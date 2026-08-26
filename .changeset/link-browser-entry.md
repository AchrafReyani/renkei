---
'renkei-server': minor
---

Add `GET /link`, a browser entry for account linking. Users who don't already
hold a renkei access token can open `/link` directly: renkei logs them in at
LINE (a normal login round-trip on the shared `/line/callback`), then — instead
of finishing an OIDC interaction — mints a link token and redirects straight to
the accountLink dialog. The same nonce store and `accountLink` webhook finalise
the link and set `line:linked`. Requires a messaging channel with a
`channelAccessToken`; region via `?line_region=`.
