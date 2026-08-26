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

## Supabase edge-runtime (verified 2026-08-26, later the same day)

`supabase/edge-runtime` 1.74.3 (compatible with Deno 2.1.4), run locally via
`supabase start -x <everything except db, kong, edge-runtime>` +
`supabase functions serve --no-verify-jwt`. Code:
`spikes/supabase-edge-runtime/supabase/functions/`.

| Approach | Result |
|---|---|
| `renkei-spike`: `npm:oidc-provider` import + `new Provider()` + `provider.listen(port)` + loopback `fetch` | Import and construction **work**; `listen()` reports success but the port is **inert** — loopback connect refused. `node:http` servers are not real sockets in edge-runtime. |
| `renkei-shim`: `Deno.serve` → hand-built `IncomingMessage`/`ServerResponse` shim (~60 lines on `node:stream` + `node:events`) → `provider.callback()(req, res)` | **Works.** Discovery 200 (22 endpoints, correct issuer), JWKS 200 (1 key), `/auth` bad client → 400 with oidc-provider's error page, `/token` no creds → 400 `invalid_request` JSON. |

Gotchas found:
- Kong requires the local **anon key** as a Bearer token even with
  `--no-verify-jwt`; with auth excluded, `supabase status` doesn't print it —
  mint it from `jwt_secret` (HS256, `role: anon`, `iss: supabase-demo`).
- Koa checks `res.socket.writable` before writing a body; the fake socket
  must set `writable: true` or every response is empty with the right status.
- oidc-provider derives *some* URLs (`jwks_uri`) from the request `Host`
  header, so through Kong they came out as
  `http://supabase_edge_runtime_…:8081/jwks`. The shim must set `host` from
  the configured issuer, or the provider must run with `proxy: true` and
  trusted `X-Forwarded-*` headers. Trivial, but easy to miss.
- Prints the same `oidc-provider WARNING: Unsupported runtime` as workerd.

**Implication:** the shim is the portable deploy path for *every* non-Node
runtime (edge-runtime, Deno Deploy, Workers without `httpServerHandler`).
It belongs in `renkei-server` as `adapters/fetch-to-node.ts` with its own
tests, and the Workers target can choose between it and `httpServerHandler`.
"Deploy renkei as a Supabase Edge Function" is therefore real — v0.3 as
planned; the v0.1 Supabase tutorial can still use Docker next to Supabase.

## Residual risk

- edge-runtime's `npm:` compatibility is a moving target (1.74.3 today,
  Deno 2.1-compatible while Deno CLI is at 2.9). Pin and matrix-test.
- Persistent adapter for oidc-provider state inside an Edge Function must
  be Postgres (the Supabase DB itself) — no in-memory across invocations.
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
