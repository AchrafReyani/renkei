/**
 * PKCE + random-string helpers on Web Crypto, so a public (browser / mobile /
 * Workers) client can call `loginUrl({ codeChallenge })` without another
 * library. renkei requires PKCE for clients with `tokenEndpointAuthMethod:
 * 'none'` and accepts it from confidential ones.
 */

export interface Pkce {
  /** Keep this in the session; send it as `code_verifier` when exchanging the code. */
  verifier: string;
  /** Send this as `code_challenge` in the authorize request. */
  challenge: string;
  method: 'S256';
}

/** A URL-safe random string — use it for `state` and `nonce`. */
export function randomString(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  return base64Url(buf);
}

/** A fresh PKCE verifier and its S256 challenge. */
export async function generatePkce(): Promise<Pkce> {
  const verifier = randomString(32);
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier),
  );
  return { verifier, challenge: base64Url(new Uint8Array(digest)), method: 'S256' };
}

function base64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
