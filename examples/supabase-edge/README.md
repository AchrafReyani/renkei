# renkei on Supabase Edge Functions

renkei as one Edge Function, storing in the project's own Postgres. The
function body is two lines (`supabase/functions/renkei/index.ts`); everything
else is configuration. Guide: [`docs/guides/deploy-supabase-edge.en.md`](../../docs/guides/deploy-supabase-edge.en.md)
([日本語](../../docs/guides/deploy-supabase-edge.ja.md)).

```sh
cp .env.example .env            # fill in the LINE channel + keys (npx renkei init --print)
supabase start                  # local stack (Docker)
supabase functions serve --env-file .env
open http://127.0.0.1:54321/functions/v1/renkei/dev
```

Production:

```sh
supabase link --project-ref <ref>
supabase secrets set --env-file .env      # with ISSUER=https://<ref>.supabase.co/functions/v1/renkei
supabase functions deploy renkei
```

`config.toml` sets `verify_jwt = false` for the function: browsers and LINE's
redirect carry no Supabase JWT, and renkei's own endpoints are the auth layer.

## Running against the workspace build

The function imports `npm:renkei-server/supabase`. To exercise the unpublished
workspace build, bundle it into a second, gitignored function (`renkei-local`)
and serve that one — the import map cannot remap an `npm:` specifier inside
the edge-runtime:

```sh
pnpm build && pnpm --filter example-supabase-edge bundle:local   # → supabase/functions/renkei-local/
# .env: ISSUER=http://127.0.0.1:54321/functions/v1/renkei-local
supabase functions serve --env-file .env --no-verify-jwt
open http://127.0.0.1:54321/functions/v1/renkei-local/dev
```
