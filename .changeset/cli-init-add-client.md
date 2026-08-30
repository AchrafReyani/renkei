---
'renkei': minor
'renkei-server': patch
---

`npx renkei init` writes a ready-to-run `.env` — signing keys and cookie keys generated, `DATABASE_URL=sqlite:./data/renkei.db`, the `/dev` test page on — so a first run is `renkei init`, paste the LINE channel ID and secret, `renkei`. `npx renkei add-client <id> --redirect <url> [--preset authjs|supabase|public]` generates a client secret, adds the client to `RENKEI_CLIENTS` in `.env` (validated with the server's schema) and prints what to paste on the app side: the Auth.js provider block, Supabase's Keycloak fields and `config.toml`, or plain OIDC values. `renkei-server` now exports `oidcClientSchema`.
