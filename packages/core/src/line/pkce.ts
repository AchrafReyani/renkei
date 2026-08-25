/**
 * PKCE (RFC 7636) and random-token helpers built on WebCrypto only, so they
 * run identically on Node, Deno, Bun and Cloudflare Workers.
 */

export interface PkcePair {
  /** `code_verifier`: 43-128 chars of [A-Za-z0-9-._~]. Keep server-side until the token exchange. */
  verifier: string;
  /** `code_challenge` = base64url(sha256(verifier)). Goes in the authorize URL. */
  challenge: string;
  method: 'S256';
}

export function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Cryptographically random, URL-safe token. 32 bytes → 43 chars. */
export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return base64url(buf);
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

export async function generatePkce(): Promise<PkcePair> {
  const verifier = randomToken(32);
  return { verifier, challenge: await pkceChallenge(verifier), method: 'S256' };
}
