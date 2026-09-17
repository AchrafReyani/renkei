# renkei

## 0.6.0

### Minor Changes

- e69ca6f: Structured configuration: `renkei.yaml`. renkei now reads a config file from the working directory (`RENKEI_CONFIG` overrides the path) and, when there is one, it is the whole configuration — the `LINE_*` / `RENKEI_*` variables it supersedes are named on the boot banner instead of quietly taking effect, while `PORT`, `DATABASE_URL` and anything the file references keep working. The file goes through the same `renkeiConfigSchema`, takes `snake_case` keys (camelCase too, so a `RENKEI_CHANNELS` entry can be pasted in unchanged) and expands `${VAR}` / `${VAR:-fallback}` from the environment, so no secret has to live in it and it can be committed. The loader is `renkei-server/config-file`, a Node-only entry the Workers and Supabase Edge builds do not import.
  
  The CLI writes it: `renkei init --yaml` creates a `renkei.yaml` plus the `.env` of secrets it references — converting an existing `.env` if there is one, including the secrets that were buried inside `RENKEI_CHANNELS` / `RENKEI_CLIENTS` JSON, which get a variable of their own. `renkei add-channel <id> [--region tw] [--miniapp] [--secret … | --secret-env VAR]` appends a channel, and `renkei add-client` appends to the file's `clients:` when there is one (otherwise `RENKEI_CLIENTS`, as before); both put the reference in the YAML and the value in `.env`, and comments in the file survive the edit.
  
  Also fixed: `npx renkei` never loaded `.env`, so the quickstart (`renkei init` then `npx renkei`) only worked if you exported the variables yourself.

### Patch Changes

- Updated dependencies [5752a28]
- Updated dependencies [c57d2a9]
- Updated dependencies [6ded8f0]
- Updated dependencies [e7fc959]
- Updated dependencies [e69ca6f]
  - renkei-server@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [df00b94]
- Updated dependencies [2745aa5]
  - renkei-server@0.5.0

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
