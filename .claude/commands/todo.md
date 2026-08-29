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

Context (as of 2026-08-30): v0.2.1 is published (npm + GHCR) with the two patch
fixes (#38, #40) and #40 is confirmed live; the repo is public; one patch
changeset (#44, `/dev` client selection) is pending for a later 0.2.2 — not
urgent. Nothing blocking remains: what's left is the dogfood dates (§3), the
LINE email-permission check (§4, console login by Achraf first), and the launch
steps (§2). Start by asking for the dogfood dates. `docs/NEXT.md`
has the exact split of who runs what (Achraf's terminal is `cmd.exe`: `&&`, not
`;`). Then optional live checks, launch/UI/time-gated steps. Don't re-implement
finished features; confirm against `main` before suggesting work.
Follow the DCO single-paragraph commit rule and the branch→PR→merge flow already
in use (see the [[renkei-project]] memory for the CI/DCO gotchas).
