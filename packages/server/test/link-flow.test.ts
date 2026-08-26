/**
 * The browser-initiated /link flow: GET /link logs the user in at (a fake)
 * LINE on the shared callback, then redirects to the accountLink dialog; the
 * accountLink webhook finalises the link. No network, no real LINE.
 */
import { SignJWT } from 'jose';
import { createMemoryStorage, type Storage } from 'renkei-core';
import { beforeEach, describe, expect, it } from 'vitest';
import type { RenkeiConfigInput } from '../src/config.js';
import { createRenkei, type Renkei } from '../src/index.js';

const ISSUER = 'http://renkei.test';
const LOGIN_CHANNEL_ID = '2011257262';
const LOGIN_SECRET = 'login-secret-0123456789';
const MSG_SECRET = 'messaging-channel-secret-0123456789';
const MSG_TOKEN = 'messaging-channel-access-token-xyz';
const USER = 'U54de992ad068a07f1d4ef661a0a946bd';
const LINK_TOKEN = 'LT-from-line';

function baseConfig(withAccessToken = true): RenkeiConfigInput {
  return {
    issuer: ISSUER,
    channels: [{ channelId: LOGIN_CHANNEL_ID, channelSecret: LOGIN_SECRET, region: 'jp' }],
    messagingChannels: [
      {
        channelSecret: MSG_SECRET,
        region: 'jp',
        channelId: '2011257490',
        ...(withAccessToken ? { channelAccessToken: MSG_TOKEN } : {}),
      },
    ],
    clients: [
      {
        clientId: 'app',
        clientSecret: 'app-secret-0123456789abcdef',
        redirectUris: ['http://app.test/cb'],
      },
    ],
    cookieKeys: ['0123456789abcdef0123'],
  };
}

/** Fake LINE: token endpoint (signs an id_token with the captured nonce), profile, linkToken. */
function fakeLine() {
  const state = { nonce: '' };
  const fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === 'https://api.line.me/oauth2/v2.1/token') {
      const now = Math.floor(Date.now() / 1000);
      const idToken = await new SignJWT({ name: 'Linker', nonce: state.nonce })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuer('https://access.line.me')
        .setAudience(LOGIN_CHANNEL_ID)
        .setSubject(USER)
        .setIssuedAt(now)
        .setExpirationTime(now + 3600)
        .sign(new TextEncoder().encode(LOGIN_SECRET));
      return json({ access_token: 'line-at', token_type: 'Bearer', id_token: idToken });
    }
    if (url === 'https://api.line.me/v2/profile') {
      return json({ userId: USER, displayName: 'Linker' });
    }
    if (url === `https://api.line.me/v2/bot/user/${USER}/linkToken`) {
      return json({ linkToken: LINK_TOKEN });
    }
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

async function sign(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  let bin = '';
  for (const b of mac) bin += String.fromCharCode(b);
  return btoa(bin);
}

let renkei: Renkei;
let storage: Storage;
let line: ReturnType<typeof fakeLine>;

async function boot(withAccessToken = true) {
  storage = createMemoryStorage();
  line = fakeLine();
  renkei = await createRenkei({
    config: baseConfig(withAccessToken),
    storage,
    fetch: line.fetch,
    logger: { info() {}, warn() {}, error() {} },
  });
}

const req = (path: string, init?: RequestInit) =>
  renkei.app.fetch(new Request(`${ISSUER}${path}`, { redirect: 'manual', ...init }));

describe('GET /link (browser-initiated account linking)', () => {
  beforeEach(async () => {
    await boot();
  });

  it('redirects to LINE login, then to the accountLink dialog after callback', async () => {
    // 1. /link → LINE authorize
    const toLine = await req('/link');
    expect(toLine.status).toBe(302);
    const authorize = new URL(toLine.headers.get('location') as string);
    expect(authorize.origin).toBe('https://access.line.me');
    const state = authorize.searchParams.get('state');
    line.state.nonce = authorize.searchParams.get('nonce') ?? '';
    expect(state).toBeTruthy();

    // 2. LINE returns to the shared callback → accountLink dialog
    const back = await req(`/line/callback?code=good-code&state=${state}`);
    expect(back.status).toBe(302);
    const dialog = new URL(back.headers.get('location') as string);
    expect(dialog.origin + dialog.pathname).toBe('https://access.line.me/dialog/bot/accountLink');
    expect(dialog.searchParams.get('linkToken')).toBe(LINK_TOKEN);
    const nonce = dialog.searchParams.get('nonce');
    expect(nonce).toBeTruthy();

    // 3. accountLink webhook finalises → line:linked
    const body = JSON.stringify({
      destination: 'Ubot',
      events: [
        {
          type: 'accountLink',
          timestamp: 1,
          source: { type: 'user', userId: USER },
          link: { result: 'ok', nonce },
        },
      ],
    });
    const hook = await renkei.app.fetch(
      new Request(`${ISSUER}/line/webhook`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-line-signature': await sign(MSG_SECRET, body),
        },
        body,
      }),
    );
    expect(hook.status).toBe(200);

    const identity = await storage.identities.findIdentityByLineAccount(LOGIN_CHANNEL_ID, USER);
    expect(identity).toBeDefined();
    const accounts = await storage.identities.listLineAccounts(identity?.sub ?? '');
    expect(accounts.some((a) => a.kind === 'messaging')).toBe(true);
  });

  it('404s when no messaging channel has an access token', async () => {
    await boot(false);
    expect((await req('/link')).status).toBe(404);
  });

  it('shows a cancelled message when the user declines at LINE', async () => {
    const toLine = await req('/link');
    const state = new URL(toLine.headers.get('location') as string).searchParams.get('state');
    const res = await req(`/line/callback?error=access_denied&state=${state}`);
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('cancelled');
  });

  it('still logs in normally (login flow is unaffected by the link branch)', async () => {
    // A callback with an unknown state is rejected, not treated as a link flow.
    const res = await req('/line/callback?code=good-code&state=bogus');
    expect(res.status).toBe(400);
  });
});
