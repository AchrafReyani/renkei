/**
 * A path-prefixed issuer (`https://x.supabase.co/functions/v1/renkei`, a proxy's
 * `/auth`): every URL renkei hands out keeps the prefix, requests arrive with
 * it — or with the tail a gateway leaves (`/renkei/…`) — and a whole OIDC login
 * still completes through the fake LINE.
 */
import { createLocalJWKSet, jwtVerify, SignJWT } from 'jose';
import { createMemoryStorage } from 'renkei-core';
import { beforeAll, describe, expect, it } from 'vitest';
import { issuerBasePath, stripBasePath } from '../src/base-path.js';
import { createRenkei, type Renkei } from '../src/index.js';

describe('stripBasePath', () => {
  const base = '/functions/v1/renkei';
  it('removes the full prefix and every trailing piece of it', () => {
    expect(stripBasePath('/functions/v1/renkei/oidc/auth', base)).toBe('/oidc/auth');
    expect(stripBasePath('/v1/renkei/oidc/auth', base)).toBe('/oidc/auth');
    expect(stripBasePath('/renkei/oidc/auth', base)).toBe('/oidc/auth');
    expect(stripBasePath('/renkei', base)).toBe('/');
    expect(stripBasePath('/functions/v1/renkei', base)).toBe('/');
  });
  it('leaves other paths alone (segment boundary respected)', () => {
    expect(stripBasePath('/oidc/auth', base)).toBeUndefined();
    expect(stripBasePath('/renkeix/oidc/auth', base)).toBeUndefined();
    expect(stripBasePath('/healthz', base)).toBeUndefined();
  });
  it('is empty for a root issuer', () => {
    expect(issuerBasePath(new URL('https://auth.example.com'))).toBe('');
    expect(issuerBasePath(new URL('https://auth.example.com/'))).toBe('');
    expect(issuerBasePath(new URL('https://x.supabase.co/functions/v1/renkei/'))).toBe(
      '/functions/v1/renkei',
    );
  });
});

const ORIGIN = 'http://x.supabase.test';
const BASE = '/functions/v1/renkei';
const ISSUER = `${ORIGIN}${BASE}`;
const CHANNEL = { channelId: '2011257262', channelSecret: 'test-channel-secret-0123456789' };
const APP = {
  clientId: 'app',
  clientSecret: 'app-secret-0123456789abcdef',
  redirectUris: ['http://app.test/cb'],
};

let nonce = '';
const lineFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
  if (url === 'https://api.line.me/oauth2/v2.1/token') {
    const body = init?.body as URLSearchParams;
    // The redirect_uri LINE is told must carry the prefix, or LINE would reject the exchange.
    expect(body.get('redirect_uri')).toBe(`${ISSUER}/line/callback`);
    const now = Math.floor(Date.now() / 1000);
    const idToken = await new SignJWT({ name: 'テスト', nonce, amr: ['linesso'] })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('https://access.line.me')
      .setAudience(CHANNEL.channelId)
      .setSubject('Uprefixed')
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(new TextEncoder().encode(CHANNEL.channelSecret));
    return json({ access_token: 'at', token_type: 'Bearer', expires_in: 1, id_token: idToken });
  }
  if (url === 'https://api.line.me/v2/profile')
    return json({ userId: 'Uprefixed', displayName: 'テスト' });
  if (url === 'https://api.line.me/friendship/v1/status') return json({ friendFlag: true });
  throw new Error(`unexpected LINE call: ${url}`);
}) as typeof fetch;

