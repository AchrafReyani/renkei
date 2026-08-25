import { createMemoryStorage } from '@renkei/core';
import { createLocalJWKSet, jwtVerify, SignJWT } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { createRenkei, type Renkei } from '../src/index.js';

const ISSUER = 'http://renkei.test';
const CHANNEL = {
  channelId: '2011257262',
  channelSecret: 'test-channel-secret-0123456789',
  region: 'jp',
};
const APP = {
  clientId: 'app',
  clientSecret: 'app-secret-0123456789abcdef',
  redirectUris: ['http://app.test/cb'],
};
const SPA = {
  clientId: 'spa',
  redirectUris: ['http://spa.test/cb'],
  tokenEndpointAuthMethod: 'none' as const,
};

const user = { userId: 'Uliff', name: 'LIFF太郎', picture: 'https://p/liff', friend: true };

async function liffIdToken(
  overrides: Record<string, unknown> = {},
  secret = CHANNEL.channelSecret,
  aud = CHANNEL.channelId,
) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ name: user.name, picture: user.picture, amr: ['linesso'], ...overrides })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('https://access.line.me')
    .setAudience(aud)
    .setSubject(user.userId)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(new TextEncoder().encode(secret));
}

const lineFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
  if (url.startsWith('https://api.line.me/oauth2/v2.1/verify?access_token=')) {
    const token = new URL(url).searchParams.get('access_token');
    if (token === 'good-at')
      return json({ scope: 'profile openid', client_id: CHANNEL.channelId, expires_in: 100 });
    if (token === 'foreign-at')
      return json({ scope: 'profile', client_id: '9999999999', expires_in: 100 });
    return json({ error: 'invalid_request', error_description: 'access token expired' }, 400);
  }
  if (url === 'https://api.line.me/v2/profile')
    return json({ userId: user.userId, displayName: user.name, pictureUrl: user.picture });
  if (url === 'https://api.line.me/friendship/v1/status') return json({ friendFlag: user.friend });
  throw new Error(`unexpected LINE call: ${url} ${init?.method ?? ''}`);
}) as typeof fetch;

