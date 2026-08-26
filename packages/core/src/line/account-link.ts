/**
 * LINE account linking (Messaging API "Linking user accounts").
 *
 * The flow renkei drives:
 *  1. `issueLinkToken()` — POST /v2/bot/user/{userId}/linkToken with the
 *     Messaging API channel access token → a one-time `linkToken` (~10 min).
 *     This needs the LINE `userId`, which renkei already knows from Login.
 *  2. `buildAccountLinkUrl()` — redirect the user to the accountLink dialog
 *     with the `linkToken` and a caller-generated one-time `nonce`.
 *  3. The user consents; LINE delivers an `accountLink` webhook carrying the
 *     same `nonce` and the `userId`. The caller resolves `nonce → account`
 *     (renkei stores `nonce → sub`) and records the link.
 *
 * `startAccountLink()` bundles steps 1–2. All calls take an injectable fetch
 * so they run unchanged on Node/Deno/workerd/edge and are testable offline.
 */
import { LINE_ENDPOINTS } from './channel.js';
import { readLineError } from './errors.js';
import type { FetchOptions } from './token.js';

/**
 * Mint a one-time link token for a LINE user. Requires the **Messaging API**
 * channel access token (not the channel secret). The token is short-lived and
 * single-use — mint one per link attempt, right before redirecting.
 */
export async function issueLinkToken(
  userId: string,
  channelAccessToken: string,
  options: FetchOptions = {},
): Promise<string> {
  const f = options.fetch ?? fetch;
  const res = await f(`${LINE_ENDPOINTS.messagingUser}/${encodeURIComponent(userId)}/linkToken`, {
    method: 'POST',
    headers: { authorization: `Bearer ${channelAccessToken}` },
  });
  if (!res.ok) throw await readLineError('linkToken', res);
  const body = (await res.json()) as { linkToken?: string };
  if (!body.linkToken) {
    throw new Error('LINE linkToken response had no linkToken field');
  }
  return body.linkToken;
}

export interface AccountLinkUrlParams {
  /** From `issueLinkToken()`. */
  linkToken: string;
  /**
   * One-time, caller-generated value tying this link to a specific account.
   * Echoed back on the `accountLink` webhook. Use a cryptographically random
   * string (e.g. `randomToken()`); LINE accepts 10–255 characters.
   */
  nonce: string;
}

/** Build the accountLink consent-dialog URL to redirect the user to. */
export function buildAccountLinkUrl(params: AccountLinkUrlParams): string {
  const url = new URL(LINE_ENDPOINTS.accountLinkDialog);
  url.searchParams.set('linkToken', params.linkToken);
  url.searchParams.set('nonce', params.nonce);
  return url.toString();
}

export interface StartAccountLinkParams {
  /** The LINE user ID to link (renkei's `line:user_id` / the login `sub`'s account). */
  userId: string;
  /** Messaging API channel access token. */
  channelAccessToken: string;
  /** One-time nonce the caller has stored against the account being linked. */
  nonce: string;
}

/**
 * Mint a link token and build the accountLink dialog URL in one step. The
 * caller is responsible for generating `nonce` and persisting `nonce → account`
 * (with a TTL) before redirecting, and for handling the `accountLink` webhook.
 */
export async function startAccountLink(
  params: StartAccountLinkParams,
  options: FetchOptions = {},
): Promise<{ url: string; linkToken: string }> {
  const linkToken = await issueLinkToken(params.userId, params.channelAccessToken, options);
  const url = buildAccountLinkUrl({ linkToken, nonce: params.nonce });
  return { url, linkToken };
}
