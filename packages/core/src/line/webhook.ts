/**
 * LINE Messaging API webhook parsing and signature verification.
 *
 * LINE POSTs webhook events (a user adds/removes the Official Account,
 * completes account linking, …) to the bot's webhook URL. Each request carries
 * an `x-line-signature` header: the base64 of HMAC-SHA256(channel secret, raw
 * body). renkei uses `follow` / `unfollow` to keep friendship state current
 * after login, and `accountLink` to bind a LINE account to a downstream
 * account via a nonce.
 *
 * The **Messaging API** channel secret signs webhooks — not the Login channel
 * secret. Signature verification uses Web Crypto so it runs unchanged on Node,
 * Deno, workerd and edge runtimes.
 */

/** Something was wrong with a webhook request. */
export class LineWebhookError extends Error {
  override readonly name = 'LineWebhookError';
  constructor(
    readonly reason: 'signature' | 'malformed',
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

/** Where an event originated. `userId` is absent for some group/room events. */
export interface LineEventSource {
  type: 'user' | 'group' | 'room' | (string & {});
  userId?: string;
  groupId?: string;
  roomId?: string;
}

interface LineEventBase {
  type: string;
  /** Milliseconds since epoch, from LINE. */
  timestamp: number;
  /** 'active' normally; 'standby' in a multi-bot setup. */
  mode?: string;
  source?: LineEventSource;
  webhookEventId?: string;
  deliveryContext?: { isRedelivery: boolean };
  replyToken?: string;
}

/** The user added the Official Account as a friend (or unblocked it). */
export interface LineFollowEvent extends LineEventBase {
  type: 'follow';
  follow?: { isUnblocked?: boolean };
}

/** The user removed/blocked the Official Account. */
export interface LineUnfollowEvent extends LineEventBase {
  type: 'unfollow';
}

/** Result of an account-link flow started with a renkei-issued nonce. */
export interface LineAccountLinkEvent extends LineEventBase {
  type: 'accountLink';
  link: { result: 'ok' | 'failed'; nonce: string };
}

/** Any other event type renkei does not model explicitly (message, join, …). */
export interface LineGenericEvent extends LineEventBase {
  type: string;
  [key: string]: unknown;
}

export type LineWebhookEvent =
  | LineFollowEvent
  | LineUnfollowEvent
  | LineAccountLinkEvent
  | LineGenericEvent;

export interface LineWebhookPayload {
  /** The bot user ID that should receive these events. */
  destination: string;
  events: LineWebhookEvent[];
}

/** Raw request body, exactly as LINE sent it (the signature is over these bytes). */
export type RawBody = string | Uint8Array;

function toBytes(body: RawBody): Uint8Array {
  return typeof body === 'string' ? new TextEncoder().encode(body) : body;
}

function bodyText(body: RawBody): string {
  return typeof body === 'string' ? body : new TextDecoder().decode(body);
}

function base64ToBytes(b64: string): Uint8Array | null {
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** Constant-time comparison; false immediately on length mismatch. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] as number) ^ (b[i] as number);
  return diff === 0;
}

/**
 * Verify the `x-line-signature` header against the raw body using the
 * Messaging API channel secret. Returns a boolean; it never throws on a bad
 * signature (only on a missing crypto implementation, which cannot happen on
 * a supported runtime).
 */
export async function verifyWebhookSignature(
  channelSecret: string,
  body: RawBody,
  signature: string | null | undefined,
): Promise<boolean> {
  if (!signature) return false;
  const expected = base64ToBytes(signature);
  if (!expected) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(channelSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, toBytes(body) as BufferSource));
  return timingSafeEqual(mac, expected);
}

export interface ParseWebhookParams {
  /** Raw request body bytes/string — must be the exact bytes LINE sent. */
  body: RawBody;
  /** The `x-line-signature` request header. */
  signature: string | null | undefined;
  /** Messaging API channel secret. */
  channelSecret: string;
}

/**
 * Verify the signature and parse the webhook body into typed events.
 * Throws {@link LineWebhookError} with reason `signature` if the signature does
 * not match, or `malformed` if the body is not a valid webhook payload.
 */
export async function parseWebhook(params: ParseWebhookParams): Promise<LineWebhookPayload> {
  const ok = await verifyWebhookSignature(params.channelSecret, params.body, params.signature);
  if (!ok) {
    throw new LineWebhookError('signature', 'webhook signature verification failed');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText(params.body));
  } catch (cause) {
    throw new LineWebhookError('malformed', 'webhook body is not valid JSON', { cause });
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as { destination?: unknown }).destination !== 'string' ||
    !Array.isArray((parsed as { events?: unknown }).events)
  ) {
    throw new LineWebhookError('malformed', 'webhook body is missing destination or events');
  }

  return parsed as LineWebhookPayload;
}

/** Narrowing helper: the user added/unblocked the Official Account. */
export function isFollowEvent(e: LineWebhookEvent): e is LineFollowEvent {
  return e.type === 'follow';
}

/** Narrowing helper: the user removed/blocked the Official Account. */
export function isUnfollowEvent(e: LineWebhookEvent): e is LineUnfollowEvent {
  return e.type === 'unfollow';
}

/** Narrowing helper: an account-link result. */
export function isAccountLinkEvent(e: LineWebhookEvent): e is LineAccountLinkEvent {
  return e.type === 'accountLink';
}
