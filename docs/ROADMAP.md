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
- [x] `parseWebhook()` + signature check for `follow`, `unfollow`,
      `accountLink` (HMAC-SHA256 via Web Crypto; renkei-core, 2026-08-26).
      Consumed by the `POST /line/webhook` server route (below).
- [x] Identity mapping: upsert rules, multi-channel, `sub` stability (`upsertIdentityFromLine`, `buildClaims`)
- [x] `Storage` interface + in-memory implementation for tests (+ shared behavioural contract test)
- [x] Unit tests against real-shaped LINE fixtures: webhook bodies
      (follow/unfollow/accountLink/message, group source, batched, verify ping)
      in `test/fixtures/webhooks.ts` (2026-08-26). HS256/ES256 id_tokens are
      exercised by `id-token.test.ts` (signed at test time with jose).

**server**
- [x] Config loader (env, zod-validated, JA/EN error messages) — YAML later
- [x] First-run checks: provider-sharing + webhook-region + email-permission +
      in-memory-storage + `/dev`-enabled warnings (`firstRunChecks()`,
      renkei-server, 2026-08-26)
- [x] Routes: `/interaction/:uid` (→ LINE), `/line/callback`, `/interaction/:uid/finish`,
      `/liff/exchange`, `/healthz`, and `POST /line/webhook` (follow/unfollow →
      friendship; accountLink acked) done
- [x] `oidc-provider` mounted at `/oidc`: discovery, JWKS, authorize, token,
      userinfo; `findAccount` backed by identity store; `line:*` claims;
      first-party auto-grant (no second consent screen); PKCE required for
      public clients only; RS256 dev keys; e2e test with a fake LINE
- [x] Session cookie mode for direct-app usage: `/login` + signed session
      cookie, `/session` (claims), `/logout`; `return_to` open-redirect guard;
      enable via `sessionCookie` / `RENKEI_SESSION_COOKIE` (2026-08-27)
- [x] Structured logs with redaction: `createLogger()` wraps the sink,
      deep-redacts secrets by key (always on), `RENKEI_LOG_FORMAT=json` for
      one-JSON-line output (2026-08-27)

**storage**
- [x] `storage-postgres` (Drizzle, migrations) incl. the `oidc-provider` adapter — tested on PGlite
- [x] `storage-sqlite` — shipped 2026-08-30 as the first v0.3 item (see below): Node's
      built-in `node:sqlite`, zero dependencies, `DATABASE_URL=sqlite:<file>`; same
      contract tests as Postgres plus file persistence / reopen / FK cascade

**deploy**
- [x] Dockerfile (node:22-alpine, pnpm deploy --prod, 301 MB) — verified standalone 2026-08-26;
      GHCR publish workflow written (`release.yml`, runs on `v*` tags — first
      exercised on `v0.2.0`, 2026-08-27: `:0.2.0` / `:0.2` / `:latest`;
      `v0.2.1`, `v0.2.2`, `v0.2.3` and `v0.3.0` on 2026-08-30; `v0.4.0` on 2026-09-03; `v0.5.0` on 2026-09-04)
- [x] `docker-compose.yml` with Postgres — verified: migrations run at boot, healthz 200
- [x] npm publish via Changesets (`changeset version` on a PR, then `pnpm -r publish`
      interactively — passkey 2FA); 0.2.0 published 2026-08-27, 0.2.1 (patches
      #38 / #40) and 0.2.2 (#44, server + CLI only) 2026-08-30; 0.2.3 (#51,
      all four packages) published 2026-08-30; 0.3.0 (`renkei`, `renkei-server`,
      first publish of `renkei-storage-sqlite`) published 2026-08-30; 0.4.0 (`renkei`,
      first publishes of `renkei-client` and `renkei-next`) published 2026-09-03; 0.5.0 (`renkei`,
      `renkei-server`, `renkei-storage-sqlite`, `renkei-storage-postgres`, `renkei-client`, `renkei-next`;
      Workers + Supabase Edge targets) published 2026-09-04.
      `renkei` CLI = `npx renkei` ready
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
- [x] Social preview image generated (`.github/social-preview.png`) and uploaded
      (2026-08-30); topics + description set; homepage link at launch
- [x] Discussions enabled with a 「はじめに / Welcome」 thread

**proof**
- [~] Dogfooded in one real app for two weeks — job-matching-platform in prod,
      clock started 2026-08-27 (v0.2.0); earliest launch 2026-09-10

## v0.2 — account linking

- [x] Link-token flow: `POST /link/start` (Bearer access token) mints the
      LINE link token, stores nonce → sub, returns the `dialog/bot/accountLink`
      URL; `startAccountLink()` / `issueLinkToken()` in renkei-core
      (2026-08-26, DESIGN-account-linking.md — Option A, renkei-owned).
      Plus `GET /link` — a browser entry that logs the user in then starts
      linking, for users without an access token in hand (2026-08-27)
- [x] `accountLink` webhook handling: direct mode (Option A — nonce → identity,
      `line:linked`) and forwarded mode (Option B — verify + relay to an
      app-owned `accountLinkForwardUrl`, signed with `x-renkei-signature`)
      (2026-08-27)
- [x] Friendship sync from `follow`/`unfollow` (idempotent `setFriendship`)
- [x] Minimal inspection UI (read-only): identity / LINE account lookup
      (by sub or channel+userId), friendship + `line:linked`, recent webhooks.
      Mounted only when `RENKEI_ADMIN_TOKEN` is set; Bearer-gated JSON API +
      a self-contained HTML shell (`/inspect`). Not an admin console — no
      list-all, nothing mutates (2026-08-26)
