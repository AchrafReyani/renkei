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
  /**
   * Other channels of the same LINE provider (a LINE MINI App channel next to
   * the Login channel, for instance). LINE issues one user ID per provider, so
   * a user known through any of them is the same identity; their existing
   * `sub` is reused and this channel is attached to it.
   */
  providerChannelIds?: readonly string[];
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
 * 1. Lookup is by (channelId, lineUserId), then by the same lineUserId on the
 *    other channels of the same provider (`providerChannelIds`) — LINE user
 *    IDs are provider-scoped, so a MINI App channel and a Login channel of one
 *    provider see the same user. Never by email — LINE emails are verified, but
 *    linking across providers/regions by email is an opt-in policy decision,
 *    not a default.
 * 2. `sub` is minted once and never changes. It is not derived from LINE IDs
 *    so that downstream systems never leak LINE user IDs by accident.
 * 3. Name and picture are refreshed on every login. Email is only ever
 *    *added or updated*, never removed: a later login without the `email`
 *    scope must not erase what an earlier login granted.
 * 4. Friendship is recorded when known; absence of information leaves the
 *    previous value alone.
 * 5. A row that already records an account link (`kind: 'messaging'`) keeps
 *    it: a later login or LIFF exchange on the same (channelId, lineUserId)
 *    refreshes the row but never downgrades the kind, or the link would be
 *    lost on the next login.
 */
export async function upsertIdentityFromLine(
  storage: Storage,
  params: UpsertFromLineParams,
): Promise<UpsertResult> {
  const { channelId, claims, profile } = params;
  const requestedKind = params.kind ?? 'login';
  const now = params.now ?? (() => new Date());
  const lineUserId = claims.sub;

  const patch = {
    displayName: profile?.displayName ?? claims.name,
    pictureUrl: profile?.pictureUrl ?? claims.picture,
    ...(claims.email ? { email: claims.email, emailVerified: true } : {}),
  };

  let identity = await storage.identities.findIdentityByLineAccount(channelId, lineUserId);
  let created = false;
  let kind: LineAccountKind = requestedKind;
  if (identity) {
    identity = await storage.identities.updateIdentity(identity.sub, patch);
    // Rule 5: when the messaging channelId is not configured, the accountLink
    // handler records the link on this very row by flipping its kind. Keep it.
    const existing = await storage.identities.findLineAccount(channelId, lineUserId);
    if (existing?.kind === 'messaging') kind = 'messaging';
  } else {
    // Rule 1, second half: the same user through a sibling channel of the provider.
    for (const sibling of params.providerChannelIds ?? []) {
      if (sibling === channelId) continue;
      const known = await storage.identities.findIdentityByLineAccount(sibling, lineUserId);
      if (known) {
        identity = await storage.identities.updateIdentity(known.sub, patch);
        break;
      }
    }
    if (!identity) {
      const sub = (params.generateSub ?? (() => randomToken(24)))();
      identity = await storage.identities.createIdentity({ sub, ...patch });
      created = true;
    }
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
