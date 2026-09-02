/**
 * The SDK against a real renkei-server instance with a fake LINE Platform:
 * OIDC code flow (confidential + public/PKCE), LIFF exchange, session-cookie
 * mode. The client's `fetch` is the renkei instance's own handler, so no
 * network and no ports.
 */
import { createLocalJWKSet, jwtVerify, SignJWT } from 'jose';
import { createMemoryStorage } from 'renkei-core';
import { createRenkei, type Renkei } from 'renkei-server';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createRenkeiClient,
  decodeClaimsUnverified,
  generatePkce,
  type RenkeiClient,
  RenkeiClientError,
  randomString,
} from '../src/index.js';

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
const USER = {
  userId: 'U54de992ad068a07f1d4ef661a0a946bd',
  name: 'テスト太郎',
  picture: 'https://p/1',
};

// ── Fake LINE Platform ──────────────────────────────────────────────────────
const line = { nonce: '', friend: true };

async function lineIdToken(nonce?: string) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    name: USER.name,
    picture: USER.picture,
    amr: ['linesso'],
    ...(nonce ? { nonce } : {}),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('https://access.line.me')
    .setAudience(CHANNEL.channelId)
    .setSubject(USER.userId)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(new TextEncoder().encode(CHANNEL.channelSecret));
}

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });

const lineFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url === 'https://api.line.me/oauth2/v2.1/token') {
    const body = init?.body as URLSearchParams;
    if (body.get('code') !== 'good-code') return json({ error: 'invalid_grant' }, 400);
    return json({
      access_token: 'line-at',
      token_type: 'Bearer',
      id_token: await lineIdToken(line.nonce),
    });
  }
  if (url.startsWith('https://api.line.me/oauth2/v2.1/verify?access_token=')) {
    const token = new URL(url).searchParams.get('access_token');
    if (token === 'good-at')
      return json({ scope: 'profile openid', client_id: CHANNEL.channelId, expires_in: 100 });
    return json({ error: 'invalid_request', error_description: 'access token expired' }, 400);
  }
  if (url === 'https://api.line.me/v2/profile')
    return json({ userId: USER.userId, displayName: USER.name, pictureUrl: USER.picture });
  if (url === 'https://api.line.me/friendship/v1/status') return json({ friendFlag: line.friend });
  throw new Error(`unexpected LINE call: ${url}`);
}) as typeof fetch;

// ── Minimal browser over renkei.fetch: cookie jar + issuer-internal redirects ─
class Browser {
  private readonly jar = new Map<string, string>();
  constructor(private readonly renkei: Renkei) {}

  /** A `fetch` for the SDK that carries this browser's cookies (like `credentials: 'include'`). */
  readonly fetch: typeof fetch = async (input, init) => {
    const req = new Request(input, init);
    const cookie = this.cookieHeader();
    if (cookie) req.headers.set('cookie', cookie);
    const res = await this.renkei.fetch(new Request(req, { redirect: 'manual' }));
    this.store(res);
    return res;
  };

  cookieHeader() {
    return [...this.jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  private store(res: Response) {
    for (const raw of res.headers.getSetCookie()) {
      const [pair = '', ...attrs] = raw.split(';').map((s) => s.trim());
      const eq = pair.indexOf('=');
      if (eq < 0) continue;
      const maxAge = attrs.find((a) => a.toLowerCase().startsWith('max-age='))?.slice(8);
      const expires = attrs.find((a) => a.toLowerCase().startsWith('expires='))?.slice(8);
      const dead =
        (maxAge !== undefined && Number(maxAge) <= 0) ||
        (expires && new Date(expires).getTime() < Date.now());
      if (dead) this.jar.delete(pair.slice(0, eq));
      else this.jar.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
  }

  /** Follow redirects while they stay on the issuer; return the first external Location. */
  async navigate(url: string): Promise<URL> {
    let current = url;
    for (let i = 0; i < 10; i++) {
      const res = await this.fetch(current);
      const loc = res.headers.get('location');
      if (res.status < 300 || res.status >= 400 || !loc) {
        throw new Error(`stopped at ${res.status} ${current}: ${await res.text()}`);
      }
      const next = new URL(loc, current);
      if (next.origin !== ISSUER) return next;
      current = next.toString();
    }
    throw new Error('too many redirects');
  }

  /** loginUrl → LINE (capture nonce/state) → callback → the app's redirect_uri. */
  async completeLineLogin(startUrl: string): Promise<URL> {
    const toLine = await this.navigate(startUrl);
    // An existing renkei session is SSO: the user goes straight back to the app.
    if (toLine.origin !== 'https://access.line.me') return toLine;
    line.nonce = toLine.searchParams.get('nonce') ?? '';
    const state = toLine.searchParams.get('state') ?? '';
    return this.navigate(`${ISSUER}/line/callback?code=good-code&state=${state}`);
  }
}

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
      sessionCookie: { enabled: true, returnUrls: ['http://app.test'] },
    },
  });
  jwks = createLocalJWKSet(await (await renkei.fetch(new Request(`${ISSUER}/oidc/jwks`))).json());
});

