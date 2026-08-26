# Deploying to Fly.io

> 日本語: [deploy-fly.ja.md](deploy-fly.ja.md)

Run the Docker image as-is on Fly.io (Tokyo region `nrt`). Time: ~15 minutes. Fly is pay-as-you-go (a minimal auto-stopping setup is well under a dollar a month). You need: [flyctl](https://fly.io/docs/flyctl/install/), a Fly account, and a Postgres (below).

## 1. Get a Postgres

Either works — all renkei needs is one `DATABASE_URL`.

- **Neon** (free tier, easiest): create a project and note the connection string (`postgres://...?sslmode=require`)
- **Fly Managed Postgres**: `fly mpg create --region nrt` → `fly mpg attach <cluster> --app <app>` sets `DATABASE_URL` for you

renkei runs its migrations on boot (`autoMigrate`).

## 2. Create the app

The repo root has a `fly.toml`. Change `app` and `ISSUER` to yours, then:

```sh
fly launch --copy-config --no-deploy   # reuse the existing fly.toml; say No to creating a DB
```

## 3. Set secrets

```sh
# Generate the signing key and cookie key (see docs/reference/config)
JWKS=$(node -e "
const { generateKeyPair, exportJWK } = await import('jose');
const { privateKey } = await generateKeyPair('RS256', { modulusLength: 2048, extractable: true });
const jwk = await exportJWK(privateKey);
console.log(JSON.stringify([{ ...jwk, kid: 'k' + Date.now().toString(36), alg: 'RS256', use: 'sig' }]));
" --input-type=module)
COOKIE=$(openssl rand -base64 32)

fly secrets set \
  LINE_LOGIN_CHANNEL_ID=... \
  LINE_LOGIN_CHANNEL_SECRET=... \
  DATABASE_URL='postgres://...' \
  RENKEI_JWKS="$JWKS" \
  RENKEI_COOKIE_KEYS="$COOKIE"
```

`RENKEI_JWKS` and `RENKEI_COOKIE_KEYS` **must be pinned**. Without them every restart invalidates tokens and sessions.

## 4. Register the callback on the LINE side

LINE Developers Console → Login channel → **LINE Login → Callback URL** → add
`https://<app>.fly.dev/line/callback` ([console guide](line-console.en.md#2-create-a-line-login-channel)).

## 5. Deploy and check

```sh
fly deploy
curl https://<app>.fly.dev/.well-known/openid-configuration   # issuer must be your URL
open https://<app>.fly.dev/dev                                 # the test RP, when RENKEI_DEV=true
```

You are done when `/dev` completes a LINE login — friend-add screen, then an id_token carrying `line:*` claims.

## What to change for production

| | Trying it out | Production |
|---|---|---|
| `RENKEI_DEV` | `true` (exposes `/dev`) | remove; register your apps in `RENKEI_CLIENTS` |
| `min_machines_running` | `0` (cold starts) | `1` |
| Postgres | Neon free tier | something with backups |
| `RENKEI_CORS_ORIGINS` | not needed | set if a LIFF app calls `/liff/exchange` directly |

## Common errors

- **`redirect_uri` mismatch** — the callback URL doesn't exactly match `ISSUER` (`https`, no trailing slash)
- **502 right after boot** — `DATABASE_URL` unreachable; with Neon, append `?sslmode=require`
- **Logged out on every redeploy** — `RENKEI_COOKIE_KEYS` / `RENKEI_JWKS` aren't in the secrets