/** Cookie jar + redirect following that stays on the issuer's origin. */
class Browser {
  private readonly jar = new Map<string, { value: string; path: string }>();
  constructor(private readonly renkei: Renkei) {}
  async request(url: string, init: RequestInit = {}) {
    const u = new URL(url);
    const headers = new Headers(init.headers);
    const cookie = [...this.jar.entries()]
      .filter(([, c]) => u.pathname.startsWith(c.path))
      .map(([n, c]) => `${n}=${c.value}`)
      .join('; ');
    if (cookie) headers.set('cookie', cookie);
    const res = await this.renkei.fetch(new Request(u, { ...init, headers, redirect: 'manual' }));
    for (const raw of res.headers.getSetCookie()) {
      const [pair, ...attrs] = raw.split(';').map((s) => s.trim());
      const eq = pair?.indexOf('=') ?? -1;
      if (!pair || eq < 0) continue;
      const path = attrs.find((a) => a.toLowerCase().startsWith('path='))?.slice(5) ?? '/';
      const maxAge = attrs.find((a) => a.toLowerCase().startsWith('max-age='))?.slice(8);
      if (maxAge !== undefined && Number(maxAge) <= 0) this.jar.delete(pair.slice(0, eq));
      else this.jar.set(pair.slice(0, eq), { value: pair.slice(eq + 1), path });
    }
    return res;
  }
  async navigate(url: string, hops: string[] = []) {
    let current = url;
    for (let i = 0; i < 10; i++) {
      const res = await this.request(current);
      const loc = res.headers.get('location');
      if (res.status < 300 || res.status >= 400 || !loc) return { res, hops };
      const next = new URL(loc, current);
      hops.push(next.toString());
      if (next.origin !== ORIGIN) return { res, hops, location: next };
      current = next.toString();
    }
    throw new Error('too many redirects');
  }
}

