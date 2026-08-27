import type { Identity, LineAccount } from '../storage/types.js';

/**
 * Claim names renkei adds on top of standard OIDC. Namespaced with `line:`
 * so they can never collide with standard or downstream-defined claims.
 */
export const LINE_CLAIMS = {
  userId: 'line:user_id',
  friend: 'line:friend',
  channelId: 'line:channel_id',
  region: 'line:region',
  /** Whether this identity has completed LINE account linking (a messaging-side account exists). */
  linked: 'line:linked',
} as const;

/** The custom OIDC scope that releases the `line:*` claims. */
export const LINE_SCOPE = 'line';

export interface ClaimsOptions {
  /** Which channel's LINE account to surface when the identity has several. */
  preferChannelId?: string;
  /** Region lookup for `line:region`, keyed by channel ID. */
  regionOf?: (channelId: string) => string | undefined;
}

/**
 * Build the OIDC claims for an identity. Standard claims first, then the
 * `line:*` set for the most relevant LINE account (the preferred channel if
 * given, else the most recently updated login/liff account).
 */
export function buildClaims(
  identity: Identity,
  accounts: readonly LineAccount[],
  options: ClaimsOptions = {},
): Record<string, unknown> {
  const claims: Record<string, unknown> = { sub: identity.sub };
  if (identity.displayName !== undefined) claims.name = identity.displayName;
  if (identity.pictureUrl !== undefined) claims.picture = identity.pictureUrl;
  if (identity.email !== undefined) {
    claims.email = identity.email;
    claims.email_verified = identity.emailVerified ?? true;
  }

  const account = pickAccount(accounts, options.preferChannelId);
  if (account) {
    claims[LINE_CLAIMS.userId] = account.lineUserId;
    claims[LINE_CLAIMS.channelId] = account.channelId;
    if (account.friend !== undefined) claims[LINE_CLAIMS.friend] = account.friend;
    const region = options.regionOf?.(account.channelId);
    if (region !== undefined) claims[LINE_CLAIMS.region] = region;
  }
  // Account linking adds a messaging-side account; surface it as a boolean so
  // downstream apps can gate OA messaging without inspecting raw accounts.
  claims[LINE_CLAIMS.linked] = accounts.some((a) => a.kind === 'messaging');
  return claims;
}

function pickAccount(accounts: readonly LineAccount[], preferChannelId?: string) {
  // Prefer login-side rows for line:user_id & co. A messaging-side row is only
  // acceptable when it is all there is — which happens when the messaging
  // channelId is not configured and the accountLink handler records the link on
  // the login row itself (same provider ⇒ same userId), flipping its kind.
  const loginSide = accounts.filter((a) => a.kind !== 'messaging');
  const candidates = loginSide.length > 0 ? loginSide : accounts;
  if (preferChannelId) {
    const hit = candidates.find((a) => a.channelId === preferChannelId);
    if (hit) return hit;
  }
  return [...candidates].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
}
