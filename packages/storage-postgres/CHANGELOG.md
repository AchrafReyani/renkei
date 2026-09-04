# renkei-storage-postgres

## 0.5.0

### Minor Changes

- 2745aa5: Supabase Edge Functions deploy target. `renkei-server/supabase` exports `serve()` and `createEdgeFunction()`: renkei boots once per isolate from `Deno.env` and stores in Postgres — `DATABASE_URL`, else the function's own `SUPABASE_DB_URL` — with row level security enabled on its tables. Path-prefixed issuers now work everywhere (`ISSUER=https://x.supabase.co/functions/v1/renkei`, or renkei behind a proxy at `/auth`): the path is kept on every URL renkei builds and stripped from incoming requests, and the fetch→node bridge overrides `X-Forwarded-Host` so a gateway can no longer change the advertised endpoints. `renkei-storage-postgres` migrates from an embedded migration list instead of reading SQL files, so it runs on edge runtimes and inside bundles (`migratePostgres(db)` is exported for other drivers), and `createPostgresStorage()` gained `idleTimeout` and `rowLevelSecurity` options.

## 0.2.3

### Patch Changes

- Updated dependencies [bae62c7]
  - renkei-core@0.2.3

## 0.2.1

### Patch Changes

- Updated dependencies [4cc0151]
  - renkei-core@0.2.1

## 0.2.0

### Patch Changes

- Updated dependencies [d78649e]
- Updated dependencies [e47e577]
- Updated dependencies [9ed52b8]
  - renkei-core@0.2.0

## 0.1.0

### Minor Changes

- First release. Self-hosted identity broker for LINE, exposed as a standard OIDC provider:
  
  - LINE Login with friend-add (`bot_prompt`), PKCE, id_token verification, friendship status
  - LIFF token exchange (`POST /liff/exchange`), verified in the external browser and inside the LINE app
  - Stable per-user `sub` mapped to LINE user IDs; `line:*` claims; optional email with placeholder for downstreams that require one
  - Storage: in-memory (dev) and Postgres (Drizzle, auto-migrate)
  - Keycloak-shaped endpoint aliases so Supabase can use renkei as a provider; Next.js (Auth.js) works as a plain OIDC client
  - `renkei` CLI, Docker image, Render/Fly deployment references, Japanese-first docs with English mirror

### Patch Changes

- Updated dependencies
  - renkei-core@0.1.0
