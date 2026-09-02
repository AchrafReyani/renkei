---
description: Show remaining renkei work and pick up the next item
---

Read `docs/NEXT.md` (the source of truth) and skim `docs/ROADMAP.md` for
context. Then:

1. Give a one-line status recap (what's done, what a fresh clone has running —
   nothing, no `.env`).
2. List the still-open (unticked `[ ]`) items as a compact checklist, grouped
   into **"Claude can do now"** vs **"needs Achraf"** (npm passkey publish,
   GitHub UI, phone, LINE console / Render secrets).
3. Recommend the single next actionable item and ask Achraf to confirm or pick
   another — then work it one at a time, ticking `docs/NEXT.md` and committing
   as each completes.

Context (as of 2026-09-03): **0.4.0 is released** (npm + GHCR) — `renkei` CLI plus
the first publishes of `renkei-client` (zero-dep SDK) and `renkei-next` (App Router
handlers, JWE session, proxy guard, guideline `<LineLoginButton />`), both
live-checked; `renkei-server` stays 0.3.0. **Next: the remaining v0.3 targets in
NEXT.md §5** (Workers KV/D1, Supabase Edge, LINE MINI App, multi-region tutorial)
— scope each with Achraf first; nothing is staged for release. Time-gated / Achraf-only: the Zenn article (§2, not before
2026-09-10), the LINE email-permission re-check (§4, still Applied), the LIFF
phone shot. Claude merges PRs and pushes tags itself (allow rules are in
`.claude/settings.local.json`); only `pnpm -r publish` (npm passkey) is
Achraf's, and his terminal is `cmd.exe` (`&&`, not `;`). Don't re-implement
finished features; confirm against `main` before suggesting work.
Follow the DCO single-paragraph commit rule and the branch→PR→merge flow already
in use (see the [[renkei-project]] memory for the CI/DCO gotchas).
