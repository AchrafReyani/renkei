# Next.js helpers (`renkei-next`)

> 日本語: [next.ja.md](next.ja.md) · Runnable code: [`examples/nextjs-renkei-next`](../../examples/nextjs-renkei-next)

`renkei-next` turns a Next.js (App Router) app into an OIDC client of renkei without Auth.js: **four route handlers, an encrypted session cookie, `getSession()`, a guard for `proxy.ts` / `middleware.ts`, and a `<LineLoginButton />` that follows LINE's design guideline**. Under the hood it uses [`renkei-client`](client.en.md) for URLs and the token exchange, and verifies the id_token against renkei's JWKS.

If you use Auth.js you do not need this — see the [Next.js tutorial](../tutorials/nextjs.en.md) instead.

```sh
npm i renkei-next
# register the client on the renkei side (prints the app-side config)
npx renkei add-client my-next-app --redirect https://app.example.com/api/renkei/callback --preset next
```

## Three files

```ts
// renkei.ts — one instance for the whole app
import { createRenkeiAuth } from 'renkei-next';

export const renkei = createRenkeiAuth({
  issuer: process.env.RENKEI_ISSUER!,          // renkei's public URL
  clientId: process.env.RENKEI_CLIENT_ID!,
  clientSecret: process.env.RENKEI_CLIENT_SECRET, // omit for a public (PKCE-only) client
  secret: process.env.RENKEI_NEXT_SECRET!,     // 32+ chars; encrypts the cookies
  botPrompt: 'normal',                         // optional
});
```

```ts
// app/api/renkei/[...renkei]/route.ts
import { renkei } from '@/renkei';
export const { GET, POST } = renkei.handlers;
// → /api/renkei/login, /api/renkei/callback, /api/renkei/logout, /api/renkei/session
```

```ts
// proxy.ts (Next 16; on Next ≤ 15 put the same code in middleware.ts)
import { renkei } from '@/renkei';
export default renkei.proxy({ protect: ['/account'] });
export const config = { matcher: ['/account/:path*'] };
```

Then, in a page:

```tsx
import { renkei } from '@/renkei';
import { LineLoginButton } from 'renkei-next/button';

export default async function Page() {
  const session = await renkei.getSession(); // RenkeiClaims | null
  if (!session) return <LineLoginButton locale="en" returnTo="/account" />;
  return <p>{session.name} · LINE {session['line:user_id']} · <a href={renkei.logoutPath('/')}>Log out</a></p>;
}
```

## Flow

1. `GET /api/renkei/login?return_to=/account` — stores `state`, `nonce`, the PKCE verifier and `return_to` in a short-lived encrypted cookie (10 minutes) and redirects to renkei's `/oidc/auth`.
2. renkei runs the LINE login (friend-add prompt included) and returns to `GET /api/renkei/callback?code=&state=`.
3. `state` is checked → the code is exchanged at `/oidc/token` (PKCE; HTTP Basic for confidential clients) → the id_token is **verified against renkei's JWKS** (`iss`, `aud`, signature, `nonce`) → the claims go into the encrypted session cookie → redirect to `return_to`.
4. `getSession()` / `getSessionFromRequest()` only decrypt that cookie. No call to renkei.

The session is a snapshot of the claims at login time. To follow `line:friend` changes, make the user log in again or consume renkei's webhook forwarding in your app.

## API

### `createRenkeiAuth(options)`

| Option | Default | Meaning |
|---|---|---|
| `issuer` | — | renkei's public URL |
| `clientId` / `clientSecret?` | — | the registered client; without `clientSecret` it is a public client (PKCE is always used) |
| `secret` | — | cookie encryption secret (32+ chars). JWE `dir` / `A256GCM`, key = SHA-256(secret). Changing it logs everyone out |
| `basePath` | `/api/renkei` | where the handlers are mounted |
| `scope` | `openid profile email line` | |
| `botPrompt` / `lineRegion` | — | forwarded to renkei as `bot_prompt` / `line_region` |
| `session.cookieName` | `renkei_next_session` | the flow cookie is `<name>_flow` |
| `session.maxAge` | 7 days (seconds) | |
| `defaultReturnTo` | `/` | used when `return_to` is missing or unsafe |
| `errorRedirect` | none (plain 400/401 text) | where failures redirect, with `?error=&error_description=` |
| `fetch` | `globalThis.fetch` | override for the calls to renkei |

