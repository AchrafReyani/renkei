import { describe, expect, it } from 'vitest';
import {
  isAccountLinkEvent,
  isFollowEvent,
  isUnfollowEvent,
  LineWebhookError,
  type LineWebhookPayload,
  parseWebhook,
  verifyWebhookSignature,
} from '../src/index.js';

const CHANNEL_SECRET = 'test-messaging-channel-secret';

/** Compute a valid x-line-signature the way LINE does: base64(HMAC-SHA256(secret, body)). */
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

const payload: LineWebhookPayload = {
  destination: 'U0000000000000000000000000000bot',
  events: [
    {
      type: 'follow',
      timestamp: 1_700_000_000_000,
      mode: 'active',
      source: { type: 'user', userId: 'U54de992ad068a07f1d4ef661a0a946bd' },
      webhookEventId: '01F00000000000000000000000',
      deliveryContext: { isRedelivery: false },
      replyToken: 'reply-1',
      follow: { isUnblocked: false },
    },
    {
      type: 'unfollow',
      timestamp: 1_700_000_100_000,
      source: { type: 'user', userId: 'U54de992ad068a07f1d4ef661a0a946bd' },
    },
    {
      type: 'accountLink',
      timestamp: 1_700_000_200_000,
      source: { type: 'user', userId: 'U54de992ad068a07f1d4ef661a0a946bd' },
      link: { result: 'ok', nonce: 'nonce-123' },
      replyToken: 'reply-2',
    },
    {
      type: 'message',
      timestamp: 1_700_000_300_000,
      source: { type: 'user', userId: 'U54de992ad068a07f1d4ef661a0a946bd' },
    },
  ],
};
const body = JSON.stringify(payload);

describe('verifyWebhookSignature', () => {
  it('accepts a correct signature', async () => {
    const sig = await sign(CHANNEL_SECRET, body);
    expect(await verifyWebhookSignature(CHANNEL_SECRET, body, sig)).toBe(true);
  });

  it('rejects a tampered body', async () => {
    const sig = await sign(CHANNEL_SECRET, body);
    expect(await verifyWebhookSignature(CHANNEL_SECRET, `${body} `, sig)).toBe(false);
  });

  it('rejects the wrong secret', async () => {
    const sig = await sign(CHANNEL_SECRET, body);
    expect(await verifyWebhookSignature('other-secret', body, sig)).toBe(false);
  });

  it('rejects a missing or non-base64 signature', async () => {
    expect(await verifyWebhookSignature(CHANNEL_SECRET, body, null)).toBe(false);
    expect(await verifyWebhookSignature(CHANNEL_SECRET, body, '')).toBe(false);
    expect(await verifyWebhookSignature(CHANNEL_SECRET, body, 'not base64 %%%')).toBe(false);
  });

  it('works with a Uint8Array body', async () => {
    const bytes = new TextEncoder().encode(body);
    const sig = await sign(CHANNEL_SECRET, body);
    expect(await verifyWebhookSignature(CHANNEL_SECRET, bytes, sig)).toBe(true);
  });
});

describe('parseWebhook', () => {
  it('parses a valid signed payload into typed events', async () => {
    const sig = await sign(CHANNEL_SECRET, body);
    const result = await parseWebhook({ body, signature: sig, channelSecret: CHANNEL_SECRET });

    expect(result.destination).toBe(payload.destination);
    expect(result.events).toHaveLength(4);

    const follow = result.events.find(isFollowEvent);
    expect(follow?.source?.userId).toBe('U54de992ad068a07f1d4ef661a0a946bd');
    expect(follow?.follow?.isUnblocked).toBe(false);

    expect(result.events.some(isUnfollowEvent)).toBe(true);

    const link = result.events.find(isAccountLinkEvent);
    expect(link?.link.result).toBe('ok');
    expect(link?.link.nonce).toBe('nonce-123');
  });

  it('throws on a bad signature (reason: signature)', async () => {
    await expect(
      parseWebhook({ body, signature: 'AAAA', channelSecret: CHANNEL_SECRET }),
    ).rejects.toMatchObject({ name: 'LineWebhookError', reason: 'signature' });
  });

  it('throws on non-JSON body (reason: malformed)', async () => {
    const bad = 'not json';
    const sig = await sign(CHANNEL_SECRET, bad);
    await expect(
      parseWebhook({ body: bad, signature: sig, channelSecret: CHANNEL_SECRET }),
    ).rejects.toMatchObject({ name: 'LineWebhookError', reason: 'malformed' });
  });

  it('throws when destination/events are missing (reason: malformed)', async () => {
    const bad = JSON.stringify({ hello: 'world' });
    const sig = await sign(CHANNEL_SECRET, bad);
    await expect(
      parseWebhook({ body: bad, signature: sig, channelSecret: CHANNEL_SECRET }),
    ).rejects.toMatchObject({ name: 'LineWebhookError', reason: 'malformed' });
  });

  it('surfaces LineWebhookError as the error type', async () => {
    const err = await parseWebhook({
      body,
      signature: 'AAAA',
      channelSecret: CHANNEL_SECRET,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(LineWebhookError);
  });
});
