# NEXT — what to do at the start of the next session

**Type `/todo`** to have Claude read this file + ROADMAP.md and lay out the
open items. Work through them **with Achraf, one at a time**. Most remaining
steps need his passkey, phone, the GitHub UI, the LINE console or Render.

**Pick up here (session ended 2026-08-30 ~04:30 JST):** everything urgent is
done — 0.2.1 shipped, the demo login works, #40 is confirmed live. The
remaining list is optional/launch/time-gated. Dogfood dates are set (§3: 2026-08-27 → earliest launch
2026-09-10), the email permission is still Applied (§4), the social preview
and README GIF are done (§2), the optional demo env experiments are live (§1).
**0.2.2 is released** (npm + GHCR, §0); #51 (`renkei-core` patch) is pending
for a 0.2.3. What remains: the Zenn article after 2026-09-10 (§2), the §4
re-check — then v0.3. 0.2.2 can wait until
another patch lands or the launch is near.

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
- 159 tests green; lint / typecheck / build / docs pass. `main` = `4ccd8b5`.
- **Live #40 confirmation done** (§1): Achraf's `/dev` login on the demo shows
  `line:linked: true` with all `line:*` claims.
- **One patch changeset pending → 0.2.3** (#51, 2026-08-30, `renkei-core`):
  a link collapsed onto the login row (`kind: messaging`, no
  `LINE_MESSAGING_CHANNEL_ID`) was overwritten by the next login / LIFF
  exchange (`kind: login`/`liff`) and `line:linked` fell back to `false`.
  `upsertIdentityFromLine` now keeps a `messaging` kind. Found by the LIFF
  phone shot; verified live after Achraf re-linked. Not urgent: deployments
  with `LINE_MESSAGING_CHANNEL_ID` set store a separate row and never hit it.
- **0.2.2 released 2026-08-30** (`renkei-server` + `renkei` CLI; #44): `/dev` borrowed
  `clients[0]` when `RENKEI_CLIENTS` had no `renkei-dev` client, so the demo's
  login button died with `invalid_redirect_uri` / `client_id=jobmatch`. Now the
  dev clients are appended when `RENKEI_DEV=true`, and `/dev` 503s with an
  explanation rather than impersonating a real client. Live on the demo
  (`/dev` → `client_id=renkei-dev` → `/interaction/…`). Not urgent to release:
  only affects `RENKEI_DEV=true` + `RENKEI_CLIENTS` deployments.
- Demo config on Render now has `LINE_MESSAGING_CHANNEL_SECRET`,
  `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN`, `RENKEI_ADMIN_TOKEN`. Achraf's
  identity on the demo: sub `j_QoAMmfl7tyAG-SFrz1XfE3YY04RdU0`, LINE userId
  `U54de992ad068a07f1d4ef661a0a946bd`, currently `friend: true`,
  `linked: true`.

Cloud-session note: a fresh clone has **no `.env` and nothing running**. LINE
secrets, the demo's Render env and the LINE console are all Achraf's side.

## 0. Cut 0.2.2  — DONE 2026-08-30 (0.2.1 done the same way)

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
- [ ] (Optional) **Option B** forward (`LINE_ACCOUNTLINK_FORWARD_URL`) — not set:
      nothing exists to receive the POST. Needs a downstream endpoint first.

## 2. Launch / UI steps  (Achraf, GitHub UI)

- [x] `.github/social-preview.png` uploaded (2026-08-30, Claude via Chrome;
      persists after reload under Settings → General → Social preview).
- [x] README GIF of the `/dev` flow: `docs/images/dev-flow.gif` (4 frames,
      320 KB, recorded on renkei-demo — LINE's consent screen is skipped
      because Chrome's LINE SSO auto-approved; it shows Achraf's `line:user_id`,
      which NEXT.md already lists). Linked from both READMEs.
- [x] In-app **LIFF phone shot** — `docs/images/liff-phone.png` (Achraf, Android,
      2026-08-30), linked from both READMEs. `LIFF_ID` is set on Render and the
      LIFF app's endpoint now points at the demo. The first shot showed
      `line:linked: false` → bug #51 (below); the retake after the fix + a
      re-link shows `true`.
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

- oidc-provider **reuses its session cookie**: a second `/dev` login in the same
  browser never reaches `/line/callback`, so it cannot catch upsert bugs — the
  LIFF exchange (`/liff/exchange`) always upserts and can. Test both paths.
- The Claude-in-Chrome classifier blocks typing LIFF IDs / URLs into Render
  and LINE-console fields (reads them as credentials); leave the field open in
  edit mode and hand Achraf the value. Chrome's LINE SSO auto-approves, so
  Claude can run and record the full `/dev` flow on the demo.

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

## After all of the above → v0.3

Next real coding milestone (ROADMAP.md → v0.3): `renkei-client` /
`renkei-next` SDKs, Cloudflare Workers + Supabase Edge deploy targets, LINE
MINI App channel support, multi-region tutorial. Scope with Achraf before
starting. Candidate from today's findings: model account linkage as a flag on
the LINE account row instead of overloading `kind` (needs a migration).
