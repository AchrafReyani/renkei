# Configuration reference

> 日本語: [config.ja.md](config.ja.md)

There are two ways to configure renkei, and it uses exactly one of them:

- **`renkei.yaml`** in the working directory ([below](#renkei-yaml)) — one file for
  everything, secrets by `${VAR}` reference so it can be committed. Recommended
  once you have more than one channel or more than one client.
- **environment variables** (a `.env` file works) — the tables below. This is
  what a fresh `renkei init` writes, and the only option on Cloudflare Workers
  and Supabase Edge Functions, which have no filesystem.

When a `renkei.yaml` is present it is the whole configuration: renkei does not
read the `LINE_*` / `RENKEI_*` variables at all, and names the ones you had set
at boot so nothing is silently in effect. `PORT` and `DATABASE_URL` still work
next to it, as does anything the file references as `${VAR}`.

For programmatic use, pass the same settings as an object to
`createRenkei({ config, storage })` ([`RenkeiConfig`](#programmatic-configuration)).

## Required

| Variable | Meaning |
|---|---|
| `LINE_LOGIN_CHANNEL_ID` | Channel ID of the LINE Login channel |
| `LINE_LOGIN_CHANNEL_SECRET` | Its Channel secret — used as the OAuth `client_secret` and as the HS256 key for id_tokens |

## Server

| Variable | Default | Meaning |
|---|---|---|
| `ISSUER` | `http://localhost:3000` | renkei's public URL. **Becomes the OIDC issuer and the base for every absolute URL.** No trailing slash. Behind a proxy, use the externally visible URL. May carry a path (`https://x.supabase.co/functions/v1/renkei`, `https://example.com/auth`): renkei keeps it on every URL it hands out and strips it from incoming requests |
| `PORT` | port of `ISSUER`, else `3000` | listen port |
| `DATABASE_URL` | none | `postgres://…` selects Postgres, `sqlite:./data/renkei.db` selects SQLite (Node 22.13+ built-in `node:sqlite`: zero dependencies, no database server, single process; keep the file on a persistent disk). Unset = **in-memory** (wiped on restart, single process; development only). Not used on Cloudflare Workers, where the D1 binding `DB` is the storage ([guide](../guides/deploy-cloudflare-workers.en.md)) |
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
| `RENKEI_CHANNELS` | none | Further channels as JSON, appended after the primary one: `[{ channelId, channelSecret, region, kind?, provider?, botPrompt?, requestEmail? }]`. A second region, a MINI App, or the whole list on its own (then `LINE_LOGIN_*` can be omitted and the first Login channel is the default). One Login channel per region ([tutorial](../tutorials/multi-region.en.md)) |
| `LINE_MINIAPP_CHANNEL_ID` | none | LINE MINI App channel(s) of the same provider, accepted by `POST /liff/exchange` and mapped onto the same `sub` as the Login channel. Comma-separate one ID per stage (Developing / Review / Published). [Guide](../guides/line-mini-app.en.md) |
| `LINE_MINIAPP_CHANNEL_SECRET` | none | Secret for the MINI App channel(s): one for all IDs, or one per ID in the same order |
| `RENKEI_BOT_PROMPT` | `aggressive` | friend-add at login: `aggressive` (dedicated screen) / `normal` (on the consent screen) / `none`. Requires an Official Account linked to the channel |
| `RENKEI_REQUEST_EMAIL` | `false` | `true` requests the `email` scope from LINE. Without **email permission** on the channel LINE silently drops it (renkei warns at boot) |

Multiple regions (Japan + Taiwan, …) are configured programmatically via the `channels` array (env supports one channel).

## Messaging API channel (webhook + account linking)

| Variable | Default | Meaning |
|---|---|---|
| `LINE_MESSAGING_CHANNEL_SECRET` | none | Messaging API channel secret. Set it to enable `POST /line/webhook` (verifies `x-line-signature`, keeps `line:friend` current). **Not** the Login channel secret |
| `LINE_MESSAGING_CHANNEL_ID` | none | Messaging API channel ID. Informational |
| `LINE_MESSAGING_CHANNEL_REGION` | `LINE_LOGIN_REGION` | which Login channel's users this channel's webhook events concern. Only matters with several regions |
| `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN` | none | Messaging API channel access token. Set it to enable `POST /link/start` (account linking mints a one-time link token with it) |
| `LINE_ACCOUNTLINK_FORWARD_URL` | none | Forwarded (app-owned) linking: `accountLink` events whose nonce renkei doesn't own are POSTed here as `{ type, userId, nonce, result, timestamp }`. Your app owns the nonce → account mapping |
| `LINE_ACCOUNTLINK_FORWARD_SECRET` | none | Shared secret for the forward. renkei signs the body (base64 HMAC-SHA256) in `x-renkei-signature`, so your app can verify it the same way it would a LINE webhook |

The Messaging API channel must live under the **same LINE provider** as the Login channel, or the LINE user IDs won't line up. Programmatically these map to the `messagingChannels` array.

## Downstream clients (`RENKEI_CLIENTS`)

The apps / IdPs that log in through renkei over OIDC. JSON array. Rather than writing it by hand,
`npx renkei add-client <id> --redirect <url> [--preset authjs|supabase|public]` generates the secret,
appends the client to `RENKEI_CLIENTS` in `.env`, and prints what to paste on the app side (the Auth.js
provider block / Supabase's Keycloak fields). `--replace` overwrites, `--print` shows without writing.

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

## `renkei.yaml`

`renkei init --yaml` writes one, converting an existing `.env` if there is one.
renkei picks it up from the working directory; `RENKEI_CONFIG=<path>` points at
another file (`renkei.yml` is also recognised).

```yaml
issuer: https://auth.example.com
storage: postgres://…            # or sqlite:./data/renkei.db; DATABASE_URL if absent
port: 3000                       # PORT wins over it
liff_id: 1234567890-abcdefgh     # /dev/liff page only
log_format: json                 # one JSON object per log line
dev: false                       # mount the /dev test page (adds its clients automatically)

cookie_keys: "${RENKEI_COOKIE_KEYS}"
jwks: "${RENKEI_JWKS}"

channels:
  - id: "1234567890"             # LINE Login, Japan
    region: jp
    secret: "${LINE_JP_CHANNEL_SECRET}"
    bot_prompt: aggressive
    request_email: false
    liff_ids: ["1234567890-abcdefgh"]
  - id: "2345678901"             # a second region
    region: tw
    secret: "${LINE_TW_CHANNEL_SECRET}"
  - id: "3456789012"             # a LINE MINI App stage
    kind: miniapp
    region: jp
    secret: "${LINE_MINIAPP_CHANNEL_SECRET}"

messaging:                       # or messaging_channels: [ … ] for several
  channel_id: "4567890123"
  channel_secret: "${LINE_MESSAGING_CHANNEL_SECRET}"
  channel_access_token: "${LINE_MESSAGING_CHANNEL_ACCESS_TOKEN}"

clients:
  - client_id: my-app
    client_secret: "${RENKEI_MY_APP_CLIENT_SECRET}"
    redirect_uris: ["https://app.example.com/callback"]
    line_region: tw              # pin this client to one channel
  - client_id: spa
    token_endpoint_auth_method: none
    redirect_uris: ["https://spa.example.com/callback"]

cors_origins: ["https://liff.example.com"]
session_cookie:
  enabled: true
  return_urls: ["https://app.example.com"]
admin_token: "${RENKEI_ADMIN_TOKEN}"
```

Every field of [`RenkeiConfig`](#programmatic-configuration) is available, in
`snake_case`. The camelCase spelling works too, so an entry can be pasted
straight out of `RENKEI_CHANNELS` or `RENKEI_CLIENTS`. Two shorthands the schema
does not have: a channel's `id` / `secret` (`channel_id` / `channel_secret` also
work), and `messaging:` as a single mapping instead of a one-entry
`messaging_channels:` list.

### `${VAR}` — keeping secrets out of the file

Any string may reference an environment variable. `${VAR}` fails at boot, naming
the variable and the field, if it is not set; `${VAR:-fallback}` uses the
fallback instead; `$${` is a literal `${`.

This is what makes the file committable: **put no secret in `renkei.yaml`** —
reference one, and keep the value in `.env` (development) or in your platform's
secret store (production). `renkei add-channel` and `renkei add-client` follow
the same rule: the file gets the reference, `.env` gets the value.

`cookie_keys` and `jwks` also accept a single string, so each can be one
reference holding exactly what `RENKEI_COOKIE_KEYS` (comma-separated) and
`RENKEI_JWKS` (JSON) hold.

### CLI

| | |
|---|---|
| `renkei init --yaml` | write `renkei.yaml` + a `.env` of secrets; converts an existing `.env` if there is one |
| `renkei add-channel <id> [--region tw] [--miniapp] [--secret <value>]` | append a channel; `--secret-env VAR` references a variable without writing it |
| `renkei add-client <id> --redirect <url>` | append a client (writes to `renkei.yaml` when there is one, else to `RENKEI_CLIENTS`) |

### Migrating from environment variables

Run `renkei init --yaml` in the directory with your `.env`. It builds the config
the way the server does, so the file says exactly what those variables were
already booting, and writes every secret back as a reference — including the
ones that were buried inside `RENKEI_CHANNELS` / `RENKEI_CLIENTS` JSON, which
get a variable of their own in `.env`. Your `.env` is not otherwise touched.
Start renkei, check the line naming the superseded variables, and once it boots
clean those lines can come out of `.env`.

## Token lifetimes (programmatic only)

`ttl.accessToken` 3600 s, `ttl.idToken` 3600, `ttl.refreshToken` 14 days, `ttl.session` 14 days, `ttl.interaction` 600.

## Generating signing keys

`npx renkei init` writes a `.env` with `RENKEI_JWKS` and `RENKEI_COOKIE_KEYS` already generated. By hand:

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
// or SQLite: import { createSqliteStorage } from 'renkei-storage-sqlite';
// Cloudflare D1: import { createD1Storage } from 'renkei-storage-sqlite/d1'; → createD1Storage(env.DB)

const renkei = await createRenkei({
  storage: createPostgresStorage({ connectionString: process.env.DATABASE_URL! }),
  // storage: createSqliteStorage({ filename: './data/renkei.db' }),
  config: {
    issuer: 'https://auth.example.com',
    channels: [
      { channelId: '…', channelSecret: '…', region: 'jp', botPrompt: 'aggressive', requestEmail: true },
      // A LINE MINI App channel next to it (same provider → same sub); `provider` groups channels
      // per LINE provider and is only needed when one renkei mixes several providers.
      { channelId: '…', channelSecret: '…', region: 'jp', kind: 'miniapp' },
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
