# Decision log

Lightweight ADRs. Newest at the bottom. Each entry says what was decided, why,
what it cost, and what would make us revisit it. Rejected options are kept —
the reasoning is the point.

---

## 1. Name: `renkei` (2026-08-26)

**Decision.** Project, npm scope and GitHub repo are `renkei` (連携).

**Why.** 「LINE ID連携」 is the exact phrase the target user types into Google.
A project literally named after the thing they're searching for is the
cheapest SEO we'll ever get. Availability checked 2026-08-26: npm `renkei`
free, GitHub org `renkei` free, ~60 repos with the word in the name, the
top one has 10 stars. Pronounceable by non-Japanese speakers ("ren-kay").

**Rejected.**
- `tsunagi` / `musubi` / `kizuna` — taken on npm; `musubi` and `kizuna` are
  crowded on GitHub (500–800 repos, top ones with 1k+ stars).
- `enishi` (縁) — free everywhere, prettier, but means nothing to a developer
  searching for a solution. Runner-up if `renkei` ever has to change.
- Anything containing "LINE" — trademark. Also rules out `line-*` npm names
  even though `line-bot-sdk` exists; LY Corp owns those.

**Revisit if.** LY Corporation objects (unlikely — it's a common noun) or a
squatter grabs the npm name before first publish. **Mitigation: publish a
placeholder `renkei@0.0.0` to npm this week.**

---

## 2. License: Apache-2.0 (2026-08-26)

**Decision.** Apache-2.0.

**Why.** Explicit patent grant; Japanese enterprise legal reviews wave it
through (Keycloak, Kubernetes precedent). We want platform teams at mid-size
companies to adopt without a legal conversation.

**Rejected.**
- MIT — nearly equivalent in practice, no patent grant. Fine, but Apache
  costs nothing extra.
- AGPL-3.0 — would stop a ソーシャルPLUS-type vendor from wrapping renkei as
  their SaaS without contributing back. Tempting, but Japanese corporate
  legal departments reflexively reject AGPL, which kills the tertiary
  audience. Adoption matters more than protection at this stage.
- MPL-2.0 (what Logto uses) — reasonable middle ground, less known in Japan.

**Revisit if.** A commercial fork appears and hurts the project. Relicensing
later is possible only while contributor count is small — another reason to
have a CLA-free but DCO-signed contribution flow (see CONTRIBUTING).

---

## 3. Language policy (2026-08-26) — confirmed by Achraf 2026-08-26

**Decision.**
- **Japanese-first, always available in English:** README, docs site,
  tutorials, issue templates, discussions, release notes, blog posts,
  community (Discord). Japanese is the *primary* language; English is a
  mirror maintained in the same PR.
- **English only:** code identifiers, code comments, commit messages,
  internal design docs (this folder), API error messages, log lines.
- **Later, community-maintained:** Traditional Chinese and Thai docs.

**Why this deviates.** Achraf's initial preference was "fully in Japanese,
including code comments." The objection:

1. LINE's three verified-OA markets are Japan, Taiwan, Thailand. The secondary
   audience is Taiwanese and Thai developers who have the *identical* pain.
   Japanese code comments lock them out of contributing; English doesn't lock
   anyone out.
2. Japanese engineering culture at the companies whose engineers we want as
   contributors (LY Corp, Mercari, Cybozu, SmartHR, freee) writes code and
   commits in English. Japanese-comment code reads as *less* professional to
   that audience, not more.
3. Security-sensitive code benefits from the widest possible reviewer pool.
   A LINE-ID-token-verification bug found by a Go developer in Berlin is
   still a bug found.
4. The differentiation Achraf is after — "this project is *for* us, in our
   language" — comes from the docs, the tutorials, the Zenn posts, the
   Discord and the issue templates being Japanese-first. That's where users
   look. Nobody chooses an auth library because the comments are in their
   language.

**What full-Japanese would have bought.** A stronger "made in Japan" signal
in the code itself, and slightly easier contribution for Japanese developers
who are uncomfortable writing English comments. Real, but small, and the
CONTRIBUTING guide can say "Japanese PR descriptions are welcome; a
maintainer will help with English comments."

**Cost of flipping back to full-Japanese.** Zero today — there is no code.
After v0.1 it's a mechanical but tedious rewrite. **Decide before the first
code commit.**

**Status.** Achraf confirmed English code / Japanese-first docs on 2026-08-26. Closed.

---

## 4. Stack: TypeScript · Hono · Postgres/Drizzle · `oidc-provider` (2026-08-26)

**Decision.** Monorepo (pnpm workspaces + Turborepo):

```
packages/core     — LINE flows, token verification, identity mapping. No HTTP framework. Pure functions + storage interface.
packages/server   — Hono app: routes, OIDC provider (node-oidc-provider), webhooks, config loading.
packages/storage-postgres, packages/storage-sqlite — Drizzle adapters.
packages/client   — tiny browser/Node client (LIFF exchange helper, session helper).
packages/next     — (v0.3) Next.js helpers.
examples/supabase, examples/nextjs, examples/…  — runnable, CI-tested.
docs/             — VitePress site, ja + en.
```

**Why.**
- **TypeScript**: the primary audience (Next.js / Supabase / Zenn crowd) is
  TS-native. Lowest barrier to first PR.
- **Hono**: one codebase runs on Node, Bun, Deno, Cloudflare Workers and
  therefore Supabase Edge Functions (Deno). "Deploy renkei as a Supabase
  Edge Function" is a killer demo for the wedge audience; "deploy as a
  Docker container" serves the Keycloak crowd. Same code.
- **Postgres + Drizzle**: Supabase *is* Postgres; users can point renkei at
  their existing database. Drizzle is light and TS-first. SQLite adapter for
  zero-setup local dev.
- **`oidc-provider`** (node-oidc-provider, OpenID-certified): renkei must act
  as an OIDC provider downstream. Hand-rolling OIDC is how auth projects get
  CVEs. Wrap the certified library; contribute upstream if we need something.
- **`jose`** for JWT/JWKS. LINE issues HS256 (channel-secret) and ES256
  (JWKS) id_tokens; both must be supported and tested.

**Rejected.**
- **Go single binary** — better ops story, worse contributor story for the
  primary audience, and no Edge Function deploy. Keep in mind if the
  tertiary (platform-team) audience turns out to be the real one.
- **Python** — no.
- **Writing our own OIDC provider** — no, see above.
- **Supporting MySQL in v0.x** — Japanese enterprises love MySQL. Adapter
  interface makes it a community contribution later; not core.

**Revisit if.** ~~Cloudflare Workers/Deno compatibility of `oidc-provider`
turns out to be poor.~~ **Spiked 2026-08-26 — it works on all three
targets** (see §8 and SPIKE-oidc-provider-runtimes.md). The "token-issuer-only"
fallback is dropped.

---

## 5. Private until v0.1, then public in one move (2026-08-26)

**Decision.** Repo is private during build-out. Flip to public the day the
v0.1 bar in PLAN.md §7 is fully met, together with the first Zenn article.

**Why.** First impression is the launch. An empty or half-built public repo
that someone stumbles on costs a star we'll never get back. GitHub Trending
counts stars-per-day regardless of repo age, so we lose nothing by waiting.

**Rejected.** Public from day one ("build in public"). Works for people with
an existing audience. Achraf's 1.9k followers are mostly follow-back, so the
audience effect is small; the risk side dominates.

**Cost.** Green squares from private-repo commits only show if "private
contributions" is enabled on the profile — it is (per senior-engineer-presence
PLAN.md). So no cost.