The returned `RenkeiAuth`:

| Member | Meaning |
|---|---|
| `handlers.GET` / `handlers.POST` | the route handlers (re-export from `[...renkei]/route.ts`) |
| `handle(request)` | the dispatcher behind them, for custom mounting |
| `paths` | absolute paths `{ login, callback, logout, session }` |
| `loginPath(returnTo?, { botPrompt? })` | `/api/renkei/login?return_to=…` |
| `logoutPath(returnTo?)` | `/api/renkei/logout?return_to=…` (GET or POST) |
| `getSession()` | from Server Components, Server Actions and Route Handlers (uses `cookies()` from `next/headers`) |
| `getSessionFromRequest(request)` | from any `Request` (proxy, custom handlers) |
| `proxy(options?)` / `middleware(options?)` | `(request) => Response \| undefined`; anonymous requests on protected paths get a `307` to the login |
| `client` | the underlying `RenkeiClient` |

`proxy({ protect })` takes path prefixes or a `(url) => boolean` predicate. By default everything except `basePath`, `/_next/*` and files with an extension is protected.

### `GET /api/renkei/session`

Client Components can `fetch('/api/renkei/session')` for the current claims as JSON, or `401 { error: "no_session" }`.

### `<LineLoginButton />` (`renkei-next/button`)

An `<a>` that follows the [LINE Login button design guideline](https://developers.line.biz/en/docs/line-login/login-button/): base `#06C755`, a 10 % black overlay on hover and 30 % on press, white text, **the official LINE icon (the PNG from LINE's template, embedded unmodified)**, an 8 % black separator, side padding at least the speech-bubble width; the disabled state is white with `#1E1E1E` at 20 % and a 60 % `#E5E5E5` border. It uses no hooks, so it works in Server Components. Its styles ship as an accompanying `<style>` (deduplicated once by React 19).

| Prop | Default | Meaning |
|---|---|---|
| `href` | `/api/renkei/login` | the login route |
| `returnTo` | — | `?return_to=` |
| `botPrompt` | — | `?bot_prompt=` (`aggressive` / `normal` / `none`) |
| `locale` | `ja` | `ja` 「LINEでログイン」 / `en` "Log in with LINE" |
| `label` | — | custom text; must clearly say it logs in with LINE, no line breaks (guideline) |
| `size` | `md` | `md` = 44 px / `sm` = 32 px |
| `iconOnly` | `false` | icon only (allowed by the guideline) |
| `disabled` | `false` | |
| others | | any `<a>` attribute (`className`, `style`, `id`, `target`, …) passes through |

LINE and the LINE logo are trademarks of LY Corporation. Do not change the button's colours or icon.

### Re-exports

`RenkeiClaims`, `LineClaims`, `LINE_CLAIMS`, `isFriend()`, `isLinked()` and `BotPrompt` are re-exported from `renkei-client`.

## Security notes

- Every id_token is verified against renkei's JWKS (`/oidc/jwks`): signature, `iss`, `aud`, `nonce`. `renkei-client`'s `decodeClaimsUnverified()` is not used here.
- PKCE (S256) is always on; `state` lives in an encrypted cookie and is compared on return.
- `return_to` accepts same-origin paths only (`//host` and absolute URLs fall back to `defaultReturnTo`).
- The session cookie is `HttpOnly` / `SameSite=Lax` / `Path=/`, `Secure` on HTTPS. Its content is a JWE; tampering, expiry or a different `secret` yields `null`.
- renkei's own session-cookie mode (`RENKEI_SESSION_COOKIE`) is not used: that cookie belongs to renkei's origin, which a Next.js app on another origin cannot read ([DECISIONS.md §13](../DECISIONS.md)).
