# NEXT — what to do at the start of the next session

The v0.1 build is done (see PLAN.md §7 and ROADMAP.md). What remains before
flipping the repo public is below, in order. Work through it **with Achraf,
one item at a time**; several steps need his phone, passkey, or the GitHub
UI. Tick items here as they complete and commit.

State to expect (after 2026-08-26): renkei may still be on :3000 with
`ISSUER=https://sponsor-flight-wheels-gdp.trycloudflare.com` and that
cloudflared tunnel running; the LIFF endpoint URL in the console points at
it and is dead once the tunnel stops. Otherwise nothing is running. `.env` has the LINE secrets. The
cloudflared tunnel URL from last time is dead — LIFF endpoint and Supabase
`url` in `spikes/supabase-edge-runtime/supabase/config.toml` still point at
it and will need a fresh one if you redo those checks.

## 1. Human-only verifications

- [x] **Next.js example, final LINE leg.** Done 2026-08-26 — see DEV_SETUP.md.
  ```sh
  # terminal 1 — renkei with the example's client
  cd packages/server
  RENKEI_CLIENTS='[{"clientId":"my-next-app","clientSecret":"my-next-app-secret-0123456789abcdef","redirectUris":["http://localhost:3400/api/auth/callback/renkei"]}]' RENKEI_DEV=true pnpm dev
  # terminal 2
  cd examples/nextjs && cp .env.example .env.local && pnpm dev
  ```
  Achraf opens http://localhost:3400 → 「LINEでログイン」→ LINE → back with his
  name and the `line` object. Claude can drive localhost:3400 in Chrome but
  not `access.line.me`. Record the result in DEV_SETUP.md.
  *2026-08-26: Claude drove it as far as the LINE login page — Auth.js →
  renkei `/authorize` → `access.line.me` with PKCE, `scope=openid profile`,
  `bot_prompt=aggressive`. LINE did not auto-SSO in that tab; the login
  itself is still Achraf's.*
- [x] **LIFF inside the LINE app** — done 2026-08-26 (`inClient: true`, Android). See DEV_SETUP.md.
  Needs a fresh tunnel: `pnpm dlx cloudflared tunnel --url http://localhost:3000`,
  restart renkei with `ISSUER=<tunnel>`, update the LIFF endpoint URL in the
  console (LIFF tab → renkei-dev → Edit) to `<tunnel>/dev/liff`, then Achraf
  opens `https://liff.line.me/2011257262-OKRFVulZ` on his phone. Expect
  `inClient: true`.

## 2. UI-only GitHub steps (Achraf, ~2 minutes)

- [ ] Upload `.github/social-preview.png`. *2026-08-26: the "Social preview"
  block is gone from Settings → General and isn't in the About editor
  either — GitHub appears to have removed/hidden it (repo is private).
  Re-check after flipping public; if still absent, drop this item.*
- [x] Pin Discussion #21 — done 2026-08-26 (green background).

## 3. Launch mechanics

- [x] **Demo instance — Render free tier** — live 2026-08-26 at
  `https://renkei-demo.onrender.com/dev`, LINE login verified by Achraf,
  README demo link + disclaimer committed. Details and the Render routing
  quirk in DEV_SETUP.md. Left over: rotate the Neon password (Neon →
  Branches → Roles → reset, then update `DATABASE_URL` on Render);
  optional `LIFF_ID` on Render + LIFF endpoint → demo.
- [ ] **README GIF** of the `/dev` flow (optional, nice-to-have now that
  there's a live demo): 「LINEでログイン」→ friend-add → claims JSON, plus the
  in-app LIFF phone screenshot. LINE screens are blocked for Claude in Chrome,
  so Achraf records those legs.
- [ ] **Version + tag.** `pnpm changeset` → version `0.1.0` for `renkei-core`,
  `renkei-storage-postgres`, `renkei-server`, `renkei`. Tag `v0.1.0` → the
  `release.yml` workflow builds and pushes `ghcr.io/achrafreyani/renkei`.
  Verify the image lands and `docker run ghcr.io/achrafreyani/renkei:0.1.0` boots.
- [ ] **npm publish** of the four packages — Achraf runs it (passkey 2FA):
  `pnpm -r publish --access public` from the repo root after `pnpm build`.
  Verify with `npm view renkei-server version`.
- [x] **Console screenshots** for docs/guides/line-console.{ja,en}.md — done
  2026-08-26 in Japanese UI: `docs/images/console/*.png` (basic settings,
  callback URL, linked OA + email permission, LIFF list, LIFF app detail).
  Not captured: the Developing → Publish button (channel is already
  Published) and the email-permission application form (already submitted).
- [ ] **Flip public.** Only after everything above and item 4. Then run
  LAUNCH.md §2 (Zenn article first).

## 4. Dogfooding (two weeks, calendar time)

- [ ] Wire renkei into one real thing and leave it running. Candidates:
  `examples/nextjs` against a local renkei, or one of Achraf's own apps
  (no hosted instance — see §3). Note bugs as issues.
  Start date: ______  Earliest launch date: ______

## 5. LINE email permission

- [ ] Check the channel's status (Basic settings → Email address permission).
  *Checked 2026-08-26: still 申請済み (Applied).*
  When **Approved**: set `RENKEI_REQUEST_EMAIL=true`, log in once with the
  email consent, confirm `email` appears in the id_token, and note in
  DEV_SETUP.md. Until then Supabase-style downstreams rely on
  `placeholderEmailDomain`.

## Still-running-process cleanup from 2026-08-26 (if the machine wasn't rebooted)

```sh
# renkei dev server on :3000, next on :3400
netstat -ano | grep -E ":3000|:3400"      # then taskkill //F //PID <pid>
# local Supabase stack
cd spikes/supabase-edge-runtime && pnpm exec supabase stop --no-backup
# cloudflared
tasklist | grep -i cloudflared            # then taskkill //F //IM cloudflared.exe
```
