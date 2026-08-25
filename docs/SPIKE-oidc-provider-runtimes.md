# Spike: `oidc-provider` across runtimes (2026-08-26)

**Question** (ARCHITECTURE.md §7.1, DECISIONS.md §4 "revisit if"): does
`oidc-provider` (node-oidc-provider, Koa-based, OpenID-certified) run outside
Node — on Deno (Supabase Edge Functions) and Cloudflare Workers (workerd)? If
not, edge targets would need a reduced "token-issuer-only" mode.

**Answer: yes on all three.** The full provider serves discovery, JWKS,
`/auth` and `/token` on Node 22, Deno 2.9 and workerd. No reduced mode needed.

Code: `spikes/oidc-provider-runtimes/`. Versions: `oidc-provider@9.11.5`,
`koa@3.2.1`, `jose@6.2.10`, Node v22.12.0, Deno 2.9.5, wrangler 4.125.0.

## Results

| Target | How | Discovery | JWKS | `/auth` bad client | `/token` no creds | Notes |
|---|---|---|---|---|---|---|
| Node 22 | `provider.listen()` | 200, 22 keys | 200, 1 key | — | — | baseline |
| Deno 2.9 | `npm:oidc-provider`, `provider.listen()` on `node:http` | 200, 22 keys | 200, 1 key | — | — | needed `--minimum-dependency-age 0` only because 9.11.5 was < 24 h old |
| Workers (workerd), plain `fetch` handler | `new Provider()` + `provider.callback` | n/a | n/a | n/a | n/a | constructs fine; `callback` is a Node `(req,res)` handler so cannot serve directly |
| **Workers + `cloudflare:node` `httpServerHandler`** | `provider.listen(port)` inside the Worker, runtime bridges fetch → `node:http` | **200, 22 keys** | **200, 1 key** | **400** (proper OIDC error) | **400** | logs `oidc-provider WARNING: Unsupported runtime` but behaves correctly |

Bundle size for Workers: 1.3 MB raw / 224 KB gzip — well under the 10 MB
paid / 3 MB free limits.

## Implications for the architecture

1. **One codebase, three deploy targets, full OIDC provider on each.**
   ARCHITECTURE.md §7.1 fallback ("token-issuer-only mode for edge") is
   dropped.
2. **Workers target uses `httpServerHandler`**, not a fetch adapter. This
   means the Hono app should also be mounted behind the same `node:http`
   server on Workers (or Hono handles `fetch` and forwards `/oidc/*` to the
   Koa server on a local port — decide during v0.3). Requires
   `nodejs_compat` and a compatibility date that enables Node http server
   modules (2026-08-01 worked).
3. **State is the real edge constraint, not the library.** The spike used the
   in-memory adapter. Every target needs a persistent `oidc-provider`
   adapter: Postgres (Docker/Node/Deno) and, for Workers, either Postgres
   over Hyperdrive or a KV/D1 adapter. `oidc-provider`'s adapter interface
   is small (`upsert/find/findByUid/findByUserCode/consume/destroy/revokeByGrantId`);
   this is a v0.1 item for Postgres and a v0.3 item for KV/D1.
4. **"Unsupported runtime" warning on workerd** — cosmetic today, but
   upstream doesn't promise compatibility. Mitigation: pin the version,
   keep this spike as a CI job (`spikes/` → `scripts/runtime-matrix`) so a
   regression shows up on upgrade, and consider contributing a workerd
   note upstream once renkei is public.

## Residual risk

- **Supabase's edge runtime is not plain Deno.** It's `supabase/edge-runtime`
  (Deno core + custom host). `npm:` and `node:http` support there is
  narrower than Deno CLI. **Not verified in this spike** — needs
  `supabase functions serve` with Docker running. Added to ROADMAP week 0.
  If it fails there, the Supabase story becomes "Docker/Node next to
  Supabase" rather than "inside an Edge Function", which is still fine for
  the wedge tutorial.
- Deno's default *minimum dependency age* policy (24 h) will bite users on
  the day of any renkei release. Document it in the Deno quickstart.

## Reproduce

```sh
cd spikes/oidc-provider-runtimes
pnpm install
node node.mjs
deno run -A --node-modules-dir=auto deno.ts          # add --minimum-dependency-age 0 if the package is < 24h old
wrangler dev --config wrangler-http.toml --port 48789 --local
curl -s localhost:48789/.well-known/openid-configuration | head -c 300
```
