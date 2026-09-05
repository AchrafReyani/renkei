# renkei — instructions for Claude Code

renkei (連携) is a self-hosted identity broker for LINE: LINE Login with
friend-add, LIFF token exchange, ID mapping, exposed as a standard OIDC
provider. Monorepo: `packages/core` (LINE + identity logic, no HTTP),
`packages/storage-postgres`, `packages/server` (Hono + oidc-provider),
`packages/renkei` (CLI), `examples/*`, `docs/`.

## Start of a session

1. Read `docs/NEXT.md`. If it has unticked items, that is the work: go
   through them in order with the user, ticking and committing as you go.
2. `docs/ROADMAP.md` is the running record; `docs/DECISIONS.md` has the why.
   Update them when things ship — don't leave them stale.

## Conventions

- **English** code, comments, commit messages. **Japanese-first** docs and
  user-facing text, with an English mirror (`*.ja.md` / `*.en.md`, README.md /
  README.en.md) updated in the same change. See DECISIONS.md §3.
- Commits are DCO signed-off (`git commit -s`). CI enforces it on PRs.
- `main` is protected by a GitHub ruleset (no bypass, admins included):
  changes land only through a PR, squash-merged, with the `lint · typecheck ·
  test` and `DCO sign-off` checks green; no force-push, no deletion. `v*`
  tags can be created but not deleted or moved. Merged PR branches are deleted
  automatically. Never try to push to `main` directly.
- Never put "LINE" in package/product names. Keep the trademark note.
- Secrets live only in `.env` (gitignored). Channel/LIFF IDs are fine in docs.

## Verify before claiming done

`pnpm lint && pnpm typecheck && pnpm test` (70+ tests, PGlite-backed Postgres
tests included), `pnpm build`, `pnpm docs:build`. For anything touching the
login flow, run it against the real channel (`pnpm dev:server` → http://localhost:3000/dev).
State explicitly what was verified and how; anything that needs the user's
phone, passkey, or a GitHub/LINE UI page is an open item to hand to them, not
a done item.

## Commands

| | |
|---|---|
| `pnpm dev:server` | renkei on :3000 with the `/dev` test relying party |
| `pnpm --filter renkei-server dev:harness` | raw LINE Login harness (no OIDC layer) |
| `pnpm demo:server` | renkei on :4321 with a **stubbed LINE and a synthetic user** — use this for screenshots and the README GIF, never a real login |
| `pnpm test` / `pnpm lint` / `pnpm typecheck` / `pnpm build` | the checks |
| `pnpm docs:build` / `pnpm docs:dev` | VitePress site (`docs/.vitepress`) |
| `docker compose up` | renkei + Postgres from the Dockerfile |

## Known environment quirks

- Claude in Chrome: `localhost:3000`, `renkei-demo.onrender.com`,
  `developers.line.biz` and `manager.line.biz` work; `access.line.me`,
  `account.line.biz` (the console's login page) and `*.trycloudflare.com` are
  blocked — when the console session has expired, Achraf logs in on the tab
  Claude opened. Console attestation checkboxes must be set with `form_input`,
  not clicked.
- Achraf's own terminal is `cmd.exe`: give him commands joined with `&&`,
  never `;`. The auto-mode classifier sometimes blocks `gh pr merge` and
  `git push` of tags — hand him the exact command instead of retrying.
- Every merge to `main` redeploys renkei-demo on Render (empties the
  per-process `/inspect` webhook ring).
- Bash tool: avoid single quotes inside heredocs; put scripts in a file.
- Windows: kill servers by PID from `netstat -ano`, never `taskkill //IM node.exe`.
