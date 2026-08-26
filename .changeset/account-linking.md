---
'renkei-core': minor
'renkei-server': minor
---

Account linking (first slice, renkei-owned / Option A).

renkei-core: `issueLinkToken()`, `buildAccountLinkUrl()` and `startAccountLink()`
drive the LINE "Linking user accounts" flow (mint a one-time link token with the
Messaging API channel access token, then build the `dialog/bot/accountLink` URL).
`buildClaims()` now emits `line:linked` (true once a messaging-side account exists).

renkei-server: `POST /link/start` takes a renkei access token (Bearer), resolves
it to a `sub`, mints a link token for that user's LINE account, stores nonce → sub,
and returns the accountLink dialog URL for the app to redirect to. The existing
`POST /line/webhook` now finalises `accountLink` events (nonce → identity, recording
the messaging account, which flips `line:linked`). New config
`messagingChannels[].channelAccessToken` (env `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN`).
Downstream apps read `line:linked` as a claim — no webhook code of their own.
