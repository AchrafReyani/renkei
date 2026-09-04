# renkei-next

## 0.5.0

### Patch Changes

- 44c86d2: Add a `default` condition next to `import` in the package `exports` so CommonJS-side resolvers that ignore the `import` condition (Jest without ESM mode, some bundler configs) can find `renkei-client`, `renkei-next` and `renkei-next/button` — previously `renkei-next/button` failed with "Cannot find module" under next/jest and needed a `moduleNameMapper` entry.
- Updated dependencies [44c86d2]
  - renkei-client@0.5.0

## 0.4.0

### Minor Changes

- 24d8358: New `renkei-next`: Next.js (App Router) helpers that make an app an OIDC client of renkei without Auth.js. `createRenkeiAuth({ issuer, clientId, clientSecret?, secret })` gives route handlers for `/api/renkei/{login,callback,logout,session}` (PKCE always on, `state`/`nonce` in a short-lived encrypted cookie, the id_token verified against renkei's JWKS, the claims stored in a JWE `A256GCM` session cookie), `getSession()` / `getSessionFromRequest()`, `loginPath()` / `logoutPath()`, and `proxy()` / `middleware()` guards that send anonymous requests to the login with `return_to`. `renkei-next/button` exports `<LineLoginButton />`, which follows LINE's Login button design guideline (colours, hover/press overlays, the official icon embedded unmodified, separator, padding, disabled state) and renders in Server and Client Components.

### Patch Changes

- Updated dependencies [ff893a4]
  - renkei-client@0.4.0
