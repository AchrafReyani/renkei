import {
  createRemoteJWKSet,
  decodeProtectedHeader,
  type JWTPayload,
  type JWTVerifyGetKey,
  errors as joseErrors,
  jwtVerify,
} from 'jose';
import { LINE_ENDPOINTS, type LineLoginChannel } from './channel.js';
import { LineIdTokenError, readLineError } from './errors.js';
import type { FetchOptions } from './token.js';

/**
 * Claims LINE puts in an id_token. `email` is present only when the channel
 * has email permission *and* the user consented. LINE never returns email
 * from the userinfo endpoint — the id_token is the only source.
 */
export interface LineIdTokenClaims {
  iss: 'https://access.line.me';
  sub: string;
  aud: string;
  exp: number;
  iat: number;
  auth_time?: number;
  nonce?: string;
  /** Authentication methods: `pwd`, `lineautologin`, `lineqr`, `linesso`, `mfa`. */
  amr?: string[];
  name?: string;
  picture?: string;
  email?: string;
}

export interface VerifyIdTokenParams {
  channel: Pick<LineLoginChannel, 'channelId' | 'channelSecret'>;
  /** Expected `nonce`; verification fails if the claim differs or is missing. */
  nonce?: string;
  /**
   * Key resolver for ES256 tokens. Defaults to LINE's JWKS endpoint with
   * jose's built-in caching. Inject `createLocalJWKSet(...)` in tests.
   */
  jwks?: JWTVerifyGetKey;
  /** Clock skew tolerance in seconds. Default 60. */
  clockTolerance?: number;
  /** Override "now" for tests. */
  currentDate?: Date;
}

let defaultJwks: JWTVerifyGetKey | undefined;
function lineJwks(): JWTVerifyGetKey {
  defaultJwks ??= createRemoteJWKSet(new URL(LINE_ENDPOINTS.certs));
  return defaultJwks;
}

/**
 * Verify a LINE id_token **locally**.
 *
 * LINE signs id_tokens with HS256 (key = channel secret) by default, or ES256
 * (key from LINE's JWKS) when the channel opts in. Both are handled here.
 * This is the primary verification path; `verifyIdTokenViaLine` is the
 * network fallback / test oracle.
 */
export async function verifyIdToken(
  idToken: string,
  params: VerifyIdTokenParams,
): Promise<LineIdTokenClaims> {
  let alg: string | undefined;
  try {
    alg = decodeProtectedHeader(idToken).alg;
  } catch (cause) {
    throw new LineIdTokenError('malformed', 'id_token is not a JWS', { cause });
  }

  const verifyOptions = {
    issuer: LINE_ENDPOINTS.issuer,
    audience: params.channel.channelId,
    clockTolerance: params.clockTolerance ?? 60,
    ...(params.currentDate ? { currentDate: params.currentDate } : {}),
  };

  let payload: JWTPayload;
  try {
    if (alg === 'HS256') {
      const key = new TextEncoder().encode(params.channel.channelSecret);
      ({ payload } = await jwtVerify(idToken, key, { ...verifyOptions, algorithms: ['HS256'] }));
    } else if (alg === 'ES256') {
      ({ payload } = await jwtVerify(idToken, params.jwks ?? lineJwks(), {
        ...verifyOptions,
        algorithms: ['ES256'],
      }));
    } else {
      throw new LineIdTokenError('unsupported_alg', `unsupported id_token alg: ${alg ?? 'none'}`);
    }
  } catch (cause) {
    if (cause instanceof LineIdTokenError) throw cause;
    throw mapJoseError(cause);
  }

  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new LineIdTokenError('missing_sub', 'id_token has no sub');
  }
  if (params.nonce !== undefined && payload.nonce !== params.nonce) {
    throw new LineIdTokenError('nonce', 'id_token nonce mismatch');
  }
  return payload as unknown as LineIdTokenClaims;
}

function mapJoseError(cause: unknown): LineIdTokenError {
  if (cause instanceof joseErrors.JWTExpired) {
    return new LineIdTokenError('expired', 'id_token expired', { cause });
  }
  if (cause instanceof joseErrors.JWTClaimValidationFailed) {
    const reason =
      cause.claim === 'iss' ? 'issuer' : cause.claim === 'aud' ? 'audience' : 'signature';
    return new LineIdTokenError(reason, `id_token claim invalid: ${cause.claim}`, { cause });
  }
  if (cause instanceof joseErrors.JWSSignatureVerificationFailed) {
    return new LineIdTokenError('signature', 'id_token signature invalid', { cause });
  }
  if (cause instanceof joseErrors.JOSEError) {
    return new LineIdTokenError('malformed', `id_token invalid: ${cause.code}`, { cause });
  }
  return new LineIdTokenError('malformed', 'id_token verification failed', { cause });
}

export interface VerifyViaLineParams {
  channelId: string;
  nonce?: string;
  /** If provided, LINE also checks that the token belongs to this user. */
  userId?: string;
}

/**
 * Ask LINE to verify an id_token (`POST /oauth2/v2.1/verify`). Useful as a
 * fallback when local keys are unavailable, and as a test oracle for the
 * local implementation. Costs a network round-trip; prefer `verifyIdToken`.
 */
export async function verifyIdTokenViaLine(
  idToken: string,
  params: VerifyViaLineParams,
  options: FetchOptions = {},
): Promise<LineIdTokenClaims> {
  const f = options.fetch ?? fetch;
  const body = new URLSearchParams({ id_token: idToken, client_id: params.channelId });
  if (params.nonce) body.set('nonce', params.nonce);
  if (params.userId) body.set('user_id', params.userId);
  const res = await f(LINE_ENDPOINTS.verify, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw await readLineError('verify', res);
  return (await res.json()) as LineIdTokenClaims;
}
