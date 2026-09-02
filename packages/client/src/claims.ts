/**
 * Claim names renkei adds on top of standard OIDC. Mirrors `LINE_CLAIMS` in
 * renkei-core (a test keeps the two in step) so this package stays
 * dependency-free and browser-sized.
 */
export const LINE_CLAIMS = {
  userId: 'line:user_id',
  friend: 'line:friend',
  channelId: 'line:channel_id',
  region: 'line:region',
  linked: 'line:linked',
} as const;

/** The OIDC scope that releases the `line:*` claims. */
export const LINE_SCOPE = 'line';

/** What the SDK asks for when no scope is given. */
export const DEFAULT_SCOPE = 'openid profile email line';

/** Standard OIDC claims renkei issues (id_token, `/oidc/me`, `/session`, `/liff/exchange`). */
export interface StandardClaims {
  iss?: string;
  sub: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  auth_time?: number;
  nonce?: string;
  /** LINE's value when known (e.g. `["linesso"]`), `["liff"]` for a LIFF exchange without one. */
  amr?: string[];
  name?: string;
  picture?: string;
  email?: string;
  email_verified?: boolean;
  /** `true` when `email` is a `placeholderEmailDomain` address, not one LINE returned. */
  email_placeholder?: boolean;
}

/** The `line:*` claims, present when the `line` scope was granted. */
export interface LineClaims {
  /** LINE user ID (`U…`) on the login channel. */
  'line:user_id'?: string;
  /** Whether the user is a friend of the channel's official account (undefined = unknown). */
  'line:friend'?: boolean;
  /** The LINE Login channel the account belongs to. */
  'line:channel_id'?: string;
  /** Region of that channel (`jp`, `tw`, `th`, …) as configured on the server. */
  'line:region'?: string;
  /** Whether the user completed Messaging API account linking. */
  'line:linked'?: boolean;
}

export type RenkeiClaims = StandardClaims & LineClaims & Record<string, unknown>;

/**
 * Read the payload of a JWT **without verifying its signature**.
 *
 * Use it on tokens you just received from renkei over TLS (the `id_token` of
 * a LIFF exchange or a code exchange) to show the user's name or read
 * `line:*` flags in the UI. A backend that *trusts* the token must verify it
 * against `${issuer}/oidc/jwks` (jose, openid-client, your framework's OIDC
 * layer) — this function is not a substitute for that.
 */
export function decodeClaimsUnverified(token: string): RenkeiClaims {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) throw new TypeError('not a JWT');
  let payload: unknown;
  try {
    payload = JSON.parse(base64UrlDecode(parts[1]));
  } catch {
    throw new TypeError('JWT payload is not valid JSON');
  }
  if (
    typeof payload !== 'object' ||
    payload === null ||
    typeof (payload as { sub?: unknown }).sub !== 'string'
  ) {
    throw new TypeError('JWT payload has no sub');
  }
  return payload as RenkeiClaims;
}

/** `line:friend`, treating unknown as `false`. */
export function isFriend(claims: RenkeiClaims): boolean {
  return claims[LINE_CLAIMS.friend] === true;
}

/** `line:linked`, treating unknown as `false`. */
export function isLinked(claims: RenkeiClaims): boolean {
  return claims[LINE_CLAIMS.linked] === true;
}

function base64UrlDecode(input: string): string {
  const b64 = input
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(input.length / 4) * 4, '=');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
