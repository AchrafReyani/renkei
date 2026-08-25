import { LINE_ENDPOINTS } from './channel.js';
import { readLineError } from './errors.js';
import type { FetchOptions } from './token.js';

export interface LineProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
  statusMessage?: string;
}

/** `GET /v2/profile` with a LINE Login access token. Never trust profile data sent by a client — call this server-side. */
export async function getProfile(
  accessToken: string,
  options: FetchOptions = {},
): Promise<LineProfile> {
  const f = options.fetch ?? fetch;
  const res = await f(LINE_ENDPOINTS.profile, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw await readLineError('profile', res);
  return (await res.json()) as LineProfile;
}
