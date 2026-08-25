import { LINE_ENDPOINTS } from './channel.js';
import { readLineError } from './errors.js';
import type { FetchOptions } from './token.js';

export interface AccessTokenInfo {
  /** Granted scopes, space separated. */
  scope: string;
  /** The channel ID the token was issued for. Must match one of your channels. */
  client_id: string;
  expires_in: number;
}

/**
 * Validate a LINE access token (`GET /oauth2/v2.1/verify?access_token=`).
 * This is how a LIFF app's `liff.getAccessToken()` is checked server-side:
 * never trust the token without this, and always check `client_id` is one
 * of your own channels — a valid token from someone else's channel is still
 * a valid token.
 */
export async function verifyAccessToken(
  accessToken: string,
  options: FetchOptions = {},
): Promise<AccessTokenInfo> {
  const f = options.fetch ?? fetch;
  const url = new URL(LINE_ENDPOINTS.verify);
  url.searchParams.set('access_token', accessToken);
  const res = await f(url.toString());
  if (!res.ok) throw await readLineError('verify', res);
  return (await res.json()) as AccessTokenInfo;
}
