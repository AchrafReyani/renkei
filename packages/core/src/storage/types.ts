/**
 * Storage contract for renkei. Implemented by `renkei-storage-postgres`
 * and by the in-memory store in this package (tests, local dev).
 *
 * Two halves:
 * - the identity store (who is this LINE user, across channels and surfaces)
 * - a generic payload store used by the `oidc-provider` adapter
 *
 * Everything is async and runtime-neutral (no Node-only types) so the same
 * interface works on Node, Deno, Workers and Supabase edge-runtime.
 */

/** A person, as renkei knows them. `sub` is what downstream OIDC clients see. */
export interface Identity {
  /** Stable, opaque identifier. Never derived from LINE user IDs. */
  sub: string;
  createdAt: Date;
  updatedAt: Date;
  /** From the id_token only. Present only if the channel has email permission. */
  email?: string | undefined;
  /** LINE verifies emails before issuing them, so this is true whenever `email` is set. */
  emailVerified?: boolean | undefined;
  displayName?: string | undefined;
  pictureUrl?: string | undefined;
}

/** Which LINE surface an account record came from. */
export type LineAccountKind = 'login' | 'liff' | 'messaging';

/**
 * A LINE user ID within one channel, attached to an identity. One identity
 * can own several: one per region channel, and the Messaging API side once
 * account linking runs.
 */
export interface LineAccount {
  identitySub: string;
  channelId: string;
  lineUserId: string;
  kind: LineAccountKind;
  /** Friendship with the Official Account linked to this channel, if known. */
  friend?: boolean | undefined;
  friendCheckedAt?: Date | undefined;
  /** Last raw profile from LINE, kept so claim mapping can change without re-auth. */
  rawProfile?: Record<string, unknown> | undefined;
  createdAt: Date;
  updatedAt: Date;
}

/** Partial update. `undefined` means "leave unchanged", never "clear". */
export interface IdentityPatch {
  email?: string | undefined;
  emailVerified?: boolean | undefined;
  displayName?: string | undefined;
  pictureUrl?: string | undefined;
}

export interface LineAccountUpsert {
  identitySub: string;
  channelId: string;
  lineUserId: string;
  kind: LineAccountKind;
  friend?: boolean | undefined;
  friendCheckedAt?: Date | undefined;
  rawProfile?: Record<string, unknown> | undefined;
}

export interface IdentityStore {
  findIdentity(sub: string): Promise<Identity | undefined>;
  findIdentityByLineAccount(channelId: string, lineUserId: string): Promise<Identity | undefined>;
  createIdentity(init: IdentityPatch & { sub: string }): Promise<Identity>;
  updateIdentity(sub: string, patch: IdentityPatch): Promise<Identity>;
  upsertLineAccount(record: LineAccountUpsert): Promise<LineAccount>;
  listLineAccounts(sub: string): Promise<LineAccount[]>;
  findLineAccount(channelId: string, lineUserId: string): Promise<LineAccount | undefined>;
  setFriendship(channelId: string, lineUserId: string, friend: boolean, at?: Date): Promise<void>;
}

/**
 * Generic expiring-payload store shaped exactly like what `oidc-provider`'s
 * adapter needs, plus what renkei itself needs for short-lived login state.
 * `model` namespaces the ids (e.g. "AccessToken", "Session", "renkei:login").
 */
export interface PayloadStore {
  upsert(
    model: string,
    id: string,
    payload: PayloadRecord,
    expiresInSeconds?: number,
  ): Promise<void>;
  find(model: string, id: string): Promise<PayloadRecord | undefined>;
  findByUid(model: string, uid: string): Promise<PayloadRecord | undefined>;
  findByUserCode(model: string, userCode: string): Promise<PayloadRecord | undefined>;
  /** Marks the payload consumed (sets `consumed` to a unix timestamp). */
  consume(model: string, id: string): Promise<void>;
  destroy(model: string, id: string): Promise<void>;
  revokeByGrantId(model: string, grantId: string): Promise<void>;
}

/** Arbitrary JSON payload. `oidc-provider` reads back `consumed`, `uid`, `userCode`, `grantId`. */
export interface PayloadRecord {
  [key: string]: unknown;
  uid?: string;
  userCode?: string;
  grantId?: string;
  consumed?: number;
}

export interface Storage {
  identities: IdentityStore;
  payloads: PayloadStore;
  /** Optional: run migrations / open connections. Servers call this at boot. */
  init?(): Promise<void>;
  close?(): Promise<void>;
}
