# renkei — master plan

Internal planning record. Written in English so we can iterate fast; everything
public-facing is Japanese-first (see [DECISIONS.md](DECISIONS.md) §3).
Written 2026-08-26 before any code; §7 status block tracks where v0.1 stands.

Related: [ARCHITECTURE.md](ARCHITECTURE.md) · [ROADMAP.md](ROADMAP.md) ·
[LAUNCH.md](LAUNCH.md) · [DECISIONS.md](DECISIONS.md)

---

## 1. One-paragraph pitch

**renkei** is a self-hostable identity broker for LINE. It owns everything
LINE-specific that happens *after* the OAuth handshake — friend-add at login
(`bot_prompt`), LIFF / Mini App sessions, Messaging API account linking, the
mapping between LINE Login / Messaging / LIFF user IDs, per-country channels,
and LINE's email quirks — and exposes a boring, standard OpenID Connect
interface on the other side. Plug it into Supabase, Firebase, Cognito,
Keycloak, or straight into your app. Open source, Apache-2.0, not affiliated
with LY Corporation.

Japanese tagline (draft): **LINEの「ログインの先」を全部引き受ける、セルフホスト型IDブローカー。**

## 2. Why this exists (the evidence, 2026-08-25)

The naive version of this idea — "an IdP with a LINE button" — is already
solved. Clerk, Auth0, Logto, Better Auth and Auth.js all ship a LINE provider;
Keycloak/Zitadel/Ory/Authentik work through LINE's OIDC discovery document.
Competing there would be pointless.

What is **not** solved anywhere, and what Japanese developers keep re-building
by hand:

| Pain | Evidence |
|---|---|
| Friend-add at login (`bot_prompt`) | Cognito cannot pass it at all. Auth0 needs an `upstream_params` Management-API hack. Clerk/Logto docs don't mention it. LINE login without the Official Account friend-add is half the business value. |
| User-ID linking across LINE Login / Messaging API / LIFF | LINE's own tips article (2026-04-09) ends with "the linking mechanism itself isn't provided by the LINE Platform — build your own." |
| LIFF / Mini App → backend session | Every team re-implements id_token → `/oauth2/v2.1/verify` → session. LINE published a tips post on 2026-08-13 telling people to stop sending profile JSON to the server — because many do. |
| Messaging API account linking | Link token + nonce + `accountLink` webhook is a small state machine nobody packages. |
| One channel per country (JP/TW/TH) | better-auth issue #5493; answer is "configure the generic plugin three times." |
| Email | Requires a separate permission application; present only in the id_token, not userinfo. Generic OIDC connectors silently get no email. |
| Supabase | No native LINE. Three separate Zenn articles on homegrown workarounds (Edge Functions + magic link, manual PKCE, Auth0-as-middleman). |
| **Commercial proof** | ソーシャルPLUS and Login Plus are paid Japanese SaaS whose pitch is exactly "LINE login + ID連携 + 友だち追加, and we absorb LINE's spec changes." No OSS equivalent exists. |

Full source list is in the research notes at the bottom of this file.

## 3. Positioning

- **Is:** the LINE-specific identity layer. A broker/bridge. Small, sharp,
  opinionated about LINE.
- **Is not:** a general-purpose IdP. No password login, no MFA, no RBAC, no
  admin console for managing your whole user base. Those exist already; renkei
  federates *into* them.
- **Wedge:** "LINE auth for Supabase, done right" — the loudest single pain
  signal. First tutorial, first example, first Zenn article.
- **Expansion (much later, only if pulled):** the same broker shape for other
  Asia-specific IdPs that Western auth vendors ignore — Yahoo! JAPAN ID,
  dアカウント, au ID, Kakao, Zalo. Designed for via a provider-plugin interface
  from day one; **not built** until LINE is excellent.

## 4. Non-goals (write these down so scope doesn't creep)

- Not a Keycloak/Logto replacement. If someone asks for password login, point
  them at Logto + renkei.
- Not a marketing/CRM tool. We expose friendship status and user IDs; we do
  not send campaigns. (This is the line between us and ソーシャルPLUS.)
- Not a hosted SaaS in v0.x. Self-host only. A hosted offering is a possible
  future, never a v0.x commitment.
- Not a LINE Messaging API SDK. We consume the `accountLink`/`follow`/
  `unfollow` webhooks we need; we don't wrap the whole Messaging API.

## 5. Who it's for

1. **Primary:** Japanese web developers (Next.js / Supabase / Firebase /
   Rails / Laravel crowd) building B2C services that need LINE login *and*
   the Official Account tie-in. They read Zenn/Qiita, attend LINE DC meetups.
2. **Secondary:** Taiwanese and Thai developers with identical needs (LINE's
   other two verified-OA markets). They read Medium (LINE Developers TW/TH),
   iThome, Facebook groups.
