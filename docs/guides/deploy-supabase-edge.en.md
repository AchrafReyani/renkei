# Deploying to Supabase Edge Functions

> 日本語: [deploy-supabase-edge.ja.md](deploy-supabase-edge.ja.md)

Run renkei as one Edge Function on your Supabase project, storing in the project's own Postgres. Time: ~15 minutes. The free plan is enough to try it. You need: a Supabase project, the [Supabase CLI](https://supabase.com/docs/guides/cli), and Docker if you want to run it locally first.

The function body is two lines importing `renkei-server/supabase`: it boots renkei once per isolate from the function's secrets and stores identities and OIDC state in Postgres. The complete project is in [`examples/supabase-edge`](https://github.com/AchrafReyani/renkei/tree/main/examples/supabase-edge). If you also use Supabase Auth, the [Supabase tutorial](../tutorials/supabase.en.md) shows how to point it at renkei — this guide is only about *hosting* renkei on Supabase.

## 1. The project (two files)

```sh
supabase init          # or start from the example
```

`supabase/functions/renkei/index.ts`:

```ts
import { serve } from 'npm:renkei-server/supabase';

serve();
```

`supabase/config.toml` — add:

```toml
[functions.renkei]
verify_jwt = false     # browsers and LINE's redirect carry no Supabase JWT
```

`verify_jwt = false` is not optional: by default Supabase's gateway rejects requests without a Supabase JWT in the `Authorization` header, and neither a browser opening `/dev` nor LINE redirecting to `/line/callback` sends one. renkei's own endpoints are the authentication layer.

## 2. Secrets

Generate the signing key and the cookie key once and **pin them**. The function runs in many isolates; without pinned keys each isolate would mint its own, and a login that starts on one isolate fails on the next.

```sh
npx renkei init --print          # prints a full .env; copy the RENKEI_JWKS and RENKEI_COOKIE_KEYS lines
```

Put these in a `.env` (gitignored) next to `supabase/`:

```sh
ISSUER=https://<project-ref>.supabase.co/functions/v1/renkei   # the function URL, no trailing slash
RENKEI_DEV=true                                                 # /dev test page; remove for production
LINE_LOGIN_CHANNEL_ID=…
LINE_LOGIN_CHANNEL_SECRET=…
RENKEI_JWKS=[…]
RENKEI_COOKIE_KEYS=…
```

```sh
supabase link --project-ref <project-ref>
supabase secrets set --env-file .env
```

Every variable from the [configuration reference](../reference/config.en.md) works, with the same name. Two Supabase specifics:

- **`ISSUER` carries a path.** Supabase serves the function under `/functions/v1/renkei`, so that is part of renkei's public URL and of the OIDC issuer. renkei keeps the path on every URL it hands out (discovery, `redirect_uri`, cookies) and strips it from incoming requests. Discovery is at `${ISSUER}/.well-known/openid-configuration`.
- **Storage is your project's Postgres, with nothing to set.** Every Edge Function receives `SUPABASE_DB_URL`, and renkei uses it when `DATABASE_URL` is unset (one connection per isolate, closed after 20 s idle). To go through the transaction pooler instead — recommended once you have real traffic, the direct connection cap is small — set `DATABASE_URL` to the pooler URL from the dashboard (port 6543); it takes precedence. `sqlite:` URLs do not work here.

renkei creates its tables (`renkei_identity`, `renkei_line_account`, `renkei_payload`) on the first request, idempotently, in the `public` schema, and **enables row level security on them** so the project's Data API (`anon` / `authenticated` keys) cannot read identities — renkei itself connects as the database owner and is not affected.

## 3. Register the callback on the LINE side

LINE Developers Console → Login channel → **LINE Login → Callback URL** → add
`https://<project-ref>.supabase.co/functions/v1/renkei/line/callback` ([console guide](line-console.en.md#2-create-a-line-login-channel)).

## 4. Deploy and check

```sh
supabase functions deploy renkei
curl https://<project-ref>.supabase.co/functions/v1/renkei/.well-known/openid-configuration   # issuer must be your ISSUER
open https://<project-ref>.supabase.co/functions/v1/renkei/dev                                # the test RP, when RENKEI_DEV=true
```

You are done when `/dev` completes a LINE login — friend-add screen, then an id_token carrying `line:*` claims.

## Local development

```sh
supabase start                                   # Docker; prints the local API URL (port 54321)
supabase functions serve --env-file .env         # with ISSUER=http://127.0.0.1:54321/functions/v1/renkei
open http://127.0.0.1:54321/functions/v1/renkei/dev
```

Register `http://127.0.0.1:54321/functions/v1/renkei/line/callback` on the channel as well. Locally, `SUPABASE_DB_URL` points at the CLI's Postgres container, so the tables appear in the local database (Studio → Table Editor, or `psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)"`).

## What to change for production

| | Trying it out | Production |
|---|---|---|
| `RENKEI_DEV` | `true` (exposes `/dev`) | remove; register your apps in `RENKEI_CLIENTS` |
| `RENKEI_CLIENTS` | — | `npx renkei add-client <id> --redirect <url> --preset next --print` prints the value; store it with `supabase secrets set` (it holds client secrets) |
| Database | `SUPABASE_DB_URL` (direct) | `DATABASE_URL` = the transaction pooler URL |
| Domain | `<project-ref>.supabase.co` | a [custom domain](https://supabase.com/docs/guides/platform/custom-domains) on the project; `ISSUER` must match |
| `RENKEI_CORS_ORIGINS` | not needed | set if a LIFF app calls `/liff/exchange` directly |

## Your own storage or logger

```ts
import { createEdgeFunction } from 'npm:renkei-server/supabase';
import { createPostgresStorage } from 'npm:renkei-storage-postgres';

Deno.serve(
  createEdgeFunction({
    storage: (env) => createPostgresStorage({ connectionString: env.MY_DATABASE_URL!, max: 1 }),
  }).fetch,
);
```

## Common errors

- **`{"code":401,"message":"Invalid JWT"}`** from every URL — `verify_jwt = false` missing for the function (or `--no-verify-jwt` when serving locally)
- **`renkei failed to start: ISSUER is not set`** (HTTP 500) — the secret is missing; renkei retries the boot on the next request once it is set
- **`renkei failed to start: … Failed query: CREATE TABLE …`** / connection errors — the database is unreachable from the function; check `DATABASE_URL`, or unset it to fall back to `SUPABASE_DB_URL`
- **Login works once, then `Login session not found` / a fresh `/dev` page** — `RENKEI_JWKS` or `RENKEI_COOKIE_KEYS` not pinned (see step 2); the boot log says which
- **`redirect_uri` mismatch** — the callback URL doesn't exactly match `ISSUER` (`https`, the `/functions/v1/renkei` path, no trailing slash)
- **`oidc-provider WARNING: Unsupported runtime`** in the logs — cosmetic; the full provider runs on Deno
