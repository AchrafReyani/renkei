# Client SDK (`renkei-client`)

> 日本語: [client.ja.md](client.ja.md)

`renkei-client` is a small SDK for apps that talk to a renkei server. **Zero dependencies**; it runs wherever `fetch`, `URL` and Web Crypto exist (browsers, Node 18+, Cloudflare Workers, Deno, Bun). renkei's endpoints are fixed paths, so the SDK builds URLs without fetching discovery.

```sh
npm i renkei-client
```

```ts
import { createRenkeiClient } from 'renkei-client';

const renkei = createRenkeiClient({
  issuer: 'https://auth.example.com', // renkei's public URL (= OIDC issuer)
  clientId: 'my-app',                  // the ID you registered with renkei add-client
  // clientSecret: '…',                // confidential clients, server-side only. Never ship to a browser
  // fetch: customFetch,               // swap fetch (tests, custom agents)
});
```

`renkei add-client <id> --redirect <url>` (no preset / `--preset public`) also prints a snippet for this SDK.

## What it does and does not do

| Does | Does not |
|---|---|
| Build the `/oidc/auth` URL (with `bot_prompt`, `line_region`, PKCE) | Verify id_token signatures (see below) |
| Authorization-code exchange at `/oidc/token`, `/oidc/me` | Manage refresh-token rotation |
| Wrap `/liff/exchange` | Initialise the LIFF SDK (`liff.init()` stays in your app) |
| Session-cookie mode: `/login`, `/session`, `/logout` | Store cookies (the browser does; server-side you forward `headers`) |
| Type the `line:*` claims and decode JWT payloads | |

**Signature verification is outside the SDK.** `decodeClaimsUnverified()` reads a payload without verifying, as its name says; it exists so a front-end can show the `id_token` it just received from renkei over TLS. A backend that *trusts* a token for an authorization decision must verify it against `${issuer}/oidc/jwks` — jose (`createRemoteJWKSet` + `jwtVerify`), openid-client, Auth.js or your framework's OIDC layer all do this already ([DECISIONS.md §12](../DECISIONS.md)).

## API

### `createRenkeiClient(options)`

| Option | Meaning |
|---|---|
| `issuer` | renkei's public URL. A trailing `/` is stripped; no query or fragment |
| `clientId` | a registered client ID |
| `clientSecret?` | the confidential client's secret, sent as HTTP Basic by `exchangeCode()` and `exchangeLiffToken()`. **Server-side only** |
| `fetch?` | replacement `fetch` |

The returned `RenkeiClient`:

| Member | Meaning |
|---|---|
| `issuer`, `clientId` | normalised values |
| `endpoints` | absolute URLs: `discovery`, `authorization`, `token`, `userinfo`, `jwks`, `revocation`, `liffExchange`, `login`, `session`, `logout` |
| `loginUrl(opts)` | the `/oidc/auth` URL as a string; no network |
| `sessionLoginUrl(opts?)` | the `/login` URL for session-cookie mode |
| `exchangeCode(opts)` | authorization code → tokens at `/oidc/token` |
| `userinfo(accessToken, req?)` | `/oidc/me` |
| `exchangeLiffToken(opts, req?)` | `/liff/exchange` |
| `session(req?)` | `/session` → `RenkeiClaims`, or `null` without a session |
| `logout(req?)` | `/logout` |

### `loginUrl(options)`

| Option | Meaning |
|---|---|
| `redirectUri` | required; a redirect URI registered on the client |
| `state` | required; CSRF token you keep in the session and compare on return (`randomString()`) |
| `nonce?` | replay protection, compared with the id_token's `nonce` (`randomString()`) |
| `scope?` | default `openid profile email line`; string or array |
| `botPrompt?` | `'aggressive'` / `'normal'` / `'none'`; omitted = the channel default (`RENKEI_BOT_PROMPT`). `none` suppresses the friend-add prompt |
| `lineRegion?` | pick the `jp` / `tw` / `th` … channel on a multi-channel server |
| `codeChallenge?` | the `challenge` from `generatePkce()`; adds `code_challenge_method=S256`. **Required for public clients** (`tokenEndpointAuthMethod: 'none'`) |
| `extra?` | any other OIDC parameter (`prompt`, `ui_locales`, `login_hint`, …) |

### `exchangeCode({ code, redirectUri, codeVerifier? })`

Posts `grant_type=authorization_code` to `/oidc/token`. With a `clientSecret` the client authenticates with HTTP Basic; without one `client_id` goes in the body (public client). Returns the raw `TokenResponse` (`access_token`, `id_token`, `refresh_token`, `expires_in`, `scope`). Compare the id_token's `nonce` with the one you stored, and verify the token on the backend.

### `exchangeLiffToken({ idToken?, accessToken?, scope? })`

Sends `liff.getIDToken()` and `liff.getAccessToken()` to renkei and gets back a renkei-signed id_token (`aud` = `clientId`). At least one token is required. Returns:

```ts
{ idToken: string; expiresIn: number; sub: string; claims: RenkeiClaims }
```

`claims` is `idToken` decoded (not verified; it arrived from renkei in this very response, so it is fine for front-end display). When calling from a browser, set `RENKEI_CORS_ORIGINS` on the server to the LIFF app's origin.

### Session-cookie mode

For servers with `RENKEI_SESSION_COOKIE=true`.

- `sessionLoginUrl({ returnTo?, botPrompt?, lineRegion? })` — send the user here; after LINE login a signed HttpOnly cookie is set and they land on `returnTo` (a same-origin path, or an absolute URL in `RENKEI_SESSION_RETURN_URLS`).
- `session()` — the claims, or `null`. In browsers it sends `credentials: 'include'`, so renkei and the app must be same-site.
- `logout()` — destroys the session.

Server-side (Next.js middleware or a Route Handler, Hono, …) forward the incoming request's `cookie` header:

```ts
const me = await renkei.session({ headers: { cookie: req.headers.get('cookie') ?? '' } });
```

### Claims

```ts
import { type RenkeiClaims, LINE_CLAIMS, decodeClaimsUnverified, isFriend, isLinked } from 'renkei-client';
```

`RenkeiClaims` types the standard claims (`sub`, `name`, `picture`, `email`, `email_verified`, `email_placeholder`, `nonce`, `amr`, …) plus `line:*`:

| Claim | Type | Meaning |
|---|---|---|
| `line:user_id` | `string` | LINE user ID (`U…`) |
| `line:friend` | `boolean` | friend of the official account (undefined = unknown) |
| `line:channel_id` | `string` | the login channel |
| `line:region` | `string` | that channel's region |
| `line:linked` | `boolean` | Messaging API account linking completed |

`isFriend(claims)` / `isLinked(claims)` read undefined as `false`. `LINE_CLAIMS` holds the same constants as renkei-core (a test keeps them equal).

### PKCE / randomness

```ts
import { generatePkce, randomString } from 'renkei-client';

const { verifier, challenge, method } = await generatePkce(); // method: 'S256'
const state = randomString(); // 32 random bytes, base64url
```

### Errors

A non-2xx answer from renkei throws `RenkeiClientError` with `status`, `error` (`invalid_client`, `invalid_grant`, `invalid_token`, `no_session`, …) and `errorDescription?`. The one exception is `session()`, where a 401 returns `null`.

## Using Auth.js or Supabase?

You do not need this. They talk to renkei directly as standard OIDC clients ([Next.js](../tutorials/nextjs.en.md) / [Supabase](../tutorials/supabase.en.md) tutorials). The SDK is for apps that drive the flow themselves, LIFF front-ends, and session-cookie mode.