---

## 6. LINE provider sharing is a hard prerequisite (2026-08-26)

**Decision.** renkei documents, and checks at setup, that the LINE Login
channel(s) and the Messaging API channel live under the **same LINE
provider**. Without this, LINE issues different user IDs across Login/LIFF
and Messaging and the whole ID-mapping story collapses.

**Why.** This is the single most common cause of "IDs don't match" questions
on Qiita. Surfacing it as a first-run check turns a support ticket into a
setup step.

---

## 7. No CLA; DCO sign-off instead (2026-08-26)

**Decision.** Contributors sign off commits (`git commit -s`), enforced by a
DCO check. No CLA.

**Why.** CLAs deter casual contributors, especially ones whose employer's
legal department would need to review it. DCO keeps the door open for a
possible future relicensing conversation without paperwork up front.

---

## 8. Full `oidc-provider` on every runtime; state is the edge concern (2026-08-26)

**Decision.** The complete OIDC provider ships on Node/Docker, Deno and
Cloudflare Workers. Workers uses `cloudflare:node`'s `httpServerHandler`
so Koa runs unmodified. No reduced edge mode.

**Why.** Spike result (SPIKE-oidc-provider-runtimes.md): discovery, JWKS,
`/auth`, `/token` all behave correctly on workerd; Deno works via `npm:`.
Bundle is 224 KB gzip.

