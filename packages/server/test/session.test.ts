/**
 * First-party session-cookie mode: /login runs LINE login and sets a signed
 * cookie, /session returns claims, /logout clears it. Open-redirect guard on
 * return_to. No network, no real LINE.
 */
import { SignJWT } from 'jose';
import { createMemoryStorage, type Storage } from 'renkei-core';
import { beforeEach, describe, expect, it } from 'vitest';
import type { RenkeiConfigInput } from '../src/config.js';
import { createRenkei, type Renkei } from '../src/index.js';

const ISSUER = 'http://renkei.test';
const CHANNEL_ID = '2011257262';
const CHANNEL_SECRET = 'login-secret-0123456789';
const USER = 'U54de992ad068a07f1d4ef661a0a946bd';

function config(opts: { enabled?: boolean; returnUrls?: string[] } = {}): RenkeiConfigInput {
  const base: RenkeiConfigInput = {
    issuer: ISSUER,
    channels: [{ channelId: CHANNEL_ID, channelSecret: CHANNEL_SECRET, region: 'jp' }],
    clients: [
      {
        clientId: 'app',
        clientSecret: 'app-secret-0123456789abcdef',
        redirectUris: ['http://app.test/cb'],
      },
    ],
    cookieKeys: ['cookie-key-0123456789abcdef'],
  };
  if (opts.enabled !== false) {
    base.sessionCookie = {
      enabled: true,
      ...(opts.returnUrls ? { returnUrls: opts.returnUrls } : {}),
    };
  }
  return base;
}

function fakeLine() {
  const state = { nonce: '' };
  const fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === 'https://api.line.me/oauth2/v2.1/token') {
      const now = Math.floor(Date.now() / 1000);
      const idToken = await new SignJWT({ name: 'テスト太郎', nonce: state.nonce })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuer('https://access.line.me')
        .setAudience(CHANNEL_ID)
        .setSubject(USER)
        .setIssuedAt(now)
        .setExpirationTime(now + 3600)
        .sign(new TextEncoder().encode(CHANNEL_SECRET));
      return json({ access_token: 'line-at', token_type: 'Bearer', id_token: idToken });
    }
    if (url === 'https://api.line.me/v2/profile')
      return json({ userId: USER, displayName: 'テスト太郎' });
    if (url === 'https://api.line.me/friendship/v1/status') return json({ friendFlag: true });
    throw new Error(`unexpected LINE call: ${url}`);
  }) as typeof globalThis.fetch;
  return { fetch, state };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

let renkei: Renkei;
let storage: Storage;
let line: ReturnType<typeof fakeLine>;

async function boot(opts?: Parameters<typeof config>[0]) {
  storage = createMemoryStorage();
  line = fakeLine();
  renkei = await createRenkei({
    config: config(opts),
    storage,
    fetch: line.fetch,
    logger: { info() {}, warn() {}, error() {} },
  });
}

const req = (path: string, init?: RequestInit) =>
  renkei.app.fetch(new Request(`${ISSUER}${path}`, { redirect: 'manual', ...init }));

/** Drive /login → callback and return the session cookie + the final redirect target. */
async function login(returnTo?: string): Promise<{ cookie: string; location: string | null }> {
  const start = await req(`/login${returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : ''}`);
  const authorize = new URL(start.headers.get('location') as string);
  line.state.nonce = authorize.searchParams.get('nonce') ?? '';
  const state = authorize.searchParams.get('state');
  const back = await req(`/line/callback?code=good-code&state=${state}`);
  const setCookie = back.headers.get('set-cookie') ?? '';
  const cookie = setCookie.split(';')[0] ?? '';
  return { cookie, location: back.headers.get('location') };
}

describe('session-cookie mode', () => {
  beforeEach(async () => {
    await boot();
  });

  it('logs in, sets a signed cookie, and /session returns claims', async () => {
    const { cookie, location } = await login();
    expect(location).toBe('/');
    expect(cookie).toMatch(/^renkei_session=/);

    const res = await req('/session', { headers: { cookie } });
    expect(res.status).toBe(200);
    const claims = (await res.json()) as Record<string, unknown>;
    expect(claims.sub).toBeTruthy();
    expect(claims.name).toBe('テスト太郎');
    expect(claims['line:user_id']).toBe(USER);
    expect(claims['line:friend']).toBe(true);
  });

  it('/session is 401 without a valid cookie', async () => {
    expect((await req('/session')).status).toBe(401);
    expect((await req('/session', { headers: { cookie: 'renkei_session=forged' } })).status).toBe(
      401,
    );
  });

  it('/logout clears the session so /session is 401 afterwards', async () => {
    const { cookie } = await login();
    expect((await req('/session', { headers: { cookie } })).status).toBe(200);
    const out = await req('/logout', { method: 'POST', headers: { cookie } });
    expect(out.status).toBe(204);
    expect((await req('/session', { headers: { cookie } })).status).toBe(401);
  });

  it('honours a same-origin relative return_to', async () => {
    expect((await login('/dashboard')).location).toBe('/dashboard');
  });

  it('rejects an off-origin return_to (open-redirect guard), falling back to /', async () => {
    expect((await login('https://evil.example/steal')).location).toBe('/');
    expect((await login('//evil.example')).location).toBe('/');
  });

  it('allows an allowlisted absolute return_to', async () => {
    await boot({ returnUrls: ['https://app.example.com'] });
    expect((await login('https://app.example.com/home')).location).toBe(
      'https://app.example.com/home',
    );
  });

  it('does not mount /login, /session, /logout when disabled', async () => {
    await boot({ enabled: false });
    expect((await req('/login')).status).toBe(404);
    expect((await req('/session')).status).toBe(404);
    expect((await req('/logout', { method: 'POST' })).status).toBe(404);
  });
});
