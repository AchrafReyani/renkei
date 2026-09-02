---
"renkei": patch
---

`renkei add-client` gains `--preset next`: registers a confidential client for a `renkei-next` app, hints the `<app origin>/api/renkei/callback` redirect URI, and prints the `.env.local` values plus the three files (`renkei.ts`, the `[...renkei]` route, `proxy.ts`) to paste.
