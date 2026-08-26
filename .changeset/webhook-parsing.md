---
'renkei-core': minor
---

Add LINE Messaging API webhook parsing to `renkei-core`: `parseWebhook()`
verifies the `x-line-signature` HMAC-SHA256 (Web Crypto, runtime-portable,
timing-safe) with the Messaging API channel secret and returns typed events,
plus `verifyWebhookSignature()` and `isFollowEvent` / `isUnfollowEvent` /
`isAccountLinkEvent` narrowing helpers and a `LineWebhookError`.
