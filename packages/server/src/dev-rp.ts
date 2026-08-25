import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { createRemoteJWKSet, decodeJwt, jwtVerify } from 'jose';
import type Provider from 'oidc-provider';
import type { RenkeiConfig } from './config.js';
import { OIDC_ROUTES } from './oidc/provider.js';

/**
 * A tiny relying party mounted at /dev when `config.dev` is on. It logs in
 * *through renkei's own OIDC endpoints*, so what it shows is exactly what a
 * downstream Supabase/Keycloak/app would receive. Manual testing only.
 */
export function devRoutes({
  config,
  provider: _provider,
  liffId,
}: {
  config: RenkeiConfig;
  provider: Provider;
  /** LIFF app ID for the /dev/liff page (LIFF_ID env). */
  liffId?: string | undefined;
}) {
  const dev = new Hono();
  const liffClient = config.clients.find((c) => c.tokenEndpointAuthMethod === 'none');
  const client = config.clients.find((c) => c.clientId === 'renkei-dev') ?? config.clients[0];
  if (!client) return dev;
  const redirectUri = `${config.issuer}/dev/callback`;
  const COOKIE = 'renkei_dev_rp';

  dev.get('/', (c) =>
    c.html(`<!doctype html><meta charset="utf-8"><title>renkei dev RP</title>
<body style="font-family:system-ui;max-width:40rem;margin:3rem auto;line-height:1.7">
<h1>renkei — dev relying party</h1>
<p>This page is an OIDC client of renkei (<code>${client.clientId}</code>). Clicking below goes through
<code>${OIDC_ROUTES.authorization}</code> → LINE → back here with an id_token minted by renkei.</p>
<ul>
<li><a href="/dev/login">ログイン（channel default bot_prompt）</a></li>
<li><a href="/dev/login?bot_prompt=normal">ログイン（bot_prompt=normal）</a></li>
<li><a href="/dev/login?bot_prompt=none">ログイン（bot_prompt なし）</a></li>
<li><a href="/dev/login?scope=openid+profile+email+line">ログイン（email scope も要求）</a></li>
</ul>
<p>LIFF: ${liffId && liffClient ? `<a href="/dev/liff">/dev/liff</a> (open via <code>https://liff.line.me/${liffId}</code> on a phone, or here in a browser)` : 'set LIFF_ID and add a public client to enable /dev/liff'}</p>
<p><a href="/.well-known/openid-configuration">discovery</a> · <a href="${OIDC_ROUTES.jwks}">jwks</a></p>`),
  );

  if (liffId && liffClient) {
    dev.get('/liff', (c) =>
      c.html(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>renkei LIFF dev</title>
<body style="font-family:system-ui;max-width:40rem;margin:2rem auto;line-height:1.6;padding:0 1rem">
<h1>renkei — LIFF exchange</h1>
<p id="status">LIFF SDK 初期化中… / initialising LIFF…</p>
<pre id="out" style="white-space:pre-wrap;word-break:break-all"></pre>
<script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
<script>
const $ = (id) => document.getElementById(id);
const show = (o) => { $('out').textContent = JSON.stringify(o, null, 2); };
(async () => {
  try {
    await liff.init({ liffId: ${JSON.stringify(liffId)} });
    if (!liff.isLoggedIn()) { $('status').textContent = 'LINE ログインへ… / redirecting to LINE login…'; liff.login({ redirectUri: location.href }); return; }
    const id_token = liff.getIDToken();
    const access_token = liff.getAccessToken();
    $('status').textContent = 'renkei に交換中… / exchanging with renkei…';
    const res = await fetch('/liff/exchange', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id_token, access_token, client_id: ${JSON.stringify(liffClient.clientId)} }),
    });
    const body = await res.json();
    if (!res.ok) { $('status').textContent = '失敗 / failed (' + res.status + ')'; show(body); return; }
    const payload = JSON.parse(atob(body.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    $('status').textContent = '成功 / OK — renkei id_token payload (in LINE app: ' + liff.isInClient() + ', os: ' + liff.getOS() + ')';
    show({ liff: { inClient: liff.isInClient(), hadIdToken: !!id_token, hadAccessToken: !!access_token }, response: { expires_in: body.expires_in, sub: body.sub }, payload });
  } catch (e) { $('status').textContent = 'エラー / error'; show({ error: String(e && e.message || e) }); }
})();
</script>`),
    );
  }

  dev.get('/login', async (c) => {
    const state = crypto.randomUUID();
    const nonce = crypto.randomUUID();
    setCookie(c, COOKIE, JSON.stringify({ state, nonce }), {
      httpOnly: true,
      sameSite: 'Lax',
      path: '/dev',
      maxAge: 600,
    });
    const url = new URL(OIDC_ROUTES.authorization, config.issuer);
    url.searchParams.set('client_id', client.clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', c.req.query('scope') ?? 'openid profile line');
    url.searchParams.set('state', state);
    url.searchParams.set('nonce', nonce);
    const bp = c.req.query('bot_prompt');
    if (bp) url.searchParams.set('bot_prompt', bp);
    return c.redirect(url.toString());
  });

  dev.get('/callback', async (c) => {
    const raw = getCookie(c, COOKIE);
    deleteCookie(c, COOKIE, { path: '/dev' });
    if (!raw) return c.text('no dev session', 400);
    const session = JSON.parse(raw) as { state: string; nonce: string };
    const error = c.req.query('error');
    if (error)
      return c.html(
        page('失敗 / Failed', { error, error_description: c.req.query('error_description') }),
        400,
      );
    if (c.req.query('state') !== session.state) return c.text('state mismatch', 400);
    const code = c.req.query('code');
    if (!code) return c.text('no code', 400);

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    });
    const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded' };
    if (client.clientSecret) {
      headers.authorization = `Basic ${btoa(`${client.clientId}:${client.clientSecret}`)}`;
    } else {
      body.set('client_id', client.clientId);
    }
    const tokenRes = await fetch(new URL(OIDC_ROUTES.token, config.issuer), {
      method: 'POST',
      headers,
      body,
    });
    const tokens = (await tokenRes.json()) as Record<string, unknown>;
    if (!tokenRes.ok) return c.html(page('トークン取得失敗 / Token error', tokens), 400);

    const idToken = String(tokens.id_token);
    const jwks = createRemoteJWKSet(new URL(OIDC_ROUTES.jwks, config.issuer));
    const { payload } = await jwtVerify(idToken, jwks, {
      issuer: config.issuer,
      audience: client.clientId,
    });
    if (payload.nonce !== session.nonce) return c.text('nonce mismatch', 400);

    const userinfoRes = await fetch(new URL(OIDC_ROUTES.userinfo, config.issuer), {
      headers: { authorization: `Bearer ${String(tokens.access_token)}` },
    });
    const userinfo = await userinfoRes.json();

    return c.html(
      page('ログイン成功 / Login OK', {
        id_token_header: decodeJwt(idToken) && JSON.parse(atob(idToken.split('.')[0] ?? '')),
        id_token_claims: payload,
        userinfo,
        scope: tokens.scope,
        expires_in: tokens.expires_in,
        has_refresh_token: Boolean(tokens.refresh_token),
      }),
    );
  });

  return dev;
}

function page(title: string, data: unknown) {
  const json = JSON.stringify(data, null, 2).replace(
    /[&<>]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] ?? c,
  );
  return `<!doctype html><meta charset="utf-8"><title>${title}</title>
<body style="font-family:system-ui;max-width:50rem;margin:3rem auto"><h1>${title}</h1><pre>${json}</pre><a href="/dev">← back</a></body>`;
}
