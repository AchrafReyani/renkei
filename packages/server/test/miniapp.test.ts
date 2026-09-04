/**
 * LINE MINI App channels: configured next to the Login channel (`kind:
 * 'miniapp'`, one per stage), accepted by `/liff/exchange`, never used for the
 * web redirect flow, and — being the same LINE provider — mapped onto the
 * identity the web login created (same `sub`).
 */
import { decodeJwt, SignJWT } from 'jose';
import { createMemoryStorage } from 'renkei-core';
import { beforeAll, describe, expect, it } from 'vitest';
import { configFromEnv } from '../src/env.js';
import { createRenkei, parseConfig, type Renkei } from '../src/index.js';

const ISSUER = 'http://renkei.test';
const LOGIN = {
  channelId: '2011257262',
  channelSecret: 'login-secret-0123456789abcdef',
  region: 'jp',
};
const MINI_DEV = {
  channelId: '2011444277',
  channelSecret: 'miniapp-secret-0123456789abcdef',
  region: 'jp',
  kind: 'miniapp' as const,
};
const MINI_PUB = { ...MINI_DEV, channelId: '2011444279' };
const SPA = {
  clientId: 'spa',
  redirectUris: ['http://spa.test/cb'],
  tokenEndpointAuthMethod: 'none' as const,
};
const DEV_LIFF = {
  clientId: 'renkei-dev-liff',
  redirectUris: [`${ISSUER}/dev/liff`],
  tokenEndpointAuthMethod: 'none' as const,
};
const user = { userId: 'Umini', name: 'ミニ太郎', picture: 'https://p/mini' };

async function idToken(channel: { channelId: string; channelSecret: string }, name = user.name) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ name, picture: user.picture, amr: ['linesso'] })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('https://access.line.me')
    .setAudience(channel.channelId)
    .setSubject(user.userId)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(new TextEncoder().encode(channel.channelSecret));
}

const lineFetch = (async (input: RequestInfo | URL) => {
  const url = String(input);
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
  if (url.startsWith('https://api.line.me/oauth2/v2.1/verify?access_token=')) {
    const token = new URL(url).searchParams.get('access_token');
    if (token === 'mini-at')
      return json({ scope: 'profile openid', client_id: MINI_DEV.channelId, expires_in: 100 });
    return json({ error: 'invalid_request' }, 400);
  }
  if (url === 'https://api.line.me/v2/profile')
    return json({ userId: user.userId, displayName: user.name, pictureUrl: user.picture });
  if (url === 'https://api.line.me/friendship/v1/status') return json({ friendFlag: true });
  throw new Error(`unexpected LINE call: ${url}`);
}) as typeof fetch;

describe('config: MINI App channels', () => {
  const base = { issuer: ISSUER, clients: [SPA], cookieKeys: ['cookie-key-0123456789abcdef'] };

  it('allows a miniapp channel in the same region as the Login channel, but not two Login channels', () => {
    const cfg = parseConfig({ ...base, channels: [LOGIN, MINI_DEV, MINI_PUB] });
    expect(cfg.channels.map((c) => c.kind)).toEqual(['login', 'miniapp', 'miniapp']);
    expect(() => parseConfig({ ...base, channels: [LOGIN, { ...LOGIN, channelId: '1' }] })).toThrow(
      /duplicate channel region/,
    );
    expect(() => parseConfig({ ...base, channels: [LOGIN, MINI_DEV, MINI_DEV] })).toThrow(
      /duplicate channelId/,
    );
    expect(() => parseConfig({ ...base, channels: [MINI_DEV] })).toThrow(/no LINE Login channel/);
  });

  it('reads LINE_MINIAPP_CHANNEL_ID / _SECRET from the environment, one channel per stage', () => {
    const env = {
      ISSUER,
      LINE_LOGIN_CHANNEL_ID: LOGIN.channelId,
      LINE_LOGIN_CHANNEL_SECRET: LOGIN.channelSecret,
      LINE_MINIAPP_CHANNEL_ID: '2011444277, 2011444279',
      LINE_MINIAPP_CHANNEL_SECRET: 'one-secret-for-both-0123456789',
    };
    const cfg = parseConfig(configFromEnv(env).config);
    expect(cfg.channels.map((c) => [c.channelId, c.kind, c.region, c.channelSecret])).toEqual([
      [LOGIN.channelId, 'login', 'jp', LOGIN.channelSecret],
      ['2011444277', 'miniapp', 'jp', 'one-secret-for-both-0123456789'],
      ['2011444279', 'miniapp', 'jp', 'one-secret-for-both-0123456789'],
    ]);
    const perStage = configFromEnv({
      ...env,
      LINE_MINIAPP_CHANNEL_SECRET: 'dev-secret-1234567890,pub-secret-1234567890',
    });
    expect(perStage.config.channels.map((c) => c.channelSecret)).toEqual([
      LOGIN.channelSecret,
      'dev-secret-1234567890',
      'pub-secret-1234567890',
    ]);
    expect(() => configFromEnv({ ...env, LINE_MINIAPP_CHANNEL_SECRET: undefined })).toThrow(
      /LINE_MINIAPP_CHANNEL_SECRET is not set/,
    );
    expect(() =>
      configFromEnv({ ...env, LINE_MINIAPP_CHANNEL_SECRET: 'a1234567890,b1234567890,c1234567890' }),
    ).toThrow(/one secret, or one per/);
  });
});