describe('renkei under a path-prefixed issuer', () => {
  let renkei: Renkei;
  beforeAll(async () => {
    renkei = await createRenkei({
      storage: createMemoryStorage(),
      fetch: lineFetch,
      logger: { info() {}, warn() {}, error() {} },
      config: {
        issuer: ISSUER,
        dev: true,
        channels: [{ ...CHANNEL, region: 'jp' }],
        clients: [
          APP,
          {
            clientId: 'renkei-dev',
            clientSecret: 'renkei-dev-secret',
            redirectUris: [`${ISSUER}/dev/callback`],
          },
        ],
        cookieKeys: ['cookie-key-0123456789abcdef'],
        sessionCookie: { enabled: true },
      },
    });
  });

  it('serves discovery with prefixed endpoints, at the prefixed, gateway-stripped and bare paths', async () => {
    for (const path of [`${BASE}`, '/renkei', '']) {
      const res = await renkei.fetch(
        new Request(`${ORIGIN}${path}/.well-known/openid-configuration`),
      );
      expect(res.status, path).toBe(200);
      const d = (await res.json()) as Record<string, string>;
      expect(d.issuer).toBe(ISSUER);
      expect(d.authorization_endpoint).toBe(`${ISSUER}/oidc/auth`);
      expect(d.token_endpoint).toBe(`${ISSUER}/oidc/token`);
      expect(d.jwks_uri).toBe(`${ISSUER}/oidc/jwks`);
      expect(d.userinfo_endpoint).toBe(`${ISSUER}/oidc/me`);
    }
  });

  it('ignores the gateway Host / X-Forwarded-Host headers: the issuer decides the public URL', async () => {
    // Supabase's Kong forwards X-Forwarded-Host without the port; Koa would build URLs from it.
    const res = await renkei.fetch(
      new Request('http://edge-runtime.internal/renkei/.well-known/openid-configuration', {
        headers: {
          host: '127.0.0.1',
          'x-forwarded-host': '127.0.0.1',
          'x-forwarded-proto': 'https',
        },
      }),
    );
    expect(res.status).toBe(200);
    const d = (await res.json()) as Record<string, string>;
    expect(d.authorization_endpoint).toBe(`${ISSUER}/oidc/auth`);
    expect(d.token_endpoint).toBe(`${ISSUER}/oidc/token`);
  });

  it('links and fetches inside /dev keep the prefix', async () => {
    const html = await (await renkei.fetch(new Request(`${ISSUER}/dev`))).text();
    expect(html).toContain(`href="${BASE}/dev/login"`);
    expect(html).toContain(`href="${BASE}/.well-known/openid-configuration"`);
    expect(html).toContain(`href="${BASE}/oidc/jwks"`);
    expect(html).not.toMatch(/href="\/dev/);
    const login = await renkei.fetch(new Request(`${ISSUER}/dev/login`, { redirect: 'manual' }));
    expect(login.status).toBe(302);
    const to = new URL(login.headers.get('location') ?? '');
    expect(to.pathname).toBe(`${BASE}/oidc/auth`);
    expect(to.searchParams.get('redirect_uri')).toBe(`${ISSUER}/dev/callback`);
    expect(login.headers.get('set-cookie')).toContain(`Path=${BASE}/dev`);
  });

  it('completes an OIDC login: interaction, LINE callback and finish all carry the prefix', async () => {
    const b = new Browser(renkei);
    const auth = new URL(`${ISSUER}/oidc/auth`);
    auth.searchParams.set('client_id', APP.clientId);
    auth.searchParams.set('response_type', 'code');
    auth.searchParams.set('redirect_uri', APP.redirectUris[0] as string);
    auth.searchParams.set('scope', 'openid profile line');
    auth.searchParams.set('state', 's');
    auth.searchParams.set('nonce', 'n');

    const toLine = await b.navigate(auth.toString());
    expect(toLine.hops[0]).toMatch(new RegExp(`^${ORIGIN}${BASE}/interaction/[^/]+$`));
    expect(toLine.location?.origin).toBe('https://access.line.me');
    const lineUrl = toLine.location as URL;
    expect(lineUrl.searchParams.get('redirect_uri')).toBe(`${ISSUER}/line/callback`);
    nonce = lineUrl.searchParams.get('nonce') ?? '';
    const state = lineUrl.searchParams.get('state') ?? '';

    // LINE redirects to the prefixed callback (what it was told). The finish hop must be prefixed too.
    const back = await b.navigate(`${ISSUER}/line/callback?code=good-code&state=${state}`);
    expect(back.hops[0]).toMatch(new RegExp(`^${ORIGIN}${BASE}/interaction/[^/]+/finish\\?t=`));
    expect(back.location?.origin).toBe('http://app.test');
    const code = back.location?.searchParams.get('code');
    expect(code).toBeTruthy();

    const token = await renkei.fetch(
      new Request(`${ISSUER}/oidc/token`, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          authorization: `Basic ${btoa(`${APP.clientId}:${APP.clientSecret}`)}`,
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: code as string,
          redirect_uri: APP.redirectUris[0] as string,
        }),
      }),
    );
    expect(token.status).toBe(200);
    const tokens = (await token.json()) as { id_token: string; access_token: string };
    const jwks = createLocalJWKSet(
      await (await renkei.fetch(new Request(`${ISSUER}/oidc/jwks`))).json(),
    );
    const { payload } = await jwtVerify(tokens.id_token, jwks, {
      issuer: ISSUER,
      audience: APP.clientId,
    });
    expect(payload['line:user_id']).toBe('Uprefixed');
    expect(payload['line:friend']).toBe(true);

    const me = await renkei.fetch(
      new Request(`${ISSUER}/oidc/me`, {
        headers: { authorization: `Bearer ${tokens.access_token}` },
      }),
    );
    expect(me.status).toBe(200);
  });

  it('session-cookie mode: /login sends LINE the prefixed callback', async () => {
    const res = await renkei.fetch(new Request(`${ISSUER}/login`, { redirect: 'manual' }));
    expect(res.status).toBe(302);
    const to = new URL(res.headers.get('location') ?? '');
    expect(to.searchParams.get('redirect_uri')).toBe(`${ISSUER}/line/callback`);
  });

  it('POST bodies survive the rewrite', async () => {
    const res = await renkei.fetch(
      new Request(`${ORIGIN}/renkei/oidc/token`, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          authorization: `Basic ${btoa(`${APP.clientId}:${APP.clientSecret}`)}`,
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: 'nope',
          redirect_uri: APP.redirectUris[0] as string,
        }),
      }),
    );
    // invalid_grant means the token endpoint parsed grant_type and code from the body;
    // a lost body would be invalid_request (missing grant_type).
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('invalid_grant');
  });
});
