---
'renkei-server': minor
---

Add first-run configuration checks. At startup renkei now inspects the config
it was given and logs advisories for the mistakes that otherwise fail silently:
no signing keys, in-memory storage, the `/dev` relying party left enabled, an
`email` scope on a channel that may lack email permission, and — new for the
Messaging API webhook — a `messagingChannels` region that matches no Login
channel (events would be mirrored onto the wrong channel) plus a reminder that
the Messaging API channel must share a provider with its Login channel and have
its webhook URL pointed at `${issuer}/line/webhook`. Exposed as
`firstRunChecks()` / `reportFirstRunChecks()` for embedders.