const sdk = (
  opts: Partial<Parameters<typeof createRenkeiClient>[0]> & { fetch: typeof fetch },
): RenkeiClient => createRenkeiClient({ issuer: `${ISSUER}/`, clientId: APP.clientId, ...opts });

describe('OIDC code flow', () => {
  it('confidential client: loginUrl → LINE → code → exchangeCode → verified id_token with line:* claims', async () => {
    const b = new Browser(renkei);
    const client = sdk({ fetch: b.fetch, clientSecret: APP.clientSecret });
    const state = randomString();
    const nonce = randomString();

    const back = await b.completeLineLogin(
      client.loginUrl({
        redirectUri: APP.redirectUris[0] as string,
        state,
        nonce,
        botPrompt: 'normal',
      }),
    );
    expect(back.origin + back.pathname).toBe(APP.redirectUris[0]);
    expect(back.searchParams.get('state')).toBe(state);
    const code = back.searchParams.get('code') as string;
    expect(code).toBeTruthy();

    const tokens = await client.exchangeCode({ code, redirectUri: APP.redirectUris[0] as string });
    expect(tokens.token_type).toBe('Bearer');
    expect(tokens.access_token).toBeTruthy();

    // The SDK's unverified decode agrees with a real signature check.
    const claims = decodeClaimsUnverified(tokens.id_token as string);
    const { payload } = await jwtVerify(tokens.id_token as string, jwks, {
      issuer: ISSUER,
      audience: APP.clientId,
    });
    expect(claims).toEqual(payload);
    expect(claims.nonce).toBe(nonce);
    expect(claims.name).toBe(USER.name);
    expect(claims['line:user_id']).toBe(USER.userId);
    expect(claims['line:friend']).toBe(true);
    expect(claims['line:channel_id']).toBe(CHANNEL.channelId);
    expect(claims['line:region']).toBe('jp');
    expect(claims['line:linked']).toBe(false);

    const me = await client.userinfo(tokens.access_token);
    expect(me.sub).toBe(claims.sub);
    expect(me['line:user_id']).toBe(USER.userId);
  });

  it('bot_prompt from loginUrl reaches LINE', async () => {
    const b = new Browser(renkei);
    const client = sdk({ fetch: b.fetch });
    const toLine = await b.navigate(
      client.loginUrl({
        redirectUri: APP.redirectUris[0] as string,
        state: 's',
        botPrompt: 'none',
      }),
    );
    expect(toLine.searchParams.has('bot_prompt')).toBe(false); // none = do not ask LINE for it
    const toLine2 = await new Browser(renkei).navigate(
      client.loginUrl({
        redirectUri: APP.redirectUris[0] as string,
        state: 's',
        botPrompt: 'aggressive',
      }),
    );
    expect(toLine2.searchParams.get('bot_prompt')).toBe('aggressive');
  });

  it('public client: PKCE from generatePkce() is accepted, and required', async () => {
    const b = new Browser(renkei);
    const client = sdk({ fetch: b.fetch, clientId: SPA.clientId });
    const pkce = await generatePkce();
    const redirectUri = SPA.redirectUris[0] as string;

    const back = await b.completeLineLogin(
      client.loginUrl({ redirectUri, state: 's', nonce: 'n', codeChallenge: pkce.challenge }),
    );
    const code = back.searchParams.get('code') as string;

    // Wrong verifier is refused …
    const bad = await client
      .exchangeCode({ code, redirectUri, codeVerifier: randomString() })
      .catch((e: unknown) => e);
    expect(bad).toBeInstanceOf(RenkeiClientError);
    expect((bad as RenkeiClientError).error).toBe('invalid_grant');

    // … and a code that failed once is burned, so log in again for the good path.
    const back2 = await b.completeLineLogin(
      client.loginUrl({ redirectUri, state: 's2', nonce: 'n2', codeChallenge: pkce.challenge }),
    );
    const tokens = await client.exchangeCode({
      code: back2.searchParams.get('code') as string,
      redirectUri,
      codeVerifier: pkce.verifier,
    });
    expect(decodeClaimsUnverified(tokens.id_token as string)['line:user_id']).toBe(USER.userId);

    // Without PKCE at all the authorize request is rejected before LINE.
    const res = await b.fetch(client.loginUrl({ redirectUri, state: 's3' }));
    expect(res.status).toBe(303);
    const err = new URL(res.headers.get('location') as string);
    expect(err.searchParams.get('error')).toBe('invalid_request');
    expect(err.searchParams.get('error_description')).toMatch(/PKCE|code_challenge/i);
  });
});

