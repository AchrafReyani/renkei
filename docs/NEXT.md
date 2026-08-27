# NEXT — what to do at the start of the next session

**Type `/todo`** to have Claude read this file + ROADMAP.md and lay out the
open items. Work through them **with Achraf, one at a time**; the remaining
work is mostly release mechanics and steps that need his passkey, phone, the
GitHub UI, or the LINE console.

## Where things stand (2026-08-27)

**All buildable v0.1 and v0.2 code is done and merged to `main`** — 153 tests
green; lint / typecheck / build / docs all pass. Shipped in v0.2: webhook
parsing + `POST /line/webhook`, first-run config checks, account linking
(Option A `/link/start` + `GET /link`, Option B forwarded `accountLinkForwardUrl`),
`line:linked` claim, read-only `/inspect`, real-shaped webhook fixtures,
Tutorial 3 (ja/en), structured logging + redaction, and session-cookie mode
(`/login` `/session` `/logout`). Both the renkei and job-matching-platform
remotes are pruned to just `main`.

**A stack of ~9 unreleased changesets sits on `main`** (everything since 0.1.0).
Nothing is published yet at these new versions.

Cloud-session note: a fresh clone has **no `.env` and nothing running**. The
LINE secrets, the demo's Render env, and the LINE console are all Achraf's side.

## 0. Cut the v0.2 release  — DONE 2026-08-27

- [x] `pnpm changeset version` → review the bumped `renkei-core` /
  `renkei-server` versions and the generated CHANGELOGs, commit. (Done
  2026-08-27: all four packages → 0.2.0; `renkei` added to the Changesets
  `linked` group so the CLI tracks the server version.)
- [x] `pnpm build && pnpm test` once more, then **Achraf** publishes:
  `pnpm -r publish` (or the release flow) from an interactive terminal —
  npm 2FA is a passkey, so Claude cannot do this. (Published 2026-08-27: all
  four packages at 0.2.0 / `latest`. Gotcha: an expired npm session shows up as
  `E404 PUT` on publish — run `npm login` first.)
- [x] Tag `vX.Y.Z` and push; confirm `release.yml` is green and the GHCR image
  is pushed. (`gh` token needs `read:packages` to pull.) (`v0.2.0` tagged
  2026-08-27; `ghcr.io/achrafreyani/renkei:0.2.0` / `:0.2` / `:latest` pushed.)

## 1. Live-verify the v0.2 features on the demo  (needs the LINE console + Render)

None of these have been exercised against real LINE yet — they need secrets a
cloud session doesn't have, so they're Achraf's steps.

- [x] On the **Messaging API channel**: set the webhook URL to
  `https://renkei-demo.onrender.com/line/webhook`, enable "Use webhook",
  disable auto-reply. (Done 2026-08-27 via the console + OA Manager →
  Response settings. The console's "Verify" button returns 404 until the demo
  has `LINE_MESSAGING_CHANNEL_SECRET` — `/line/webhook` is only mounted when a
  messaging channel is configured — so re-run Verify after the next step.)
- [x] On the demo (Render): set `LINE_MESSAGING_CHANNEL_SECRET` and
  `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN`. Then follow/unfollow the OA and watch
  `line:friend` flip (check via `/inspect` after setting `RENKEI_ADMIN_TOKEN`).
  (Verified 2026-08-27: console Verify → Success; block/unblock produced
  signature-verified `unfollow` + `follow` events in `/inspect`, and the
  identity's `friend` flipped to true at the `follow` timestamp. Found and fixed
  #38 on the way: the `/inspect` shell fetched `/api/...` instead of
  `/inspect/api/...`. Note the webhook log is per-process — a redeploy empties it.)
- [ ] Exercise **account linking** end to end (a real consent round-trip →
  `accountLink` webhook → `line:linked`), per `docs/tutorials/account-linking`.
- [ ] (Optional) Try **Option B** forward (`LINE_ACCOUNTLINK_FORWARD_URL`),
  **session mode** (`RENKEI_SESSION_COOKIE=true` → `/login`/`/session`), and
  **JSON logs** (`RENKEI_LOG_FORMAT=json`).

## 2. Launch / UI steps  (Achraf, GitHub UI)

- [ ] Upload `.github/social-preview.png` (the setting was hidden while the repo
  is private — re-check after flipping public; drop if still absent).
- [ ] (Optional) README GIF of the `/dev` flow + the in-app LIFF phone shot —
  LINE screens are blocked for Claude, so Achraf records them.
- [ ] **Flip the repo public** — only after the release and the dogfood clock.
  Then run LAUNCH.md §2 (publish the Zenn article — draft is
  `drafts/zenn-account-linking.md`).

## 3. Dogfooding (two weeks, calendar time)

- [ ] renkei already brokers LINE login on the job-matching-platform in prod
  (see the [[jobmatch-renkei-integration]] memory). Just let it run and log
  bugs as issues. Start date: ______  Earliest launch date: ______

## 4. LINE email permission

- [ ] Check the channel (Basic settings → Email address permission).
  *Last checked 2026-08-26: still 申請済み (Applied).* When **Approved**: set
  `RENKEI_REQUEST_EMAIL=true`, log in once with email consent, confirm `email`
  in the id_token, note in DEV_SETUP.md. Until then, Supabase-style downstreams
  rely on `placeholderEmailDomain`.

## After all of the above → v0.3

Next real coding milestone (ROADMAP.md → v0.3): `renkei-client` /
`renkei-next` SDKs, Cloudflare Workers + Supabase Edge deploy targets, LINE
MINI App channel support, multi-region tutorial. Scope with Achraf before
starting.
