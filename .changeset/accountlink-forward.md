---
'renkei-core': minor
'renkei-server': minor
---

Account linking, forwarded mode (Option B). For apps that run their own linking
— owning the nonce and the account it maps to (e.g. connecting LINE to a
pre-existing password account) — set `accountLinkForwardUrl` (+
`accountLinkForwardSecret`) on a messaging channel. renkei verifies LINE's
signature and relays any `accountLink` event whose nonce it doesn't own to that
URL as `{ type, userId, nonce, result, timestamp }`, signed with base64
HMAC-SHA256 in `x-renkei-signature`; the app matches the nonce and records the
binding, with no Messaging webhook of its own. renkei-owned nonces (from
`/link/start` / `/link`) are still handled internally and never forwarded.
renkei-core gains `signWebhookBody()` (the signing counterpart of
`verifyWebhookSignature()`). Env: `LINE_ACCOUNTLINK_FORWARD_URL` /
`LINE_ACCOUNTLINK_FORWARD_SECRET`.
