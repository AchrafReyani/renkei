---
'renkei-core': patch
---

Fix `buildClaims()` dropping `line:user_id`, `line:channel_id`, `line:friend` and `line:region` after account linking when the messaging channel has no `channelId` configured. In that setup the link is recorded on the login row itself (same provider, same userId), flipping its `kind` to `messaging`, and the claim builder then found no login-side account. Messaging-side rows are now used as a fallback when they are all the identity has. Found live on renkei-demo.
