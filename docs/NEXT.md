# NEXT — what to do at the start of the next session

**Type `/todo`** to have Claude read this file + ROADMAP.md and lay out the
open items. Work through them **with Achraf, one at a time**. Most remaining
steps need his passkey, phone, the GitHub UI, the LINE console or Render.

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
- 155 tests green; lint / typecheck / build / docs pass. `main` = `d3057ab`.
- Demo config on Render now has `LINE_MESSAGING_CHANNEL_SECRET`,
  `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN`, `RENKEI_ADMIN_TOKEN`. Achraf's
  identity on the demo: sub `j_QoAMmfl7tyAG-SFrz1XfE3YY04RdU0`, LINE userId
  `U54de992ad068a07f1d4ef661a0a946bd`, currently `friend: true`,
  `linked: true`.

Cloud-session note: a fresh clone has **no `.env` and nothing running**. LINE
secrets, the demo's Render env and the LINE console are all Achraf's side.

## 0. Cut 0.2.1  — DONE 2026-08-30

Same flow as 0.2.0. Split so Claude does the git side and Achraf the passkey
side. Achraf's terminal is **`cmd.exe`** — join commands with `&&`, never `;`.

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

- [ ] **Confirm the #40 fix live**: Achraf logs in once at
      https://renkei-demo.onrender.com/dev (Claude can't — `access.line.me` is
      blocked in Claude-in-Chrome) and reads the claims panel: it must show
      **both** `line:linked: true` and `line:user_id` (+ `line:friend: true`).
      Before #40 the demo would have shown `line:linked` only.
- [ ] (Optional, cleaner data model) set `LINE_MESSAGING_CHANNEL_ID=2011257490`
      on Render so the link is stored as its own `messaging` row instead of
      flipping the login row's `kind`. Not required after #40.
- [ ] (Optional) Try **Option B** forward (`LINE_ACCOUNTLINK_FORWARD_URL`),
      **session mode** (`RENKEI_SESSION_COOKIE=true` → `/login`/`/session`),
      and **JSON logs** (`RENKEI_LOG_FORMAT=json`) on the demo. Each is a
      Render env change by Achraf + a redeploy.

## 2. Launch / UI steps  (Achraf, GitHub UI)

- [ ] Upload `.github/social-preview.png` (repo is public now, so the setting
      should be visible under Settings → General → Social preview).
- [ ] (Optional) README GIF of the `/dev` flow + the in-app LIFF phone shot —
      LINE screens are blocked for Claude, so Achraf records them.
- [x] **Flip the repo public** — already PUBLIC as of 2026-08-30 (`gh repo view`).
- [ ] Run LAUNCH.md §2 (publish the Zenn article — draft is
      `drafts/zenn-account-linking.md`) — after the dogfood clock.

## 3. Dogfooding (two weeks, calendar time)

- [ ] renkei already brokers LINE login on the job-matching-platform in prod
      (see the [[jobmatch-renkei-integration]] memory). Just let it run and log
      bugs as issues. Start date: ______  Earliest launch date: ______
      (Suggestion: start = 2026-08-27, the day v0.2.0 shipped → earliest
      launch 2026-09-10. Achraf to confirm.)

## 4. LINE email permission

- [ ] Check the Login channel (Basic settings → Email address permission).
      *Last checked 2026-08-26: still 申請済み (Applied).* Claude can check this
      in Chrome once Achraf has logged the console in (see quirks). When
      **Approved**: set `RENKEI_REQUEST_EMAIL=true`, log in once with email
      consent, confirm `email` in the id_token, note in DEV_SETUP.md. Until
      then, Supabase-style downstreams rely on `placeholderEmailDomain`.

## Things learned on 2026-08-27 (don't relearn)

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

## After all of the above → v0.3

Next real coding milestone (ROADMAP.md → v0.3): `renkei-client` /
`renkei-next` SDKs, Cloudflare Workers + Supabase Edge deploy targets, LINE
MINI App channel support, multi-region tutorial. Scope with Achraf before
starting. Candidate from today's findings: model account linkage as a flag on
the LINE account row instead of overloading `kind` (needs a migration).
