import { LINE_ENDPOINTS } from './channel.js';
import { readLineError } from './errors.js';
import type { FetchOptions } from './token.js';

/**
 * Whether the user is friends with the Official Account linked to the Login
 * channel (`GET /friendship/v1/status`). Requires a linked OA; without one
 * LINE answers 4xx. This — not `friendship_status_changed` on the callback —
 * is the source of truth right after login; webhooks keep it current later.
 */
export async function getFriendshipStatus(
  accessToken: string,
  options: FetchOptions = {},
): Promise<boolean> {
  const f = options.fetch ?? fetch;
  const res = await f(LINE_ENDPOINTS.friendship, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw await readLineError('friendship', res);
  const body = (await res.json()) as { friendFlag: boolean };
  return body.friendFlag === true;
}