describe('MINI App channel at runtime', () => {
  let renkei: Renkei;
  beforeAll(async () => {
    renkei = await createRenkei({
      storage: createMemoryStorage(),
      fetch: lineFetch,
      logger: { info() {}, warn() {}, error() {} },
      liffId: '2011257262-AbCdEfGh',
      config: {
        issuer: ISSUER,
        dev: true,
        channels: [LOGIN, MINI_DEV, MINI_PUB],
        clients: [
          SPA,
          DEV_LIFF,
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

  const exchange = (body: Record<string, string>) =>
    renkei.fetch(
      new Request(`${ISSUER}/liff/exchange`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ client_id: SPA.clientId, ...body }),
      }),
    );

  it('accepts a MINI App id_token and maps it onto the identity the Login channel created', async () => {
    // First seen through the Login channel's LIFF (a web login would do the same).
    const web = await exchange({ id_token: await idToken(LOGIN) });
    expect(web.status).toBe(200);
    const webSub = ((await web.json()) as { sub: string }).sub;

    // Then through the MINI App (Developing stage): same LINE user ID, another channel.
    const mini = await exchange({ id_token: await idToken(MINI_DEV, 'ミニ太郎 (app)') });
    expect(mini.status).toBe(200);
    const body = (await mini.json()) as { sub: string; id_token: string };
    expect(body.sub).toBe(webSub);
    const claims = decodeJwt(body.id_token);
    expect(claims['line:user_id']).toBe(user.userId);
    expect(claims['line:channel_id']).toBe(MINI_DEV.channelId);
    expect(claims['line:region']).toBe('jp');
    expect(claims.name).toBe('ミニ太郎 (app)');

    // The Published stage is its own channel ID: still the same person.
    const pub = await exchange({ id_token: await idToken(MINI_PUB) });
    expect(((await pub.json()) as { sub: string }).sub).toBe(webSub);

    const accounts = await renkei.storage.identities.listLineAccounts(webSub);
    expect(accounts.map((a) => a.channelId).sort()).toEqual(
      [LOGIN.channelId, MINI_DEV.channelId, MINI_PUB.channelId].sort(),
    );
  });

  it('accepts a MINI App access_token (verify → client_id = the MINI App channel)', async () => {
    const res = await exchange({ access_token: 'mini-at' });
    expect(res.status).toBe(200);
    const claims = decodeJwt(((await res.json()) as { id_token: string }).id_token);
    expect(claims['line:channel_id']).toBe(MINI_DEV.channelId);
    expect(claims['line:friend']).toBe(true);
  });

  it('never routes a web login through the MINI App channel', async () => {
    // Session-cookie /login is the shortest path to the LINE authorize URL.
    for (const q of ['', '?line_region=jp', '?line_region=zz']) {
      const res = await renkei.fetch(new Request(`${ISSUER}/login${q}`, { redirect: 'manual' }));
      expect(res.status).toBe(302);
      const line = new URL(res.headers.get('location') ?? '');
      expect(line.origin).toBe('https://access.line.me');
      expect(line.searchParams.get('client_id')).toBe(LOGIN.channelId);
    }
  });

  it('/dev/liff?liff_id= swaps the LIFF app for a MINI App stage', async () => {
    const page = await (await renkei.fetch(new Request(`${ISSUER}/dev/liff`))).text();
    expect(page).toContain('liff.init({ liffId: "2011257262-AbCdEfGh" })');
    const mini = await (
      await renkei.fetch(new Request(`${ISSUER}/dev/liff?liff_id=2011444277-oYFL2elQ`))
    ).text();
    expect(mini).toContain('liff.init({ liffId: "2011444277-oYFL2elQ" })');
    const bad = await (
      await renkei.fetch(new Request(`${ISSUER}/dev/liff?liff_id=<script>`))
    ).text();
    expect(bad).toContain('liff.init({ liffId: "2011257262-AbCdEfGh" })');
  });
});
