# renkei-client

## 0.5.0

### Patch Changes

- 44c86d2: Add a `default` condition next to `import` in the package `exports` so CommonJS-side resolvers that ignore the `import` condition (Jest without ESM mode, some bundler configs) can find `renkei-client`, `renkei-next` and `renkei-next/button` — previously `renkei-next/button` failed with "Cannot find module" under next/jest and needed a `moduleNameMapper` entry.

## 0.4.0

### Minor Changes

- ff893a4: New `renkei-client`: a zero-dependency SDK for apps that talk to a renkei server, for browsers, Node and Workers. `createRenkeiClient({ issuer, clientId })` gives `loginUrl()` (with `bot_prompt`, `line_region` and PKCE), `exchangeCode()`, `userinfo()`, `exchangeLiffToken()` (wraps `POST /liff/exchange`), and `sessionLoginUrl()` / `session()` / `logout()` for session-cookie mode, plus a typed `RenkeiClaims` with the `line:*` claims, `decodeClaimsUnverified()`, `generatePkce()` and `randomString()`. Errors surface as `RenkeiClientError` with the OAuth `error` / `error_description`.
