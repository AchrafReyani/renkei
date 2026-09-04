/**
 * Multi-region: several LINE Login channels, one per region. `line_region` on
 * the authorization request (or a client's pinned `lineRegion`) picks the
 * channel; the id_token carries that channel's `line:region`; and because LINE
 * user IDs are per provider, the same person logging in through two channels of
 * one provider keeps a single `sub`.
 */
import { createLocalJWKSet, decodeJwt, jwtVerify, SignJWT } from 'jose';
import { createMemoryStorage } from 'renkei-core';
import { beforeAll, describe, expect, it } from 'vitest';
import { configFromEnv } from '../src/env.js';
import { createRenkei, parseConfig, type Renkei } from '../src/index.js';

const ISSUER = 'http://renkei.test';
const JP = {
  channelId: '2011257262',
  channelSecret: 'jp-channel-secret-0123456789',
  region: 'jp',
};
const TW = {
  channelId: '2011447387',
  channelSecret: 'tw-channel-secret-0123456789',
  region: 'tw',
};
const APP = {
  clientId: 'app',
  clientSecret: 'app-secret-0123456789abcdef',
  redirectUris: ['http://app.test/cb'],
};
/** A client pinned to Taiwan: its users never see the JP channel. */
const TW_APP = {
  clientId: 'tw-app',
  clientSecret: 'tw-app-secret-0123456789abcdef',
  redirectUris: ['http://tw-app.test/cb'],
  lineRegion: 'tw',
};

// One LINE user ID: both channels sit under the same LINE provider.
const USER = { userId: 'Umultiregion', name: '多地域太郎', picture: 'https://p/mr' };

/** Fake LINE that answers as whichever channel the request names. */
function fakeLine() {
  const channels = [JP, TW];
  const state = { nonce: '', calls: [] as string[] };
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
  const lineFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === 'https://api.line.me/oauth2/v2.1/token') {
      const body = init?.body as URLSearchParams;
      const channelId = body.get('client_id') ?? '';
      const channel = channels.find((c) => c.channelId === channelId);
      state.calls.push(`token ${channelId}`);
      if (!channel || body.get('client_secret') !== channel.channelSecret) {
        return json({ error: 'invalid_client' }, 401);
      }
      const now = Math.floor(Date.now() / 1000);
      const idToken = await new SignJWT({
        name: USER.name,
        picture: USER.picture,
        nonce: state.nonce,
        amr: ['linesso'],
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuer('https://access.line.me')
        .setAudience(channel.channelId)
        .setSubject(USER.userId)
        .setIssuedAt(now)
        .setExpirationTime(now + 3600)
        .sign(new TextEncoder().encode(channel.channelSecret));
      return json({
        access_token: `at-${channel.region}`,
        token_type: 'Bearer',
        expires_in: 60,
        id_token: idToken,
      });
    }
    if (url === 'https://api.line.me/v2/profile')
      return json({ userId: USER.userId, displayName: USER.name, pictureUrl: USER.picture });
    if (url === 'https://api.line.me/friendship/v1/status') return json({ friendFlag: true });
    throw new Error(`unexpected LINE call: ${url}`);
  }) as typeof globalThis.fetch;
  return { fetch: lineFetch, state };
}