3. **Tertiary:** Platform teams at mid-size Japanese companies running
   Keycloak/Cognito who want a supported way to get LINE features without
   patching the IdP.

## 6. Key design decisions (summary — full reasoning in DECISIONS.md)

| # | Decision | Short reason |
|---|---|---|
| 1 | Name: `renkei` | The literal word users google ("LINE ID連携"). Free on npm and as a GitHub org. Never "LINE" in the name — trademark. |
| 2 | License: Apache-2.0 | Patent grant + Japanese enterprise legal departments accept it without friction. |
| 3 | Language: **Japanese-first docs and community; English code and comments** | LINE's markets are JP/TW/TH. Japanese comments lock out TW/TH contributors and global reviewers. Japanese-first *everything else* is the differentiator. **This deviates from Achraf's initial "fully Japanese" preference — see DECISIONS.md §3 for the argument; cost of flipping is zero right now.** |
| 4 | Stack: TypeScript, Hono, Postgres (Drizzle), `oidc-provider` for the OIDC-provider side | Hono runs on Node/Bun/Deno/Cloudflare Workers — same core deploys as a Docker container, a Supabase Edge Function, or a Worker. `oidc-provider` is OpenID-certified; we don't hand-roll OIDC. |
| 5 | Monorepo: `packages/core`, `packages/server`, `packages/client`, `examples/*` | Small contribution surface per package; framework adapters are the natural "help wanted" items. |
| 6 | Repo private until v0.1 "shareable" bar is met, then public in one move | Empty public repos get judged; first impression matters for stars/trending. |
| 7 | LINE Login and Messaging channels must share a LINE **provider** | Only then do user IDs match across Login/LIFF/Messaging. Documented as a hard prerequisite, checked at setup. |

## 7. Scope before sharing — the v0.1 bar

> **Status 2026-08-26:** everything below is done except the items marked
> *open* in ROADMAP.md: demo instance, npm publish of `renkei-*`, two weeks
> of dogfooding, console screenshots in the guide, social-preview upload
> (UI-only). Human-only verifications outstanding: Next.js example final
> LINE leg; LIFF in the LINE app (in-client) — external browser verified.

Nothing gets posted anywhere until **all** of these are true. This is the
answer to "how much do we have to build before we can start sharing it."

**Functional**
- [x] LINE Login (auth code + PKCE) end to end, with `bot_prompt`
      (`normal`/`aggressive`) and `friendship_status_changed` captured
- [x] id_token verified locally (HS256 with channel secret *and* ES256 via
      LINE JWKS), `nonce`/`state` enforced, email pulled from id_token
- [x] LIFF token exchange: `POST /liff/exchange` takes a LIFF id_token or
      access token → verified → renkei session / OIDC tokens
- [x] Identity store: stable renkei `sub` ↔ LINE userId, per channel;
      multi-channel config (JP/TW/TH) with routing by channel ID
- [x] renkei acts as an **OIDC provider**: discovery, JWKS, `/authorize`,
      `/token`, `/userinfo`, with LINE-specific claims
      (`line:friend`, `line:user_id`, `line:channel_id`)
