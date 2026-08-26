/**
 * Option B: forwarded (app-owned) account linking. renkei verifies LINE's
 * signature and relays accountLink events whose nonce it does not own to a
 * configured app URL, signed so the app can trust them. No network.
 */
import { createMemoryStorage, type Storage, verifyWebhookSignature } from 'renkei-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RenkeiConfigInput } from '../src/config.js';
import { createRenkei, type Renkei } from '../src/index.js';

const ISSUER = 'http://renkei.test';
const LOGIN_CHANNEL_ID = '2011257262';
const MSG_SECRET = 'messaging-channel-secret-0123456789';
const FORWARD_URL = 'https://app.test/hooks/renkei-accountlink';
const FWD_SECRET = 'forward-shared-secret-0123456789';
const USER = 'U54de992ad068a07f1d4ef661a0a946bd';

interface Forwarded {
  url: string;
  body: string;
  signature: string | null;
}

function config(withSecret = true): RenkeiConfigInput {
  return {
    issuer: ISSUER,
    channels: [
      { channelId: LOGIN_CHANNEL_ID, channelSecret: 'login-secret-0123456789', region: 'jp' },
    ],
    messagingChannels: [
      {
        channelSecret: MSG_SECRET,
        region: 'jp',
        channelId: '2011257490',
        accountLinkForwardUrl: FORWARD_URL,
        ...(withSecret ? { accountLinkForwardSecret: FWD_SECRET } : {}),
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
let forwarded: Forwarded[];

async function boot(withSecret = true) {
  storage = createMemoryStorage();
  forwarded = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === FORWARD_URL) {
      const headers = new Headers(init?.headers);
      forwarded.push({
        url,
        body: String(init?.body ?? ''),
        signature: headers.get('x-renkei-signature'),
      });
      return new Response('ok', { status: 200 });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  renkei = await createRenkei({
    config: config(withSecret),
    storage,
    fetch: fetch as unknown as typeof globalThis.fetch,
    logger: { info() {}, warn() {}, error() {} },
  });
}

function accountLinkBody(nonce: string, result = 'ok'): string {
  return JSON.stringify({
    destination: 'Ubot',
    events: [
      {
        type: 'accountLink',
        timestamp: 1_700_000_000_000,
        source: { type: 'user', userId: USER },
        link: { result, nonce },
      },
    ],
  });
}

async function post(body: string): Promise<Response> {
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

describe('accountLink forwarding (Option B)', () => {
  beforeEach(async () => {
    await boot();
  });

  it('forwards an app-owned (unknown-nonce) accountLink, signed', async () => {
    const body = accountLinkBody('app-owned-nonce-123');
    expect((await post(body)).status).toBe(200);

    expect(forwarded).toHaveLength(1);
    const f = forwarded[0];
    if (!f) throw new Error('nothing forwarded');
    const payload = JSON.parse(f.body) as {
      type: string;
      userId: string;
      nonce: string;
      result: string;
    };
    expect(payload).toMatchObject({
      type: 'accountLink',
      userId: USER,
      nonce: 'app-owned-nonce-123',
      result: 'ok',
    });
    // The forward is signed so the app can verify it (same scheme as LINE).
    expect(await verifyWebhookSignature(FWD_SECRET, f.body, f.signature)).toBe(true);
  });

  it('forwards failed results too', async () => {
    await post(accountLinkBody('n2', 'failed'));
    expect(JSON.parse(forwarded[0]?.body ?? '{}').result).toBe('failed');
  });

  it('does NOT forward a renkei-owned nonce (Option A takes precedence)', async () => {
    await storage.identities.createIdentity({ sub: 'sub-A' });
    // Seed a renkei-owned pending link (as /link/start would).
    await storage.payloads.upsert('renkei:link', 'renkei-owned-nonce', { sub: 'sub-A' }, 600);

    expect((await post(accountLinkBody('renkei-owned-nonce'))).status).toBe(200);
    expect(forwarded).toHaveLength(0);
    const accounts = await storage.identities.listLineAccounts('sub-A');
    expect(accounts.some((a) => a.kind === 'messaging')).toBe(true);
  });

  it('omits the signature header when no forward secret is configured', async () => {
    await boot(false);
    await post(accountLinkBody('n3'));
    expect(forwarded[0]?.signature).toBeNull();
  });
});
