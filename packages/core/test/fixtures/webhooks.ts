/**
 * Real-shaped LINE Messaging API webhook bodies, stored as the exact raw
 * strings LINE would POST (so a signature computed over these bytes matches
 * what verifyWebhookSignature sees). Field shapes follow LINE's documented
 * webhook objects — `webhookEventId`, `deliveryContext`, `mode`, `replyToken`,
 * `follow.isUnblocked` — including fields renkei does not model, to prove they
 * pass through parsing untouched.
 *
 * These are hand-authored to match the documented wire format, not captured
 * from a live channel (renkei has no test channel with a webhook yet).
 */

export const FIXTURE_USER = 'U4af4980629bd0a67f2b8e9a1c3d5e7f9';
export const FIXTURE_BOT = 'U0a1b2c3d4e5f60718293a4b5c6d7e8f9';

/** Single follow event, full wire shape (a first-time add: isUnblocked false). */
export const followBody = JSON.stringify({
  destination: FIXTURE_BOT,
  events: [
    {
      type: 'follow',
      mode: 'active',
      timestamp: 1_699_999_999_999,
      source: { type: 'user', userId: FIXTURE_USER },
      webhookEventId: '01FZ74A0TDDPYRVKNK77XKC3ZR',
      deliveryContext: { isRedelivery: false },
      replyToken: '0f3779fba3b349968c5d07db31eab56f',
      follow: { isUnblocked: false },
    },
  ],
});

/** Single unfollow event. */
export const unfollowBody = JSON.stringify({
  destination: FIXTURE_BOT,
  events: [
    {
      type: 'unfollow',
      mode: 'active',
      timestamp: 1_700_000_100_000,
      source: { type: 'user', userId: FIXTURE_USER },
      webhookEventId: '01FZ74CAQ2DGGA20N3EAJ5W2PB',
      deliveryContext: { isRedelivery: false },
    },
  ],
});

/** accountLink success — the nonce renkei issued at /link/start comes back here. */
export const accountLinkOkBody = JSON.stringify({
  destination: FIXTURE_BOT,
  events: [
    {
      type: 'accountLink',
      mode: 'active',
      timestamp: 1_700_000_200_000,
      source: { type: 'user', userId: FIXTURE_USER },
      webhookEventId: '01FZ74D9M0M8Z9V6E6Q0S6C8R7',
      deliveryContext: { isRedelivery: false },
      replyToken: 'b60d432864f44d079f6d8efe86cf404b',
      link: { result: 'ok', nonce: 'xxxxNONCExxxx1234567890' },
    },
  ],
});

/** accountLink failure (user declined or the token expired). */
export const accountLinkFailedBody = JSON.stringify({
  destination: FIXTURE_BOT,
  events: [
    {
      type: 'accountLink',
      mode: 'active',
      timestamp: 1_700_000_300_000,
      source: { type: 'user', userId: FIXTURE_USER },
      webhookEventId: '01FZ74EJ8Q0R2T4V6X8Z0B2D4F',
      deliveryContext: { isRedelivery: false },
      replyToken: 'a10d432864f44d079f6d8efe86cf9999',
      link: { result: 'failed', nonce: 'xxxxNONCExxxx1234567890' },
    },
  ],
});

/** A text message — a generic event renkei does not act on. */
export const messageBody = JSON.stringify({
  destination: FIXTURE_BOT,
  events: [
    {
      type: 'message',
      mode: 'active',
      timestamp: 1_700_000_400_000,
      source: { type: 'user', userId: FIXTURE_USER },
      webhookEventId: '01FZ74F0000000000000000000',
      deliveryContext: { isRedelivery: false },
      replyToken: 'c20d432864f44d079f6d8efe86cf1111',
      message: { type: 'text', id: '14353798921116', text: 'こんにちは' },
    },
  ],
});

/** A group-sourced follow — there is no userId to key friendship on. */
export const groupFollowBody = JSON.stringify({
  destination: FIXTURE_BOT,
  events: [
    {
      type: 'follow',
      mode: 'active',
      timestamp: 1_700_000_500_000,
      source: { type: 'group', groupId: 'Ca56f94637cc4347f90a25382909b24b9' },
      webhookEventId: '01FZ74G0000000000000000000',
      deliveryContext: { isRedelivery: false },
    },
  ],
});

/** One delivery carrying several events (LINE batches). */
export const multiEventBody = JSON.stringify({
  destination: FIXTURE_BOT,
  events: [
    {
      type: 'follow',
      mode: 'active',
      timestamp: 1_700_000_600_000,
      source: { type: 'user', userId: FIXTURE_USER },
      webhookEventId: '01FZ74H0000000000000000001',
      deliveryContext: { isRedelivery: false },
      replyToken: 'd30d432864f44d079f6d8efe86cf2222',
    },
    {
      type: 'message',
      mode: 'active',
      timestamp: 1_700_000_600_001,
      source: { type: 'user', userId: FIXTURE_USER },
      webhookEventId: '01FZ74H0000000000000000002',
      deliveryContext: { isRedelivery: false },
      replyToken: 'e40d432864f44d079f6d8efe86cf3333',
      message: { type: 'text', id: '14353798921117', text: 'hi' },
    },
  ],
});

/** An empty verify/health ping — LINE sends this from the console's "Verify". */
export const verifyPingBody = JSON.stringify({ destination: FIXTURE_BOT, events: [] });
