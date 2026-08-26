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
