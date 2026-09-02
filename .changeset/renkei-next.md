---
"renkei-next": minor
---

New `renkei-next`: Next.js (App Router) helpers that make an app an OIDC client of renkei without Auth.js. `createRenkeiAuth({ issuer, clientId, clientSecret?, secret })` gives route handlers for `/api/renkei/{login,callback,logout,session}` (PKCE always on, `state`/`nonce` in a short-lived encrypted cookie, the id_token verified against renkei's JWKS, the claims stored in a JWE `A256GCM` session cookie), `getSession()` / `getSessionFromRequest()`, `loginPath()` / `logoutPath()`, and `proxy()` / `middleware()` guards that send anonymous requests to the login with `return_to`. `renkei-next/button` exports `<LineLoginButton />`, which follows LINE's Login button design guideline (colours, hover/press overlays, the official icon embedded unmodified, separator, padding, disabled state) and renders in Server and Client Components.