- [~] Friendship status kept current via `follow`/`unfollow` webhooks — **moved to v0.2** (#2); friendship is captured at every login already
- [x] Postgres storage; SQLite for local dev

**Deployable**
- [x] `docker run` works with a `.env` in < 5 minutes from a clean machine
- [ ] Published Docker image (GHCR) and npm packages — at launch (workflows ready)
- [x] A live demo instance (Render free tier, sleeps when idle — DECISIONS §9) — 2026-08-26

**Documented (Japanese, with English mirror)**
- [x] README with the "why" in three sentences, a diagram, and a
      copy-paste quickstart
- [x] **Tutorial 1: Supabase + renkei** — the wedge
- [x] **Tutorial 2: Next.js direct** (no downstream IdP)
- [x] Reference: config, endpoints, claims, webhook setup, LINE Developers
      Console prerequisites (provider sharing, email permission application)
- [x] LINE brand-guideline-compliant login button assets and a note on
      trademark

**Project hygiene** (see LAUNCH.md checklist)
- [x] CONTRIBUTING, CoC, SECURITY, issue/PR templates, CI green, release
      automation, ≥ 10 open issues that show a living roadmap,
      ≥ 5 labelled `good first issue`

**Proof**
- [ ] renkei used in one real thing (own app or a friend's) for two weeks.
      If we haven't dogfooded it, we don't ship it.

**Estimated effort:** 6–8 weekends for one person if scope holds. If it's
trending past 10, cut Tutorial 2 and SQLite, not the OIDC-provider side.

## 8. Milestones (detail in ROADMAP.md)

| Version | Theme | Public? |
|---|---|---|
| v0.1 | The bar above. LINE Login + LIFF + OIDC provider + Supabase tutorial | **Launch** |
| v0.2 | Messaging API account linking (link token, nonce, `accountLink` webhook), minimal admin/inspection UI | Yes |
| v0.3 | Client SDKs (`renkei-client`, `renkei-next`), Cloudflare Workers + Supabase Edge deploy targets, LINE Mini App specifics | Yes |
| v0.4 | Firebase / Cognito / Keycloak federation guides, `examples/` for Rails, Laravel, Spring, Go | Yes |
| v1.0 | Stability promise. Config schema frozen. Security review done. | Yes |
| later | Provider plugins for other Asian IdPs — only if users ask | — |

## 9. Risks and how we handle them

| Risk | Mitigation |
|---|---|
| LINE API churn (the thing ソーシャルPLUS charges for) | Pin API versions in config, CI job that hits LINE's endpoints against a test channel weekly, changelog discipline. Churn is also the moat. |
| Trademark | Never "LINE" in name/logo/domain. Disclaimer in README. Follow LINE Login button guidelines. |
| Scope explosion once people arrive | Non-goals list above is public. Provider-plugin interface exists but only LINE is built. RFC process for anything touching core (LAUNCH.md §6). |
| Solo maintainer burnout | Small packages, CODEOWNERS, "help wanted" pipeline, release automation, say no fast. |
| Employer overlap | Confirmed 2026-08-25: company IdP does not do this. Still: check contract's side-project clause before first public commit. |
| Security — we're an auth component | Threat model in ARCHITECTURE.md, SECURITY.md with disclosure process, dependency audit in CI, external review before v1.0. |
| Nobody cares | The v0.1 bar is deliberately small. If the Supabase tutorial gets no traction on Zenn within a month, we've lost ~8 weekends and learned something. |

## 10. Immediate next steps

1. Read DECISIONS.md §3 (language) and §4 (stack) — flip either if you
   disagree; nothing depends on them yet.
2. Check employment contract side-project clause.
3. Create a LINE Developers **provider** with one LINE Login channel and one
   Messaging API channel for development. Apply for email permission early —
   it takes days.
4. Start v0.1 per ROADMAP.md, in order. First code: the LINE Login flow with
   `bot_prompt`, because every other feature depends on it.

---

## Research notes (2026-08-25)

Vendor support matrix, verified from docs:

- Clerk — LINE supported: https://clerk.com/docs/guides/configure/auth-strategies/social-connections/line
- Auth0 — LINE since 2019: https://auth0.com/blog/auth0-integrates-social-login-for-line/
- Logto — first-party connector: https://docs.logto.io/integrations/line
- Better Auth: https://better-auth.com/docs/authentication/line · multi-country issue: https://github.com/better-auth/better-auth/issues/5493
- Auth.js: https://authjs.dev/reference/core/providers/line
- Keycloak via OIDC: https://gary-chang.medium.com/add-line-login-as-a-custom-identity-provider-into-keycloak-d7e2e496ad99
- Supabase — no native LINE: https://github.com/orgs/supabase/discussions/20178
  - workarounds: https://zenn.dev/kota113/articles/79a75dac7236c0 · https://zenn.dev/rtkhs/articles/f26ed85cc01168 · https://zenn.dev/spacemarket/articles/supabase-thirdparty-auth-by-auth0
- Firebase custom auth: https://firebase.blog/posts/2016/11/authenticate-your-firebase-users-with-line-login/
- Cognito can't pass bot_prompt: https://zenn.dev/kecy/articles/7e8648dd2bdc3e · OIDC setup: https://dev.classmethod.jp/articles/cognito-userpool-openid-connect-line/
- Auth0 bot_prompt workaround: https://qiita.com/takusan64/items/a7acb77cecdff90f09e9 · https://zenn.dev/code_diver/articles/ee1884bba472d1
- LINE Developers — user ID linking (2026-04-09): https://developers.line.biz/ja/tips/2026/04/09/user-id-linking/
- LINE Developers — send tokens not profiles (2026-08-13): https://developers.line.biz/ja/tips/2026/08/13/send-token-to-server/
- LINE Developers — link a bot: https://developers.line.biz/ja/docs/line-login/link-a-bot/
- LIFF + Firebase: https://zenn.dev/devaoyama/articles/7ffa4c7ff1686f · LIFF + Auth.js: https://zenn.dev/rayven_inc_731/articles/b47dd2fcad5a91
- Email not in userinfo: https://meta.discourse.org/t/openid-with-line-biz-email-in-jwt-missing-in-userinfo/238789
- Commercial incumbents: https://www.socialplus.jp/ · https://login-plus.jp/posts/line-botlink
- Stytch, Kinde, WorkOS, Descope, SuperTokens, FusionAuth, Authgear: no LINE found in docs (checked 2026-08-25)
