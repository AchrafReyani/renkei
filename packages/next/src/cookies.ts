/**
 * Cookie plumbing that works on plain `Request` / `Response` objects, so the
 * same code runs in Route Handlers, `proxy.ts` / `middleware.ts` and tests
 * without importing anything from Next.
 */
import { EncryptJWT, jwtDecrypt } from 'jose';

/** Derive the 256-bit content-encryption key from the app secret. */
export async function deriveKey(secret: string): Promise<Uint8Array> {
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new TypeError('secret must be a string of at least 32 characters');
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return new Uint8Array(digest);
}

/** Seal a JSON payload into a compact JWE (`dir` / `A256GCM`) that expires after `maxAge` seconds. */
export async function seal(
  payload: Record<string, unknown>,
  key: Uint8Array,
  maxAge: number,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new EncryptJWT(payload)
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt(now)
    .setExpirationTime(now + maxAge)
    .encrypt(key);
}

/** Open a sealed cookie value; `undefined` for anything missing, tampered or expired. */
export async function unseal<T extends Record<string, unknown>>(
  value: string | undefined,
  key: Uint8Array,
): Promise<T | undefined> {
  if (!value) return undefined;
  try {
    const { payload } = await jwtDecrypt(value, key);
    return payload as T;
  } catch {
    return undefined;
  }
}

/** Read one cookie from a `Cookie` request header. */
export function readCookie(headers: Headers, name: string): string | undefined {
  const raw = headers.get('cookie');
  if (!raw) return undefined;
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}

export interface CookieAttributes {
  /** Seconds; `0` deletes the cookie. */
  maxAge: number;
  secure: boolean;
  path?: string;
  sameSite?: 'Lax' | 'Strict';
}

/** Serialise a `Set-Cookie` header value: HttpOnly, SameSite=Lax, Path=/ by default. */
export function serializeCookie(name: string, value: string, attrs: CookieAttributes): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${attrs.path ?? '/'}`,
    'HttpOnly',
    `SameSite=${attrs.sameSite ?? 'Lax'}`,
    `Max-Age=${attrs.maxAge}`,
  ];
  if (attrs.maxAge <= 0) parts.push('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  if (attrs.secure) parts.push('Secure');
  return parts.join('; ');
}