describe('configuring several channels from the environment', () => {
  const base = {
    ISSUER,
    LINE_LOGIN_CHANNEL_ID: JP.channelId,
    LINE_LOGIN_CHANNEL_SECRET: JP.channelSecret,
  };

  it('appends RENKEI_CHANNELS to the primary LINE_LOGIN_* channel', () => {
    const cfg = parseConfig(
      configFromEnv({
        ...base,
        RENKEI_CHANNELS: JSON.stringify([{ ...TW, botPrompt: 'none' }]),
      }).config,
    );
    expect(cfg.channels.map((c) => [c.channelId, c.region, c.kind])).toEqual([
      [JP.channelId, 'jp', 'login'],
      [TW.channelId, 'tw', 'login'],
    ]);
    // Per-channel settings from the JSON win over the primary channel's env defaults.
    expect(cfg.channels[1]?.botPrompt).toBe('none');
    expect(cfg.channels[0]?.botPrompt).toBe('aggressive');
  });

  it('accepts RENKEI_CHANNELS on its own, and combines with the MINI App shorthand', () => {
    const cfg = parseConfig(
      configFromEnv({
        ISSUER,
        RENKEI_CHANNELS: JSON.stringify([JP, TW]),
        LINE_MINIAPP_CHANNEL_ID: '2011444277',
        LINE_MINIAPP_CHANNEL_SECRET: 'miniapp-secret-0123456789',
      }).config,
    );
    expect(cfg.channels.map((c) => [c.channelId, c.kind])).toEqual([
      [JP.channelId, 'login'],
      [TW.channelId, 'login'],
      ['2011444277', 'miniapp'],
    ]);
  });

  it('still explains itself when no channel is configured at all', () => {
    expect(() => configFromEnv({ ISSUER })).toThrow(/LINE_LOGIN_CHANNEL_ID is not set/);
    expect(() => configFromEnv({ ISSUER })).toThrow(/RENKEI_CHANNELS/);
    expect(() => configFromEnv({ ISSUER, LINE_LOGIN_CHANNEL_ID: JP.channelId })).toThrow(
      /LINE_LOGIN_CHANNEL_SECRET is not set/,
    );
  });

  it('gives the messaging channel its own region', () => {
    const cfg = parseConfig(
      configFromEnv({
        ...base,
        RENKEI_CHANNELS: JSON.stringify([TW]),
        LINE_MESSAGING_CHANNEL_SECRET: 'messaging-secret-0123456789',
        LINE_MESSAGING_CHANNEL_REGION: 'tw',
      }).config,
    );
    expect(cfg.messagingChannels[0]?.region).toBe('tw');
  });
});

