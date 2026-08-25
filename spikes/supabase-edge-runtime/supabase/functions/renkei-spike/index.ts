// Spike: does the full oidc-provider run inside Supabase edge-runtime?
// Strategy: start Koa's node:http server on a loopback port inside the
// function isolate and proxy Deno.serve requests to it. If node:http listen
// isn't supported here, we at least learn whether construction works.
import Provider from 'npm:oidc-provider@9.11.5';
const PORT = 47000;
const ISSUER = `http://127.0.0.1:${PORT}`;
const config = {
  clients: [{ client_id: 'spike', client_secret: 'spike-secret', redirect_uris: ['http://localhost:3000/cb'] }],
  features: { devInteractions: { enabled: false } },
};
let state: 'init' | 'constructed' | 'listening' | 'failed' = 'init';
let lastError = '';
let provider: any;
function ensureStarted() {
  if (state === 'listening' || state === 'failed') return;
  try {
    provider = new Provider(ISSUER, config);
    state = 'constructed';
    provider.listen(PORT);
    state = 'listening';
  } catch (e) { state = 'failed'; lastError = String((e as any)?.stack || e); }
}
Deno.serve(async (req) => {
  ensureStarted();
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/renkei-spike/, '') || '/';
  if (path === '/status') return Response.json({ target: 'supabase-edge-runtime', state, lastError, deno: (globalThis as any).Deno?.version });
  if (state !== 'listening') return Response.json({ target: 'supabase-edge-runtime', state, lastError }, { status: 500 });
  try {
    const r = await fetch(ISSUER + path + url.search, { method: req.method, headers: req.headers, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer() });
    return new Response(await r.arrayBuffer(), { status: r.status, headers: r.headers });
  } catch (e) { return Response.json({ target: 'supabase-edge-runtime', state, proxyError: String((e as any)?.stack || e) }, { status: 500 }); }
});
