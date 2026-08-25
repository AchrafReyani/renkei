import { LineAuthorizationError } from './errors.js';

export interface LineCallback {
  code: string;
  state: string;
  /**
   * `true` when the user added the linked Official Account as a friend during
   * this login (`bot_prompt` was shown and accepted). Absent when the friend
   * prompt was not shown. Informational only — the friendship API is the
   * source of truth.
   */
  friendshipStatusChanged?: boolean;
  /** LIFF-only: the LIFF client ID that initiated the login. */
  liffClientId?: string;
  /** LIFF-only: the redirect URI the LIFF app asked for. */
  liffRedirectUri?: string;
}

/**
 * Parse the query string LINE sends to the callback URL. Throws
 * `LineAuthorizationError` when LINE returned an OAuth error (user cancelled,
 * invalid request, ...). Does **not** check `state` — the caller owns the
 * session that holds the expected value.
 */
export function parseCallback(input: string | URL | URLSearchParams): LineCallback {
  const params =
    input instanceof URLSearchParams
      ? input
      : new URL(typeof input === 'string' ? input : input.toString(), 'http://localhost')
          .searchParams;

  const error = params.get('error');
  if (error) {
    throw new LineAuthorizationError(
      error,
      params.get('error_description') ?? undefined,
      params.get('state') ?? undefined,
    );
  }
  const code = params.get('code');
  const state = params.get('state');
  if (!code || !state) {
    throw new LineAuthorizationError('invalid_callback', 'missing code or state');
  }
  const result: LineCallback = { code, state };
  const fsc = params.get('friendship_status_changed');
  if (fsc !== null) result.friendshipStatusChanged = fsc === 'true';
  const liffClientId = params.get('liffClientId');
  if (liffClientId) result.liffClientId = liffClientId;
  const liffRedirectUri = params.get('liffRedirectUri');
  if (liffRedirectUri) result.liffRedirectUri = liffRedirectUri;
  return result;
}
