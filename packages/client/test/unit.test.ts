/** Pure parts: URL building, claim decoding, PKCE. No server. */
import { LINE_CLAIMS as CORE_LINE_CLAIMS, LINE_SCOPE as CORE_LINE_SCOPE } from 'renkei-core';
import { describe, expect, it } from 'vitest';
import {
  createRenkeiClient,
  DEFAULT_SCOPE,
  decodeClaimsUnverified,
  generatePkce,
  isFriend,
  isLinked,
  LINE_CLAIMS,
  LINE_SCOPE,
  RenkeiClientError,
  randomString,
} from '../src/index.js';

const client = createRenkeiClient({ issuer: 'https://auth.example.com/', clientId: 'my-app' });

describe('claim names', () => {
  it('match renkei-core exactly (the SDK duplicates them to stay dependency-free)', () => {
    expect(LINE_CLAIMS).toEqual(CORE_LINE_CLAIMS);
    expect(LINE_SCOPE).toBe(CORE_LINE_SCOPE);
    expect(DEFAULT_SCOPE.split(' ')).toContain(LINE_SCOPE);
  });
});

describe('createRenkeiClient', () => {
  it('normalises the issuer and derives the fixed renkei endpoints', () => {
    expect(client.issuer).toBe('https://auth.example.com');
    expect(client.endpoints).toEqual({
      discovery: 'https://auth.example.com/.well-known/openid-configuration',
      authorization: 'https://auth.example.com/oidc/auth',
      token: 'https://auth.example.com/oidc/token',
      userinfo: 'https://auth.example.com/oidc/me',
      jwks: 'https://auth.example.com/oidc/jwks',
      revocation: 'https://auth.example.com/oidc/token/revocation',
      liffExchange: 'https://auth.example.com/liff/exchange',
      login: 'https://auth.example.com/login',
      session: 'https://auth.example.com/session',
      logout: 'https://auth.example.com/logout',
    });
    const sub = createRenkeiClient({ issuer: 'http://localhost:8787/renkei/', clientId: 'x' });
    expect(sub.endpoints.token).toBe('http://localhost:8787/renkei/oidc/token');
  });

  it('rejects a relative issuer, an issuer with a query, and a missing clientId', () => {
    expect(() => createRenkeiClient({ issuer: 'auth.example.com', clientId: 'x' })).toThrow(
      /absolute URL/,
    );
    expect(() =>
      createRenkeiClient({ issuer: 'https://auth.example.com/?x=1', clientId: 'x' }),
    ).toThrow(/query/);
    expect(() => createRenkeiClient({ issuer: 'https://auth.example.com', clientId: '' })).toThrow(
      /clientId/,
    );
  });
});

describe('loginUrl', () => {
  it('builds a code-flow authorize URL with renkei defaults', () => {
    const url = new URL(
      client.loginUrl({ redirectUri: 'https://app.example.com/cb', state: 's1', nonce: 'n1' }),
    );
    expect(url.origin + url.pathname).toBe('https://auth.example.com/oidc/auth');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'my-app',
      response_type: 'code',
      redirect_uri: 'https://app.example.com/cb',
      scope: 'openid profile email line',
      state: 's1',
      nonce: 'n1',
    });
  });

  it('passes bot_prompt, line_region, PKCE, a scope array and extra params through', () => {
    const url = new URL(
      client.loginUrl({
        redirectUri: 'https://app.example.com/cb',
        state: 's',
        scope: ['openid', 'line'],
        botPrompt: 'none',
        lineRegion: 'tw',
        codeChallenge: 'abc',
        extra: { prompt: 'login', ui_locales: 'ja' },
      }),
    );
    const p = url.searchParams;
    expect(p.get('scope')).toBe('openid line');
    expect(p.get('bot_prompt')).toBe('none');
    expect(p.get('line_region')).toBe('tw');
    expect(p.get('code_challenge')).toBe('abc');
    expect(p.get('code_challenge_method')).toBe('S256');
    expect(p.get('prompt')).toBe('login');
    expect(p.get('ui_locales')).toBe('ja');
    expect(p.has('nonce')).toBe(false);
  });

  it('requires redirectUri and state', () => {
    expect(() => client.loginUrl({ redirectUri: '', state: 's' })).toThrow(/redirectUri/);
    expect(() => client.loginUrl({ redirectUri: 'https://a/cb', state: '' })).toThrow(/state/);
  });
});

