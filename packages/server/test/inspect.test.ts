/**
 * The read-only /inspect endpoints: admin-token gating, identity/account
 * lookups, and the recent-webhook log. No network, no real LINE.
 */
import { createMemoryStorage, type Storage } from 'renkei-core';
import { beforeEach, describe, expect, it } from 'vitest';
import type { RenkeiConfigInput } from '../src/config.js';
import { createRenkei, type Renkei } from '../src/index.js';

const ISSUER = 'http://renkei.test';
const LOGIN_CHANNEL_ID = '2011257262';
const MSG_SECRET = 'messaging-channel-secret-0123456789';
const ADMIN = 'admin-token-abcdef 0123456789'.replace(' ', '-');
const USER = 'U54de992ad068a07f1d4ef661a0a946bd';
const SUB = 'sub-inspect';

function config(withAdmin = true): RenkeiConfigInput {
  return {
    issuer: ISSUER,
    channels: [
      { channelId: LOGIN_CHANNEL_ID, channelSecret: 'login-secret-0123456789', region: 'jp' },
    ],
    messagingChannels: [{ channelSecret: MSG_SECRET, region: 'jp' }],
    clients: [
      {
        clientId: 'app',
        clientSecret: 'app-secret-0123456789abcdef',
        redirectUris: ['http://app.test/cb'],
      },
    ],
    cookieKeys: ['0123456789abcdef0123'],
    ...(withAdmin ? { adminToken: ADMIN } : {}),
  };
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

async function boot(withAdmin = true) {
  storage = createMemoryStorage();
  renkei = await createRenkei({
    config: config(withAdmin),
    storage,
    logger: { info() {}, warn() {}, error() {} },
  });
}

async function get(path: string, token?: string): Promise<Response> {
  return renkei.app.fetch(
    new Request(`${ISSUER}${path}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }),
  );
}

async function seed() {
  await storage.identities.createIdentity({
    sub: SUB,
    displayName: 'Inspected',
    email: 'i@x.test',
  });
  await storage.identities.upsertLineAccount({
    identitySub: SUB,
    channelId: LOGIN_CHANNEL_ID,
    lineUserId: USER,
    kind: 'login',
    friend: true,
  });
}

describe('/inspect gating', () => {
  it('is not mounted without an admin token (404 for the page and api)', async () => {
    await boot(false);
    expect((await get('/inspect')).status).toBe(404);
    expect((await get('/inspect/api/webhooks', ADMIN)).status).toBe(404);
  });

  it('serves the HTML shell without auth but gates the api', async () => {
    await boot();
    const page = await get('/inspect');
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    const html = await page.text();
    expect(html).toContain('renkei inspect');
    // The shell must call the API under its own mount path. A bare relative
    // fetch('api/...') resolves to /api/... from /inspect and 404s (found live).
    expect(html).not.toMatch(/fetch\('api\//);
    expect(html).toContain("location.pathname.replace(/\\/+$/, '') + '/api/'");

    expect((await get('/inspect/api/webhooks')).status).toBe(401); // no token
    expect((await get('/inspect/api/webhooks', 'wrong')).status).toBe(401);
    expect((await get('/inspect/api/webhooks', ADMIN)).status).toBe(200);
  });
});

describe('/inspect lookups', () => {
  beforeEach(async () => {
    await boot();
    await seed();
  });

  it('returns an identity with its LINE accounts by sub', async () => {
    const res = await get(`/inspect/api/identity/${SUB}`, ADMIN);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      identity: { sub: string; email?: string };
      linked: boolean;
      accounts: Array<{ lineUserId: string; kind: string; region?: string; friend?: boolean }>;
    };
    expect(body.identity.sub).toBe(SUB);
    expect(body.linked).toBe(false);
    expect(body.accounts).toHaveLength(1);
    expect(body.accounts[0]).toMatchObject({
      lineUserId: USER,
      kind: 'login',
      region: 'jp',
      friend: true,
    });
  });

  it('resolves an identity by LINE channel + userId', async () => {
    const res = await get(`/inspect/api/line/${LOGIN_CHANNEL_ID}/${USER}`, ADMIN);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { identity: { sub: string } }).identity.sub).toBe(SUB);
  });

  it('404s on an unknown sub', async () => {
    expect((await get('/inspect/api/identity/nope', ADMIN)).status).toBe(404);
  });

  it('reflects linked=true once a messaging account exists', async () => {
    await storage.identities.upsertLineAccount({
      identitySub: SUB,
      channelId: '2011257490',
      lineUserId: USER,
      kind: 'messaging',
    });
    const body = (await (await get(`/inspect/api/identity/${SUB}`, ADMIN)).json()) as {
      linked: boolean;
    };
    expect(body.linked).toBe(true);
  });
});

describe('/inspect recent webhooks', () => {
  beforeEach(async () => {
    await boot();
  });

  async function postWebhook(events: unknown[]): Promise<Response> {
    const body = JSON.stringify({ destination: 'Ubot', events });
    return renkei.app.fetch(
      new Request(`${ISSUER}/line/webhook`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-line-signature': await sign(MSG_SECRET, body),
        },
        body,
      }),
    );
  }

  it('records received events, newest first', async () => {
    await postWebhook([
      { type: 'follow', timestamp: 1, source: { type: 'user', userId: USER } },
      { type: 'message', timestamp: 2, source: { type: 'user', userId: USER } },
    ]);
    const body = (await (await get('/inspect/api/webhooks', ADMIN)).json()) as {
      events: Array<{ type: string; userId?: string; verified: boolean }>;
    };
    expect(body.events.map((e) => e.type)).toEqual(['message', 'follow']);
    expect(body.events.every((e) => e.verified)).toBe(true);
  });

  it('records a rejected (unverified) delivery', async () => {
    const body = JSON.stringify({ destination: 'Ubot', events: [] });
    await renkei.app.fetch(
      new Request(`${ISSUER}/line/webhook`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-line-signature': 'bad' },
        body,
      }),
    );
    const log = (await (await get('/inspect/api/webhooks', ADMIN)).json()) as {
      events: Array<{ type: string; verified: boolean }>;
    };
    expect(log.events[0]).toMatchObject({ type: '(unverified)', verified: false });
  });
});
