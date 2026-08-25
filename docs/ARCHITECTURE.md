# Architecture

Design notes for v0.1–v0.3. No code exists yet; this is what the code will
be. Diagrams are Mermaid (GitHub renders them).

## 1. Where renkei sits

```mermaid
flowchart LR
    subgraph LINE["LINE Platform (LY Corp)"]
        LL[LINE Login\nauthorize / token / verify / JWKS]
        LIFF[LIFF SDK\nid_token in WebView]
        MAPI[Messaging API\nwebhooks: follow / unfollow / accountLink]
    end

    subgraph R["renkei (self-hosted)"]
        FLOW[LINE flows\nbot_prompt, PKCE, id_token verify]
        XCH[LIFF exchange]
        LINK[Account linking\nlink token / nonce]
        IDM[(Identity store\nsub ↔ LINE userIds\nfriendship, channels)]
        OP[OIDC Provider\ndiscovery / authorize / token / userinfo / JWKS]
    end

    subgraph DOWN["Your side"]
        APP[Your app\n(direct)]
        SUPA[Supabase Auth\nthird-party / custom OIDC]
        FB[Firebase\ncustom token]
        COG[Cognito / Keycloak\nOIDC federation]
    end

    LL <--> FLOW
    LIFF --> XCH
    MAPI --> LINK
    MAPI --> IDM
    FLOW --> IDM
    XCH --> IDM
    LINK --> IDM
    IDM --> OP
    OP --> APP
    OP --> SUPA
    OP --> FB
    OP --> COG
```

renkei is *upstream* of your IdP (or your app). It speaks LINE on the left
and standard OIDC on the right. Your existing auth stack treats renkei as
"just another OIDC provider" — the only difference is the extra `line:*`
claims.

## 2. Components

| Package | Responsibility | Depends on |
|---|---|---|
| `core` | Pure LINE logic: build authorize URLs (with `bot_prompt`, `nonce`, `state`, PKCE), exchange codes, verify id_tokens (HS256 + ES256/JWKS), call `/verify` as fallback, fetch friendship status, parse webhooks, identity mapping rules. **No HTTP server, no DB driver** — takes a `Storage` interface. | `jose`, `zod` |
| `server` | Hono app wiring `core` to routes; hosts `oidc-provider`; config loading (env / YAML); webhook signature verification; health/metrics. | `core`, `hono`, `oidc-provider` |
| `storage-postgres` / `storage-sqlite` | Implement `Storage` with Drizzle. Migrations shipped. | `drizzle-orm` |
| `client` | Browser + Node helper: `exchangeLiffToken()`, `loginUrl()`, session cookie helpers. Zero deps. | — |
| `next` (v0.3) | App Router helpers, middleware, `<LineLoginButton />` following LINE's button guidelines. | `client` |

`core` being framework-free is what lets the same logic run in Node, Bun,
Deno (Supabase Edge) and Workers. It is also the package that gets the most
unit tests.

## 3. Flows

### 3.1 Web login with friend-add

```mermaid
sequenceDiagram
    participant U as User (browser)
    participant A as Your app / IdP
    participant R as renkei
    participant L as LINE Login

    U->>A: click "LINEでログイン"
    A->>R: GET /oidc/authorize (standard OIDC, client_id=your-app)
    R->>R: create state, nonce, PKCE verifier; pick channel by region
    R->>L: 302 access.line.me/oauth2/v2.1/authorize?bot_prompt=aggressive&scope=openid profile email…
    L->>U: consent + "友だち追加"
    L->>R: 302 /line/callback?code&state&friendship_status_changed=true
    R->>L: POST /oauth2/v2.1/token (code + verifier)
    L-->>R: id_token, access_token
    R->>R: verify id_token locally (kid → HS256 secret or ES256 JWKS), check nonce/aud/iss/exp
    R->>L: GET /friendship/v1/status (access_token)
    R->>R: upsert identity: sub ↔ line userId (channel), email from id_token, friend=true
    R->>A: 302 back with OIDC code
    A->>R: POST /oidc/token
    R-->>A: id_token { sub, email, line:user_id, line:friend, line:channel_id }
```

Notes
- Email is taken **only** from the id_token. userinfo never has it. If the
  channel hasn't been granted email permission, the claim is absent and we
  say so in logs at setup.
- `friendship_status_changed` is informational; the truth is the
  `/friendship/v1/status` call plus later webhooks.
- The OIDC leg between app and renkei is handled entirely by `oidc-provider`;
  renkei only supplies the "account" (findAccount) and the extra claims.

### 3.2 LIFF / Mini App

```mermaid
sequenceDiagram
    participant W as LIFF app (in LINE)
    participant R as renkei
    participant L as LINE

    W->>W: liff.init(); liff.getIDToken()
    W->>R: POST /liff/exchange { id_token }   (never profile JSON)
    R->>R: verify locally (channel from LIFF id prefix); fallback POST api.line.me/oauth2/v2.1/verify
    R->>L: friendship status (if access_token also supplied)
    R->>R: upsert identity
    R-->>W: renkei session cookie  +/or  OIDC tokens for your app
```

