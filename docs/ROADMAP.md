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
- [x] Apply for **email** permission — applied 2026-08-26, awaiting review;
      set `requestEmail: true` on the channel once approved
- [x] Publish placeholder `renkei@0.0.0` to npm — published 2026-08-26 (passkey 2FA; publish interactively)
- [ ] Register `renkei` GitHub org (free) — transfer repo there at launch or
      keep under personal account; decide at launch
- [x] Week-1 spike: `oidc-provider` on Deno/Workers — PASS on all three
      (2026-08-26, SPIKE-oidc-provider-runtimes.md)
- [x] Verify the same on Supabase `edge-runtime` — PASS via fetch→(req,res)
      shim (2026-08-26)
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
- [x] `verifyLiffToken()` — id_token path (`verifyIdToken`) and access_token path
      (`verifyAccessToken` + profile); live-verified in a browser 2026-08-26
- [ ] `parseWebhook()` + signature check for `follow`, `unfollow`
      (`accountLink` in v0.2)
- [x] Identity mapping: upsert rules, multi-channel, `sub` stability (`upsertIdentityFromLine`, `buildClaims`)
- [x] `Storage` interface + in-memory implementation for tests (+ shared behavioural contract test)
- [ ] Unit tests against recorded LINE fixtures (HS256 and ES256 tokens,
      real-shaped webhook bodies)

**server**
- [x] Config loader (env, zod-validated, JA/EN error messages) — YAML later
- [ ] First-run checks: provider sharing warning, email-permission warning
- [~] Routes: `/interaction/:uid` (→ LINE), `/line/callback`, `/interaction/:uid/finish`,
      `/liff/exchange`, `/healthz` done; `/webhooks/line` pending
- [x] `oidc-provider` mounted at `/oidc`: discovery, JWKS, authorize, token,
      userinfo; `findAccount` backed by identity store; `line:*` claims;
      first-party auto-grant (no second consent screen); PKCE required for
      public clients only; RS256 dev keys; e2e test with a fake LINE
- [ ] Session cookie mode for direct-app usage
- [ ] Structured logs with redaction

**storage**
- [x] `storage-postgres` (Drizzle, migrations) incl. the `oidc-provider` adapter — tested on PGlite
- [ ] `storage-sqlite` (dev) — deprioritised: memory storage covers dev, PGlite covers tests

**deploy**
- [x] Dockerfile (node:22-alpine, pnpm deploy --prod, 301 MB) — verified standalone 2026-08-26;
      GHCR publish workflow written (`release.yml`, runs on `v*` tags — not exercised yet)
- [x] `docker-compose.yml` with Postgres — verified: migrations run at boot, healthz 200
- [ ] npm publish via Changesets on tag (at launch; `renkei` CLI = `npx renkei` ready)
- [x] Demo instance running (Render free tier, cold-start disclaimer in README) — 2026-08-26

**docs (JA primary, EN mirror in the same PR)**
- [x] README: why / diagram / 5-minute quickstart / comparison table (ja + en) — badges at launch
- [x] Tutorial 1: Supabase + renkei (the wedge) — draft written ja/en; flow verified
      live 2026-08-26 (local CLI, keycloak provider, placeholder email): Supabase
      `user_signedup` + `login` events with LINE name
- [x] Tutorial 2: Next.js via Auth.js as a plain OIDC client (ja/en) + `examples/nextjs`;
      redirect chain verified, final LINE leg needs a human
- [x] Reference: config, endpoints, claims (webhooks land with v0.2)
- [x] LINE Developers Console prerequisites page (ja/en) — screenshots still to add
- [x] Trademark note + button-guideline link in README; compliant button component is issue #19
- [x] VitePress site (`pnpm docs:build`), `ja` root, `en` under /en/, local search

**hygiene** — full list in LAUNCH.md §3
- [x] CONTRIBUTING (ja/en), CoC, SECURITY, templates, CODEOWNERS, labels
- [x] 20 issues seeded (#1–#20), 6 `good first issue`
- [~] Social preview image generated (`.github/social-preview.png`) — upload is UI-only;
      topics + description set; homepage link at launch
- [x] Discussions enabled with a 「はじめに / Welcome」 thread

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

- [ ] `renkei-client`: `loginUrl()`, `exchangeLiffToken()`, session helpers
- [ ] `renkei-next`: App Router helpers, middleware, `<LineLoginButton />`
- [ ] Cloudflare Workers deploy target via `httpServerHandler` + KV/D1 or Hyperdrive adapter
- [ ] Supabase Edge Function deploy target — `adapters/fetch-to-node.ts` from the spike shim (+ host-header fix, Postgres adapter)
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
