/**
 * The Messaging API webhook route: signature verification and mirroring
 * follow/unfollow into the identity store. No network, no real LINE.
 */
import { createMemoryStorage } from 'renkei-core';
import { beforeAll, describe, expect, it } from 'vitest';
import type { RenkeiConfigInput } from '../src/config.js';
import { createRenkei, type Renkei } from '../src/index.js';

const ISSUER = 'http://renkei.test';
const LOGIN_CHANNEL_ID = '2011257262';
const MSG_SECRET = 'messaging-channel-secret-0123456789';

const config: RenkeiConfigInput = {
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
};

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

const USER = 'U54de992ad068a07f1d4ef661a0a946bd';

function webhookBody(events: unknown[]): string {
  return JSON.stringify({ destination: 'Ubotbotbotbotbotbotbotbotbotbot', events });
}

interface SetFriendshipCall {
  channelId: string;
  userId: string;
  friend: boolean;
}

let renkei: Renkei;
let calls: SetFriendshipCall[];

beforeAll(async () => {
  const storage = createMemoryStorage();
  calls = [];
  const original = storage.identities.setFriendship.bind(storage.identities);
  storage.identities.setFriendship = async (channelId, userId, friend, at) => {
    calls.push({ channelId, userId, friend });
    return original(channelId, userId, friend, at);
  };
  renkei = await createRenkei({ config, storage });
});

async function post(body: string, signature: string | null): Promise<Response> {
  return renkei.app.fetch(
    new Request(`${ISSUER}/line/webhook`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(signature ? { 'x-line-signature': signature } : {}),
      },
      body,
    }),
  );
}

describe('POST /line/webhook', () => {
  it('rejects a request with no/invalid signature (401)', async () => {
    const body = webhookBody([
      { type: 'follow', timestamp: 1, source: { type: 'user', userId: USER } },
    ]);
    expect((await post(body, null)).status).toBe(401);
    expect((await post(body, 'not-a-valid-sig')).status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it('mirrors a follow event into friendship=true', async () => {
    const body = webhookBody([
      { type: 'follow', timestamp: 1_700_000_000_000, source: { type: 'user', userId: USER } },
    ]);
    const res = await post(body, await sign(MSG_SECRET, body));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(calls).toContainEqual({ channelId: LOGIN_CHANNEL_ID, userId: USER, friend: true });
  });

  it('mirrors an unfollow event into friendship=false', async () => {
    calls.length = 0;
    const body = webhookBody([
      { type: 'unfollow', timestamp: 1_700_000_100_000, source: { type: 'user', userId: USER } },
    ]);
    const res = await post(body, await sign(MSG_SECRET, body));
    expect(res.status).toBe(200);
    expect(calls).toContainEqual({ channelId: LOGIN_CHANNEL_ID, userId: USER, friend: false });
  });

  it('ignores events without a userId and other event types', async () => {
    calls.length = 0;
    const body = webhookBody([
      { type: 'message', timestamp: 1, source: { type: 'user', userId: USER } },
      { type: 'follow', timestamp: 2, source: { type: 'group', groupId: 'G1' } },
      {
        type: 'accountLink',
        timestamp: 3,
        source: { type: 'user', userId: USER },
        link: { result: 'ok', nonce: 'n' },
      },
    ]);
    const res = await post(body, await sign(MSG_SECRET, body));
    expect(res.status).toBe(200);
    // message → not friendship; group follow → no userId; accountLink → logged, not friendship.
    expect(calls).toHaveLength(0);
  });

  it('returns 400 on a valid signature but malformed body', async () => {
    const body = 'not json';
    const res = await post(body, await sign(MSG_SECRET, body));
    expect(res.status).toBe(400);
  });
});
