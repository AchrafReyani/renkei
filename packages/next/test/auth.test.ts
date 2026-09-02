/**
 * renkei-next against a real renkei-server instance with a fake LINE Platform.
 * The Next app is simulated with plain Requests: its handlers are called
 * directly, its cookies are carried in a jar, and the hop through renkei is
 * driven over renkei's own fetch handler. No network, no Next runtime.
 */
import { SignJWT } from 'jose';
import { createMemoryStorage } from 'renkei-core';
import { createRenkei, type Renkei } from 'renkei-server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRenkeiAuth, type RenkeiAuth } from '../src/index.js';

const ISSUER = 'http://renkei.test';
const APP = 'http://app.test';
const CHANNEL = {
  channelId: '2011257262',
  channelSecret: 'test-channel-secret-0123456789',
  region: 'jp',
};
const USER = {
  userId: 'U54de992ad068a07f1d4ef661a0a946bd',
  name: 'テスト太郎',
  picture: 'https://p/1',
};
const SECRET = 'renkei-next-test-secret-0123456789abcdef';

// ── Fake LINE ────────────────────────────────────────────────────────────────
const line = { nonce: '' };
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
const lineFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url === 'https://api.line.me/oauth2/v2.1/token') {
    if (((init as RequestInit).body as URLSearchParams).get('code') !== 'good-code')
      return json({ error: 'invalid_grant' }, 400);
    const now = Math.floor(Date.now() / 1000);
    const idToken = await new SignJWT({ name: USER.name, picture: USER.picture, nonce: line.nonce })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('https://access.line.me')
      .setAudience(CHANNEL.channelId)
      .setSubject(USER.userId)
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(new TextEncoder().encode(CHANNEL.channelSecret));
    return json({ access_token: 'line-at', token_type: 'Bearer', id_token: idToken });
  }
  if (url === 'https://api.line.me/v2/profile')
    return json({ userId: USER.userId, displayName: USER.name, pictureUrl: USER.picture });
  if (url === 'https://api.line.me/friendship/v1/status') return json({ friendFlag: true });
  throw new Error(`unexpected LINE call: ${url}`);
}) as typeof fetch;

