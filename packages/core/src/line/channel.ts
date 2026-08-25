/**
 * A LINE Login channel as configured in the LINE Developers Console.
 *
 * One channel serves one region (Japan, Taiwan, Thailand, ...). A service
 * that operates in several regions has one channel per region; renkei routes
 * between them. All channels of one service must live under the same LINE
 * *provider*, otherwise user IDs differ between Login, LIFF and Messaging API.
 */
export interface LineLoginChannel {
  /** Channel ID, e.g. "2011257262". Used as OAuth `client_id`. */
  channelId: string;
  /** Channel secret. Used as OAuth `client_secret` and as the HS256 key for id_tokens. */
  channelSecret: string;
  /** Region the channel serves. Informational; LINE never tells us at runtime. */
  region?: LineRegion;
  /** LIFF app IDs that belong to this channel (prefix is the channel ID). */
  liffIds?: string[];
}

export type LineRegion = 'jp' | 'tw' | 'th' | (string & {});

/** LINE Platform endpoints. Centralised so spec changes are one-line fixes. */
export const LINE_ENDPOINTS = {
  authorize: 'https://access.line.me/oauth2/v2.1/authorize',
  token: 'https://api.line.me/oauth2/v2.1/token',
  verify: 'https://api.line.me/oauth2/v2.1/verify',
  certs: 'https://api.line.me/oauth2/v2.1/certs',
  profile: 'https://api.line.me/v2/profile',
  friendship: 'https://api.line.me/friendship/v1/status',
  issuer: 'https://access.line.me',
} as const;
