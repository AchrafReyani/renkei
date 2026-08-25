import type { LineIdTokenClaims } from '../line/id-token.js';
import { randomToken } from '../line/pkce.js';
import type { LineProfile } from '../line/profile.js';
import type { Identity, LineAccount, LineAccountKind, Storage } from '../storage/types.js';

export interface UpsertFromLineParams {
  channelId: string;
  /** Verified id_token claims. `sub` is the LINE user ID for this channel. */
  claims: Pick<LineIdTokenClaims, 'sub' | 'name' | 'picture' | 'email'>;
  /** Optional `/v2/profile` result; wins over id_token for name/picture when present. */
  profile?: LineProfile;
  /** Result of the friendship API, if it was called. */
  friend?: boolean;
  kind?: LineAccountKind;
  /** Generates new `sub` values. Defaults to a random 32-byte token. */
  generateSub?: () => string;
  now?: () => Date;
}

export interface UpsertResult {
  identity: Identity;
  account: LineAccount;
  /** True when this call created the identity (first login). */
  created: boolean;
}

/**
 * The identity-mapping rules of renkei, in one place:
 *
 * 1. Lookup is by (channelId, lineUserId). Never by email — LINE emails are
 *    verified, but linking across channels/regions by email is an opt-in
 *    policy decision, not a default.
 * 2. `sub` is minted once and never changes. It is not derived from LINE IDs
 *    so that downstream systems never leak LINE user IDs by accident.
 * 3. Name and picture are refreshed on every login. Email is only ever
 *    *added or updated*, never removed: a later login without the `email`
 *    scope must not erase what an earlier login granted.
 * 4. Friendship is recorded when known; absence of information leaves the
 *    previous value alone.
 */
export async function upsertIdentityFromLine(
  storage: Storage,
  params: UpsertFromLineParams,
): Promise<UpsertResult> {
  const { channelId, claims, profile } = params;
  const kind = params.kind ?? 'login';
  const now = params.now ?? (() => new Date());
  const lineUserId = claims.sub;

  const patch = {
    displayName: profile?.displayName ?? claims.name,
    pictureUrl: profile?.pictureUrl ?? claims.picture,
    ...(claims.email ? { email: claims.email, emailVerified: true } : {}),
  };

  let identity = await storage.identities.findIdentityByLineAccount(channelId, lineUserId);
  let created = false;
  if (identity) {
    identity = await storage.identities.updateIdentity(identity.sub, patch);
  } else {
    const sub = (params.generateSub ?? (() => randomToken(24)))();
    identity = await storage.identities.createIdentity({ sub, ...patch });
    created = true;
  }

  const account = await storage.identities.upsertLineAccount({
    identitySub: identity.sub,
    channelId,
    lineUserId,
    kind,
    ...(params.friend !== undefined ? { friend: params.friend, friendCheckedAt: now() } : {}),
    ...(profile ? { rawProfile: { ...profile } } : {}),
  });

  return { identity, account, created };
}
