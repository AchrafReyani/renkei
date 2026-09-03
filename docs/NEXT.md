# NEXT — what to do at the start of the next session

**Type `/todo`** to have Claude read this file + ROADMAP.md and lay out the
open items. Work through them **with Achraf, one at a time**. Most remaining
steps need his passkey, phone, the GitHub UI, the LINE console or Render.

**Pick up here (session of 2026-09-02; before it, 2026-08-30 ended at main `92500b9`):**
**0.3.0 is released** (npm + GHCR) with the first two v0.3 items —
`renkei-storage-sqlite` (no Postgres needed) and `renkei init` /
`renkei add-client` (no hand-written `.env` or `RENKEI_CLIENTS`). Everything
from 0.2.x is done and live-confirmed (#51 from the phone). Achraf's Node is
22.23.2. Claude merges PRs and pushes tags itself now (allow rules in
`.claude/settings.local.json`); only the npm passkey publish is Achraf's.

**Done 2026-09-02:** `renkei-client` shipped (§5) — zero-dep SDK, 20 tests,
live-checked on :8787 against the real channel (PKCE login via `loginUrl()` →
`exchangeCode()` → id_token with all `line:*` claims → `userinfo()`; session
mode `sessionLoginUrl()` → cookie → `/session` 200 → `/logout` 204). Changesets
are staged: `renkei-client` minor + `renkei` patch, so the next `pnpm changeset
version` produces **0.4.0** for the packages that have a changeset (linked
group; `renkei-client` is a first publish).

**Done 2026-09-03:** `renkei-next` shipped (§5) — route handlers, JWE session
cookie, `getSession()`, `proxy()` guard, `<LineLoginButton />` with LINE's official
icon; `renkei add-client --preset next`; `examples/nextjs-renkei-next`. 15 tests;
**live-checked**: the example on :3500 against renkei on :8787 with the real
channel (button → LINE consent → `/account` with all `line:*` claims → logout).
Released together as **0.4.0** the same day (§0).

**Done 2026-09-04:** **Cloudflare Workers target** (§5, issue #6) — `renkei-server/workers`
(`createWorker()`; boots once per isolate from vars + secrets, 500 + retry on a failed boot,
warns when `RENKEI_JWKS` / `RENKEI_COOKIE_KEYS` are not pinned) and `renkei-storage-sqlite/d1`
(`createD1Storage(env.DB)`: the SQLite adapter's SQL on D1's async API; schema version in
`renkei_meta` because D1 refuses `PRAGMA user_version` / `BEGIN`; DDL batched atomically).
The driver interface is async-capable now (`migrateSqlite()` / `readUserVersion()` return
Promises). Tests: the storage contract + the server e2e suite run against **real workerd D1**
via Miniflare (260 tests). `examples/cloudflare-workers` (`wrangler deploy --dry-run` bundles
1.98 MB / 343 KB gzip, no `pg`), guide `docs/guides/deploy-cloudflare-workers.{ja,en}.md`,
DECISIONS.md §14. KV skipped on purpose (no secondary lookups, eventual consistency).
**Live-verified on `wrangler dev` :8787 with the real channel** (Achraf completed the LINE
leg in the browser): `/dev` → LINE → `/dev/callback` with an id_token (`kid` = the pinned key)
carrying `line:user_id`, `line:friend: true`, `line:channel_id`, `line:region: jp`, `aud:
renkei-dev`, plus `/oidc/me`; the local D1 holds the identity, the `login` account row
(`friend: 1`), AccessToken / AuthorizationCode / Grant / Session payloads and
`renkei_meta.schema_version = 1`. The Node entry (`pnpm dev:server`) still boots and serves
discovery after the `configFromEnv()` refactor. Changesets staged: `renkei-storage-sqlite` minor +
`renkei-server` minor (plus the #67 patch), so the next release is **0.5.0** for the linked group.

**0.4.0 is released (2026-09-03, §0)**: `renkei`, `renkei-client`, `renkei-next` on npm,
tag `v0.4.0`, GHCR `:0.4.0`. **Next: the remaining v0.3 targets in §5** (Cloudflare
Workers KV/D1, Supabase Edge, LINE MINI App channel, multi-region tutorial) —
scope each with Achraf before starting; the `/dev` page could also adopt the
guideline button CSS to close #19 fully. Time-gated / Achraf-only leftovers: Zenn
article after 2026-09-10 (§2), the email-permission re-check (§4, still Applied),
the LIFF phone shot (§2, optional), Option B forward (§1, optional).

## Where things stand (end of 2026-08-30)

- **v0.2.1 is released (2026-08-30)**: `renkei`, `renkei-core`, `renkei-server`,
  `renkei-storage-postgres` all `0.2.1` / `latest` on npm; tag `v0.2.1`;
  `ghcr.io/achrafreyani/renkei:0.2.1` / `:0.2` / `:latest` built by
  `release.yml` (run 33269515485). It carries the two fixes below.
- **Live-verified on renkei-demo** (real LINE, Achraf's phone): Messaging API
  webhook (console Verify → Success), follow/unfollow flips `friend`, and
  account linking via `GET /link` → `accountLink` `ok` → `linked: true`.
- Two real bugs found by that live pass, fixed in 0.2.1:
  - #38 `/inspect` page fetched `/api/...` instead of `/inspect/api/...` (every
    lookup 404'd on the live demo).
  - #40 after linking with no `LINE_MESSAGING_CHANNEL_ID`, tokens lost
    `line:user_id` / `line:channel_id` / `line:friend` / `line:region` while
    reporting `line:linked: true`. Anyone on 0.2.0 without that env var hits
    this — 0.2.1 fixes it; the live confirmation on the demo is still open (§1).
- 160 tests green; lint / typecheck / build / docs pass. `main` = `c5956ed`.
- **Live #40 confirmation done** (§1): Achraf's `/dev` login on the demo shows
  `line:linked: true` with all `line:*` claims.
- **0.2.2 released 2026-08-30** (`renkei-server` + `renkei` CLI; #44): `/dev` borrowed
  `clients[0]` when `RENKEI_CLIENTS` had no `renkei-dev` client, so the demo's
  login button died with `invalid_redirect_uri` / `client_id=jobmatch`. Now the
  dev clients are appended when `RENKEI_DEV=true`, and `/dev` 503s with an
  explanation rather than impersonating a real client. Live on the demo
  (`/dev` → `client_id=renkei-dev` → `/interaction/…`). Not urgent to release:
  only affects `RENKEI_DEV=true` + `RENKEI_CLIENTS` deployments.
- **0.4.0 released 2026-09-03** (`renkei` CLI, first publishes of `renkei-client` and
  `renkei-next`; PR #65; tag `v0.4.0`; release.yml run 33650835497 pushed
  `ghcr.io/achrafreyani/renkei:0.4.0` / `:0.4` / `:latest`). Carries #63 (renkei-client)
  and #64 (renkei-next, `--preset next`). `renkei-server` stays 0.3.0 — the image is
  unchanged apart from the CLI.
- **0.3.0 released 2026-08-30** (`renkei`, `renkei-server`, first publish of
  `renkei-storage-sqlite`; PR #58; tag `v0.3.0`; release.yml run 33308564860 pushed
  `ghcr.io/achrafreyani/renkei:0.3.0` / `:0.3` / `:latest`). Carries #56 (SQLite
  storage on `node:sqlite`) and #57 (`renkei init` / `add-client`).
- **0.2.3 released 2026-08-30** (all four packages on npm; PR #53; tag
  `v0.2.3`; release.yml run 33305915772 pushed `ghcr.io/achrafreyani/renkei:0.2.3`
  / `:0.2` / `:latest`). It carries **#51** (`renkei-core` patch):
  with no `LINE_MESSAGING_CHANNEL_ID`, a completed account link is recorded by
  flipping the login row's `kind` to `messaging`, and the *next* login or LIFF
  exchange upserted `kind: login`/`liff` over it, so `line:linked` silently
  went back to `false`. Found live: `/dev` said `true` (session reuse, no
  upsert), the LIFF exchange from Achraf's phone said `false`.
  `upsertIdentityFromLine` now preserves a `messaging` kind. Same population
  as #40 (any 0.2.x deployment without a messaging channel ID).
- Demo config on Render now has `LINE_MESSAGING_CHANNEL_SECRET`,
  `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN`, `RENKEI_ADMIN_TOKEN`. Achraf's
  identity on the demo: sub `j_QoAMmfl7tyAG-SFrz1XfE3YY04RdU0`, LINE userId
  `U54de992ad068a07f1d4ef661a0a946bd`, currently `friend: true`,
  `linked: true`.

Cloud-session note: a fresh clone has **no `.env` and nothing running**. LINE
secrets, the demo's Render env and the LINE console are all Achraf's side.

## 0. Cut 0.4.0 — DONE 2026-09-03 (renkei-client + renkei-next + CLI presets)

Same flow as 0.3.0. Changesets on `main`: `renkei-client` minor, `renkei-next` minor,
`renkei` patch ×2 → the linked group puts **`renkei`, `renkei-client` and
`renkei-next` on 0.4.0**; `renkei-core` / `renkei-storage-postgres` (0.2.3),
`renkei-server` / `renkei-storage-sqlite` (0.3.0) have no changeset and stay.
`renkei-client` and `renkei-next` are **first publishes** (`--access public`,
already in their `publishConfig`). `pnpm -r publish` orders them topologically
(`renkei-next` depends on `renkei-client`). Achraf's terminal is `cmd.exe` — `&&`, never `;`.

- [x] Claude: `release/0.4.0` — `pnpm changeset version` → the three packages landed on
      **0.4.0** and nothing else moved → lint / typecheck / 233 tests / build / docs:build
      green → DCO commit → PR #65 → squash-merge (`8a47239`).
- [x] Achraf, in cmd on `main`: `git checkout main && git pull && npm login && npm whoami && pnpm build && pnpm test && pnpm -r publish --access public`
      (passkey once per package — three this time). Done 2026-09-03.
- [x] Claude: tagged and pushed `v0.4.0`; `release.yml` run 33650835497 succeeded and pushed
      `ghcr.io/achrafreyani/renkei:0.4.0` / `:0.4` / `:latest` (renkei-server 0.3.0 + CLI 0.4.0).
- [x] Claude: ticked here + ROADMAP.md; `npm view` = 0.4.0 for `renkei`, `renkei-client`,
      `renkei-next`; 0.3.0 for `renkei-server` / `renkei-storage-sqlite`; 0.2.3 for
      `renkei-core` / `renkei-storage-postgres`.

### 0.3.0 — DONE 2026-08-30 (storage-sqlite + CLI init/add-client)

Same split as 0.2.x. `renkei`, `renkei-server` and the new `renkei-storage-sqlite`
go to **0.3.0**; `renkei-core` and `renkei-storage-postgres` have no changeset and
stay at 0.2.3 (`pnpm -r publish` skips them). `renkei-storage-sqlite` is a **first
publish** — same `--access public`, nothing else special. Achraf's terminal is
`cmd.exe` — `&&`, never `;`.

- [x] Claude: `release/0.3.0` — `pnpm changeset version` → lint / typecheck /
      198 tests / build / docs:build green → DCO commit → PR → squash-merge.
- [x] Achraf, in cmd on `main`: `git checkout main && git pull && npm login && npm whoami && pnpm build && pnpm test && pnpm -r publish --access public`
      (passkey once per package — three this time).
- [x] Claude: tagged and pushed `v0.3.0`; `release.yml` run 33308564860 succeeded and
      pushed `ghcr.io/achrafreyani/renkei:0.3.0` / `:0.3` / `:latest`.
- [x] Claude: ticked here + ROADMAP.md; `npm view` = 0.3.0 for `renkei`,
      `renkei-server` and `renkei-storage-sqlite`, 0.2.3 for `renkei-core` and
      `renkei-storage-postgres`.

### 0.2.3 — DONE 2026-08-30 (#51 account-link fix)

Same split as 0.2.1/0.2.2. The changeset is on `renkei-core`; the `linked`
group + `updateInternalDependencies: patch` carry `renkei-server`,
`renkei-storage-postgres` and the `renkei` CLI along, so **all four land on
0.2.3** (core skips 0.2.2). Achraf's terminal is `cmd.exe` — `&&`, never `;`.

- [x] Claude: `release/0.2.3` — `pnpm changeset version` → lint / typecheck /
      160 tests / forced build green → DCO commit → PR #53 → squash-merge
      (first merge done by Claude unprompted: `gh pr merge` and `git push origin`
      are now allow rules in `.claude/settings.local.json`).
- [x] Achraf, in cmd on `main`: `git pull && npm login && npm whoami && pnpm build && pnpm test && pnpm -r publish --access public`
- [x] Claude: `git tag -a v0.2.3 -m "v0.2.3" && git push origin v0.2.3`, watched
      `release.yml` (run 33305915772, success) and read the GHCR tags from the
      run log: `:0.2.3` / `:0.2` / `:latest`.
- [x] Claude: ticked here + ROADMAP.md; `npm view` = 0.2.3 for `renkei-core`,
      `renkei-server`, `renkei-storage-postgres` and `renkei`.

### 0.2.2 — DONE 2026-08-30 (0.2.1 done the same way)

Same flow as 0.2.0/0.2.1. Split so Claude does the git side and Achraf the
passkey side. Achraf's terminal is **`cmd.exe`** — join commands with `&&`,
never `;`. Only `renkei-server` and the `renkei` CLI move to **0.2.2**
(#44); `renkei-core` / `renkei-storage-postgres` have no changeset and stay
at 0.2.1 (the group is `linked`, not `fixed`) — `pnpm -r publish` skips them.

- [x] Claude: `release/0.2.2` — `pnpm changeset version` → lint/typecheck/test/build
      green → DCO commit → PR (merge blocked by the classifier, Achraf merges).
- [x] Achraf, in cmd on `main`: `git pull && npm login && npm whoami && pnpm build && pnpm test && pnpm -r publish --access public`
- [x] Achraf: `git tag -a v0.2.2 -m "v0.2.2" && git push origin v0.2.2`, then
      Claude watches `release.yml` and reads the GHCR tags from the run log.
- [x] Claude: tick here + ROADMAP.md, confirm `npm view renkei-server version` = 0.2.2.
      (PR #49; `renkei-server` / `renkei` 0.2.2 on npm, `renkei-core` /
      `renkei-storage-postgres` 0.2.1; release.yml run 33292392776 pushed
      `ghcr.io/achrafreyani/renkei:0.2.2` / `:0.2` / `:latest`.)

### 0.2.1 — DONE 2026-08-30

- [x] Claude: branch → `pnpm changeset version` → check all four packages land
      on **0.2.1** (the `linked` group keeps them in step) → `pnpm lint &&
      pnpm typecheck && pnpm test && pnpm build` → single-paragraph DCO commit →
      PR → CI green → squash-merge. (The auto-mode classifier sometimes blocks
      `gh pr merge` / `git push` of tags; if so, hand Achraf the exact command.)
- [x] Achraf, in cmd on `main`: `git pull && npm login && npm whoami && pnpm build && pnpm test && pnpm -r publish --access public`
      (an expired npm session shows up as `E404 PUT` on publish — that is what
      `npm login` fixes; passkey prompt once per package).
- [x] Achraf: `git tag -a v0.2.1 -m "v0.2.1" && git push origin v0.2.1`, then
      Claude watches `release.yml` (`gh run watch`) and reads the run log for
      the pushed GHCR tags (`gh api` needs `read:packages`, which the token
      lacks — read the log instead).
- [x] Claude: tick here + ROADMAP.md, confirm `npm view renkei version` = 0.2.1.
      (PR #42; all four packages `0.2.1` on npm; GHCR tags read from the run log.)

## 1. Live verification — what is left

- [x] **Confirm the #40 fix live** — done 2026-08-30 on renkei-demo (0.2.1 +
      #44): Achraf's `/dev` login showed `line:linked: true` **and**
      `line:user_id`, `line:friend: true`, `line:channel_id`, `line:region` in
      both the id_token and userinfo, `aud: renkei-dev`.
- [x] `LINE_MESSAGING_CHANNEL_ID=2011257490` set on Render (2026-08-30, Claude
      via the dashboard; deploy dep-da9qprss728c73eiauog live). The separate
      `messaging` row only appears on the *next* link — Achraf's existing link
      keeps the flipped-`kind` row until he re-links.
- [x] **Session mode** live on the demo (`RENKEI_SESSION_COOKIE=true`): `GET /login`
      302 → LINE, `GET /session` 401 without a cookie, `POST /logout` 204.
- [x] **JSON logs** live (`RENKEI_LOG_FORMAT=json`): an unsigned webhook POST
      produced `{"level":"warn","msg":"[renkei] webhook signature verification failed"}`
      in Render logs. The boot banner stays plain text by design.
- [x] **#51 confirmed live** (2026-08-30, Achraf's phone): the LIFF app
      (`liff.line.me/2011257262-OKRFVulZ` → demo `/dev/liff` → `POST
      /liff/exchange`) now returns `line:linked: true` on 0.2.3, where the same
      exchange said `false` the morning before the fix.
- [x] **Workers target live** (2026-09-04): `wrangler dev` on :8787 + real channel, Achraf
      logged in; `/dev/callback` showed all `line:*` claims and the local D1 held the rows
      (see the top of this file). `examples/cloudflare-workers/.dev.vars` stays on disk
      (gitignored) for the next run.
- [ ] (Optional) **Option B** forward (`LINE_ACCOUNTLINK_FORWARD_URL`) — not set:
      nothing exists to receive the POST. Needs a downstream endpoint first.

## 2. Launch / UI steps  (Achraf, GitHub UI)

- [x] `.github/social-preview.png` uploaded (2026-08-30, Claude via Chrome;
      persists after reload under Settings → General → Social preview).
- [x] README GIF of the `/dev` flow: `docs/images/dev-flow.gif` (4 frames,
      320 KB, recorded on renkei-demo — LINE's consent screen is skipped
      because Chrome's LINE SSO auto-approved; it shows Achraf's `line:user_id`,
      which NEXT.md already lists). Linked from both READMEs.
- [ ] (Optional) In-app **LIFF phone shot** — only Achraf's phone can take it.
- [x] **Flip the repo public** — already PUBLIC as of 2026-08-30 (`gh repo view`).
- [ ] Run LAUNCH.md §2 (publish the Zenn article — draft is
      `drafts/zenn-account-linking.md`) — not before **2026-09-10** (§3).

## 3. Dogfooding (two weeks, calendar time)

- [~] renkei already brokers LINE login on the job-matching-platform in prod
      (see the [[jobmatch-renkei-integration]] memory). Just let it run and log
      bugs as issues. **Start date: 2026-08-27** (the day v0.2.0 shipped)
      **Earliest launch date: 2026-09-10** (confirmed by Achraf 2026-08-30).
      Tick this and ROADMAP.md "Dogfooded in one real app" on/after 2026-09-10
      if no unresolved login bug is open against renkei.

## 4. LINE email permission

- [ ] Check the Login channel (Basic settings → Email address permission).
      *Last checked 2026-08-30 (Claude, console): still 申請済み (Applied).* Claude can check this
      in Chrome once Achraf has logged the console in (see quirks). When
      **Approved**: set `RENKEI_REQUEST_EMAIL=true`, log in once with email
      consent, confirm `email` in the id_token, note in DEV_SETUP.md. Until
      then, Supabase-style downstreams rely on `placeholderEmailDomain`.

## Things learned on 2026-08-27/30 (don't relearn)

- `RENKEI_CLIENTS` on the demo holds the jobmatch client **secret**; the
  Claude-in-Chrome classifier blocks every scripted or typed edit of that Render
  field. Change code, not that env var — the demo redeploys on merge anyway.

- The LINE console session expires; the login page is `account.line.biz`,
  which Claude-in-Chrome cannot touch. Achraf logs in on the tab Claude opened,
  then Claude continues. `manager.line.biz` (OA Manager) is fine for Claude.
- `/inspect`'s **Recent webhooks** is an in-memory, per-process ring. **Every
  merge to `main` redeploys renkei-demo** and empties it — do the phone action
  *after* the last deploy, not before.
- The console's webhook **Verify** returns 404 until the demo has
  `LINE_MESSAGING_CHANNEL_SECRET` (`/line/webhook` is only mounted with a
  messaging channel configured); 401 to unsigned posts means it is mounted.
- "Unfollow" in LINE = **Block** the OA; "follow" = Unblock (Settings →
  Friends → Blocked users → Edit → Unblock). The greeting message re-fires on
  every follow — that's the expected signal, not a bug.
- DCO check is paragraph-mode: branch commits must be ONE paragraph with the
  trailers inline (see the [[renkei-project]] memory); the squash-merge
  message is free-form.

## 5. v0.3 — in progress (started 2026-08-30)

Direction agreed with Achraf: attack the setup cost first (the honest
objection to renkei versus raw LINE Login is "a server plus Postgres plus
six env vars"), breadth (TW/TH, MINI App) after.

- [x] `renkei-storage-sqlite` — Node's built-in `node:sqlite`, zero deps,
      `DATABASE_URL=sqlite:./data/renkei.db`; `createSqliteDriverStorage()` for
      better-sqlite3 / Bun. 14 tests (shared contract + persistence/reopen/FK);
      the server e2e suite (fake LINE) now runs on memory **and** sqlite. **Live-
      verified 2026-08-30**: `pnpm dev:server` on :8787 with `DATABASE_URL=sqlite:…`,
      real LINE login via `/dev` → id_token + userinfo with all `line:*` claims;
      the file held the identity, the `login` account row (friend, raw profile)
      and the AccessToken / AuthorizationCode / Grant / Session payloads.
      Wired into `renkei-server`, docs (config reference ja/en, README ja/en,
      deploy-fly note, `.env.example`), DECISIONS.md §11. Minor changeset →
      **0.3.0** for `renkei-storage-sqlite` + `renkei-server` (+ CLI via the
      linked group) at the next release.
- [x] Achraf: local Node upgraded 22.12 → 22.23.2 (2026-08-30, `winget upgrade
      OpenJS.NodeJS.22` — the MSI install is registered under that ID, not
      `OpenJS.NodeJS.LTS`). `sqlite:` URLs now work without `--experimental-sqlite`;
      Node 22 still prints a cosmetic ExperimentalWarning for `node:sqlite`.
- [x] Cut **0.3.0** — released 2026-08-30 (§0).
- [x] "3 env vars and go" quickstart — `renkei init` (writes `.env` with generated
      `RENKEI_JWKS` / `RENKEI_COOKIE_KEYS`, `DATABASE_URL=sqlite:…`, `RENKEI_DEV=true`;
      refuses to overwrite) and `renkei add-client <id> --redirect <url>
      [--preset authjs|supabase|public] [--replace] [--print]` (secret generated,
      merged into `RENKEI_CLIENTS`, validated with the server's zod schema, app-side
      snippet printed). 15 CLI tests; live: the generated `.env` + real channel booted
      on :8787 with no key warning, `/dev` up, the registered client accepted at
      `/oidc/auth`. Docs: README ja/en quickstart, config reference, Next.js +
      Supabase tutorials, CLI README (2026-08-30).
- [x] **`renkei-client`** — shipped 2026-09-02 (scope = the sketch below, confirmed by
      Achraf; zero deps; `decodeClaims` is deliberately named `decodeClaimsUnverified()`,
      DECISIONS.md §12; also got `exchangeCode()`, `userinfo()`, `sessionLoginUrl()` and
      PKCE helpers). 20 tests (unit + fake-LINE e2e against renkei-server; 218 total).
      **Live on :8787 with the real channel:** PKCE login → code on the SDK's redirect URI
      → `exchangeCode()` → id_token with nonce match and all `line:*` claims → `userinfo()`;
      `sessionLoginUrl()` → cookie → `/session` 200 → `/logout` 204 → `no_session`.
      Docs: `docs/reference/client.{ja,en}.md` (+ sidebar), README ja/en §4, pointers in
      the endpoints reference, `renkei add-client` prints the SDK snippet. Original sketch: `packages/client`, zero deps,
      works in browsers, Node, Workers; `createRenkeiClient({ issuer, clientId })`
      → `loginUrl({ redirectUri, state, nonce, scope?, botPrompt? })`,
      `exchangeLiffToken({ idToken, accessToken })` (wraps `POST /liff/exchange`),
      `session()` / `logout()` for `RENKEI_SESSION_COOKIE` mode, a typed
      `RenkeiClaims` (`line:user_id`, `line:friend`, …) and `decodeClaims()`.
      Then `renkei add-client` prints the SDK snippet too. Tests against the
      server's fake-LINE e2e harness; live check on :8787.
- [x] **`renkei-next`** — shipped 2026-09-03 (scope confirmed by Achraf). `createRenkeiAuth()`
      → route handlers `/api/renkei/{login,callback,logout,session}` (PKCE always, id_token
      verified with renkei's JWKS, claims in a JWE `A256GCM` cookie), `getSession()`,
      `getSessionFromRequest()`, `proxy()` / `middleware()` guard, `loginPath()` / `logoutPath()`;
      `renkei-next/button` → `<LineLoginButton />` per LINE's guideline with the official icon
      embedded from LINE's template (issue #19 — the component half; `/dev` still uses plain
      links). Deliberately an OIDC client with its own session, not renkei's session-cookie
      mode (DECISIONS.md §13). `renkei add-client --preset next`; `examples/nextjs-renkei-next`
      (:3500); docs `reference/next.{ja,en}.md`. 15 tests (fake-LINE e2e + button SSR).
      **Live 2026-09-03**: example → button → LINE consent → `/account` with `line:user_id`,
      `friend: true`, `region: jp` → logout → guard redirects again. Note: `renkei-client` and
      `renkei-next` ship **no `development` export condition** (Turbopack cannot resolve
      TS-style `./x.js` imports from source); `pnpm build` before running the example.
- [x] **Cloudflare Workers target** — shipped 2026-09-04 (see the top of this file;
      DECISIONS.md §14; closes #6). D1 only; Hyperdrive + Postgres documented via
      `createWorker({ storage })`, untested.
- [ ] Then the rest of the ROADMAP v0.3 list: Supabase Edge target (the fetch→node
      bridge already lives in `renkei-server`; what is missing is a `Deno.serve` entry,
      the Postgres wiring and a guide), LINE MINI App channel support, multi-region
      tutorial. Scope each with Achraf before starting. Candidate from the #51
      findings: model account linkage as a flag on the LINE account row instead
      of overloading `kind` (needs a migration).
