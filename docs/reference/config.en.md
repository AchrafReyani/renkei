# Configuration reference

> 日本語: [config.ja.md](config.ja.md)

renkei is configured through environment variables (a `.env` file works). For
programmatic use, pass the same settings as an object to
`createRenkei({ config, storage })` ([`RenkeiConfig`](#programmatic-configuration)).

## Required

| Variable | Meaning |
|---|---|
| `LINE_LOGIN_CHANNEL_ID` | Channel ID of the LINE Login channel |
| `LINE_LOGIN_CHANNEL_SECRET` | Its Channel secret — used as the OAuth `client_secret` and as the HS256 key for id_tokens |

## Server

| Variable | Default | Meaning |
|---|---|---|
| `ISSUER` | `http://localhost:3000` | renkei's public URL. **Becomes the OIDC issuer and the base for every absolute URL.** No trailing slash. Behind a proxy, use the externally visible URL |
| `PORT` | port of `ISSUER`, else `3000` | listen port |
| `DATABASE_URL` | none | Postgres connection string. Unset = **in-memory** (wiped on restart, single process; development only) |
| `RENKEI_COOKIE_KEYS` | generated per boot | cookie signing keys, comma-separated. Rotate by prepending. **Set in production** |
| `RENKEI_JWKS` | generated per boot | private signing keys (JSON array of JWKs with `kid` and `alg`). Unset means tokens die on restart and multi-instance deployments break. **Set in production** ([how to generate](#generating-signing-keys)) |
| `RENKEI_DEV` | `true` only if both `RENKEI_CLIENTS` and `DATABASE_URL` are unset | mounts the `/dev` test relying party; its `renkei-dev` / `renkei-dev-liff` clients are appended to `RENKEI_CLIENTS` when both are set. **Off in production** |
| `RENKEI_CORS_ORIGINS` | none | browser origins of LIFF apps that call `/liff/exchange` directly (comma-separated). Unset = no CORS |
| `RENKEI_ADMIN_TOKEN` | none | when set, mounts the read-only `/inspect` endpoints (identity / LINE account / recent-webhook lookups), Bearer-gated on this token. Unset = not mounted. Use a long random value |
| `RENKEI_LOG_FORMAT` | pretty | `json` emits one JSON object per log line (`{ level, msg, … }`) for log aggregators. Secrets (tokens, channel secrets, cookies, …) are **always** redacted from log metadata regardless of format |
| `RENKEI_SESSION_COOKIE` | none | `true` mounts first-party session-cookie mode (`/login`, `/session`, `/logout`) for apps that use renkei directly without their own OIDC client |
| `RENKEI_SESSION_RETURN_URLS` | none | comma-separated absolute URLs whose origin is allowed as `return_to` after `/login` (same-origin relative paths are always allowed) |

## LINE channel

| Variable | Default | Meaning |
|---|---|---|
| `LINE_LOGIN_REGION` | `jp` | region this channel serves: `jp` / `tw` / `th` … Used for the `line:region` claim and `line_region` routing |
| `RENKEI_BOT_PROMPT` | `aggressive` | friend-add at login: `aggressive` (dedicated screen) / `normal` (on the consent screen) / `none`. Requires an Official Account linked to the channel |
| `RENKEI_REQUEST_EMAIL` | `false` | `true` requests the `email` scope from LINE. Without **email permission** on the channel LINE silently drops it (renkei warns at boot) |

Multiple regions (Japan + Taiwan, …) are configured programmatically via the `channels` array (env supports one channel).

## Messaging API channel (webhook + account linking)

| Variable | Default | Meaning |
|---|---|---|
| `LINE_MESSAGING_CHANNEL_SECRET` | none | Messaging API channel secret. Set it to enable `POST /line/webhook` (verifies `x-line-signature`, keeps `line:friend` current). **Not** the Login channel secret |
| `LINE_MESSAGING_CHANNEL_ID` | none | Messaging API channel ID. Informational |
| `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN` | none | Messaging API channel access token. Set it to enable `POST /link/start` (account linking mints a one-time link token with it) |
| `LINE_ACCOUNTLINK_FORWARD_URL` | none | Forwarded (app-owned) linking: `accountLink` events whose nonce renkei doesn't own are POSTed here as `{ type, userId, nonce, result, timestamp }`. Your app owns the nonce → account mapping |
| `LINE_ACCOUNTLINK_FORWARD_SECRET` | none | Shared secret for the forward. renkei signs the body (base64 HMAC-SHA256) in `x-renkei-signature`, so your app can verify it the same way it would a LINE webhook |

The Messaging API channel must live under the **same LINE provider** as the Login channel, or the LINE user IDs won't line up. Programmatically these map to the `messagingChannels` array.

## Downstream clients (`RENKEI_CLIENTS`)

The apps / IdPs that log in through renkei over OIDC. JSON array.

```json
[
  {
    "clientId": "my-app",
    "clientSecret": "…32+ chars…",
    "redirectUris": ["https://app.example.com/api/auth/callback/renkei"],
    "tokenEndpointAuthMethod": "client_secret_basic",
    "lineRegion": "jp",
    "placeholderEmailDomain": "line-users.example.com"
  },
  {
    "clientId": "my-liff-app",
    "redirectUris": ["https://liff.example.com/"],
    "tokenEndpointAuthMethod": "none"
  }
]
```

| Key | Required | Meaning |
|---|---|---|
| `clientId` | ✅ | OIDC `client_id` |
| `clientSecret` | ✅ unless `tokenEndpointAuthMethod` is `none` | |
| `redirectUris` | ✅ | matched exactly |
| `tokenEndpointAuthMethod` | | `client_secret_basic` (default) / `client_secret_post` / `none` (public client, **PKCE required**) |
| `lineRegion` | | which LINE channel this client logs in through; default: the first channel |
| `placeholderEmailDomain` | | give users without an email `<sub>@<domain>` with `email_verified: true` and `email_placeholder: true`, for downstreams that require an email (Supabase). [Why and caveats](../tutorials/supabase.en.md#4-about-email-addresses-read-this) |

When unset, development clients `renkei-dev` (secret `renkei-dev-secret`, redirect `${ISSUER}/dev/callback`) and
`renkei-dev-liff` (public) are created.

## Token lifetimes (programmatic only)

`ttl.accessToken` 3600 s, `ttl.idToken` 3600, `ttl.refreshToken` 14 days, `ttl.session` 14 days, `ttl.interaction` 600.

## Generating signing keys

```sh
node -e "
const { generateKeyPair, exportJWK } = await import('jose');
const { privateKey } = await generateKeyPair('RS256', { modulusLength: 2048, extractable: true });
const jwk = await exportJWK(privateKey);
console.log(JSON.stringify([{ ...jwk, kid: 'k' + Date.now().toString(36), alg: 'RS256', use: 'sig' }]));
" --input-type=module
```

Put the output in `RENKEI_JWKS`. To rotate, prepend a new key and keep the old one until its tokens have expired.

## Programmatic configuration

```ts
import { createRenkei } from 'renkei-server';
import { createPostgresStorage } from 'renkei-storage-postgres';

const renkei = await createRenkei({
  storage: createPostgresStorage({ connectionString: process.env.DATABASE_URL! }),
  config: {
    issuer: 'https://auth.example.com',
    channels: [
      { channelId: '…', channelSecret: '…', region: 'jp', botPrompt: 'aggressive', requestEmail: true },
      { channelId: '…', channelSecret: '…', region: 'tw' },
    ],
    clients: [ /* as above */ ],
    cookieKeys: ['…'],
    jwks: [ /* JWK */ ],
    corsOrigins: ['https://liff.example.com'],
  },
});
// renkei.app is a Hono app; on Node, hand it to serve() from @hono/node-server.
```

Configuration is validated with zod; invalid config fails at boot with a Japanese + English message.
