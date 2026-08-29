# renkei-core

## 0.2.1

### Patch Changes

- 4cc0151: Fix `buildClaims()` dropping `line:user_id`, `line:channel_id`, `line:friend` and `line:region` after account linking when the messaging channel has no `channelId` configured. In that setup the link is recorded on the login row itself (same provider, same userId), flipping its `kind` to `messaging`, and the claim builder then found no login-side account. Messaging-side rows are now used as a fallback when they are all the identity has. Found live on renkei-demo.

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
- 9ed52b8: Add LINE Messaging API webhook parsing to `renkei-core`: `parseWebhook()`
  verifies the `x-line-signature` HMAC-SHA256 (Web Crypto, runtime-portable,
  timing-safe) with the Messaging API channel secret and returns typed events,
  plus `verifyWebhookSignature()` and `isFollowEvent` / `isUnfollowEvent` /
  `isAccountLinkEvent` narrowing helpers and a `LineWebhookError`.

## 0.1.0

### Minor Changes

- First release. Self-hosted identity broker for LINE, exposed as a standard OIDC provider:
  
  - LINE Login with friend-add (`bot_prompt`), PKCE, id_token verification, friendship status
  - LIFF token exchange (`POST /liff/exchange`), verified in the external browser and inside the LINE app
  - Stable per-user `sub` mapped to LINE user IDs; `line:*` claims; optional email with placeholder for downstreams that require one
  - Storage: in-memory (dev) and Postgres (Drizzle, auto-migrate)
  - Keycloak-shaped endpoint aliases so Supabase can use renkei as a provider; Next.js (Auth.js) works as a plain OIDC client
  - `renkei` CLI, Docker image, Render/Fly deployment references, Japanese-first docs with English mirror