**Cost.** Each target needs a persistent `oidc-provider` adapter — Postgres
first (v0.1), KV/D1 or Hyperdrive for Workers (v0.3). workerd prints an
"Unsupported runtime" warning; we pin versions and keep the runtime matrix
as a CI job so upgrades can't silently break a target.

**Resolved same day.** Supabase `edge-runtime` also works — not via
`node:http` (inert there) but via a ~60-line fetch→(req,res) shim calling
`provider.callback()`. That shim becomes the portable adapter for all
non-Node runtimes. See SPIKE-oidc-provider-runtimes.md.

## 9. Demo instance on Fly.io, Tokyo region (2026-08-26)

**Decision.** The public demo runs the release Docker image on Fly.io in
`nrt`, with `RENKEI_DEV=true` so `/dev` *is* the demo, pinned
`RENKEI_JWKS` / `RENKEI_COOKIE_KEYS`, and an external Postgres (Neon free
tier or Fly Managed Postgres). `fly.toml` and `docs/guides/deploy-fly` are
the reference deployment for anyone self-hosting.

**Why Fly over Railway / a VPS.** Fly has a Japan region — the demo logs
users into a JP LINE channel, and the whole pitch is JP-first. It runs the
verified Dockerfile unchanged, and `auto_stop_machines` keeps an idle demo
near free. Railway would be simpler to wire but has no JP region; a VPS
adds TLS and upkeep that are noise for a demo.

**Cost.** Exposing `/dev` publicly means anyone can log in with LINE and
leave an identity row in the demo DB. Acceptable for a demo; the guide
tells real deployments to drop `RENKEI_DEV` and register their own
`RENKEI_CLIENTS`. Cold starts from `min_machines_running = 0` are a
demo-only trade-off, also documented.

**Revised the same day: Render free tier instead.** Fly requires a payment
method and bills pay-as-you-go (cents/month with auto-stop, but not zero),
and Achraf doesn't want any recurring bill for a demo. The demo therefore
runs on Render's free web service (`render.yaml`, Singapore — Render has no
Japan region) with the database on Neon's free tier (Render's free Postgres
is deleted after 30 days). Cost: $0. Trade-off: the service sleeps after
15 min idle and takes up to a minute to wake — accepted, and stated next to
the demo link in the README so nobody reads the cold start as renkei being
slow. `fly.toml` and the Fly guide stay as the paid self-hosting reference.

## 10. npm package names: unscoped `renkei-*` (2026-08-26)

**Decision.** The packages publish as `renkei-core`, `renkei-server`,
`renkei-storage-postgres` and the CLI `renkei`. Not `@renkei/*`.

**Why.** The `@renkei` npm scope belongs to another user (`aminnairi`,
who published `@renkei/core`, `@renkei/node`, `@renkei/fetch` in December
2024). Scopes are tied to an npm user or org name, so `@renkei/*` can never
be ours. Discovered on the day of the first publish, via a dry run that
silently skipped `@renkei/core` because "0.1.0 already exists".

