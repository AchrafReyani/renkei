# Endpoints and claims

> 日本語: [endpoints.ja.md](endpoints.ja.md)

## OIDC provider

renkei is an OpenID Connect provider (built on [node-oidc-provider](https://github.com/panva/node-oidc-provider), authorization code flow).

| Path | What |
|---|---|
| `GET /.well-known/openid-configuration` | discovery; issuer is `ISSUER` |
| `GET /oidc/jwks` | public keys (RS256) |
| `GET /oidc/auth` | authorization endpoint. Besides the standard parameters it accepts **`bot_prompt`** (`normal` / `aggressive`) and **`line_region`** (`jp` / `tw` …). `ui_locales` is forwarded to LINE's consent screen |
| `POST /oidc/token` | token endpoint: `authorization_code` and `refresh_token`. Client auth: Basic / POST / none (public, PKCE required) |
| `GET /oidc/me` | userinfo (Bearer) |
| `POST /oidc/token/revocation` | revocation |

- No consent screen of its own (the user consented on LINE); requested scopes are granted as-is.
- PKCE is **required for public clients**, optional for confidential ones (some downstreams — Cognito — can't send it).
- `conformIdTokenClaims` is off: profile / email / line claims appear in **both** the id_token and userinfo.

## Keycloak-compatible aliases

For clients that expect Keycloak (Supabase Auth's `keycloak` provider, for instance), the same functionality is available on Keycloak's paths.

| Path | Forwards to |
|---|---|
| `/protocol/openid-connect/auth` | `/oidc/auth` (adds `openid` to the scope if missing) |
| `/protocol/openid-connect/token` | `/oidc/token` |
| `/protocol/openid-connect/userinfo` | `/oidc/me` |
| `/protocol/openid-connect/certs` | `/oidc/jwks` |
| `/protocol/openid-connect/logout` | `/oidc/session/end` |
| `/protocol/openid-connect/revoke` | `/oidc/token/revocation` |

Use renkei's `ISSUER` as the Keycloak "Realm URL".

## Scopes and claims

| Scope | Claims |
|---|---|
| `openid` | `sub` — an opaque ID minted by renkei. **Never derived from the LINE userId** (LINE IDs don't leak downstream) |
| `profile` | `name`, `picture` |
| `email` | `email`, `email_verified`, `email_placeholder` (`true` only when a placeholder was issued) |
| `line` | `line:user_id` (LINE userId within this channel), `line:friend` (friendship with the linked Official Account; omitted if unknown), `line:channel_id`, `line:region` |
| `offline_access` | refresh tokens |

`sub` is minted once at first login and never changes. Name and picture refresh on every login; email is **only ever added or updated, never removed** (a later login without the email scope keeps it).

## LIFF / Mini App

### `POST /liff/exchange`

Exchanges the LINE tokens a LIFF app holds for a renkei id_token. JSON or form body.

| Field | Meaning |
|---|---|
| `id_token` | `liff.getIDToken()`. Proves identity. The channel is picked from `aud`, then verified with the channel secret (HS256) or LINE's JWKS (ES256) |
| `access_token` | `liff.getAccessToken()`. Enables `/v2/profile` and the friendship check. Works alone too (validated at LINE's `/oauth2/v2.1/verify`) |
| `client_id` | a client registered with renkei; confidential clients also send `client_secret` (or HTTP Basic) |
| `scope` | default `openid profile email line` |

Response: `{ token_type: "Bearer", id_token, expires_in, sub }`. The `id_token` is signed by renkei (RS256, `aud` = `client_id`) and verifiable via `/oidc/jwks`. `amr` carries LINE's value (e.g. `["linesso"]`) or `["liff"]`.

Errors: `401 invalid_client` / `401 invalid_token` (token from another channel, forged, expired, id_token/access_token user mismatch) / `400 invalid_request`.

For direct browser calls, list the LIFF app's origin in `RENKEI_CORS_ORIGINS`.

## LINE-facing

| Path | What |
|---|---|
| `GET /interaction/:uid` | entry point when the OIDC provider needs a user; forwards to LINE (internal) |
| `GET /line/callback` | where LINE returns. **Register `${ISSUER}/line/callback` as a Callback URL in the console.** Path configurable via `lineCallbackPath` |
| `GET /interaction/:uid/finish` | login-result hand-off (internal) |
| `POST /line/webhook` | Messaging API webhook. Verifies `x-line-signature` (HMAC-SHA256, Messaging API channel secret) and mirrors `follow`/`unfollow` into `line:friend`. Enabled by `messagingChannels`; **set the OA webhook URL to `${ISSUER}/line/webhook`** |

## Other

| Path | What |
|---|---|
| `GET /healthz` | `{ ok: true }` |
| `/dev/*` | only with `RENKEI_DEV=true`: a test OIDC client (`/dev`), LIFF test page (`/dev/liff`), landing page for downstream redirects (`/dev/landing`) |
