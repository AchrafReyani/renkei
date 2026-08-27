/**
 * Account linking, server side: POST /link/start mints a LINE link token and
 * returns the accountLink dialog URL; the accountLink webhook then finalises
 * the link and flips the `line:linked` claim. No network, no real LINE.
 */
import { createMemoryStorage, type Storage } from 'renkei-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RenkeiConfigInput } from '../src/config.js';
import { createRenkei, type Renkei } from '../src/index.js';

const ISSUER = 'http://renkei.test';
const LOGIN_CHANNEL_ID = '2011257262';
const MSG_SECRET = 'messaging-channel-secret-0123456789';
const MSG_TOKEN = 'messaging-channel-access-token-xyz';
const USER = 'U54de992ad068a07f1d4ef661a0a946bd';
const SUB = 'sub-linktest';
const LINK_TOKEN = 'LT-generated-by-line';

function baseConfig(withAccessToken = true, withMessagingChannelId = true): RenkeiConfigInput {
  return {
    issuer: ISSUER,
    channels: [
      { channelId: LOGIN_CHANNEL_ID, channelSecret: 'login-secret-0123456789', region: 'jp' },
    ],
    messagingChannels: [
      {
        channelSecret: MSG_SECRET,
        region: 'jp',
        ...(withMessagingChannelId ? { channelId: '2011257490' } : {}),
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

/** A fake LINE that answers the linkToken mint. */
function fakeLineFetch() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === `https://api.line.me/v2/bot/user/${USER}/linkToken`) {
      return new Response(JSON.stringify({ linkToken: LINK_TOKEN }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`unexpected LINE call: ${url}`);
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

/** Seed an identity with a login-side LINE account, and mint a real access token for it. */
async function seedIdentityAndToken(r: Renkei, s: Storage, sub = SUB): Promise<string> {
  await s.identities.createIdentity({ sub, displayName: 'Linker' });
  await s.identities.upsertLineAccount({
    identitySub: sub,
    channelId: LOGIN_CHANNEL_ID,
    lineUserId: USER,
    kind: 'login',
  });
  return mintToken(r, sub);
}

async function mintToken(r: Renkei, sub: string): Promise<string> {
  const provider = r.provider;
  const client = await provider.Client.find('app');
  if (!client) throw new Error('client not found');
  const grant = new provider.Grant({ accountId: sub, clientId: 'app' });
  grant.addOIDCScope('openid line');
  grant.addOIDCClaims(['line:linked', 'line:user_id']);
  const grantId = await grant.save();
  const at = new provider.AccessToken({
    accountId: sub,
    client,
    grantId,
    scope: 'openid line',
    gty: 'authorization_code',
  });
  return at.save();
}

let renkei: Renkei;
let storage: Storage;
let lineFetch: ReturnType<typeof fakeLineFetch>;

async function boot(withAccessToken = true, withMessagingChannelId = true) {
  storage = createMemoryStorage();
  lineFetch = fakeLineFetch();
  renkei = await createRenkei({
    config: baseConfig(withAccessToken, withMessagingChannelId),
    storage,
    fetch: lineFetch as unknown as typeof fetch,
    logger: { info() {}, warn() {}, error() {} },
  });
}

async function post(path: string, init: RequestInit = {}): Promise<Response> {
  return renkei.app.fetch(new Request(`${ISSUER}${path}`, { method: 'POST', ...init }));
}

describe('POST /link/start', () => {
  beforeEach(async () => {
    await boot();
  });

  it('mints a link token and returns the accountLink dialog URL', async () => {
    const token = await seedIdentityAndToken(renkei, storage);
    const res = await post('/link/start', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string };
    const url = new URL(body.url);
    expect(url.origin + url.pathname).toBe('https://access.line.me/dialog/bot/accountLink');
    expect(url.searchParams.get('linkToken')).toBe(LINK_TOKEN);
    expect(url.searchParams.get('nonce')).toBeTruthy();
    // renkei called LINE once to mint the token (with the messaging access token).
    expect(lineFetch).toHaveBeenCalledTimes(1);
  });

  it('401s without a bearer token', async () => {
    expect((await post('/link/start')).status).toBe(401);
  });

  it('401s on an unknown/expired token', async () => {
    const res = await post('/link/start', { headers: { authorization: 'Bearer nope' } });
    expect(res.status).toBe(401);
  });

  it('409s when the identity has no LINE login account', async () => {
    await storage.identities.createIdentity({ sub: 'sub-empty' });
    const token = await mintToken(renkei, 'sub-empty');
    const res = await post('/link/start', { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(409);
  });

  it('404s when no messaging channel has an access token', async () => {
    await boot(false);
    const token = await seedIdentityAndToken(renkei, storage);
    const res = await post('/link/start', { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(404);
  });
});

describe('accountLink webhook completion', () => {
  beforeEach(async () => {
    await boot();
  });

  function webhookBody(events: unknown[]): string {
    return JSON.stringify({ destination: 'Ubot', events });
  }

  async function postWebhook(body: string): Promise<Response> {
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

  async function startAndGetNonce(): Promise<{ token: string; nonce: string }> {
    const token = await seedIdentityAndToken(renkei, storage);
    const start = await post('/link/start', { headers: { authorization: `Bearer ${token}` } });
    const { url } = (await start.json()) as { url: string };
    const nonce = new URL(url).searchParams.get('nonce');
    if (!nonce) throw new Error('no nonce');
    return { token, nonce };
  }

  it('links the messaging account and flips line:linked on result ok', async () => {
    const { token, nonce } = await startAndGetNonce();

    const body = webhookBody([
      {
        type: 'accountLink',
        timestamp: 1_700_000_000_000,
        source: { type: 'user', userId: USER },
        link: { result: 'ok', nonce },
      },
    ]);
    expect((await postWebhook(body)).status).toBe(200);

    const accounts = await storage.identities.listLineAccounts(SUB);
    expect(accounts.some((a) => a.kind === 'messaging')).toBe(true);

    // The claim is now true via userinfo.
    const me = await renkei.app.fetch(
      new Request(`${ISSUER}/oidc/me`, { headers: { authorization: `Bearer ${token}` } }),
    );
    expect(me.status).toBe(200);
    expect((await me.json()) as Record<string, unknown>).toMatchObject({ 'line:linked': true });

    // The nonce is one-time: a replay does not error and does not re-link.
    expect((await postWebhook(body)).status).toBe(200);
  });

  it('keeps line:user_id after linking when the messaging channelId is not configured', async () => {
    // Without messagingChannels[].channelId the link is recorded on the login
    // row itself (same provider ⇒ same userId). The identity must not lose its
    // login-side claims as a result — found live on renkei-demo 2026-08-27.
    await boot(true, false);
    const { token, nonce } = await startAndGetNonce();
    const body = webhookBody([
      {
        type: 'accountLink',
        timestamp: 1_700_000_000_000,
        source: { type: 'user', userId: USER },
        link: { result: 'ok', nonce },
      },
    ]);
    expect((await postWebhook(body)).status).toBe(200);

    const accounts = await storage.identities.listLineAccounts(SUB);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({ channelId: LOGIN_CHANNEL_ID, kind: 'messaging' });

    const me = await renkei.app.fetch(
      new Request(`${ISSUER}/oidc/me`, { headers: { authorization: `Bearer ${token}` } }),
    );
    expect(me.status).toBe(200);
    expect((await me.json()) as Record<string, unknown>).toMatchObject({
      'line:linked': true,
      'line:user_id': USER,
      'line:channel_id': LOGIN_CHANNEL_ID,
    });
  });

  it('does not link on result failed, and drops the nonce', async () => {
    const { nonce } = await startAndGetNonce();
    const body = webhookBody([
      {
        type: 'accountLink',
        timestamp: 1,
        source: { type: 'user', userId: USER },
        link: { result: 'failed', nonce },
      },
    ]);
    expect((await postWebhook(body)).status).toBe(200);
    const accounts = await storage.identities.listLineAccounts(SUB);
    expect(accounts.some((a) => a.kind === 'messaging')).toBe(false);
  });

  it('ignores an accountLink with an unknown nonce', async () => {
    const body = webhookBody([
      {
        type: 'accountLink',
        timestamp: 1,
        source: { type: 'user', userId: USER },
        link: { result: 'ok', nonce: 'never-issued' },
      },
    ]);
    expect((await postWebhook(body)).status).toBe(200);
    expect(await storage.identities.listLineAccounts(SUB)).toHaveLength(0);
  });
});