// ── Cookie jar shared by "the browser" for both origins ──────────────────────
class Jar {
  private readonly cookies = new Map<string, string>();
  header(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  store(res: Response) {
    for (const raw of res.headers.getSetCookie()) {
      const [pair = '', ...attrs] = raw.split(';').map((s) => s.trim());
      const eq = pair.indexOf('=');
      if (eq < 0) continue;
      const maxAge = attrs.find((a) => a.toLowerCase().startsWith('max-age='))?.slice(8);
      if (maxAge !== undefined && Number(maxAge) <= 0) this.cookies.delete(pair.slice(0, eq));
      else this.cookies.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
  }
  has(name: string) {
    return this.cookies.has(name);
  }
}

let renkei: Renkei;
let auth: RenkeiAuth;

/** renkei's handler as a fetch (used by renkei-next for /oidc/token and /oidc/jwks). */
const renkeiFetch: typeof fetch = (input, init) => renkei.fetch(new Request(input, init));

beforeAll(async () => {
  renkei = await createRenkei({
    storage: createMemoryStorage(),
    fetch: lineFetch,
    logger: { info() {}, warn() {}, error() {} },
    config: {
      issuer: ISSUER,
      channels: [CHANNEL],
      clients: [
        {
          clientId: 'next-app',
          clientSecret: 'next-app-secret-0123456789abcdef',
          redirectUris: [`${APP}/api/renkei/callback`],
        },
      ],
      cookieKeys: ['cookie-key-0123456789abcdef'],
    },
  });
  auth = createRenkeiAuth({
    issuer: `${ISSUER}/`,
    clientId: 'next-app',
    clientSecret: 'next-app-secret-0123456789abcdef',
    secret: SECRET,
    fetch: renkeiFetch,
    botPrompt: 'normal',
  });
});

/** Call a renkei-next handler as the browser would, with the jar's cookies. */
async function app(jar: Jar, path: string, init: RequestInit = {}): Promise<Response> {
  const req = new Request(new URL(path, APP), init);
  if (jar.header()) req.headers.set('cookie', jar.header());
  const res = await auth.handle(req);
  jar.store(res);
  return res;
}

/** Follow redirects inside renkei until it hands off to LINE; then come back through renkei. */
async function throughRenkei(jar: Jar, start: string): Promise<URL> {
  let current = start;
  for (let i = 0; i < 10; i++) {
    const req = new Request(current, { redirect: 'manual' });
    if (jar.header()) req.headers.set('cookie', jar.header());
    const res = await renkei.fetch(req);
    jar.store(res);
    const loc = res.headers.get('location');
    if (!loc) throw new Error(`renkei stopped at ${res.status} ${current}: ${await res.text()}`);
    const next = new URL(loc, current);
    if (next.origin === 'https://access.line.me') {
      line.nonce = next.searchParams.get('nonce') ?? '';
      expect(next.searchParams.get('bot_prompt')).toBe('normal');
      current = `${ISSUER}/line/callback?code=good-code&state=${next.searchParams.get('state')}`;
      continue;
    }
    if (next.origin === APP) return next;
    current = next.toString();
  }
  throw new Error('too many redirects');
}

async function loginThrough(jar: Jar, returnTo?: string) {
  const res = await app(jar, auth.loginPath(returnTo));
  expect(res.status).toBe(303);
  expect(jar.has('renkei_next_session_flow')).toBe(true);
  const toRenkei = new URL(res.headers.get('location') as string);
  expect(toRenkei.origin + toRenkei.pathname).toBe(`${ISSUER}/oidc/auth`);
  expect(toRenkei.searchParams.get('redirect_uri')).toBe(`${APP}/api/renkei/callback`);
  expect(toRenkei.searchParams.get('code_challenge_method')).toBe('S256');
  const back = await throughRenkei(jar, toRenkei.toString());
  expect(back.pathname).toBe('/api/renkei/callback');
  return app(jar, back.pathname + back.search);
}

describe('paths and options', () => {
  it('derives the handler paths and link helpers from basePath', () => {
    expect(auth.basePath).toBe('/api/renkei');
    expect(auth.paths).toEqual({
      login: '/api/renkei/login',
      callback: '/api/renkei/callback',
      logout: '/api/renkei/logout',
      session: '/api/renkei/session',
    });
    expect(auth.loginPath()).toBe('/api/renkei/login');
    expect(auth.loginPath('/account?tab=1', { botPrompt: 'none' })).toBe(
      '/api/renkei/login?return_to=%2Faccount%3Ftab%3D1&bot_prompt=none',
    );
    expect(auth.logoutPath('/bye')).toBe('/api/renkei/logout?return_to=%2Fbye');
    const custom = createRenkeiAuth({
      issuer: ISSUER,
      clientId: 'x',
      secret: SECRET,
      basePath: 'auth/line/',
    });
    expect(custom.paths.callback).toBe('/auth/line/callback');
  });

  it('refuses a short secret', () => {
    const short = createRenkeiAuth({ issuer: ISSUER, clientId: 'x', secret: 'short' });
    return expect(short.getSessionFromRequest(new Request(APP))).rejects.toThrow(/32 characters/);
  });

  it('404s for unknown paths and wrong methods', async () => {
    const jar = new Jar();
    expect((await app(jar, '/api/renkei/nope')).status).toBe(404);
    expect((await app(jar, '/api/renkei/login', { method: 'POST' })).status).toBe(404);
  });
});

describe('login → callback → session → logout', () => {
  it('logs in through renkei and LINE, sets an encrypted session cookie, lands on return_to', async () => {
    const jar = new Jar();
    const done = await loginThrough(jar, '/account?welcome=1');
    expect(done.status).toBe(303);
    expect(done.headers.get('location')).toBe(`${APP}/account?welcome=1`);
    expect(jar.has('renkei_next_session')).toBe(true);
    expect(jar.has('renkei_next_session_flow')).toBe(false);
    const setCookie = done.headers.getSetCookie().find((c) => c.startsWith('renkei_next_session='));
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/SameSite=Lax/);
    expect(setCookie).not.toMatch(/Secure/); // http://app.test

    const claims = await auth.getSessionFromRequest(
      new Request(APP, { headers: { cookie: jar.header() } }),
    );
    expect(claims?.sub).toBeTruthy();
    expect(claims?.name).toBe(USER.name);
    expect(claims?.['line:user_id']).toBe(USER.userId);
    expect(claims?.['line:friend']).toBe(true);
    expect(claims?.['line:channel_id']).toBe(CHANNEL.channelId);
    expect(claims?.['line:linked']).toBe(false);
    // id_token bookkeeping is not carried into the session
    expect(claims).not.toHaveProperty('nonce');
    expect(claims).not.toHaveProperty('aud');
    expect(claims).not.toHaveProperty('exp');

    const sessionRes = await app(jar, '/api/renkei/session');
    expect(sessionRes.status).toBe(200);
    expect(((await sessionRes.json()) as { sub: string }).sub).toBe(claims?.sub);

    const out = await app(jar, '/api/renkei/logout?return_to=/bye', { method: 'POST' });
    expect(out.status).toBe(303);
    expect(out.headers.get('location')).toBe(`${APP}/bye`);
    expect(jar.has('renkei_next_session')).toBe(false);
    expect((await app(jar, '/api/renkei/session')).status).toBe(401);
  });

  it('falls back to defaultReturnTo for absolute and protocol-relative return_to values', async () => {
    for (const bad of ['https://evil.test/', '//evil.test/x', 'javascript:alert(1)']) {
      const jar = new Jar();
      const done = await loginThrough(jar, bad);
      expect(done.headers.get('location')).toBe(`${APP}/`);
    }
  });

  it('rejects a callback with a missing flow cookie, a bad state, or LINE denial', async () => {
    const jar = new Jar();
    expect((await app(jar, '/api/renkei/callback?code=x&state=y')).status).toBe(400);

    await app(jar, auth.loginPath());
    const badState = await app(jar, '/api/renkei/callback?code=x&state=wrong');
    expect(badState.status).toBe(400);
    expect(await badState.text()).toMatch(/state mismatch/);

    const jar2 = new Jar();
    await app(jar2, auth.loginPath());
    const denied = await app(
      jar2,
      '/api/renkei/callback?error=access_denied&error_description=nope',
    );
    expect(denied.status).toBe(401);
    expect(await denied.text()).toBe('access_denied: nope');
    expect(jar2.has('renkei_next_session')).toBe(false);
  });

  it('errorRedirect sends failures to a page with error params', async () => {
    const withRedirect = createRenkeiAuth({
      issuer: ISSUER,
      clientId: 'next-app',
      secret: SECRET,
      fetch: renkeiFetch,
      errorRedirect: '/login-failed',
    });
    const res = await withRedirect.handle(new Request(`${APP}/api/renkei/callback?code=x&state=y`));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(
      `${APP}/login-failed?error=invalid_request&error_description=login+flow+expired+or+missing`,
    );
  });

  it('ignores tampered or foreign session cookies', async () => {
    const jar = new Jar();
    await loginThrough(jar);
    const good = jar.header().match(/renkei_next_session=([^;]+)/)?.[1] as string;
    const tampered = `${good.slice(0, -4)}AAAA`;
    expect(
      await auth.getSessionFromRequest(
        new Request(APP, { headers: { cookie: `renkei_next_session=${tampered}` } }),
      ),
    ).toBeNull();
    const other = createRenkeiAuth({
      issuer: ISSUER,
      clientId: 'next-app',
      secret: `${SECRET}-other`,
    });
    expect(
      await other.getSessionFromRequest(
        new Request(APP, { headers: { cookie: `renkei_next_session=${good}` } }),
      ),
    ).toBeNull();
  });
});

describe('proxy / middleware', () => {
  it('redirects anonymous requests on protected paths to the login with return_to', async () => {
    const guard = auth.proxy({ protect: ['/account'] });
    const res = await guard(new Request(`${APP}/account/orders?x=1`));
    expect(res?.status).toBe(307);
    expect(res?.headers.get('location')).toBe(
      `${APP}/api/renkei/login?return_to=%2Faccount%2Forders%3Fx%3D1`,
    );
    expect(await guard(new Request(`${APP}/`))).toBeUndefined();
    expect(await guard(new Request(`${APP}/api/renkei/login`))).toBeUndefined();
  });

  it('lets a logged-in user through, and protects everything but assets by default', async () => {
    const jar = new Jar();
    await loginThrough(jar);
    const guard = auth.middleware();
    const authed = new Request(`${APP}/anything`, { headers: { cookie: jar.header() } });
    expect(await guard(authed)).toBeUndefined();
    expect((await guard(new Request(`${APP}/anything`)))?.status).toBe(307);
    expect(await guard(new Request(`${APP}/_next/static/chunk.js`))).toBeUndefined();
    expect(await guard(new Request(`${APP}/favicon.ico`))).toBeUndefined();
    const predicate = auth.proxy({ protect: (url) => url.searchParams.has('secret') });
    expect((await predicate(new Request(`${APP}/p?secret`)))?.status).toBe(307);
    expect(await predicate(new Request(`${APP}/p`))).toBeUndefined();
  });
});

describe('getSession() via next/headers', () => {
  it('reads the cookie from the Next request scope', async () => {
    const jar = new Jar();
    await loginThrough(jar);
    const value = jar.header().match(/renkei_next_session=([^;]+)/)?.[1] as string;
    vi.doMock('next/headers', () => ({
      cookies: async () => ({
        get: (n: string) => (n === 'renkei_next_session' ? { value } : undefined),
      }),
    }));
    const claims = await auth.getSession();
    expect(claims?.['line:user_id']).toBe(USER.userId);
    vi.doUnmock('next/headers');
  });
});
