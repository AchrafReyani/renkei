---
'renkei-server': patch
---

Fix the `/dev` relying party silently borrowing the first configured client when no `renkei-dev` client exists. With `RENKEI_DEV=true` and `RENKEI_CLIENTS` set, `/dev/login` sent `client_id=<your real client>` with renkei's own `/dev/callback` redirect and failed with `invalid_redirect_uri`. The dev clients are now appended to `RENKEI_CLIENTS` when `RENKEI_DEV=true` (skipping any clientId you already define), `/dev` only ever uses a client registered for `<issuer>/dev/callback`, and when none exists it serves a 503 page explaining what to add and logs a warning at boot. Found live on renkei-demo after adding a downstream client.
