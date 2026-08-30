# Development setup — LINE Developers Console

What exists on the LINE side for renkei development, how it was created
(2026-08-26), and the traps hit along the way. This is the raw material for
the public 「LINE Developers Console の事前準備」 docs page.

Secrets live in `.env` (gitignored). Only IDs are recorded here.

## What exists

| Thing | Value | Where |
|---|---|---|
| Business ID | achrafreyani99@gmail.com (email login, SMS-verified) | account.line.biz |
| Provider | **renkei** — ID `2005473999` | developers.line.biz/console/provider/2005473999 |
| LINE Login channel | **renkei-dev-jp** — ID `2011257262`, region **Japan**, status **Published** (since 2026-08-26, irreversible), Web app enabled, 2FA on | /console/channel/2011257262 |
| Callback URLs | `http://localhost:3000/line/callback` · `http://localhost:8787/line/callback` · `http://127.0.0.1:3000/line/callback` | LINE Login tab |
| LIFF app | **renkei-dev** — ID `2011257262-OKRFVulZ`, Full, scopes `openid profile`, add-friend **On (Aggressive)**, endpoint **`https://renkei-demo.onrender.com/dev/liff`** (the demo; since 2026-08-30 — for local LIFF work point it at a `cloudflared` quick tunnel and put it back afterwards) | LIFF tab |
| LINE Official Account | display name "Achraf" (rename to "renkei dev" in OA Manager when convenient), basic ID `@360trecn`, industry 個人 | manager.line.biz/account/@360trecn |
| Messaging API channel | ID `2011257490`, **provider renkei** ✔ | OA Manager → Settings → Messaging API; also visible in Developers Console |
| Login ↔ OA link | renkei-dev-jp → Linked LINE Official Account = `@360trecn` ✔ | Login channel → Basic settings → Add friend option |
| Email permission | **Applied 2026-08-26** (status shows *Applied*; awaiting LINE review). Submitted with both attestations + a screenshot of `/dev` with the JA/EN email-use notice. Tip: clicking the attestation checkboxes opens the linked policy and drops Claude-in-Chrome's page access — set them with `form_input` instead. | Login channel → Basic settings → OpenID Connect |
| Channel access token (long-lived) | Not issued yet — needed for link tokens / push (v0.2) | Developers Console → Messaging API channel → Messaging API tab |

## The order that works (and why)

1. **Provider first.** Channels can never move between providers. Login, LIFF
   and Messaging user IDs only match when all channels are under one
   provider.
2. **LINE Login channel** under the provider. Region is per channel and
   permanent — this is the "one channel per country" constraint.
3. **Messaging API channel** — can no longer be created in the Developers
   Console. The flow is: Console → "Create a Messaging API channel" →
   redirected to *LINE Official Account* entry form → (SMS verification of
   the Business ID) → OA created → OA Manager → one-time 「情報利用に関する
   同意」 consent → Settings → Messaging API → Enable → **Select provider**.
4. **The trap:** the provider dialog defaults to **"New provider"**. Selecting
   that silently puts the bot under a different provider and breaks user-ID
   matching. Pick the existing provider. This should be renkei's first-run
   check and the loudest warning in the docs.
5. **Link the OA to the Login channel** (Login channel → Basic settings →
   Add friend option → Linked LINE Official Account). Without this,
   `bot_prompt` does nothing.
6. **LIFF app** on the Login channel. Endpoint must be https (any valid URL
   accepted at creation, can be a placeholder). Add-friend option here is
   the LIFF-side equivalent of `bot_prompt`.
7. **Email permission** is a separate application with a screenshot
   requirement — do it after a login screen exists.

## Things learned that belong in the public docs

- **Developing-status channels reject every user without a role.** The first
  real login returned `400 Bad Request — This channel is now developing
  status. User need to have developer role.` The Business ID that owns the
  channel (email login) is *not* the LINE account on the phone, so even the
  owner is rejected. Fix for a dev channel: publish it (irreversible;
  Developing → Published only, recreate to go back). Alternative: Roles tab →
  invite the LINE account as Tester, which requires that account to log into
  LINE Developers once to accept. Document both; recommend Publish for
  throwaway dev channels and Tester for real ones.
- **First end-to-end run (2026-08-26) succeeded:** `bot_prompt=aggressive`
  showed the friend-add screen, `friendship_status_changed=true` came back,
  `/friendship/v1/status` agreed, id_token was HS256, local verification
  matched LINE's `/verify`, `amr=["linesso"]`. No email claim (permission not
  applied yet). All four harness variants (`aggressive`, `normal`, no prompt,
  `email` scope) completed.
