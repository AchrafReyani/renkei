---
"renkei-storage-postgres": minor
"renkei-server": minor
---

Supabase Edge Functions deploy target. `renkei-server/supabase` exports `serve()` and `createEdgeFunction()`: renkei boots once per isolate from `Deno.env` and stores in Postgres — `DATABASE_URL`, else the function's own `SUPABASE_DB_URL` — with row level security enabled on its tables. Path-prefixed issuers now work everywhere (`ISSUER=https://x.supabase.co/functions/v1/renkei`, or renkei behind a proxy at `/auth`): the path is kept on every URL renkei builds and stripped from incoming requests, and the fetch→node bridge overrides `X-Forwarded-Host` so a gateway can no longer change the advertised endpoints. `renkei-storage-postgres` migrates from an embedded migration list instead of reading SQL files, so it runs on edge runtimes and inside bundles (`migratePostgres(db)` is exported for other drivers), and `createPostgresStorage()` gained `idleTimeout` and `rowLevelSecurity` options.
