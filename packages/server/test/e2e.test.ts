/**
 * End-to-end: a downstream OIDC client logs in through renkei, renkei logs
 * the user in at (a fake) LINE, and the client ends up with an id_token
 * carrying `line:*` claims. Exercises oidc-provider, the fetch→node bridge,
 * the interaction hand-off, identity upsert and claims — with no network.
 */
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

// ── Fake LINE Platform ──────────────────────────────────────────────────────
interface FakeLine {
  fetch: typeof fetch;
  /** Set from the authorize URL renkei redirected to, so the id_token nonce matches. */
  nonce: string;
  user: { userId: string; name: string; picture: string; email?: string; friend: boolean };
  calls: string[];
}

function fakeLine(user: FakeLine['user']): FakeLine {
  const line: FakeLine = {
    nonce: '',
    user,
    calls: [],
    fetch: undefined as unknown as typeof fetch,
  };
  line.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    line.calls.push(`${init?.method ?? 'GET'} ${url}`);
    if (url === 'https://api.line.me/oauth2/v2.1/token') {
      const body = init?.body as URLSearchParams;
      expect(body.get('grant_type')).toBe('authorization_code');
      expect(body.get('client_id')).toBe(CHANNEL.channelId);
      expect(body.get('client_secret')).toBe(CHANNEL.channelSecret);
      expect(body.get('code_verifier')).toBeTruthy();
      if (body.get('code') !== 'good-code') {
        return json({ error: 'invalid_grant', error_description: 'bad code' }, 400);
      }
      const now = Math.floor(Date.now() / 1000);
      const idToken = await new SignJWT({
        name: line.user.name,
        picture: line.user.picture,
        nonce: line.nonce,
        amr: ['linesso'],
        ...(line.user.email ? { email: line.user.email } : {}),
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuer('https://access.line.me')
        .setAudience(CHANNEL.channelId)
        .setSubject(line.user.userId)
        .setIssuedAt(now)
        .setExpirationTime(now + 3600)
        .sign(new TextEncoder().encode(CHANNEL.channelSecret));
      return json({
        access_token: 'line-at',
        token_type: 'Bearer',
        expires_in: 2592000,
        refresh_token: 'line-rt',
        scope: 'openid profile',
        id_token: idToken,
      });
    }
    if (url === 'https://api.line.me/v2/profile') {
      return json({
        userId: line.user.userId,
        displayName: line.user.name,
        pictureUrl: line.user.picture,
      });
    }
    if (url === 'https://api.line.me/friendship/v1/status') {
      return json({ friendFlag: line.user.friend });
    }
    throw new Error(`unexpected LINE call: ${url}`);
  }) as typeof fetch;
  return line;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// ── Minimal browser: cookie jar + redirect following inside the issuer ─────
class Browser {
  private readonly jar = new Map<string, { value: string; path: string }>();
  readonly visited: string[] = [];
  constructor(private readonly renkei: Renkei) {}

  private cookieHeader(url: URL) {
    return [...this.jar.entries()]
      .filter(([, c]) => url.pathname.startsWith(c.path))
      .map(([name, c]) => `${name}=${c.value}`)
      .join('; ');
  }

  private store(res: Response) {
    for (const raw of res.headers.getSetCookie()) {
      const [pair, ...attrs] = raw.split(';').map((s) => s.trim());
      const eq = pair?.indexOf('=') ?? -1;
      if (!pair || eq < 0) continue;
      const name = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      const path = attrs.find((a) => a.toLowerCase().startsWith('path='))?.slice(5) ?? '/';
      const maxAge = attrs.find((a) => a.toLowerCase().startsWith('max-age='))?.slice(8);
      const expires = attrs.find((a) => a.toLowerCase().startsWith('expires='))?.slice(8);
      const dead =
        (maxAge !== undefined && Number(maxAge) <= 0) ||
        (expires && new Date(expires).getTime() < Date.now());
      if (dead) this.jar.delete(name);
      else this.jar.set(name, { value, path });
    }
  }

  /** One request, no redirect following. */
  async request(url: string, init: RequestInit = {}): Promise<Response> {
    const u = new URL(url, ISSUER);
    this.visited.push(`${init.method ?? 'GET'} ${u.pathname}${u.search}`);
    const headers = new Headers(init.headers);
    const cookie = this.cookieHeader(u);
    if (cookie) headers.set('cookie', cookie);
    const res = await this.renkei.fetch(new Request(u, { ...init, headers, redirect: 'manual' }));
    this.store(res);
    return res;
  }

  /** Follow redirects while they stay on the issuer; stop at the first external one. */
  async navigate(url: string): Promise<{ res: Response; location?: URL }> {
    let current = url;
    for (let i = 0; i < 10; i++) {
      const res = await this.request(current);
      if (res.status < 300 || res.status >= 400) return { res };
      const loc = res.headers.get('location');
      if (!loc) return { res };
      const next = new URL(loc, new URL(current, ISSUER));
      if (next.origin !== ISSUER) return { res, location: next };
      current = next.toString();
    }
    throw new Error('too many redirects');
  }
}

async function boot(
  line: FakeLine,
  extra: Partial<Parameters<typeof createRenkei>[0]['config']> = {},
) {
  return createRenkei({
    storage: createMemoryStorage(),
    fetch: line.fetch,
    logger: { info() {}, warn() {}, error() {} },
    config: {
      issuer: ISSUER,
      channels: [CHANNEL],
      clients: [APP, SPA],
      cookieKeys: ['cookie-key-0123456789abcdef'],
      ...extra,
    },
  });
}

/** Drive the full login: returns the authorization code the client receives. */
async function loginThroughRenkei(
  b: Browser,
  line: FakeLine,
  authParams: Record<string, string>,
  lineCallback: (state: string) => string = (state) =>
    `/line/callback?code=good-code&state=${state}&friendship_status_changed=true`,
) {
  const auth = new URL('/oidc/auth', ISSUER);
  for (const [k, v] of Object.entries(authParams)) auth.searchParams.set(k, v);

  // 1. authorize → interaction → LINE
  const toLine = await b.navigate(auth.toString());
  expect(toLine.location?.origin).toBe('https://access.line.me');
  const lineUrl = toLine.location as URL;
  line.nonce = lineUrl.searchParams.get('nonce') ?? '';
  const state = lineUrl.searchParams.get('state') ?? '';

  // 2. LINE → callback → finish → resume → client
  const back = await b.navigate(lineCallback(state));
  return { lineUrl, back };
}

describe('renkei end to end', () => {
  let line: FakeLine;
  let renkei: Renkei;
  let jwks: ReturnType<typeof createLocalJWKSet>;

  beforeAll(async () => {
    line = fakeLine({ userId: 'Uabc', name: 'テスト太郎', picture: 'https://p/1', friend: true });
    renkei = await boot(line);
    const keys = await (await renkei.fetch(new Request(`${ISSUER}/oidc/jwks`))).json();
    jwks = createLocalJWKSet(keys);
  });

  it('serves discovery at the issuer root with /oidc routes and the line scope', async () => {
    const res = await renkei.fetch(new Request(`${ISSUER}/.well-known/openid-configuration`));
    expect(res.status).toBe(200);
    const d = (await res.json()) as Record<string, unknown>;
    expect(d.issuer).toBe(ISSUER);
    expect(d.authorization_endpoint).toBe(`${ISSUER}/oidc/auth`);
    expect(d.token_endpoint).toBe(`${ISSUER}/oidc/token`);
    expect(d.jwks_uri).toBe(`${ISSUER}/oidc/jwks`);
    expect(d.userinfo_endpoint).toBe(`${ISSUER}/oidc/me`);
    expect(d.scopes_supported).toContain('line');
    expect(d.claims_supported).toEqual(
      expect.arrayContaining(['line:user_id', 'line:friend', 'email']),
    );
  });

  it('logs a user in through LINE with bot_prompt and issues an id_token with line:* claims', async () => {
    const b = new Browser(renkei);
    const { lineUrl, back } = await loginThroughRenkei(b, line, {
      client_id: APP.clientId,
      response_type: 'code',
      redirect_uri: APP.redirectUris[0] as string,
      scope: 'openid profile email line',
      state: 'client-state',
      nonce: 'client-nonce',
      bot_prompt: 'normal',
    });

    // What renkei asked LINE for
    expect(lineUrl.searchParams.get('client_id')).toBe(CHANNEL.channelId);
    expect(lineUrl.searchParams.get('bot_prompt')).toBe('normal');
    expect(lineUrl.searchParams.get('code_challenge_method')).toBe('S256');
    expect(lineUrl.searchParams.get('redirect_uri')).toBe(`${ISSUER}/line/callback`);
    // channel.requestEmail is false → no email scope towards LINE, even though the client asked
    expect(lineUrl.searchParams.get('scope')).toBe('openid profile');

    // Client receives a code
    expect(back.location?.origin).toBe('http://app.test');
    expect(back.location?.searchParams.get('state')).toBe('client-state');
    const code = back.location?.searchParams.get('code');
    expect(code).toBeTruthy();
    expect(b.visited.some((v) => v.startsWith('GET /interaction/'))).toBe(true);
    expect(b.visited.some((v) => v.includes('/finish?t='))).toBe(true);

    // Exchange the code
    const tokenRes = await renkei.fetch(
      new Request(`${ISSUER}/oidc/token`, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          authorization: `Basic ${btoa(`${APP.clientId}:${APP.clientSecret}`)}`,
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: String(code),
          redirect_uri: APP.redirectUris[0] as string,
        }),
      }),
    );
    expect(tokenRes.status).toBe(200);
    const tokens = (await tokenRes.json()) as Record<string, string>;
    expect(tokens.token_type).toBe('Bearer');

    const { payload } = await jwtVerify(tokens.id_token as string, jwks, {
      issuer: ISSUER,
      audience: APP.clientId,
    });
    expect(payload.nonce).toBe('client-nonce');
    expect(payload).toMatchObject({
      name: 'テスト太郎',
      picture: 'https://p/1',
      'line:user_id': 'Uabc',
      'line:friend': true,
      'line:channel_id': CHANNEL.channelId,
      'line:region': 'jp',
    });
    expect(payload.email).toBeUndefined();
    expect(payload.sub).not.toContain('Uabc');

    // userinfo agrees
    const me = await renkei.fetch(
      new Request(`${ISSUER}/oidc/me`, {
        headers: { authorization: `Bearer ${tokens.access_token}` },
      }),
    );
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({
      sub: payload.sub,
      'line:user_id': 'Uabc',
      'line:friend': true,
    });

    // Same LINE user again → same sub (new browser, no session)
    const b2 = new Browser(renkei);
    const again = await loginThroughRenkei(b2, line, {
      client_id: APP.clientId,
      response_type: 'code',
      redirect_uri: APP.redirectUris[0] as string,
      scope: 'openid line',
      state: 's2',
      nonce: 'n2',
    });
    const code2 = again.back.location?.searchParams.get('code');
    const tokens2 = (await (
      await renkei.fetch(
        new Request(`${ISSUER}/oidc/token`, {
          method: 'POST',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            authorization: `Basic ${btoa(`${APP.clientId}:${APP.clientSecret}`)}`,
          },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code: String(code2),
            redirect_uri: APP.redirectUris[0] as string,
          }),
        }),
      )
    ).json()) as Record<string, string>;
    const second = await jwtVerify(tokens2.id_token as string, jwks, {
      issuer: ISSUER,
      audience: APP.clientId,
    });
    expect(second.payload.sub).toBe(payload.sub);
  });

  it('uses the channel default bot_prompt when the client does not pass one', async () => {
    const b = new Browser(renkei);
    const { lineUrl } = await loginThroughRenkei(b, line, {
      client_id: APP.clientId,
      response_type: 'code',
      redirect_uri: APP.redirectUris[0] as string,
      scope: 'openid',
      state: 's',
      nonce: 'n',
    });
    expect(lineUrl.searchParams.get('bot_prompt')).toBe('aggressive');
  });

  it('propagates a LINE cancellation to the client as access_denied', async () => {
    const b = new Browser(renkei);
    const { back } = await loginThroughRenkei(
      b,
      line,
      {
        client_id: APP.clientId,
        response_type: 'code',
        redirect_uri: APP.redirectUris[0] as string,
        scope: 'openid',
        state: 'cancel',
        nonce: 'n',
      },
      (state) =>
        `/line/callback?error=access_denied&error_description=The+user+cancelled&state=${state}`,
    );
    expect(back.location?.origin).toBe('http://app.test');
    expect(back.location?.searchParams.get('error')).toBe('access_denied');
    expect(back.location?.searchParams.get('state')).toBe('cancel');
  });

  it('rejects a callback with an unknown state and a replayed state', async () => {
    const b = new Browser(renkei);
    const unknown = await b.request('/line/callback?code=good-code&state=nope');
    expect(unknown.status).toBe(400);

    const { lineUrl } = await loginThroughRenkei(b, line, {
      client_id: APP.clientId,
      response_type: 'code',
      redirect_uri: APP.redirectUris[0] as string,
      scope: 'openid',
      state: 's',
      nonce: 'n',
    });
    const replay = await b.request(
      `/line/callback?code=good-code&state=${lineUrl.searchParams.get('state')}`,
    );
    expect(replay.status).toBe(400);
  });

  it('requires PKCE for public clients but not for confidential ones', async () => {
    const b = new Browser(renkei);
    const noPkce = new URL('/oidc/auth', ISSUER);
    noPkce.search = new URLSearchParams({
      client_id: SPA.clientId,
      response_type: 'code',
      redirect_uri: SPA.redirectUris[0] as string,
      scope: 'openid',
      state: 's',
      nonce: 'n',
    }).toString();
    const res = await b.navigate(noPkce.toString());
    // oidc-provider redirects the error back to the SPA
    expect(res.location?.origin).toBe('http://spa.test');
    expect(res.location?.searchParams.get('error')).toBe('invalid_request');
    expect(res.location?.searchParams.get('error_description')).toMatch(/pkce|code_challenge/i);
  });

  it('forwards the email claim when LINE returns one and the channel requests it', async () => {
    const emailLine = fakeLine({
      userId: 'Umail',
      name: 'Mail',
      picture: 'https://p/m',
      email: 'mail@example.com',
      friend: false,
    });
    const r = await boot(emailLine, { channels: [{ ...CHANNEL, requestEmail: true }] });
    const b = new Browser(r);
    const auth = new URL('/oidc/auth', ISSUER);
    auth.search = new URLSearchParams({
      client_id: APP.clientId,
      response_type: 'code',
      redirect_uri: APP.redirectUris[0] as string,
      scope: 'openid email line',
      state: 's',
      nonce: 'n',
    }).toString();
    const toLine = await b.navigate(auth.toString());
    expect(toLine.location?.searchParams.get('scope')).toBe('openid profile email');
    emailLine.nonce = toLine.location?.searchParams.get('nonce') ?? '';
    const back = await b.navigate(
      `/line/callback?code=good-code&state=${toLine.location?.searchParams.get('state')}`,
    );
    const code = back.location?.searchParams.get('code');
    const tokens = (await (
      await r.fetch(
        new Request(`${ISSUER}/oidc/token`, {
          method: 'POST',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            authorization: `Basic ${btoa(`${APP.clientId}:${APP.clientSecret}`)}`,
          },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code: String(code),
            redirect_uri: APP.redirectUris[0] as string,
          }),
        }),
      )
    ).json()) as Record<string, string>;
    const keys = await (await r.fetch(new Request(`${ISSUER}/oidc/jwks`))).json();
    const { payload } = await jwtVerify(tokens.id_token as string, createLocalJWKSet(keys), {
      issuer: ISSUER,
    });
    expect(payload).toMatchObject({
      email: 'mail@example.com',
      email_verified: true,
      'line:friend': false,
    });
  });

  it('answers on Keycloak-shaped paths so the Supabase keycloak provider can use renkei', async () => {
    const b = new Browser(renkei);
    const auth = new URL('/protocol/openid-connect/auth', ISSUER);
    auth.search = new URLSearchParams({
      client_id: APP.clientId,
      response_type: 'code',
      redirect_uri: APP.redirectUris[0] as string,
      // Exactly what Supabase's keycloak provider sends: no `openid`, no nonce.
      scope: 'profile email',
      state: 'kc',
    }).toString();
    const toLine = await b.navigate(auth.toString());
    expect(toLine.location?.origin).toBe('https://access.line.me');
    line.nonce = toLine.location?.searchParams.get('nonce') ?? '';
    const back = await b.navigate(
      `/line/callback?code=good-code&state=${toLine.location?.searchParams.get('state')}`,
    );
    const code = back.location?.searchParams.get('code');
    expect(code).toBeTruthy();

    const tokenRes = await renkei.fetch(
      new Request(`${ISSUER}/protocol/openid-connect/token`, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          authorization: `Basic ${btoa(`${APP.clientId}:${APP.clientSecret}`)}`,
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: String(code),
          redirect_uri: APP.redirectUris[0] as string,
        }),
      }),
    );
    expect(tokenRes.status).toBe(200);
    const tokens = (await tokenRes.json()) as Record<string, string>;
    const me = await renkei.fetch(
      new Request(`${ISSUER}/protocol/openid-connect/userinfo`, {
        headers: { authorization: `Bearer ${tokens.access_token}` },
      }),
    );
    expect(me.status).toBe(200);
    // Exactly the shape Supabase's keycloak provider reads: sub, name, email, email_verified
    expect(await me.json()).toMatchObject({ name: 'テスト太郎' });
    const certs = await renkei.fetch(new Request(`${ISSUER}/protocol/openid-connect/certs`));
    expect(certs.status).toBe(200);
    expect(((await certs.json()) as { keys: unknown[] }).keys.length).toBeGreaterThan(0);
    expect((await renkei.fetch(new Request(`${ISSUER}/protocol/openid-connect/nope`))).status).toBe(
      404,
    );
  });
});
