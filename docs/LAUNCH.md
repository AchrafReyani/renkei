# Launch and growth plan

How renkei gets in front of the people who need it, and how it turns
visitors into contributors. This is the answer to "what conventions make a
GitHub project visible, where else to post, and how to get people to help."

## 1. Principle

One launch, done well, beats a trickle. Everything in PLAN.md §7 (the v0.1
bar) is finished *before* the first post. On launch day the repo goes public,
the Zenn article goes up, and the same-day posts go out in the order below.
After that, cadence: one substantive post per release, one small post per
month, always in Japanese first.

## 2. Channels, ranked by expected yield for this audience

### Japan (primary)

| Channel | What | When |
|---|---|---|
| **Zenn** | Launch article: 「LINEログインの"その先"を全部引き受けるOSSを作った」— problem-first, not feature-first. Link the Supabase tutorial. Use Zenn *Scraps* during build-out for dev-log snippets (cheap, builds the account). | Launch day, Tue–Thu, 07:00–09:00 JST |
| **Qiita** | Cross-post a shorter version 2–3 days later with a canonical link. Tags: `LINE`, `LINEログイン`, `LIFF`, `Supabase`, `OIDC`, `OSS`. | Launch +3d |
| **Hatena Bookmark** | Not a place to post; a place to *get bookmarked*. 10+ bookmarks in the first hours puts a Zenn article on the tech hotentry list. Ask friends to bookmark at 08:00 JST, not to star. | Launch day |
| **X (Twitter) JA** | Thread: 1 problem tweet, 1 diagram, 1 quickstart GIF, 1 link. Tag nobody. Quote-tweet by anyone at LY Corp DevRel is the jackpot; don't ask for it, make it easy. | Launch day 12:00 JST |
| **LINE Developers Community (LINE DC)** | connpass group with monthly meetups and LT slots. Apply for a 5-min LT: "自作するのはもうやめよう、LINE認証". Meeting the LINE API Experts in person is worth more than any post. | First meetup after launch |
| **Qiita / Zenn Advent Calendar** | December. LINE DC runs its own calendar; also the Supabase and 認証 ones. Reserve slots in November. | Dec |
| **note.com** | Business-side audience (the people who *buy* ソーシャルPLUS). One post: "LINE ID連携をOSSで — 導入コストの話". | Month 2 |
| **Speaker Deck / Docswell** | Upload every LT deck. Decks get found on Google for years. | Each talk |
| **Bluesky / Misskey JA tech** | Low effort cross-post. | Launch day |

### Taiwan / Thailand (secondary, from v0.3)

| Channel | What |
|---|---|
| **Medium — LINE Developers Taiwan / Thailand** publications | Pitch a guest post once zh-TW docs exist. These publications already wrote about the "don't send userId from frontend" problem. |
| **iThome 鐵人賽** (Sept–Oct annual 30-day series) | A 30-post series "用 renkei 做 LINE 登入" would be a huge TW signal. Needs a TW contributor; recruit one via the Medium post. |
| **Facebook groups** — LINE Developers TH, Thai dev communities | Thai devs live on Facebook. One contributor there is worth the whole channel. |
| **PTT Soft_Job / Reddit r/Taiwan dev** | Low priority |

### Global (tertiary — mostly for contributors and credibility)

| Channel | What |
|---|---|
| **Hacker News "Show HN"** | Post *after* the Japanese launch, once there's social proof. Title the problem, not the product: "Show HN: Self-hosted identity broker for LINE (Japan's WhatsApp) — friend-add at login, LIFF, account linking". HN likes "I couldn't find X so I built it" with evidence. |
| **Reddit** r/selfhosted, r/webdev, r/nextjs, r/Supabase | Same week as HN. |
| **Existing threads where people already asked** | Reply with the solution in: Supabase discussion #20178, better-auth issue #5493, Logto discussions, the Auth0 community LINE thread, the Discourse LINE thread. Genuinely helpful, not spam — one link, the answer inline. **This is the highest-conversion channel of all.** |
| **awesome-lists** | PR to `awesome-selfhosted` (auth section), `cerberauth/awesome-openid-connect`, `awesome-supabase`, any `awesome-line` list. |
| **Product Hunt** | Skip for v0.x. Wrong audience. |
| **Dev.to / Hashnode** | English mirror of the Zenn article, canonical to Zenn. |

## 3. GitHub conventions that affect discoverability — checklist

Things GitHub's search, trending and social-preview machinery actually look at,
plus what makes a human star within 30 seconds.

**Repo metadata**
- [ ] **Description** (≤ 120 chars, JA + EN): 「LINEログインの"その先"を担うセルフホスト型IDブローカー — Self-hosted identity broker for LINE」
- [ ] **Topics** (GitHub search weights these heavily; max 20): `line`,
      `line-login`, `liff`, `line-messaging-api`, `oidc`, `openid-connect`,
      `oauth2`, `authentication`, `identity-provider`, `identity-broker`,
      `self-hosted`, `supabase`, `firebase`, `keycloak`, `typescript`, `hono`,
      `japan`, `japanese`, `taiwan`, `thailand`
- [ ] **Homepage** link → docs site
- [ ] **Social preview image** 1280×640 — logo + one-line JA + one-line EN.
      This is what shows on X/Slack/Discord unfurls. Most projects skip it.
- [ ] **Releases** with notes (Changesets → GitHub Releases), not just tags.
      Releases page is what people check for "is this alive."
- [ ] **Discussions** on, categories: 質問 / Q&A, アイデア / Ideas,
      お知らせ / Announcements, 事例 / Show and tell
