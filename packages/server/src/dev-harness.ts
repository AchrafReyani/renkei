/**
 * Development harness for the LINE Login flow against a real channel.
 *
 * Not the renkei server — a minimal Hono app that exercises renkei-core end
 * to end so the flow can be verified on a phone before the OIDC provider,
 * storage and config layers exist. Reads LINE_LOGIN_* from the repo .env.
 *
 *   pnpm dev:server   →   http://localhost:3000
 */
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import {
  buildAuthorizeUrl,
  exchangeCode,
  generatePkce,
  getFriendshipStatus,
  getProfile,
  LineApiError,
  LineAuthorizationError,
  LineIdTokenError,
  parseCallback,
  randomToken,
  verifyIdToken,
  verifyIdTokenViaLine,
} from 'renkei-core';

const channel = {
  channelId: required('LINE_LOGIN_CHANNEL_ID'),
  channelSecret: required('LINE_LOGIN_CHANNEL_SECRET'),
};
const redirectUri = process.env.LINE_LOGIN_CALLBACK_URL ?? 'http://localhost:3000/line/callback';
const port = Number(new URL(redirectUri).port || 3000);
const COOKIE = 'renkei_dev_login';

const app = new Hono();

app.get('/', (c) =>
  c.html(`<!doctype html><meta charset="utf-8"><title>renkei dev</title>
  <body style="font-family:system-ui;max-width:40rem;margin:3rem auto;line-height:1.6">
  <h1>renkei — LINE Login dev harness</h1>
  <p>Channel <code>${channel.channelId}</code> · callback <code>${redirectUri}</code></p>
  <p><a href="/line/login?bot_prompt=aggressive">LINEでログイン（友だち追加あり / bot_prompt=aggressive）</a></p>
  <p><a href="/line/login?bot_prompt=normal">LINEでログイン（bot_prompt=normal）</a></p>
  <p><a href="/line/login">LINEでログイン（bot_prompt なし）</a></p>
  <p><a href="/line/login?scope=openid+profile+email">LINEでログイン（email scope — fails until permission is granted）</a></p>
  </body>`),
);

app.get('/line/login', async (c) => {
  const state = randomToken();
  const nonce = randomToken();
  const pkce = await generatePkce();
  const botPrompt = c.req.query('bot_prompt');
  const scope = c.req.query('scope')?.split(' ');

  setCookie(c, COOKIE, JSON.stringify({ state, nonce, verifier: pkce.verifier }), {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 600,
  });

  const url = buildAuthorizeUrl({
    channelId: channel.channelId,
    redirectUri,
    state,
    nonce,
    codeChallenge: pkce.challenge,
    ...(scope ? { scope } : {}),
    ...(botPrompt === 'normal' || botPrompt === 'aggressive' ? { botPrompt } : {}),
  });
  console.log('[login] redirecting to', url);
  return c.redirect(url);
});

app.get('/line/callback', async (c) => {
  const raw = getCookie(c, COOKIE);
  deleteCookie(c, COOKIE, { path: '/' });
  if (!raw) return c.text('no login session cookie — start from /', 400);
  const session = JSON.parse(raw) as { state: string; nonce: string; verifier: string };

  try {
    const cb = parseCallback(c.req.url);
    if (cb.state !== session.state) return c.text('state mismatch', 400);

    const tokens = await exchangeCode({
      channel,
      code: cb.code,
      redirectUri,
      codeVerifier: session.verifier,
    });
    if (!tokens.id_token) return c.text('no id_token (was openid scope requested?)', 500);

    const local = await verifyIdToken(tokens.id_token, { channel, nonce: session.nonce });
    // Test oracle: LINE's own verify endpoint must agree with our local verification.
    const remote = await verifyIdTokenViaLine(tokens.id_token, {
      channelId: channel.channelId,
      nonce: session.nonce,
    });
    const [profile, friend] = await Promise.all([
      getProfile(tokens.access_token),
      getFriendshipStatus(tokens.access_token).catch((e: unknown) =>
        e instanceof LineApiError
          ? `error ${e.status}: ${e.description ?? e.code ?? ''}`
          : String(e),
      ),
    ]);

    const result = {
      callback: cb,
      idTokenAlg: JSON.parse(
        Buffer.from(tokens.id_token.split('.')[0] ?? '', 'base64url').toString(),
      ).alg,
      localClaims: local,
      remoteVerifyAgrees: local.sub === remote.sub && local.email === remote.email,
      profile,
      friend,
      tokenScope: tokens.scope,
      expiresIn: tokens.expires_in,
    };
    console.log('[callback]', JSON.stringify(result, null, 2));
    return c.html(
      `<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;max-width:50rem;margin:3rem auto">
      <h1>ログイン成功 / Login OK</h1><pre>${escapeHtml(JSON.stringify(result, null, 2))}</pre><a href="/">← back</a></body>`,
    );
  } catch (e) {
    const info =
      e instanceof LineAuthorizationError
        ? { type: 'authorization', code: e.code, description: e.description }
        : e instanceof LineApiError
          ? {
              type: 'api',
              endpoint: e.endpoint,
              status: e.status,
              code: e.code,
              description: e.description,
            }
          : e instanceof LineIdTokenError
            ? { type: 'id_token', reason: e.reason, message: e.message }
            : { type: 'unknown', message: String(e) };
    console.error('[callback] failed', info);
    return c.html(
      `<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;max-width:50rem;margin:3rem auto">
      <h1>失敗 / Failed</h1><pre>${escapeHtml(JSON.stringify(info, null, 2))}</pre><a href="/">← back</a></body>`,
      400,
    );
  }
});

serve({ fetch: app.fetch, port }, () => {
  console.log(`renkei dev harness → http://localhost:${port}  (callback: ${redirectUri})`);
});

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set — copy .env.example to .env and fill it in`);
  return v;
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch,
  );
}
