# renkei

## 0.4.0

### Patch Changes

- 24d8358: `renkei add-client` gains `--preset next`: registers a confidential client for a `renkei-next` app, hints the `<app origin>/api/renkei/callback` redirect URI, and prints the `.env.local` values plus the three files (`renkei.ts`, the `[...renkei]` route, `proxy.ts`) to paste.
- ff893a4: `renkei add-client` (no preset, or `--preset public`) now also prints a `renkei-client` snippet with the issuer, client ID and redirect URI filled in, next to the raw OIDC client settings.

## 0.3.0

### Minor Changes

- 3e9f07e: `npx renkei init` writes a ready-to-run `.env` — signing keys and cookie keys generated, `DATABASE_URL=sqlite:./data/renkei.db`, the `/dev` test page on — so a first run is `renkei init`, paste the LINE channel ID and secret, `renkei`. `npx renkei add-client <id> --redirect <url> [--preset authjs|supabase|public]` generates a client secret, adds the client to `RENKEI_CLIENTS` in `.env` (validated with the server's schema) and prints what to paste on the app side: the Auth.js provider block, Supabase's Keycloak fields and `config.toml`, or plain OIDC values. `renkei-server` now exports `oidcClientSchema`.

### Patch Changes

- Updated dependencies [3e9f07e]
- Updated dependencies [f05994c]
  - renkei-server@0.3.0

## 0.2.3

### Patch Changes

- renkei-server@0.2.3

## 0.2.2

### Patch Changes

- Updated dependencies [fd34b95]
  - renkei-server@0.2.2

## 0.2.1

### Patch Changes

- Updated dependencies [388d4b2]
  - renkei-server@0.2.1

## 0.2.0

### Patch Changes

- Updated dependencies [d78649e]
- Updated dependencies [e47e577]
- Updated dependencies [dba8faf]
- Updated dependencies [eac1fb3]
- Updated dependencies [b735c20]
- Updated dependencies [d1c6505]
- Updated dependencies [65eb7c9]
- Updated dependencies [e77484b]
  - renkei-server@0.2.0

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
  - renkei-server@0.1.0
