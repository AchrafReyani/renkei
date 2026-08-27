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

Context: v0.2.0 is published (npm + GHCR) and live-verified; two patch fixes
(#38, #40) are merged but unreleased — **0.2.1 is the first item**. `docs/NEXT.md`
has the exact split of who runs what (Achraf's terminal is `cmd.exe`: `&&`, not
`;`). Then optional live checks, launch/UI/time-gated steps. Don't re-implement
finished features; confirm against `main` before suggesting work.
Follow the DCO single-paragraph commit rule and the branch→PR→merge flow already
in use (see the [[renkei-project]] memory for the CI/DCO gotchas).