**Alternatives.** A new org scope (`@renkeijs`, `@renkei-id` — both free)
would be tidier but needs an org created and the name explained forever;
`@achrafreyani/*` ties the project to a personal handle. Unscoped names
are publishable from the existing account today, and `renkei` (the CLI)
was already ours. Future packages follow the same pattern: `renkei-client`,
`renkei-next`.

**Cost.** Unscoped names can be squatted by anyone and read as less
"official"; the repo and docs are the source of truth for which packages
are real. `pnpm changeset`'s `linked` group is now `renkei-*`, which
excludes the `renkei` CLI (same as before).

## 11. SQLite storage on Node's built-in `node:sqlite` (2026-08-30)

**Decision.** `renkei-storage-sqlite` uses `node:sqlite` (`DatabaseSync`),
which Node ships unflagged from 22.13. The package has zero runtime
dependencies. A three-method `SqliteDriver` interface (`exec` / `prepare` /
`close`) is the only thing the stores touch, so `better-sqlite3` and Bun's
`bun:sqlite` satisfy it structurally via `createSqliteDriverStorage()`.
`renkei-server` selects it with `DATABASE_URL=sqlite:<file>`.

**Why.** The honest objection to renkei versus raw LINE Login is setup cost:
a server *and* a Postgres *and* six env vars before the first login. For a
single-box deploy the database is the part that can go. A native module
(`better-sqlite3`) would reintroduce a compile step and platform prebuilds
in the Docker image; the built-in binding has neither.

**Schema.** Same tables and column names as Postgres (`renkei_identity`,
`renkei_line_account`, `renkei_payload`); timestamps are epoch milliseconds,
booleans 0/1, JSON as TEXT. Versioned with `PRAGMA user_version`, one
transaction per version, append-only. WAL mode, `foreign_keys = ON`,
`busy_timeout = 5000` are set on open.

**Cost.** Node ≥ 22.13 for the built-in driver (22.5–22.12 need
`--experimental-sqlite`; the package's vitest config adds it automatically so
older 22.x still runs the tests). Single writer: SQLite is for one process on
one disk — multi-instance deploys stay on Postgres, and the docs say so.

## 12. `renkei-client` is dependency-free and does not verify tokens (2026-09-02)

**Decision.** The SDK builds URLs and wraps renkei's HTTP endpoints; it has
zero runtime dependencies and runs wherever `fetch`, `URL` and Web Crypto
exist. Its only token helper is `decodeClaimsUnverified()`, named so nobody
mistakes it for verification. The `line:*` claim names are duplicated from
renkei-core (a test keeps the two equal) instead of importing core, so a
browser bundle never pulls in `jose`.

