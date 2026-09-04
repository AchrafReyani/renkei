---
"renkei-core": minor
"renkei-server": minor
---

LINE MINI App channel support. Channels take `kind: 'login' | 'miniapp'` and an optional `provider`; `LINE_MINIAPP_CHANNEL_ID` / `LINE_MINIAPP_CHANNEL_SECRET` register a MINI App's stage channels (comma-separated) next to the Login channel. `POST /liff/exchange` accepts MINI App id_tokens and access tokens, and identities are now provider-scoped: `upsertIdentityFromLine()` takes `providerChannelIds`, and a LINE user ID already known on a sibling channel of the same provider reuses that identity's `sub` instead of creating a second one (channels with the same `provider` value, or none, are one provider). `/dev/liff?liff_id=` swaps the LIFF app the test page initialises. Guide: docs/guides/line-mini-app.