describe('POST /liff/exchange', () => {
  let renkei: Renkei;
  let jwks: ReturnType<typeof createLocalJWKSet>;

  beforeAll(async () => {
    renkei = await createRenkei({
      storage: createMemoryStorage(),
      fetch: lineFetch,
      logger: { info() {}, warn() {}, error() {} },
      config: {
        issuer: ISSUER,
        channels: [CHANNEL],
        clients: [APP, SPA],
        cookieKeys: ['cookie-key-0123456789abcdef'],
        corsOrigins: ['https://liff.example'],
      },
    });
    jwks = createLocalJWKSet(await (await renkei.fetch(new Request(`${ISSUER}/oidc/jwks`))).json());
  });

  const post = (body: Record<string, string>, headers: Record<string, string> = {}) =>
    renkei.fetch(
      new Request(`${ISSUER}/liff/exchange`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
      }),
    );

  it('exchanges a LIFF id_token for a renkei id_token with line:* claims', async () => {
    const res = await post({ id_token: await liffIdToken(), client_id: SPA.clientId });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, string>;
    const { payload, protectedHeader } = await jwtVerify(body.id_token as string, jwks, {
      issuer: ISSUER,
      audience: SPA.clientId,
    });
    expect(protectedHeader.alg).toBe('RS256');
    expect(payload).toMatchObject({
      name: 'LIFF太郎',
      'line:user_id': 'Uliff',
      'line:channel_id': CHANNEL.channelId,
      'line:region': 'jp',
      amr: ['linesso'],
    });
    expect(payload.sub).toBe(body.sub);
    expect(payload['line:friend']).toBeUndefined(); // no access_token → friendship unknown
  });

  it('adds friendship and profile when an access_token is supplied too', async () => {
    const res = await post({
      id_token: await liffIdToken(),
      access_token: 'good-at',
      client_id: SPA.clientId,
    });
    expect(res.status).toBe(200);
    const { payload } = await jwtVerify(
      ((await res.json()) as Record<string, string>).id_token as string,
      jwks,
    );
    expect(payload['line:friend']).toBe(true);
  });

  it('works with an access_token alone', async () => {
    const res = await post({ access_token: 'good-at', client_id: SPA.clientId });
    expect(res.status).toBe(200);
    const { payload } = await jwtVerify(
      ((await res.json()) as Record<string, string>).id_token as string,
      jwks,
    );
    expect(payload['line:user_id']).toBe('Uliff');
    expect(payload.name).toBe('LIFF太郎');
  });

  it('maps to the same sub as a web login of the same LINE user', async () => {
    const a = (await (
      await post({ id_token: await liffIdToken(), client_id: SPA.clientId })
    ).json()) as Record<string, string>;
    const b = (await (
      await post({
        access_token: 'good-at',
        client_id: APP.clientId,
        client_secret: APP.clientSecret,
      })
    ).json()) as Record<string, string>;
    expect(a.sub).toBe(b.sub);
    const accounts = await renkei.storage.identities.listLineAccounts(a.sub as string);
    expect(accounts.map((x) => x.kind)).toEqual(['liff']);
  });

  it('honours the requested scope when filtering claims', async () => {
    const res = await post({
      id_token: await liffIdToken(),
      client_id: SPA.clientId,
      scope: 'openid',
    });
    const { payload } = await jwtVerify(
      ((await res.json()) as Record<string, string>).id_token as string,
      jwks,
    );
    expect(payload.name).toBeUndefined();
    expect(payload['line:user_id']).toBeUndefined();
    expect(payload.sub).toBeTruthy();
  });

  it('authenticates confidential clients (body or Basic) and rejects bad secrets', async () => {
    expect((await post({ id_token: await liffIdToken(), client_id: APP.clientId })).status).toBe(
      401,
    );
    expect(
      (
        await post({
          id_token: await liffIdToken(),
          client_id: APP.clientId,
          client_secret: 'wrong',
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await post({
          id_token: await liffIdToken(),
          client_id: APP.clientId,
          client_secret: APP.clientSecret,
        })
      ).status,
    ).toBe(200);
    const basic = `Basic ${btoa(`${APP.clientId}:${APP.clientSecret}`)}`;
    expect((await post({ id_token: await liffIdToken() }, { authorization: basic })).status).toBe(
      200,
    );
    expect((await post({ id_token: await liffIdToken(), client_id: 'nobody' })).status).toBe(401);
  });

  it('rejects tokens for other channels, forged tokens, expired access tokens, and mismatched pairs', async () => {
    const foreign = await post({
      id_token: await liffIdToken({}, 'other-secret', '9999999999'),
      client_id: SPA.clientId,
    });
    expect(foreign.status).toBe(401);
    const forged = await post({
      id_token: await liffIdToken({}, 'wrong-secret'),
      client_id: SPA.clientId,
    });
    expect(forged.status).toBe(401);
    expect(((await forged.json()) as Record<string, string>).error_description).toContain(
      'signature',
    );
    expect((await post({ access_token: 'expired-at', client_id: SPA.clientId })).status).toBe(401);
    expect((await post({ access_token: 'foreign-at', client_id: SPA.clientId })).status).toBe(401);
    expect((await post({ client_id: SPA.clientId })).status).toBe(400);
  });

  it('answers CORS preflight for configured origins only', async () => {
    const ok = await renkei.fetch(
      new Request(`${ISSUER}/liff/exchange`, {
        method: 'OPTIONS',
        headers: { origin: 'https://liff.example', 'access-control-request-method': 'POST' },
      }),
    );
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://liff.example');
    const no = await renkei.fetch(
      new Request(`${ISSUER}/liff/exchange`, {
        method: 'OPTIONS',
        headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' },
      }),
    );
    expect(no.headers.get('access-control-allow-origin')).toBeNull();
  });
});