describe('sessionLoginUrl', () => {
  it('is /login with the optional return_to / bot_prompt / line_region', () => {
    expect(client.sessionLoginUrl()).toBe('https://auth.example.com/login');
    const url = new URL(
      client.sessionLoginUrl({ returnTo: '/account', botPrompt: 'normal', lineRegion: 'jp' }),
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      return_to: '/account',
      bot_prompt: 'normal',
      line_region: 'jp',
    });
  });
});

describe('decodeClaimsUnverified', () => {
  const jwt = (payload: unknown) =>
    `eyJhbGciOiJSUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`;

  it('decodes a base64url payload with non-ASCII and the line:* claims', () => {
    const claims = decodeClaimsUnverified(
      jwt({
        sub: 'abc',
        name: 'テスト太郎',
        'line:user_id': 'U1',
        'line:friend': true,
        'line:linked': false,
      }),
    );
    expect(claims.sub).toBe('abc');
    expect(claims.name).toBe('テスト太郎');
    expect(claims['line:user_id']).toBe('U1');
    expect(isFriend(claims)).toBe(true);
    expect(isLinked(claims)).toBe(false);
    expect(isFriend({ sub: 'x' })).toBe(false);
    expect(isLinked({ sub: 'x' })).toBe(false);
  });

  it('rejects things that are not a JWT with a sub', () => {
    expect(() => decodeClaimsUnverified('nope')).toThrow(/not a JWT/);
    expect(() => decodeClaimsUnverified('a.!!!.c')).toThrow(/not valid JSON/);
    expect(() => decodeClaimsUnverified(jwt({ name: 'no sub' }))).toThrow(/no sub/);
  });
});

describe('pkce', () => {
  it('generates a verifier whose S256 challenge matches', async () => {
    const { verifier, challenge, method } = await generatePkce();
    expect(method).toBe('S256');
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    expect(Buffer.from(digest).toString('base64url')).toBe(challenge);
  });

  it('randomString is URL-safe and not repeating', () => {
    const a = randomString();
    const b = randomString(16);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(b).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(a).not.toBe(randomString());
  });
});

describe('errors', () => {
  it('surfaces OAuth error bodies and falls back to the HTTP status', async () => {
    const respond = (status: number, body?: unknown) =>
      createRenkeiClient({
        issuer: 'https://auth.example.com',
        clientId: 'x',
        fetch: (async () =>
          new Response(body === undefined ? 'oops' : JSON.stringify(body), {
            status,
            headers: { 'content-type': body === undefined ? 'text/plain' : 'application/json' },
          })) as typeof fetch,
      });
    const e1 = await respond(400, { error: 'invalid_grant', error_description: 'bad code' })
      .exchangeCode({ code: 'c', redirectUri: 'https://a/cb' })
      .catch((e: unknown) => e);
    expect(e1).toBeInstanceOf(RenkeiClientError);
    expect(e1).toMatchObject({
      status: 400,
      error: 'invalid_grant',
      errorDescription: 'bad code',
      message: 'invalid_grant: bad code',
    });
    const e2 = await respond(502)
      .userinfo('at')
      .catch((e: unknown) => e);
    expect(e2).toMatchObject({ status: 502, error: 'http_502', message: 'http_502' });
  });

  it('exchangeLiffToken needs at least one LINE token', async () => {
    await expect(client.exchangeLiffToken({})).rejects.toThrow(/idToken or accessToken/);
  });
});
