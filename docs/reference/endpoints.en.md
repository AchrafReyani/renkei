# Endpoints and claims

> 日本語: [endpoints.ja.md](endpoints.ja.md)

## OIDC provider

renkei is an OpenID Connect provider (built on [node-oidc-provider](https://github.com/panva/node-oidc-provider), authorization code flow).

| Path | What |
|---|---|
| `GET /.well-known/openid-configuration` | discovery; issuer is `ISSUER` |
| `GET /oidc/jwks` | public keys (RS256) |
| `GET /oidc/auth` | authorization endpoint. Besides the standard parameters it accepts **`bot_prompt`** (`normal` / `aggressive`) and **`line_region`** (`jp` / `tw` …; only applied when a LINE authentication actually runs — an existing renkei session answers without one, so pair it with `prompt=login` to switch regions). `ui_locales` is forwarded to LINE's consent screen |
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
| `line` | `line:user_id` (LINE userId within this channel), `line:friend` (friendship with the linked Official Account; omitted if unknown), `line:channel_id`, `line:region`, `line:linked` (`true` once the user has completed account linking) |
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

`renkei-client`'s `exchangeLiffToken()` wraps this call → [Client SDK](client.en.md).

## LINE-facing

| Path | What |
|---|---|
| `GET /interaction/:uid` | entry point when the OIDC provider needs a user; forwards to LINE (internal) |
| `GET /line/callback` | where LINE returns. **Register `${ISSUER}/line/callback` as a Callback URL in the console.** Path configurable via `lineCallbackPath` |
| `GET /interaction/:uid/finish` | login-result hand-off (internal) |
| `POST /line/webhook` | Messaging API webhook. Verifies `x-line-signature` (HMAC-SHA256, Messaging API channel secret), mirrors `follow`/`unfollow` into `line:friend`, and finalises `accountLink` events (nonce → identity, flipping `line:linked`). Enabled by `messagingChannels`; **set the OA webhook URL to `${ISSUER}/line/webhook`** |

## Account linking

| Path | What |
|---|---|
| `GET /link` | Browser entry for users who don't already hold a renkei access token. renkei logs them in at LINE (a normal login round-trip on the shared callback), then redirects straight to the accountLink dialog. Optional `?line_region=`. |
| `POST /link/start` | Start LINE account linking for the user of the supplied renkei access token (`Authorization: Bearer <access_token>`). renkei mints a one-time LINE link token and returns `{ url }` — the accountLink dialog to redirect the browser to. The link is finalised asynchronously when LINE delivers the `accountLink` webhook, which sets `line:linked`. |

Requires a `messagingChannels` entry with a `channelAccessToken` (`LINE_MESSAGING_CHANNEL_ACCESS_TOKEN`); without one the route returns `404 account_linking_not_configured`. Other errors: `401` (missing/invalid access token), `409 no_line_account` (the identity has no LINE login account yet), `502 link_start_failed` (LINE rejected the link-token mint).

**Forwarded (app-owned) mode.** If your app runs its own linking (it owns the nonce and the account it maps to — e.g. connecting LINE to a pre-existing password account), set `accountLinkForwardUrl` (+ `accountLinkForwardSecret`) on the messaging channel. renkei verifies LINE's signature and relays any `accountLink` event whose nonce it doesn't own to that URL as `{ type, userId, nonce, result, timestamp }`, signed with base64 HMAC-SHA256 in `x-renkei-signature`. Your app matches the nonce to its user and records the binding — no Messaging webhook of its own required. renkei-owned nonces (from `POST /link/start`) are handled internally and never forwarded.

## Session cookie mode

For an app that uses renkei **directly** (no OIDC client of its own). Enabled with `sessionCookie` (`RENKEI_SESSION_COOKIE=true`).

| Path | What |
|---|---|
| `GET /login` | Runs LINE login and, on return, sets a signed HttpOnly session cookie, then redirects to `return_to`. Optional `?return_to=` (same-origin path, or an allowlisted absolute URL — otherwise `/`) and `?line_region=` / `?bot_prompt=` |
| `GET /session` | Returns the current user's claims as JSON (`sub`, `name`, `line:*`, …) from the cookie; `401` if there is no valid session |
| `POST /logout` | Destroys the session and clears the cookie (`204`) |

The cookie is signed with `cookieKeys[0]`, `HttpOnly`, `SameSite=Lax`, and `Secure` when the issuer is HTTPS. `return_to` is validated to prevent open redirects. This is an alternative to the OIDC flow, not a replacement — most integrations should use `/oidc/*`.

`renkei-client`'s `sessionLoginUrl()` / `session()` / `logout()` wrap these → [Client SDK](client.en.md).

## Other

| Path | What |
|---|---|
| `GET /healthz` | `{ ok: true }` |
| `/dev/*` | only with `RENKEI_DEV=true`: a test OIDC client (`/dev`), LIFF test page (`/dev/liff`), landing page for downstream redirects (`/dev/landing`) |
| `/inspect` + `/inspect/api/*` | only when `RENKEI_ADMIN_TOKEN` is set: a read-only lookup page and its JSON API (`GET /inspect/api/identity/:sub`, `/inspect/api/line/:channelId/:userId`, `/inspect/api/webhooks`). The API is Bearer-gated on the admin token; the page carries no data and prompts for it. Read-only — nothing here mutates state |