- **Public demo live on Render free tier (2026-08-26):**
  `https://renkei-demo.onrender.com/dev` — Blueprint from `render.yaml`
  (Docker, Singapore), DB on Neon free (Singapore), pinned `RENKEI_JWKS`
  (kid `kmt9ncrjl`) and Render-generated `RENKEI_COOKIE_KEYS`. Achraf
  completed a LINE login: RS256 id_token, `iss` = demo URL, `line:*` claims,
  `line:friend: true`, userinfo matches. **Render quirk:** after each deploy
  and after a restart, the router answered `404 x-render-routing: no-server`
  for ~10 minutes (with 200/404 flapping near the end) while the app logs
  were clean and Render showed "Deploy live"; it converged on its own both
  times. Hence the README disclaimer. Follow-ups: rotate the Neon password
  (it appeared in a chat screenshot); optionally set `LIFF_ID` on Render and
  point the LIFF endpoint at the demo so `/dev/liff` is demo-able too.
- **Next.js example verified live (2026-08-26):** `examples/nextjs`
  (Auth.js v5, plain OIDC provider) against renkei with `RENKEI_CLIENTS`
  → 「LINEでログイン」 → LINE (PKCE, `scope=openid profile`,
  `bot_prompt=aggressive`) → `/api/auth/callback/renkei` → signed in as
  "Achraf" with `line: { userId, friend: true, channelId, region: "jp" }`.
  renkei side: `created: true`, `amr: ["linesso"]`. Achraf completed the
  LINE leg; Claude in Chrome cannot touch `access.line.me`.
- **LIFF exchange verified live (2026-08-26):** `/dev/liff` through a
  `cloudflared` quick tunnel; `liff.init` → `liff.login` → both tokens →
  `POST /liff/exchange` → renkei id_token with `line:*` claims. Works in an
  external browser (`inClient: false`) **and inside the LINE app** (verified
  2026-08-26 on Android: `inClient: true`, both LIFF tokens present,
  `client: renkei-dev-liff`, payload has `name`, `picture`,
  `line:user_id`, `line:channel_id`).
- **`sub` is not stable across restarts on memory storage.** The same LINE
  user got a different `sub` after renkei was restarted with a new
  `ISSUER`, because the in-memory identity table starts empty. Expected;
  use Postgres for anything where `sub` must persist.
- **Claude in Chrome blocks `trycloudflare.com`** outright (not an approval
  prompt), so LIFF verification through the tunnel has to be done by Achraf.
- **Supabase verified live (2026-08-26):** local `supabase start` with
  `[auth.external.keycloak] url = <renkei tunnel>` → LINE login → Supabase
  `user_signedup` with `actor_name` from LINE. First attempt failed with
  `Error getting user email from external provider` — Supabase's built-in
  providers require an email — which is why `placeholderEmailDomain` exists.
- **LINE silently drops the `email` scope** when the channel has no email
  permission: the login succeeds, the token's `scope` just lacks `email` and
  the id_token has no `email` claim. There is no error to catch at login
  time. renkei must therefore warn at **startup/config time** ("email
  requested but channel has no email permission") and expose the granted
  scope, rather than rely on a runtime failure.

- `http://localhost:<port>` **is** accepted as a LINE Login callback URL
  (validation passed). No tunnel needed for web login dev. LIFF still needs
  https.
- Creating an OA requires **SMS verification** of the Business ID — tell
  people up front so they have their phone.
- LINE says **LIFF is being rebranded into LINE MINI App** and recommends new
  apps be created as MINI App channels (JP service area, or TW with local
  approval). Existing LIFF apps keep working. renkei should support both:
  LIFF apps on a Login channel *and* MINI App channels under the same
  provider. Roadmap item added.
- Two-factor authentication on the Login channel is **on by default** for
  new channels; users need the smartphone LINE app on first login.
- OA Manager is Japanese-first; the Developers Console is available in
  English. Screenshots for the docs should be taken in Japanese.

## Not done today (deliberately)

- Rename OA display name → "renkei dev"
- Issue long-lived channel access token (v0.2)
- ~~Set OA webhook URL / disable auto-reply~~ — done 2026-08-27: webhook URL
  `https://renkei-demo.onrender.com/line/webhook`, "Use webhook" on, auto-reply
  off (OA Manager → Settings → Response settings)
- Email permission application (after spike)
- TW / TH Login channels (v0.3)
- LINE MINI App channel (v0.3)
