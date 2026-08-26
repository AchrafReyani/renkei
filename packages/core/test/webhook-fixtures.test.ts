/**
 * Exercise parseWebhook and the event type guards against real-shaped LINE
 * webhook bodies (full wire fields, batched deliveries, non-user sources).
 * Complements webhook.test.ts, which focuses on signature edge cases.
 */

import { describe, expect, it } from 'vitest';
import {
  isAccountLinkEvent,
  isFollowEvent,
  isUnfollowEvent,
  LineWebhookError,
  parseWebhook,
  verifyWebhookSignature,
} from '../src/index.js';
import {
  accountLinkFailedBody,
  accountLinkOkBody,
  FIXTURE_USER,
  followBody,
  groupFollowBody,
  messageBody,
  multiEventBody,
  unfollowBody,
  verifyPingBody,
} from './fixtures/webhooks.js';

const SECRET = 'fixture-messaging-channel-secret-0123456789';

async function sign(body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  let bin = '';
  for (const b of mac) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function parse(body: string) {
  return parseWebhook({ body, signature: await sign(body), channelSecret: SECRET });
}

describe('parseWebhook against real-shaped fixtures', () => {
  it('verifies the signature over the exact fixture bytes', async () => {
    expect(await verifyWebhookSignature(SECRET, followBody, await sign(followBody))).toBe(true);
  });

  it('parses a follow event and keeps the full wire shape', async () => {
    const payload = await parse(followBody);
    expect(payload.destination).toBeTruthy();
    const [event] = payload.events;
    expect(event && isFollowEvent(event)).toBe(true);
    expect(event?.source?.userId).toBe(FIXTURE_USER);
    // Fields renkei does not model survive parsing untouched.
    expect(event?.webhookEventId).toBe('01FZ74A0TDDPYRVKNK77XKC3ZR');
    expect(event?.deliveryContext).toEqual({ isRedelivery: false });
    expect(event?.mode).toBe('active');
  });

  it('parses an unfollow event', async () => {
    const [event] = (await parse(unfollowBody)).events;
    expect(event && isUnfollowEvent(event)).toBe(true);
    expect(event && isFollowEvent(event)).toBe(false);
  });

  it('parses accountLink ok and failed, exposing result and nonce', async () => {
    const okEvent = (await parse(accountLinkOkBody)).events[0];
    expect(okEvent && isAccountLinkEvent(okEvent)).toBe(true);
    if (okEvent && isAccountLinkEvent(okEvent)) {
      expect(okEvent.link.result).toBe('ok');
      expect(okEvent.link.nonce).toBe('xxxxNONCExxxx1234567890');
    }
    const failEvent = (await parse(accountLinkFailedBody)).events[0];
    if (failEvent && isAccountLinkEvent(failEvent)) {
      expect(failEvent.link.result).toBe('failed');
    }
  });

  it('classifies a message as neither follow/unfollow/accountLink', async () => {
    const [event] = (await parse(messageBody)).events;
    expect(event?.type).toBe('message');
    expect(
      event && (isFollowEvent(event) || isUnfollowEvent(event) || isAccountLinkEvent(event)),
    ).toBe(false);
  });

  it('keeps a group-sourced follow but exposes no userId', async () => {
    const [event] = (await parse(groupFollowBody)).events;
    expect(event && isFollowEvent(event)).toBe(true);
    expect(event?.source?.userId).toBeUndefined();
    expect(event?.source?.type).toBe('group');
  });

  it('parses a batched multi-event delivery in order', async () => {
    const events = (await parse(multiEventBody)).events;
    expect(events).toHaveLength(2);
    expect(events[0]?.type).toBe('follow');
    expect(events[1]?.type).toBe('message');
  });

  it('parses the console "Verify" empty ping', async () => {
    const payload = await parse(verifyPingBody);
    expect(payload.events).toHaveLength(0);
  });

  it('rejects a fixture whose signature was made with the wrong secret', async () => {
    const wrong = await (async () => {
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode('a-different-secret'),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      );
      const mac = new Uint8Array(
        await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(followBody)),
      );
      let bin = '';
      for (const b of mac) bin += String.fromCharCode(b);
      return btoa(bin);
    })();
    await expect(
      parseWebhook({ body: followBody, signature: wrong, channelSecret: SECRET }),
    ).rejects.toBeInstanceOf(LineWebhookError);
  });
});
