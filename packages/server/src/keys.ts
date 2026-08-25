import { exportJWK, generateKeyPair, type JWK } from 'jose';

/**
 * Generate a signing key for development. Production deployments must
 * provide stable keys via config — a key generated at boot invalidates
 * every issued token on restart and breaks multi-instance setups.
 */
export async function generateDevJwks(): Promise<JWK[]> {
  // RS256: the algorithm every downstream IdP (Supabase, Cognito, Keycloak,
  // Firebase) accepts by default. ES256 keys can be added alongside later.
  const { privateKey } = await generateKeyPair('RS256', { modulusLength: 2048, extractable: true });
  const jwk = await exportJWK(privateKey);
  return [{ ...jwk, kid: `dev-${Date.now().toString(36)}`, alg: 'RS256', use: 'sig' }];
}