describe('exchangeLiffToken', () => {
  const renkeiFetch: typeof fetch = (input, init) => renkei.fetch(new Request(input, init));

  it('confidential client via Basic auth: id_token + access_token → renkei id_token + decoded claims', async () => {
    const client = sdk({ fetch: renkeiFetch, clientSecret: APP.clientSecret });
    const result = await client.exchangeLiffToken({
      idToken: await lineIdToken(),
      accessToken: 'good-at',
    });
    expect(result.sub).toBeTruthy();
    expect(result.expiresIn).toBeGreaterThan(0);
    const { payload } = await jwtVerify(result.idToken, jwks, {
      issuer: ISSUER,
      audience: APP.clientId,
    });
    expect(result.claims).toEqual(payload);
    expect(result.claims['line:user_id']).toBe(USER.userId);
    expect(result.claims['line:friend']).toBe(true);
    expect(result.claims.amr).toEqual(['linesso']);
  });

  it('public client with only an access_token, narrowed scope', async () => {
    const client = sdk({ fetch: renkeiFetch, clientId: SPA.clientId });
    const result = await client.exchangeLiffToken({
      accessToken: 'good-at',
      scope: ['openid', 'line'],
    });
    expect(result.claims['line:user_id']).toBe(USER.userId);
    expect(result.claims.name).toBeUndefined(); // profile scope not requested
    expect(result.claims.amr).toEqual(['liff']);
  });

  it('maps server errors to RenkeiClientError', async () => {
    const wrongSecret = sdk({ fetch: renkeiFetch, clientSecret: 'nope' });
    await expect(wrongSecret.exchangeLiffToken({ accessToken: 'good-at' })).rejects.toMatchObject({
      name: 'RenkeiClientError',
      status: 401,
      error: 'invalid_client',
    });
    const expired = sdk({ fetch: renkeiFetch, clientSecret: APP.clientSecret });
    await expect(expired.exchangeLiffToken({ accessToken: 'expired-at' })).rejects.toMatchObject({
      status: 401,
      error: 'invalid_token',
    });
  });
});

describe('session-cookie mode', () => {
  it('sessionLoginUrl → LINE → cookie; session() reads it, logout() ends it', async () => {
    const b = new Browser(renkei);
    const client = sdk({ fetch: b.fetch });

    expect(await client.session()).toBeNull();

    const back = await b.completeLineLogin(
      client.sessionLoginUrl({ returnTo: 'http://app.test/account' }),
    );
    expect(back.toString()).toBe('http://app.test/account');
    expect(b.cookieHeader()).toMatch(/renkei_session=/);

    const claims = await client.session();
    expect(claims?.['line:user_id']).toBe(USER.userId);
    expect(claims?.name).toBe(USER.name);

    // Server-side usage: forward the cookie header explicitly, no jar involved.
    const server = sdk({ fetch: (i, init) => renkei.fetch(new Request(i, init)) });
    const viaHeader = await server.session({ headers: { cookie: b.cookieHeader() } });
    expect(viaHeader?.sub).toBe(claims?.sub);

    await client.logout();
    expect(await client.session()).toBeNull();
    expect(await server.session({ headers: { cookie: 'renkei_session=forged.value' } })).toBeNull();
  });
});
