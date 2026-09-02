---
"renkei-client": minor
---

New `renkei-client`: a zero-dependency SDK for apps that talk to a renkei server, for browsers, Node and Workers. `createRenkeiClient({ issuer, clientId })` gives `loginUrl()` (with `bot_prompt`, `line_region` and PKCE), `exchangeCode()`, `userinfo()`, `exchangeLiffToken()` (wraps `POST /liff/exchange`), and `sessionLoginUrl()` / `session()` / `logout()` for session-cookie mode, plus a typed `RenkeiClaims` with the `line:*` claims, `decodeClaimsUnverified()`, `generatePkce()` and `randomString()`. Errors surface as `RenkeiClientError` with the OAuth `error` / `error_description`.