- [x] Tutorial 3: account linking end to end (ja/en) — the shipped `/link/start`
      → accountLink webhook → `line:linked` flow, with a rich-menu entry section
      and an /inspect verification walk-through (2026-08-27)
- [~] Zenn article #2 — draft written (`drafts/zenn-account-linking.md`, ja);
      publishing to Zenn is Achraf's step (2026-08-27)

## v0.3 — SDKs and edge targets

- [x] `renkei-storage-sqlite` — single-file storage with no database server (Node
      22.13+ `node:sqlite`; `better-sqlite3` / Bun via `createSqliteDriverStorage`).
      Motivation: renkei's setup cost (Postgres + env vars) is the main objection
      versus raw LINE Login; this removes the database from a single-box deploy
      (2026-08-30, DECISIONS.md §11)
- [x] `renkei init` / `renkei add-client` — the CLI writes a ready-to-run `.env`
      (signing + cookie keys generated, SQLite storage, `/dev` on; only the two LINE
      channel values are pasted) and registers OIDC clients with presets for Auth.js,
      Supabase (Keycloak fields, placeholder email domain) and public/PKCE clients,
      printing the app-side config. First run is `npx renkei init && npx renkei`
      (2026-08-30)
- [x] `renkei-client`: zero-dependency SDK (browsers / Node / Workers) — `loginUrl()`
      with `bot_prompt` / `line_region` / PKCE, `exchangeCode()`, `userinfo()`,
      `exchangeLiffToken()`, `sessionLoginUrl()` / `session()` / `logout()`, typed
      `RenkeiClaims` + `decodeClaimsUnverified()`, `generatePkce()`; 20 tests
      against the fake-LINE server; `renkei add-client` prints the SDK snippet
      (2026-09-02, DECISIONS.md §12)
- [x] `renkei-next`: `createRenkeiAuth()` route handlers (login/callback/logout/session,
      PKCE, JWKS-verified id_token, JWE session cookie), `getSession()`, `proxy()` /
      `middleware()` guard, `<LineLoginButton />` following LINE's button guideline with
      the official icon; `renkei add-client --preset next`; `examples/nextjs-renkei-next`
      (2026-09-03, DECISIONS.md §13)
- [x] Cloudflare Workers deploy target: `renkei-server/workers` (`createWorker()`, boots once per
      isolate from vars + secrets) with D1 storage via `renkei-storage-sqlite/d1` — the SQLite
      adapter's SQL on D1's async API (no `httpServerHandler`: the Hono app is already
      fetch-native through the fetch→node bridge). KV deliberately skipped (no secondary
      lookups, eventual consistency); Hyperdrive + Postgres via `createWorker({ storage })`.
      `examples/cloudflare-workers`, deploy guide ja/en (2026-09-04, DECISIONS.md §14)
- [x] Supabase Edge Function deploy target: `renkei-server/supabase` (`serve()` / `createEdgeFunction()`,
      boots once per isolate from `Deno.env`, Postgres from `DATABASE_URL` or the function's own
      `SUPABASE_DB_URL`, RLS enabled on renkei's tables). Made possible by path-prefixed issuers
      (`/functions/v1/<name>` kept on every URL, stripped from requests, passed to oidc-provider as
      its mount path), the bridge overriding `X-Forwarded-Host`, and `renkei-storage-postgres`
      migrating from an embedded list instead of the filesystem. `examples/supabase-edge`, deploy
      guide ja/en (2026-09-04, DECISIONS.md §15)
- [x] LINE MINI App channel support: channels carry `kind: 'login' | 'miniapp'` and an optional
      `provider`; `LINE_MINIAPP_CHANNEL_ID` / `_SECRET` (one ID per stage — a MINI App is three internal
      channels); `/liff/exchange` accepts MINI App id_tokens / access tokens; identities are provider-scoped
      (the same LINE user ID on a sibling channel reuses the `sub` — core rule 1); `/dev/liff?liff_id=`;
      guide ja/en incl. service-message prerequisites (2026-09-04, DECISIONS.md §16; #8). Live-verified
      on the demo from the LINE app: same `sub` as the web login
- [x] Multi-region tutorial (JP + TW channels, `line_region` routing) — `docs/tutorials/multi-region.{ja,en}.md`,
      plus the missing configuration for it: `RENKEI_CHANNELS` (further channels as JSON — a second region,
      a MINI App, or the whole list) and `LINE_MESSAGING_CHANNEL_REGION`; `/dev` grows a login link per
      region and passes `line_region` through; a boot check names the default channel. Identity across
      regions follows the provider rule from §16 (2026-09-05, #9)
- [x] Structured configuration for multi-channel setups (`renkei.yaml`, issue #11): the file is read from
      the working directory (`RENKEI_CONFIG` overrides it) through the existing `renkeiConfigSchema`,
      `snake_case` with camelCase accepted, `${VAR}` / `${VAR:-fallback}` expansion so secrets stay out of
      it, and it **supersedes** the environment — the variables it replaces are named at boot rather than
      silently applied. `renkei init --yaml` writes or converts one, `renkei add-channel [--miniapp]` and
      `renkei add-client` append to it (reference in the YAML, value in `.env`). Node-only loader
      (`renkei-server/config-file`); env stays the deploy-time path and the only one on Workers /
      Supabase Edge. DECISIONS.md §18 (2026-09-05, #11)
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
