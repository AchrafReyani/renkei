// Target 3: Cloudflare Workers (workerd) with nodejs_compat. Expected to fail at
// bundle or construct time because oidc-provider depends on Koa / node:http.
// We only try to import + construct; there is no Node http server here anyway.
export default {
  async fetch() {
    try {
      const { default: Provider } = await import('oidc-provider');
      const { config } = await import('./provider-config.mjs');
      const provider = new Provider('https://spike.example', config);
      // Koa app exists; try the koa callback route table at least.
      return new Response(JSON.stringify({ target: 'workers', constructed: true, hasCallback: typeof provider.callback }), { headers: { 'content-type': 'application/json' } });
    } catch (e) {
      return new Response(JSON.stringify({ target: 'workers', constructed: false, error: String(e && e.stack || e).slice(0, 800) }), { status: 500, headers: { 'content-type': 'application/json' } });
    }
  },
};
