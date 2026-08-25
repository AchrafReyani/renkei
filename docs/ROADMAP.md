# Roadmap

Checklists per milestone. Tick things here *and* close the matching GitHub
issue — this file is the human-readable view, issues are the work queue.
Once public, this mirrors a GitHub Project board.

## Week 0 — before any feature code

- [x] Employment contract side-project clause checked (2026-08-26: not needed)
- [x] Decide DECISIONS.md §3 (language) and §4 (stack) — confirmed 2026-08-26
- [x] LINE Developers: provider → LINE Login channel (JP) → Messaging API
      channel → LIFF app → OA linked to Login channel. Done 2026-08-26, see
      DEV_SETUP.md.
- [ ] Apply for **email** permission — needs a screenshot of a login screen;
      do it right after the spike produces one
- [ ] Publish placeholder `renkei@0.0.0` to npm — prepared in `packages/renkei`, blocked on Achraf's OTP
- [ ] Register `renkei` GitHub org (free) — transfer repo there at launch or
      keep under personal account; decide at launch
- [x] Week-1 spike: `oidc-provider` on Deno/Workers — PASS on all three
      (2026-08-26, SPIKE-oidc-provider-runtimes.md)
- [ ] Verify the same on Supabase `edge-runtime` (`supabase functions serve`,
      needs Docker running)
- [x] Monorepo skeleton: pnpm, Turborepo, Biome, Vitest, Changesets, CI
      (lint + test + typecheck on PR), DCO check, Renovate — 2026-08-26

## v0.1 — "shareable" (launch)

Order matters: each item is what the next needs.

**core**
- [x] `buildAuthorizeUrl()` — scope, `bot_prompt`, `state`, `nonce`, PKCE,
      `ui_locales`, `initial_amr_display`, `switch_amr`, `disable_auto_login`
      (all the LINE-specific params exposed, with docs) — verified live 2026-08-26
- [x] `exchangeCode()` — token endpoint, error mapping
- [x] `verifyIdToken()` — HS256 (channel secret) and ES256 (JWKS with cache
      + rotation); `iss`/`aud`/`exp`/`nonce`; email + `amr` extraction
      (ES256 tested with a local JWKS only — no ES256 channel yet)
- [x] `verifyViaLine()` — `/oauth2/v2.1/verify` fallback and test oracle
- [x] `getFriendshipStatus()` (+ `getProfile()`, `parseCallback()`)
- [ ] `verifyLiffToken()` — id_token path and access_token path
- [ ] `parseWebhook()` + signature check for `follow`, `unfollow`
      (`accountLink` in v0.2)
- [ ] Identity mapping: upsert rules, multi-channel, `sub` stability
- [ ] `Storage` interface + in-memory implementation for tests
- [ ] Unit tests against recorded LINE fixtures (HS256 and ES256 tokens,
      real-shaped webhook bodies)

**server**
- [ ] Config loader (env + YAML, zod-validated, JA/EN error messages)
- [ ] First-run checks: provider sharing warning, email-permission warning
- [ ] Routes: `/line/login`, `/line/callback`, `/liff/exchange`,
      `/webhooks/line`, `/healthz`
- [ ] `oidc-provider` mounted at `/oidc`: discovery, JWKS, authorize, token,
      userinfo; `findAccount` backed by identity store; `line:*` claims
- [ ] Session cookie mode for direct-app usage
- [ ] Structured logs with redaction

**storage**
- [ ] `storage-postgres` (Drizzle, migrations) incl. the `oidc-provider` adapter
- [ ] `storage-sqlite` (dev)

**deploy**
- [ ] Dockerfile (distroless), GHCR publish on tag
- [ ] `docker-compose.yml` with Postgres for the quickstart
- [ ] npm publish via Changesets on tag
- [ ] Demo instance running

**docs (JA primary, EN mirror in the same PR)**
- [ ] README: why / diagram / 5-minute quickstart / status badges
- [ ] Tutorial 1: Supabase + renkei (the wedge)
- [ ] Tutorial 2: Next.js direct with session cookie
- [ ] Reference: config, endpoints, claims, webhooks
- [ ] LINE Developers Console prerequisites page (provider sharing, email
      application, callback URLs, LIFF setup) — with screenshots
- [ ] Trademark note + LINE Login button guideline compliance
- [ ] VitePress site skeleton with `ja` default, `en` mirror

**hygiene** — full list in LAUNCH.md §3
- [ ] CONTRIBUTING (ja/en), CoC, SECURITY, templates, CODEOWNERS, labels
- [ ] ≥ 10 open issues seeded from v0.2/v0.3, ≥ 5 `good first issue`
- [ ] Social preview image, topics, description, homepage link
- [ ] Discussions enabled with a pinned 「はじめに / Welcome」 thread

**proof**
- [ ] Dogfooded in one real app for two weeks

## v0.2 — account linking

- [ ] Link-token flow: `/link` entry, nonce store, redirect to
      `dialog/bot/accountLink`
- [ ] `accountLink` webhook handling (direct and forwarded modes)
- [ ] Friendship sync from `follow`/`unfollow` with idempotency
- [ ] Minimal inspection UI (read-only): identities, linked accounts,
      friendship, recent webhooks. Not an admin console.
- [ ] Tutorial 3: rich-menu account linking end to end
- [ ] Zenn article #2

## v0.3 — SDKs and edge targets

- [ ] `@renkei/client`: `loginUrl()`, `exchangeLiffToken()`, session helpers
- [ ] `@renkei/next`: App Router helpers, middleware, `<LineLoginButton />`
- [ ] Cloudflare Workers deploy target via `httpServerHandler` + KV/D1 or Hyperdrive adapter
- [ ] Supabase Edge Function deploy target
- [ ] LINE MINI App channel support (LINE is folding LIFF into MINI App; new apps should be MINI App channels under the same provider) — service messages prerequisites, `liff.permanentLink`
- [ ] Multi-region tutorial (JP + TW channels, `line_region` routing)
- [ ] zh-TW docs kickoff (community), post in LINE Developers TW channels

## v0.4 — federation guides and framework examples

- [ ] Guides: Firebase custom token bridge, Cognito OIDC federation,
      Keycloak identity brokering, Logto custom connector
- [ ] `examples/`: Rails, Laravel, Spring Boot, Go — each CI-tested
- [ ] MySQL storage adapter (community)
- [ ] th docs kickoff (community)

## v1.0 — stability

- [ ] Config schema frozen; migration guide policy
- [ ] External security review (pay for it or find a sponsor)
- [ ] Weekly CI job against a live LINE test channel
- [ ] Governance doc: maintainers, RFC process, release cadence
- [ ] Qiita/Zenn Advent Calendar entry (December)

## Later / only if pulled

- Provider plugins: Yahoo! JAPAN ID, dアカウント, au ID, Kakao, Zalo
- Hosted offering
- LINE Pay / LINE ミニアプリ決済 hooks (out of scope unless a real user asks)