describe('routing logins by region', () => {
  let renkei: Renkei;
  let line: ReturnType<typeof fakeLine>;
  let jwks: ReturnType<typeof createLocalJWKSet>;

  beforeAll(async () => {
    line = fakeLine();
    renkei = await createRenkei({
      storage: createMemoryStorage(),
      fetch: line.fetch,
      logger: { info() {}, warn() {}, error() {} },
      config: {
        issuer: ISSUER,
        dev: true,
        channels: [JP, TW],
        clients: [
          APP,
          TW_APP,
          {
            clientId: 'renkei-dev',
            clientSecret: 'renkei-dev-secret',
            redirectUris: [`${ISSUER}/dev/callback`],
          },
        ],
        cookieKeys: ['cookie-key-0123456789abcdef'],
      },
    });
    jwks = createLocalJWKSet(await (await renkei.fetch(new Request(`${ISSUER}/oidc/jwks`))).json());
  });

  /** Drive a full login and return the id_token the client receives. */
  async function login(client: typeof APP, params: Record<string, string> = {}) {
    const jar = new Map<string, string>();
    const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const visit = async (url: string) => {
      const res = await renkei.fetch(
        new Request(url, { headers: { cookie: cookieHeader() }, redirect: 'manual' }),
      );
      for (const raw of res.headers.getSetCookie()) {
        const [pair] = raw.split(';');
        const eq = pair?.indexOf('=') ?? -1;
        if (pair && eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
      }
      return res;
    };
    const follow = async (from: string) => {
      let current = from;
      for (let i = 0; i < 10; i++) {
        const res = await visit(current);
        const loc = res.headers.get('location');
        if (!loc) return { res, location: undefined };
        const next = new URL(loc, ISSUER);
        if (next.origin !== ISSUER) return { res, location: next };
        current = next.toString();
      }
      throw new Error('too many redirects');
    };

    const auth = new URL(`${ISSUER}/oidc/auth`);
    auth.searchParams.set('client_id', client.clientId);
    auth.searchParams.set('response_type', 'code');
    auth.searchParams.set('redirect_uri', client.redirectUris[0] as string);
    auth.searchParams.set('scope', 'openid profile line');
    auth.searchParams.set('state', 's');
    auth.searchParams.set('nonce', `n-${Math.random()}`);
    for (const [k, v] of Object.entries(params)) auth.searchParams.set(k, v);

    const toLine = await follow(auth.toString());
    const lineUrl = toLine.location as URL;
    expect(lineUrl.origin).toBe('https://access.line.me');
    line.state.nonce = lineUrl.searchParams.get('nonce') ?? '';
    const state = lineUrl.searchParams.get('state') ?? '';

    const back = await follow(`${ISSUER}/line/callback?code=good&state=${state}`);
    const code = (back.location as URL).searchParams.get('code') as string;
    const token = await renkei.fetch(
      new Request(`${ISSUER}/oidc/token`, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          authorization: `Basic ${btoa(`${client.clientId}:${client.clientSecret}`)}`,
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: client.redirectUris[0] as string,
        }),
      }),
    );
    expect(token.status).toBe(200);
    const tokens = (await token.json()) as { id_token: string };
    const { payload } = await jwtVerify(tokens.id_token, jwks, {
      issuer: ISSUER,
      audience: client.clientId,
    });
    return { payload, lineUrl };
  }

  it('sends the user to the LINE channel named by line_region, and stamps line:region', async () => {
    const tw = await login(APP, { line_region: 'tw' });
    expect(tw.lineUrl.searchParams.get('client_id')).toBe(TW.channelId);
    expect(tw.lineUrl.searchParams.get('redirect_uri')).toBe(`${ISSUER}/line/callback`);
    expect(tw.payload['line:channel_id']).toBe(TW.channelId);
    expect(tw.payload['line:region']).toBe('tw');
    expect(tw.payload['line:user_id']).toBe(USER.userId);
    // The token exchange authenticated as the TW channel (its own secret).
    expect(line.state.calls.at(-1)).toBe(`token ${TW.channelId}`);
  });

  it('falls back to the first Login channel with no region, or an unknown one', async () => {
    const fallback = await login(APP);
    expect(fallback.lineUrl.searchParams.get('client_id')).toBe(JP.channelId);
    expect(fallback.payload['line:region']).toBe('jp');

    const unknown = await login(APP, { line_region: 'zz' });
    expect(unknown.lineUrl.searchParams.get('client_id')).toBe(JP.channelId);
    expect(unknown.payload['line:region']).toBe('jp');
  });

  it("honours a client's pinned lineRegion without any parameter", async () => {
    const pinned = await login(TW_APP);
    expect(pinned.lineUrl.searchParams.get('client_id')).toBe(TW.channelId);
    expect(pinned.payload['line:region']).toBe('tw');
  });

  it('keeps one sub across regions of the same provider, with an account row per channel', async () => {
    const jp = await login(APP, { line_region: 'jp' });
    const tw = await login(APP, { line_region: 'tw' });
    expect(tw.payload.sub).toBe(jp.payload.sub);

    const accounts = await renkei.storage.identities.listLineAccounts(jp.payload.sub as string);
    expect(accounts.map((a) => a.channelId).sort()).toEqual([JP.channelId, TW.channelId].sort());
    expect(new Set(accounts.map((a) => a.lineUserId))).toEqual(new Set([USER.userId]));
    // line:region follows the channel of the most recent login.
    expect(tw.payload['line:region']).toBe('tw');
    const backToJp = await login(APP, { line_region: 'jp' });
    expect(backToJp.payload['line:region']).toBe('jp');
    expect(backToJp.payload.sub).toBe(jp.payload.sub);
  });

  it('the /dev page links one login per region and passes line_region through', async () => {
    const page = await (await renkei.fetch(new Request(`${ISSUER}/dev`))).text();
    expect(page).toContain('/dev/login?line_region=jp');
    expect(page).toContain('/dev/login?line_region=tw');
    const res = await renkei.fetch(
      new Request(`${ISSUER}/dev/login?line_region=tw`, { redirect: 'manual' }),
    );
    expect(new URL(res.headers.get('location') ?? '').searchParams.get('line_region')).toBe('tw');
  });

  it('exchanges a LIFF token from either region against its own channel', async () => {
    const now = Math.floor(Date.now() / 1000);
    const liffToken = await new SignJWT({ name: USER.name, amr: ['linesso'] })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('https://access.line.me')
      .setAudience(TW.channelId)
      .setSubject(USER.userId)
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(new TextEncoder().encode(TW.channelSecret));
    const res = await renkei.fetch(
      new Request(`${ISSUER}/liff/exchange`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Basic ${btoa(`${APP.clientId}:${APP.clientSecret}`)}`,
        },
        body: JSON.stringify({ id_token: liffToken }),
      }),
    );
    expect(res.status).toBe(200);
    const claims = decodeJwt(((await res.json()) as { id_token: string }).id_token);
    expect(claims['line:region']).toBe('tw');
    expect(claims['line:channel_id']).toBe(TW.channelId);
  });
});
