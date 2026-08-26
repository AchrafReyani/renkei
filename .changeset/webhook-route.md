---
'renkei-server': minor
---

Add `POST /line/webhook`: the server now accepts LINE Messaging API webhooks,
verifies the `x-line-signature` HMAC against a configured Messaging API channel
secret, and mirrors `follow`/`unfollow` events into the identity store so
`line:friend` stays accurate between logins (`accountLink` is acknowledged;
full handling is a later slice). Configure via `messagingChannels`
(env: `LINE_MESSAGING_CHANNEL_SECRET`, `LINE_MESSAGING_CHANNEL_ID`); the route
returns 404 when unconfigured.
