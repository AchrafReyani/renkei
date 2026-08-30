# renkei

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