**Why.** Verification belongs to the backend that *trusts* the token, and
every backend ecosystem already has a mature verifier (jose, openid-client,
Auth.js, the framework's OIDC layer). Bundling one into a browser SDK would
add weight and a false sense of security — a browser cannot trust its own
verification anyway. What apps actually hand-write today, and get subtly
wrong, is the authorize URL (`bot_prompt`, PKCE, scope), the LIFF exchange
body and the session-cookie calls; that is what the SDK covers.

**Cost.** Five duplicated constants. Anyone using the SDK on a backend must
bring a verifier, which the reference page says on its first screen.

## 13. `renkei-next` owns its session; it is an OIDC client, not a proxy for renkei's cookie (2026-09-03)

**Decision.** `renkei-next` makes the Next.js app a normal OIDC client of
renkei: its route handlers run the code flow (PKCE always on), verify the
id_token against renkei's JWKS with `jose`, and keep the claims in a
JWE-encrypted (`dir` / `A256GCM`) first-party cookie that `getSession()` and
the `proxy()` guard decrypt locally. It does **not** use renkei's
session-cookie mode (`RENKEI_SESSION_COOKIE`) and does not depend on Auth.js.
`<LineLoginButton />` ships in `renkei-next/button` with LINE's official icon
embedded from the button template, so the default rendering already follows
the design guideline.

**Why.** renkei's session cookie belongs to renkei's origin; a Next.js app on
another origin can neither read it in `proxy.ts` nor send it with
`credentials: 'include'` without a CORS story renkei deliberately does not
have. The OIDC code flow is what renkei is for, and an app that adopts
`renkei-next` instead of Auth.js wants fewer moving parts, not a second
framework. Verification stays on the server side (see §12), which is exactly
where these handlers run.

**Cost.** `jose` becomes a runtime dependency of `renkei-next` (it already is
one of `renkei-server`). The session is a snapshot of the claims at login:
`line:friend` changes are only seen at the next login, or through renkei's
webhook forwarding on the app side. Session-cookie mode remains available for
same-origin deployments (renkei reverse-proxied under the app's origin), via
`renkei-client` directly.

## 14. Cloudflare Workers: D1 through the SQLite adapter, no KV, no `httpServerHandler` (2026-09-04)

**Decision.** The Workers target is `renkei-server/workers`: a `createWorker()`
whose `fetch` boots renkei once per isolate from the Worker's vars and secrets
and hands every request to the existing Hono app. Storage is Cloudflare D1
through `renkei-storage-sqlite/d1` — the SQLite adapter's SQL and contract
tests, with the driver interface made async-capable and a small D1 driver that
batches DDL atomically and keeps the schema version in a `renkei_meta` table
(D1 refuses `PRAGMA user_version` and SQL `BEGIN`). No KV adapter. Postgres
via Hyperdrive is a one-liner through `createWorker({ storage })`, documented
but not tested.

**Why.** The spike (§8) assumed the Workers target would need
`cloudflare:node`'s `httpServerHandler`, but the fetch→node bridge written for
Supabase edge-runtime made the Hono app fetch-native on every runtime — the
Worker is the same `app.fetch` as Node, so there is nothing runtime-specific to
add. D1 *is* SQLite: reusing the adapter means one schema, one set of contract
tests (run against real workerd D1 via Miniflare) and no second SQL dialect to
keep in step. KV was dropped on purpose: `oidc-provider` needs `findByUid` /
`revokeByGrantId` lookups and consume-once semantics, which KV's eventual
consistency and lack of secondary indexes cannot give safely.

**Cost.** `migrateSqlite()` and `readUserVersion()` became async (0.x, noted in
the changeset). Miniflare (workerd) is a devDependency of two packages, so CI
downloads the workerd binary. Two version stores exist — `PRAGMA user_version`
on Node, `renkei_meta` on D1 — hidden behind `SqliteDriver.migration`.


## 15. Supabase Edge Functions: path-prefixed issuer, embedded migrations, RLS on renkei's tables (2026-09-04)

**Decision.** The Supabase target is `renkei-server/supabase`: `serve()` (or
`createEdgeFunction().fetch` under `Deno.serve`) boots renkei once per isolate
from `Deno.env` and stores in Postgres — `DATABASE_URL`, else the
`SUPABASE_DB_URL` every Edge Function receives for its project database (one
connection per isolate, closed when idle). Three changes underneath it apply to
every target:

- **Path-prefixed issuers are supported.** Supabase serves a function at
  `/functions/v1/<name>`, so the issuer carries a path. `createRenkei()` keeps
  that path on every URL it builds (LINE `redirect_uri`, interaction redirects,
  `/dev` links and cookie paths), strips it — or any trailing piece a gateway
  leaves, Supabase hands the function `/<name>/…` — from incoming requests before
  routing, and passes it to oidc-provider as its mount path (`originalUrl`), which
  is how the provider prefixes discovery endpoints and its own cookie paths.
- **The fetch→node bridge overrides `X-Forwarded-Host`**, not only `Host` and
  `X-Forwarded-Proto`. With `proxy` on, Koa prefers the forwarded host, and
  Supabase's Kong sends `127.0.0.1` without the port — found live: discovery
  advertised endpoints on the wrong origin. The issuer is the only source of the
  public URL.
- **`renkei-storage-postgres` migrates from an embedded list**
  (`src/migrations.ts`, generated from `migrations/` and checked in; a test keeps
  the two equal) through drizzle's own migrator internals, so it works without a
  filesystem — edge runtimes, bundles — and stays compatible with databases
  migrated from disk (same `__drizzle_migrations` rows). `migratePostgres(db)` is
  exported for other drivers (PGlite, neon).

The `/dev` page's own server-side calls (token, jwks, userinfo) go through
`RenkeiOptions.devInternalIssuer`, which the Supabase entry derives from
`SUPABASE_URL` + the issuer's path: inside the local container the public
`127.0.0.1:54321` is not reachable, `http://kong:8000` is (found live: the
callback page died with `ECONNREFUSED` on the token exchange). Tokens are still
verified against the public issuer.

renkei also **enables row level security** on its three tables when running on
Supabase (`createPostgresStorage({ rowLevelSecurity })`): Supabase's Data API
exposes every `public` table to the `anon` key unless RLS is on, and renkei's
tables hold identities. renkei connects as the table owner, which bypasses RLS.

**Why.** The spike (§8) proved oidc-provider runs on edge-runtime through the
bridge; what was missing was everything around the URL: the function is never
at the origin root, and the gateway rewrites forwarded headers. Solving the
prefix generically (rather than a Supabase-only `basePath` option) also covers
renkei behind a reverse proxy at `/auth`, which had silently been broken.
`SUPABASE_DB_URL` as the default removes the last configuration step: on
Supabase the database is already there.

**Cost.** Requests under a trailing piece of the issuer path (`/renkei/…` on a
`/functions/v1/renkei` issuer) are accepted as renkei's own — harmless, and
needed for Supabase. The RLS statements run on every boot (idempotent, three
`ALTER TABLE`s). The example imports `npm:renkei-server`, so it only resolves
once 0.5.0 is published; the local run bundles the workspace build into a
gitignored `renkei-local` function (Deno injects Node globals only into `npm:`
packages, so the bundle polyfills `Buffer`, `process`, `setImmediate` and
`require` — none of which the published package needs).

## 16. LINE MINI App channels: `kind: 'miniapp'`, provider-scoped identities (2026-09-04)

**Decision.** A LINE MINI App is configured as extra channels next to the Login
channel — `kind: 'miniapp'`, one per stage the app uses, since Developing /
Review / Published are three internal channels with their own IDs and their
id_tokens carry that ID in `aud`. MINI App channels are accepted by
`POST /liff/exchange` (id_token by `aud`, access token by the verify
endpoint's `client_id`), share the Login channel's region, and never serve the
web redirect flow. Identity lookup became **provider-scoped**: after the exact
(channelId, lineUserId) match, `upsertIdentityFromLine` tries the same LINE
user ID on every other channel of the same `provider` and, on a hit, attaches
the new channel to that identity instead of minting a `sub`. Channels with the
same `provider` value — including all that leave it unset — form one provider.
Env: `LINE_MINIAPP_CHANNEL_ID` (comma-separated per stage) and
`LINE_MINIAPP_CHANNEL_SECRET` (one, or one per ID). Service messages are
documented as prerequisites only; renkei does not send them.

**Why.** LINE issues user IDs per provider, so a person who logs in on the web
and later opens the MINI App *is* the same user to LINE; giving them two `sub`
values (the old channel-scoped rule) would push the linking problem onto every
app. Making "same provider" the default matches LINE's model and costs nothing
for single-channel deployments; `provider` exists for the rare renkei that
brokers channels of several providers, where user IDs genuinely differ. A
channel `kind` keeps the web flow on Login channels without a second config
list, and lets the same `/liff/exchange` serve LIFF and MINI App alike.

**Cost.** Multi-channel deployments that relied on separate identities per
channel (none known) change behaviour at the next login of a user on a sibling
channel: the older identity wins and the newer channel row moves onto it — no
data is deleted. The provider lookup is one `findIdentityByLineAccount` per
sibling channel, only on the first visit through a new channel. The
Review / Published stages are untested live until the MINI App passes review.
