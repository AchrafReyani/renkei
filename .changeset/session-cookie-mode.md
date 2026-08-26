---
'renkei-server': minor
---

First-party session-cookie mode for apps that use renkei directly (no OIDC
client of their own). Enable with `sessionCookie` (env `RENKEI_SESSION_COOKIE=true`):
`GET /login` runs LINE login and sets a signed HttpOnly `SameSite=Lax` cookie
(Secure on HTTPS), `GET /session` returns the user's claims (`sub`, `name`,
`line:*`) from the cookie, `POST /logout` clears it. `return_to` is validated to
prevent open redirects (same-origin paths, or origins allowlisted via
`returnUrls` / `RENKEI_SESSION_RETURN_URLS`). Sessions live in the payload store
with a configurable ttl. This is an alternative to the OIDC flow, not a
replacement.