The response shape is configurable: a first-party session cookie (simple
apps), or a short-lived code the app redeems at `/oidc/token` (apps that
already use OIDC downstream). Both come from the same identity record as
web login, so a user who logged in on the web and later opens the Mini App
is the **same `sub`**.

### 3.3 Messaging API account linking (v0.2)

```mermaid
sequenceDiagram
    participant U as User (in LINE chat)
    participant B as Your bot (Messaging API)
    participant R as renkei
    participant L as LINE

    U->>B: taps "アカウント連携" in rich menu
    B->>L: POST /v2/bot/user/{userId}/linkToken
    L-->>B: linkToken (10 min, single-use)
    B->>U: link to renkei /link?linkToken=…
    U->>R: GET /link?linkToken
    R->>R: run normal LINE Login (or your IdP login) to identify the user
    R->>R: generate nonce, store (nonce → sub)
    R->>L: 302 access.line.me/dialog/bot/accountLink?linkToken&nonce
    L->>B: webhook { type: accountLink, result: ok, nonce, userId }
    B->>R: forward webhook (or R receives it directly)
    R->>R: nonce → sub; attach Messaging userId to identity
```

renkei can be the webhook receiver itself, or your bot forwards the
`accountLink` event. We support both because many teams already have a
webhook handler they won't move.

## 4. Data model (v0.1)

```
identity            sub (uuid) · created_at · email · email_verified · display_name · picture_url
line_account        identity_sub · channel_id · line_user_id · kind (login|liff|messaging) · friend (bool) · friend_checked_at · raw_profile (jsonb)
                    UNIQUE (channel_id, line_user_id)
channel             channel_id · secret_ref · region (jp|tw|th|…) · kind (login|messaging) · provider_id · liff_ids[]
oidc_*              owned by oidc-provider adapter (clients, sessions, grants, codes)
link_nonce          nonce · identity_sub · expires_at            (v0.2)
webhook_event       id · channel_id · type · payload · received_at · processed_at   (idempotency + audit)
```

- One `identity` can have several `line_account` rows: one per channel
  (multi-region) and per kind (Login/LIFF share a userId when under one
  provider; Messaging matches too **only** under the same provider — see
  DECISIONS.md §6).
- `raw_profile` keeps what LINE gave us so downstream claim mapping can
  change without re-auth.
- Secrets are referenced, not stored, when a secret manager is configured;
  plain env vars for the simple case.

## 5. Configuration (sketch)

```yaml
# renkei.yaml
issuer: https://auth.example.com
storage: postgres://…
channels:
  - id: "1234567890"          # LINE Login, Japan
    region: jp
    secret: ${LINE_JP_SECRET}
    liff_ids: ["1234567890-abcdefgh"]
    bot_prompt: aggressive
  - id: "2345678901"          # LINE Login, Taiwan
    region: tw
    secret: ${LINE_TW_SECRET}
messaging:
  channel_id: "3456789012"
  channel_secret: ${LINE_MSG_SECRET}
  receive_webhooks: true       # or false if your bot forwards
clients:                        # downstream OIDC clients
  - client_id: supabase
    client_secret: ${SUPABASE_CLIENT_SECRET}
    redirect_uris: ["https://xyz.supabase.co/auth/v1/callback"]
claims:
  email: from_id_token         # only option that works
  extra: [line:user_id, line:friend, line:channel_id, line:region]
```

Region routing: `/oidc/authorize?…&line_region=tw` or per-client default.
Strict validation with `zod`; misconfiguration fails at boot with a Japanese
and English message.

## 6. Security notes / threat model (to expand before v1.0)

- **Token verification is local first.** `kid`-less HS256 tokens are verified
  with the channel secret; ES256 tokens via cached LINE JWKS with rotation.
  LINE's `/verify` endpoint is a fallback and a test oracle, not the primary
  path (latency + availability).
- **Never trust client-supplied profile data.** `/liff/exchange` takes tokens
  only. Documented loudly — it's the mistake LINE itself blogged about.
- **PKCE mandatory** on the LINE leg and on the downstream OIDC leg for
  public clients.
- **Webhook signatures** (`x-line-signature`, HMAC-SHA256 with channel
  secret) verified before parsing; events stored with idempotency keys.
- **Nonce single-use** with short TTL for both login and account linking.
- **No secrets in logs.** Structured logging with a redaction list.
- **Downstream token lifetime** short; refresh handled by `oidc-provider`.
- Out of scope for v0.x: rate limiting (put it in front), WAF, DDoS.

## 7. Open technical questions (resolve in the week-1 spike)

1. ~~Does `oidc-provider` run under Deno / Cloudflare Workers well enough?~~
   **Resolved 2026-08-26: yes, on both** (Workers via `cloudflare:node`
   `httpServerHandler`). See SPIKE-oidc-provider-runtimes.md. Remaining:
   Supabase `edge-runtime` unverified.
2. LINE JWKS caching and `kid` behaviour for ES256 — confirm against a real
   channel; docs are thin.
3. Whether to make renkei *also* accept a LINE **access token** on
   `/liff/exchange` (some LIFF apps only have that). Probably yes, via
   `/oauth2/v2.1/verify` + `/v2/profile`.
4. Supabase third-party auth expects specific claim shapes — pin down what
   it needs from a custom OIDC provider before writing Tutorial 1.
