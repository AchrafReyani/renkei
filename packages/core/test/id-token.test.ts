import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { LineIdTokenError, verifyIdToken } from '../src/index.js';

const channel = { channelId: '2011257262', channelSecret: 'test-channel-secret-0123456789' };
const now = Math.floor(Date.now() / 1000);

function baseClaims(extra: Record<string, unknown> = {}) {
  return {
    sub: 'U0123456789abcdef0123456789abcdef',
    name: 'テスト太郎',
    picture: 'https://profile.line-scdn.net/x',
    email: 'taro@example.com',
    amr: ['pwd'],
    nonce: 'nonce-1',
    ...extra,
  };
}

async function hs256(
  claims: Record<string, unknown>,
  opts: { iss?: string; aud?: string; exp?: number; secret?: string } = {},
) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(opts.iss ?? 'https://access.line.me')
    .setAudience(opts.aud ?? channel.channelId)
    .setIssuedAt(now)
    .setExpirationTime(opts.exp ?? now + 3600)
    .sign(new TextEncoder().encode(opts.secret ?? channel.channelSecret));
}

describe('verifyIdToken HS256 (channel secret)', () => {
  it('accepts a valid token and returns LINE claims incl. email', async () => {
    const token = await hs256(baseClaims());
    const claims = await verifyIdToken(token, { channel, nonce: 'nonce-1' });
    expect(claims.sub).toBe('U0123456789abcdef0123456789abcdef');
    expect(claims.email).toBe('taro@example.com');
    expect(claims.name).toBe('テスト太郎');
    expect(claims.amr).toEqual(['pwd']);
    expect(claims.iss).toBe('https://access.line.me');
  });

  it('rejects a wrong channel secret', async () => {
    const token = await hs256(baseClaims(), { secret: 'other-secret' });
    await expect(verifyIdToken(token, { channel })).rejects.toMatchObject({
      name: 'LineIdTokenError',
      reason: 'signature',
    });
  });

  it('rejects a wrong audience (token for another channel)', async () => {
    const token = await hs256(baseClaims(), { aud: '9999999999' });
    await expect(verifyIdToken(token, { channel })).rejects.toMatchObject({ reason: 'audience' });
  });

  it('rejects a wrong issuer', async () => {
    const token = await hs256(baseClaims(), { iss: 'https://evil.example' });
    await expect(verifyIdToken(token, { channel })).rejects.toMatchObject({ reason: 'issuer' });
  });

  it('rejects an expired token beyond clock tolerance', async () => {
    const token = await hs256(baseClaims(), { exp: now - 3600 });
    await expect(verifyIdToken(token, { channel })).rejects.toMatchObject({ reason: 'expired' });
  });

  it('rejects a nonce mismatch and a missing nonce when one is expected', async () => {
    await expect(
      verifyIdToken(await hs256(baseClaims({ nonce: 'other' })), { channel, nonce: 'nonce-1' }),
    ).rejects.toMatchObject({ reason: 'nonce' });
    await expect(
      verifyIdToken(await hs256(baseClaims({ nonce: undefined })), { channel, nonce: 'nonce-1' }),
    ).rejects.toMatchObject({ reason: 'nonce' });
  });

  it('rejects garbage and alg=none', async () => {
    await expect(verifyIdToken('not.a.jwt', { channel })).rejects.toBeInstanceOf(LineIdTokenError);
    const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify(baseClaims())).toString('base64url');
    await expect(verifyIdToken(`${header}.${payload}.`, { channel })).rejects.toMatchObject({
      reason: 'unsupported_alg',
    });
  });
});

describe('verifyIdToken ES256 (LINE JWKS)', () => {
  let jwks: ReturnType<typeof createLocalJWKSet>;
  let privateKey: CryptoKey;
  let otherPrivateKey: CryptoKey;

  beforeAll(async () => {
    const kp = await generateKeyPair('ES256');
    const other = await generateKeyPair('ES256');
    privateKey = kp.privateKey;
    otherPrivateKey = other.privateKey;
    const pub = await exportJWK(kp.publicKey);
    jwks = createLocalJWKSet({ keys: [{ ...pub, kid: 'line-kid-1', alg: 'ES256', use: 'sig' }] });
  });

  async function es256(key: CryptoKey, kid = 'line-kid-1') {
    return new SignJWT(baseClaims())
      .setProtectedHeader({ alg: 'ES256', kid })
      .setIssuer('https://access.line.me')
      .setAudience(channel.channelId)
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(key);
  }

  it('accepts a token signed by a key in the JWKS', async () => {
    const claims = await verifyIdToken(await es256(privateKey), {
      channel,
      jwks,
      nonce: 'nonce-1',
    });
    expect(claims.sub).toBe('U0123456789abcdef0123456789abcdef');
  });

  it('rejects a token signed by a key not in the JWKS', async () => {
    await expect(
      verifyIdToken(await es256(otherPrivateKey), { channel, jwks }),
    ).rejects.toBeInstanceOf(LineIdTokenError);
  });

  it('never falls back to HS256 with the secret for an ES256 header', async () => {
    // A classic key-confusion attack: header says ES256, attacker cannot sign with our EC key,
    // and must not be able to pass by having us verify with the shared secret.
    await expect(
      verifyIdToken(await es256(otherPrivateKey, 'unknown'), { channel, jwks }),
    ).rejects.toBeInstanceOf(LineIdTokenError);
  });
});
