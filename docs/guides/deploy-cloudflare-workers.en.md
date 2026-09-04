# Deploying to Cloudflare Workers

> 日本語: [deploy-cloudflare-workers.ja.md](deploy-cloudflare-workers.ja.md)

Run renkei as a Worker with D1 as its database. Time: ~15 minutes. The free plan is enough to try it (Workers: 100k requests/day, D1: 5 GB). You need: a Cloudflare account, Node 22, and `npx wrangler login`.

The whole Worker is a re-export of `renkei-server/workers`: it boots renkei once per isolate from the Worker's vars and secrets, and stores identities and OIDC state in the D1 binding. The complete project is in [`examples/cloudflare-workers`](https://github.com/AchrafReyani/renkei/tree/main/examples/cloudflare-workers).

## 1. The project (three files)

```sh
mkdir my-renkei && cd my-renkei
npm init -y && npm i renkei-server && npm i -D wrangler typescript
```

`src/index.ts`:

```ts
export { default } from 'renkei-server/workers';
```

`wrangler.toml`:

```toml
name = "renkei"
main = "src/index.ts"
compatibility_date = "2026-08-01"
compatibility_flags = ["nodejs_compat"]   # oidc-provider is a Node library

[vars]
ISSUER = "https://renkei.<your-subdomain>.workers.dev"   # your Worker's URL, no trailing slash
RENKEI_DEV = "true"                                       # /dev test page; remove for production

[[d1_databases]]
binding = "DB"
database_name = "renkei"
database_id = "<from step 2>"
```

`nodejs_compat` is not optional: renkei's OIDC layer (`oidc-provider`) needs `node:events`, `node:stream` and `node:crypto`. workerd prints `oidc-provider WARNING: Unsupported runtime` once at boot — that is cosmetic (the full provider runs; there is no reduced mode).

## 2. Create the D1 database

```sh
npx wrangler d1 create renkei     # paste the database_id it prints into wrangler.toml
```

renkei creates its tables on the first request (idempotent, versioned in a `renkei_meta` table), so there is no migration command to run — now or after upgrades.

## 3. Secrets

Generate the signing key and the cookie key once and **pin them**. Workers run many isolates; without pinned keys each isolate would mint its own, and a login that starts on one isolate fails on the next.

```sh
npx renkei init --print          # prints a full .env; copy the RENKEI_JWKS and RENKEI_COOKIE_KEYS lines
npx wrangler secret put LINE_LOGIN_CHANNEL_ID
npx wrangler secret put LINE_LOGIN_CHANNEL_SECRET
npx wrangler secret put RENKEI_JWKS
npx wrangler secret put RENKEI_COOKIE_KEYS
```

Every variable from the [configuration reference](../reference/config.en.md) works, with the same name — put non-secrets under `[vars]` and secrets in `wrangler secret put`. `DATABASE_URL` is the one exception: on Workers, storage is the D1 binding.

## 4. Register the callback on the LINE side

LINE Developers Console → Login channel → **LINE Login → Callback URL** → add
`https://renkei.<your-subdomain>.workers.dev/line/callback` ([console guide](line-console.en.md#2-create-a-line-login-channel)).

## 5. Deploy and check

```sh
npx wrangler deploy
curl https://renkei.<your-subdomain>.workers.dev/.well-known/openid-configuration   # issuer must be your URL
open https://renkei.<your-subdomain>.workers.dev/dev                                # the test RP, when RENKEI_DEV=true
```

You are done when `/dev` completes a LINE login — friend-add screen, then an id_token carrying `line:*` claims.

## Local development

```sh
cp .dev.vars.example .dev.vars   # in the example; otherwise create .dev.vars with the four secrets above
npx wrangler dev                 # http://localhost:8787/dev — a local D1 under .wrangler/
```

Set `ISSUER = "http://localhost:8787"` while developing and register `http://localhost:8787/line/callback` on the channel as well.

## What to change for production

| | Trying it out | Production |
|---|---|---|
| `RENKEI_DEV` | `"true"` (exposes `/dev`) | remove; register your apps in `RENKEI_CLIENTS` |
| `RENKEI_CLIENTS` | — | `npx renkei add-client <id> --redirect <url> --preset next --print` prints the value; store it with `wrangler secret put RENKEI_CLIENTS` (it holds client secrets) |
| Domain | `*.workers.dev` | a custom domain on the Worker; `ISSUER` must match |
| Backups | — | D1 Time Travel (30 days on paid plans) |
| `RENKEI_CORS_ORIGINS` | not needed | set if a LIFF app calls `/liff/exchange` directly |

## Postgres instead of D1

If you already run Postgres, keep it: bind it through Hyperdrive and build the Worker yourself.

```ts
import { createPostgresStorage } from 'renkei-storage-postgres';
import { createWorker } from 'renkei-server/workers';

export default createWorker({
  storage: (env) =>
    createPostgresStorage({ connectionString: (env.HYPERDRIVE as Hyperdrive).connectionString }),
});
```

`renkei-storage-postgres` uses postgres.js (`postgres`), which Cloudflare supports under `nodejs_compat`; its migrations are embedded in the module, so no filesystem is needed. This path is not covered by renkei's tests; the D1 path is.

## Common errors

- **`No such module "node:events"`** — `nodejs_compat` missing from `compatibility_flags`
- **`renkei failed to start: LINE_LOGIN_CHANNEL_ID is not set`** (HTTP 500) — a secret was not put; renkei retries the boot on the next request once it is
- **Login works locally, fails in production with `invalid state` / a fresh `/dev` page** — `RENKEI_JWKS` or `RENKEI_COOKIE_KEYS` not pinned (see step 3); the boot log says which
- **`redirect_uri` mismatch** — the callback URL doesn't exactly match `ISSUER` (`https`, no trailing slash)
- **Using in-memory storage** warning — the `DB` binding is missing or named differently; pass `createWorker({ d1Binding: '<name>' })`