- [ ] Repo name lowercase, no hyphens: `renkei`

**README (first screen decides the star)**
- [ ] H1 + one-sentence JA + one-sentence EN
- [ ] Badges: CI, npm version, Docker image, license, Discord — keep to 5
- [ ] **Diagram** above the fold (the "where renkei sits" one)
- [ ] 「なぜ」 in three sentences: the pain, the gap, the fix
- [ ] **Quickstart** copy-pasteable in one block, ≤ 10 lines
- [ ] 「対応していること / できないこと」 — the non-goals list builds trust
- [ ] Comparison table vs Auth0/Clerk/Logto/Cognito/DIY on the *LINE-specific*
      rows (bot_prompt, LIFF, account linking, multi-region, email)
- [ ] Link to English README (`README.en.md`) at the very top
- [ ] Trademark disclaimer at the bottom
- [ ] Star history chart once there's history (star-history.com embed)

**Contribution surface**
- [ ] `CONTRIBUTING.md` ja/en with a 10-minute local setup
- [ ] `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1, JA translation exists)
- [ ] `SECURITY.md` with a private reporting path (GitHub private
      vulnerability reporting enabled)
- [ ] Issue forms (`.yml`, not `.md`) — structured fields make triage fast
      and let people file in Japanese with confidence
- [ ] PR template with a DCO reminder and a "docs updated in both
      languages?" checkbox
- [ ] Labels: `good first issue`, `help wanted`, `docs`, `docs:ja`,
      `docs:en`, `docs:zh-tw`, `docs:th`, `example`, `adapter`,
      `line-api-change`, `security`, `rfc`
- [ ] `CODEOWNERS` so reviews auto-request
- [ ] ≥ 5 `good first issue` on launch day, each with the exact file and
      the acceptance criterion. Empty "good first issue" labels are a tell.
- [ ] `.github/FUNDING.yml` — GitHub Sponsors on, even if nobody donates;
      it signals seriousness

**Automation that keeps the repo looking alive when you're busy**
- [ ] CI on PR (lint, typecheck, test, build examples)
- [ ] Renovate/Dependabot weekly, auto-merge for patch
- [ ] Changesets bot for release notes
- [ ] Stale-bot **off** — closing issues automatically reads as hostile in
      the Japanese OSS community
- [ ] Weekly LINE-API smoke test in CI (the "we absorb spec changes" promise,
      made visible: a green badge)

## 4. Community home

- **Discord** — Japanese devs use Discord heavily. Channels: `#はじめに`,
  `#質問`, `#開発`, `#english`, `#zh-tw`, `#th`. Bridge announcements from
  GitHub Releases. Don't open until there are ≥ 3 people who aren't you;
  an empty Discord is worse than none. Use GitHub Discussions until then.
- **Docs site** — VitePress, `ja` default, language switcher. Hosted on
  Cloudflare Pages or Vercel at a `renkei.dev`-style domain if available
  (check at launch; not required).

## 5. Growing contributors (the "massive scope" problem)

The scope *will* balloon the moment real users show up: MySQL, Rails, Laravel,
Spring, Vue, Nuxt, Flutter, Kotlin, LINE Pay, zh-TW docs, th docs, Kakao,
Zalo. One person cannot do that. The design of the repo has to make each of
those a *small, independent, obviously-scoped* contribution:

1. **Adapters and examples are the contribution unit.** `storage-*`,
   `examples/*`, `docs/<lang>/*`. Each has a template directory and a CI
   job. "Add a Laravel example" is a weekend for someone who knows Laravel
   and nothing about renkei's core.
2. **Core stays small and guarded.** Changes to `core` or `server` need an
   issue first; anything touching token verification or claims needs an RFC
   (a markdown file in `docs/rfcs/`, one-page, discussed in the PR). This is
   how you say no without being the bottleneck.
3. **Reply to first-time contributors within 24 h**, in their language.
   Japanese-language PR descriptions are explicitly welcome; a maintainer
   helps with English identifiers/comments. Say so in CONTRIBUTING.
4. **Promote early.** The first person who lands two good PRs in an area
   gets `docs:zh-tw` or `examples/laravel` in CODEOWNERS. Ownership is what
   turns a contributor into a maintainer.
5. **Public roadmap** as a GitHub Project board. People contribute to
   things they can see coming.
6. **Credit loudly.** All-contributors bot, name people in release notes
   and in the Zenn posts.
7. **Recruit deliberately for TW and TH.** One post each on the LINE
   Developers TW/TH Medium publications asking for a docs co-maintainer.
   Those two people are the difference between a Japanese project and a
   LINE project.

## 6. Cadence after launch

| When | What |
|---|---|
| Weekly | Triage, reply to everything, merge Renovate |
| Per release (every 2–4 weeks in v0.x) | GitHub Release notes JA/EN, X post, Discord announcement |
| Monthly | One Zenn Scrap or short article (a bug found, a LINE API change absorbed, a user story) |
| Quarterly | One LT at LINE DC or a Supabase/Next.js meetup |
| December | Advent Calendar entry |
| Sept–Oct (from year 2) | Support a TW contributor's iThome series |

## 7. Metrics that mean something (and ones that don't)

Track: docker pulls / npm downloads (usage), issues opened by strangers
(reach), PRs from strangers (community), Discord non-you members, Zenn
likes + Hatena bookmarks on the launch article (Japan reach).

Don't chase: raw stars (easy to game, and Achraf's own follower count is a
reminder of how little they mean), HN rank, Product Hunt.
