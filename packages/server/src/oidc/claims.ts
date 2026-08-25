import type { OidcClientConfig } from '../config.js';

/** Extra claim renkei adds when the email was synthesised. Downstream can key on it. */
export const EMAIL_PLACEHOLDER_CLAIM = 'email_placeholder';

/**
 * Apply a client's placeholder-email policy to a claim set. No-op when the
 * identity already has a real email or the client has no domain configured.
 */
export function applyEmailPlaceholder(
  claims: Record<string, unknown>,
  client: Pick<OidcClientConfig, 'placeholderEmailDomain'> | undefined,
): Record<string, unknown> {
  if (!client?.placeholderEmailDomain) return claims;
  if (typeof claims.email === 'string' && claims.email.length > 0) return claims;
  const sub = String(claims.sub ?? '');
  if (!sub) return claims;
  return {
    ...claims,
    email: `${sub.toLowerCase()}@${client.placeholderEmailDomain}`,
    email_verified: true,
    [EMAIL_PLACEHOLDER_CLAIM]: true,
  };
}
