---
'renkei-core': patch
---

Fix account links being lost on the next login. When `LINE_MESSAGING_CHANNEL_ID` is not configured, a completed account link is recorded on the login row itself by setting its `kind` to `messaging`; the next LINE login or LIFF exchange for the same user then upserted `kind: 'login'` / `'liff'` over it, and `line:linked` silently went back to `false`. `upsertIdentityFromLine` now keeps an existing `messaging` kind (name, picture, friendship are still refreshed). Found live on renkei-demo: `/dev` reported `line:linked: true`, a LIFF exchange from the phone reported `false`.
