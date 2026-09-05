/**
 * A renkei for screenshots and the README GIF: the real server, the real
 * `/dev` page, the real login flow — against a **fake LINE** and a synthetic
 * user, so nothing recorded from it is anyone's account.
 *
 *   pnpm demo:server            → http://localhost:4321/dev
 *
 * The original `docs/images/dev-flow.gif` was recorded against the live demo
 * with a real login, which put a real LINE user ID, `sub` and profile-picture
 * URL into a file in a public repo. Recording from here instead means the next
 * person regenerating it cannot make that mistake.
 *
 * It is a dev tool, not a product surface: it is not in any package, not
 * published, and it patches `LINE_ENDPOINTS` in memory to keep the browser
 * away from `access.line.me`.
 */
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { SignJWT } from 'jose';
import { createMemoryStorage, LINE_ENDPOINTS } from 'renkei-core';
import { devClientsFor } from '../src/dev-rp.js';
import { createRenkei } from '../src/index.js';

const PORT = Number(process.env.PORT ?? 4321);
const ISSUER = `http://localhost:${PORT}`;

/** Obvious placeholders. A LINE user ID is `U` + 32 hex; keep the shape, lose the person. */
const DEMO_USER = {
  userId: 'U1234567890abcdef1234567890abcdef',
  name: 'デモユーザー / Demo User',
  picture: 'https://profile.line-scdn.net/demo-placeholder',
  friend: true,
};

const CHANNEL = {
  channelId: '2011257262',
  channelSecret: 'demo-channel-secret-0123456789',
  region: 'jp',
};

// The browser must never be sent to the real LINE. Everything else the server
// calls goes through the injected `fetch` below, which never reaches the network.
LINE_ENDPOINTS.authorize = `${ISSUER}/fake-line/authorize`;

/** The nonce renkei asked for, echoed back in the fake id_token so verification passes. */
let nonce = '';

const lineFetch = (async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url === LINE_ENDPOINTS.token) {
    const now = Math.floor(Date.now() / 1000);
    const idToken = await new SignJWT({ name: DEMO_USER.name, picture: DEMO_USER.picture, nonce })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(LINE_ENDPOINTS.issuer)
      .setAudience(CHANNEL.channelId)
      .setSubject(DEMO_USER.userId)
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(new TextEncoder().encode(CHANNEL.channelSecret));
    return json({
      access_token: 'demo-access-token',
      token_type: 'Bearer',
      expires_in: 2592000,
      scope: 'openid profile',
      id_token: idToken,
    });
  }
  if (url === LINE_ENDPOINTS.profile) {
    return json({
      userId: DEMO_USER.userId,
      displayName: DEMO_USER.name,
      pictureUrl: DEMO_USER.picture,
    });
  }
  if (url.startsWith(LINE_ENDPOINTS.friendship)) return json({ friendFlag: DEMO_USER.friend });
  throw new Error(`demo-server: unexpected LINE call ${url}`);
}) as typeof fetch;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const renkei = await createRenkei({
  storage: createMemoryStorage(),
  fetch: lineFetch,
  config: {
    issuer: ISSUER,
    dev: true,
    channels: [CHANNEL],
    // `dev: true` only mounts the page; its OIDC clients still have to be registered.
    clients: devClientsFor(ISSUER),
    cookieKeys: ['demo-cookie-key-0123456789abcdef'],
  },
});

const app = new Hono();

// Stands in for LINE's authorization screen. It approves immediately, which is
// also what the original recording showed: Chrome's LINE SSO auto-approved, so
// no consent screen appeared. Inventing a fake consent UI here would misrepresent
// what LINE's own screen looks like.
app.get('/fake-line/authorize', (c) => {
  const url = new URL(c.req.url);
  nonce = url.searchParams.get('nonce') ?? '';
  const redirectUri = url.searchParams.get('redirect_uri');
  const state = url.searchParams.get('state');
  if (!redirectUri || !state) return c.text('demo-server: missing redirect_uri/state', 400);
  const back = new URL(redirectUri);
  back.searchParams.set('code', 'demo-code');
  back.searchParams.set('state', state);
  return c.redirect(back.toString(), 302);
});

app.route('/', renkei.app);

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`renkei demo (fake LINE, synthetic user) → ${ISSUER}/dev`);
});
