# renkei-server

## 0.2.0

### Minor Changes

- d78649e: Account linking (first slice, renkei-owned / Option A).
  
  renkei-core: `issueLinkToken()`, `buildAccountLinkUrl()` and `startAccountLink()`
  drive the LINE "Linking user accounts" flow (mint a one-time link token with the
  Messaging API channel access token, then build the `dialog/bot/accountLink` URL).
  `buildClaims()` now emits `line:linked` (true once a messaging-side account exists).
  
  renkei-server: `POST /link/start` takes a renkei access token (Bearer), resolves
  it to a `sub`, mints a link token for that user's LINE account, stores nonce → sub,
  and returns the accountLink dialog URL for the app to redirect to. The existing
  `POST /line/webhook` now finalises `accountLink` events (nonce → identity, recording
  the messaging account, which flips `line:linked`). New config
  `messagingChannels[].channelAccessToken` (env `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN`).
  Downstream apps read `line:linked` as a claim — no webhook code of their own.
- e47e577: Account linking, forwarded mode (Option B). For apps that run their own linking
  — owning the nonce and the account it maps to (e.g. connecting LINE to a
  pre-existing password account) — set `accountLinkForwardUrl` (+
  `accountLinkForwardSecret`) on a messaging channel. renkei verifies LINE's
  signature and relays any `accountLink` event whose nonce it doesn't own to that
  URL as `{ type, userId, nonce, result, timestamp }`, signed with base64
  HMAC-SHA256 in `x-renkei-signature`; the app matches the nonce and records the
  binding, with no Messaging webhook of its own. renkei-owned nonces (from
  `/link/start` / `/link`) are still handled internally and never forwarded.
  renkei-core gains `signWebhookBody()` (the signing counterpart of
  `verifyWebhookSignature()`). Env: `LINE_ACCOUNTLINK_FORWARD_URL` /
  `LINE_ACCOUNTLINK_FORWARD_SECRET`.
- dba8faf: Add first-run configuration checks. At startup renkei now inspects the config
  it was given and logs advisories for the mistakes that otherwise fail silently:
  no signing keys, in-memory storage, the `/dev` relying party left enabled, an
  `email` scope on a channel that may lack email permission, and — new for the
  Messaging API webhook — a `messagingChannels` region that matches no Login
  channel (events would be mirrored onto the wrong channel) plus a reminder that
  the Messaging API channel must share a provider with its Login channel and have
  its webhook URL pointed at `${issuer}/line/webhook`. Exposed as
  `firstRunChecks()` / `reportFirstRunChecks()` for embedders.
- eac1fb3: Read-only inspection endpoints (`/inspect`), mounted only when `adminToken`
  (env `RENKEI_ADMIN_TOKEN`) is set. A Bearer-gated JSON API — look up an identity
  by `sub` or by LINE `channelId + userId`, see its LINE accounts with friendship
  and `line:linked`, and glance at recent webhook events (an in-memory,
  per-process ring) — plus a self-contained HTML shell that prompts for the token
  and calls the API. Deliberately not an admin console: no list-all, nothing
  mutates. New config `adminToken`; `createWebhookLog()` / `inspectRoutes()`
  exported for embedders. A first-run check notes when `/inspect` is enabled.
- b735c20: Add `GET /link`, a browser entry for account linking. Users who don't already
  hold a renkei access token can open `/link` directly: renkei logs them in at
  LINE (a normal login round-trip on the shared `/line/callback`), then — instead
  of finishing an OIDC interaction — mints a link token and redirects straight to
  the accountLink dialog. The same nonce store and `accountLink` webhook finalise
  the link and set `line:linked`. Requires a messaging channel with a
  `channelAccessToken`; region via `?line_region=`.
- d1c6505: First-party session-cookie mode for apps that use renkei directly (no OIDC
  client of their own). Enable with `sessionCookie` (env `RENKEI_SESSION_COOKIE=true`):
  `GET /login` runs LINE login and sets a signed HttpOnly `SameSite=Lax` cookie
  (Secure on HTTPS), `GET /session` returns the user's claims (`sub`, `name`,
  `line:*`) from the cookie, `POST /logout` clears it. `return_to` is validated to
  prevent open redirects (same-origin paths, or origins allowlisted via
  `returnUrls` / `RENKEI_SESSION_RETURN_URLS`). Sessions live in the payload store
  with a configurable ttl. This is an alternative to the OIDC flow, not a
  replacement.
- 65eb7c9: Structured logging with redaction. renkei now wraps its log sink so every log
  call deep-redacts sensitive metadata (tokens, channel secrets, cookies,
  authorization headers, link tokens, nonces, …) by key name before anything is
  emitted — redaction is always on. `RENKEI_LOG_FORMAT=json` (or
  `logStructured: true`) emits one JSON object per line for aggregators; the
  default stays human-readable. `createLogger()`, `redact()` and
  `DEFAULT_REDACT_KEYS` are exported for embedders.
- e77484b: Add `POST /line/webhook`: the server now accepts LINE Messaging API webhooks,
  verifies the `x-line-signature` HMAC against a configured Messaging API channel
  secret, and mirrors `follow`/`unfollow` events into the identity store so
  `line:friend` stays accurate between logins (`accountLink` is acknowledged;
  full handling is a later slice). Configure via `messagingChannels`
  (env: `LINE_MESSAGING_CHANNEL_SECRET`, `LINE_MESSAGING_CHANNEL_ID`); the route
  returns 404 when unconfigured.

### Patch Changes

- Updated dependencies [d78649e]
- Updated dependencies [e47e577]
- Updated dependencies [9ed52b8]
  - renkei-core@0.2.0
  - renkei-storage-postgres@0.2.0

## 0.1.0

### Minor Changes

- First release. Self-hosted identity broker for LINE, exposed as a standard OIDC provider:
  
  - LINE Login with friend-add (`bot_prompt`), PKCE, id_token verification, friendship status
  - LIFF token exchange (`POST /liff/exchange`), verified in the external browser and inside the LINE app
  - Stable per-user `sub` mapped to LINE user IDs; `line:*` claims; optional email with placeholder for downstreams that require one
  - Storage: in-memory (dev) and Postgres (Drizzle, auto-migrate)
  - Keycloak-shaped endpoint aliases so Supabase can use renkei as a provider; Next.js (Auth.js) works as a plain OIDC client
  - `renkei` CLI, Docker image, Render/Fly deployment references, Japanese-first docs with English mirror

### Patch Changes

- Updated dependencies
  - renkei-core@0.1.0
  - renkei-storage-postgres@0.1.0
