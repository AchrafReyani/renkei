import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type {
  Identity,
  IdentityPatch,
  IdentityStore,
  LineAccount,
  LineAccountKind,
  LineAccountUpsert,
  PayloadRecord,
  PayloadStore,
  Storage,
} from 'renkei-core';
import {
  identity as identityTable,
  lineAccount as lineAccountTable,
  payload as payloadTable,
} from './schema.js';

/** Any Drizzle Postgres database: postgres.js, node-postgres, PGlite, Neon, … */
// biome-ignore lint/suspicious/noExplicitAny: Drizzle's generic parameters differ per driver; we only need the shared API.
export type AnyPgDatabase = PgDatabase<PgQueryResultHKT, any, any>;

export interface PostgresStorageOptions {
  now?: () => Date;
  /** Called by `init()`. Provide to run migrations for your driver. */
  migrate?: () => Promise<void>;
  close?: () => Promise<void>;
}

/** Wrap an existing Drizzle database as renkei Storage. */
export function createDrizzleStorage(
  db: AnyPgDatabase,
  options: PostgresStorageOptions = {},
): Storage {
  const now = options.now ?? (() => new Date());
  const storage: Storage = {
    identities: new PgIdentityStore(db, now),
    payloads: new PgPayloadStore(db, now),
  };
  if (options.migrate) {
    const migrate = options.migrate;
    storage.init = async () => {
      await migrate();
    };
  }
  if (options.close) storage.close = options.close;
  return storage;
}

type IdentityRow = typeof identityTable.$inferSelect;
type AccountRow = typeof lineAccountTable.$inferSelect;

function toIdentity(r: IdentityRow): Identity {
  return {
    sub: r.sub,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    ...(r.email !== null ? { email: r.email } : {}),
    ...(r.emailVerified !== null ? { emailVerified: r.emailVerified } : {}),
    ...(r.displayName !== null ? { displayName: r.displayName } : {}),
    ...(r.pictureUrl !== null ? { pictureUrl: r.pictureUrl } : {}),
  };
}

function toAccount(r: AccountRow): LineAccount {
  return {
    identitySub: r.identitySub,
    channelId: r.channelId,
    lineUserId: r.lineUserId,
    kind: r.kind as LineAccountKind,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    ...(r.friend !== null ? { friend: r.friend } : {}),
    ...(r.friendCheckedAt !== null ? { friendCheckedAt: r.friendCheckedAt } : {}),
    ...(r.rawProfile !== null ? { rawProfile: r.rawProfile as Record<string, unknown> } : {}),
  };
}

/** Keep only defined keys so partial updates never null out columns. */
function defined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

class PgIdentityStore implements IdentityStore {
  constructor(
    private readonly db: AnyPgDatabase,
    private readonly now: () => Date,
  ) {}

  async findIdentity(sub: string) {
    const rows = await this.db
      .select()
      .from(identityTable)
      .where(eq(identityTable.sub, sub))
      .limit(1);
    return rows[0] ? toIdentity(rows[0]) : undefined;
  }

  async findIdentityByLineAccount(channelId: string, lineUserId: string) {
    const rows = await this.db
      .select({ identity: identityTable })
      .from(lineAccountTable)
      .innerJoin(identityTable, eq(identityTable.sub, lineAccountTable.identitySub))
      .where(
        and(eq(lineAccountTable.channelId, channelId), eq(lineAccountTable.lineUserId, lineUserId)),
      )
      .limit(1);
    return rows[0] ? toIdentity(rows[0].identity) : undefined;
  }

  async createIdentity(init: IdentityPatch & { sub: string }) {
    const t = this.now();
    const rows = await this.db
      .insert(identityTable)
      .values({ ...defined(init), sub: init.sub, createdAt: t, updatedAt: t })
      .returning();
    const row = rows[0];
    if (!row) throw new Error('insert returned no row');
    return toIdentity(row);
  }

  async updateIdentity(sub: string, patch: IdentityPatch) {
    const rows = await this.db
      .update(identityTable)
      .set({ ...defined(patch), updatedAt: this.now() })
      .where(eq(identityTable.sub, sub))
      .returning();
    if (!rows[0]) throw new Error(`identity ${sub} not found`);
    return toIdentity(rows[0]);
  }

  async upsertLineAccount(record: LineAccountUpsert) {
    const t = this.now();
    const optional = defined({
      friend: record.friend,
      friendCheckedAt: record.friendCheckedAt,
      rawProfile: record.rawProfile,
    });
    const updateSet = {
      identitySub: record.identitySub,
      kind: record.kind,
      ...optional,
      updatedAt: t,
    };
    const values = {
      ...updateSet,
      channelId: record.channelId,
      lineUserId: record.lineUserId,
      createdAt: t,
    };
    const rows = await this.db
      .insert(lineAccountTable)
      .values(values)
      .onConflictDoUpdate({
        target: [lineAccountTable.channelId, lineAccountTable.lineUserId],
        set: updateSet,
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error('upsert returned no row');
    return toAccount(row);
  }

  async listLineAccounts(sub: string) {
    const rows = await this.db
      .select()
      .from(lineAccountTable)
      .where(eq(lineAccountTable.identitySub, sub));
    return rows.map(toAccount);
  }

  async findLineAccount(channelId: string, lineUserId: string) {
    const rows = await this.db
      .select()
      .from(lineAccountTable)
      .where(
        and(eq(lineAccountTable.channelId, channelId), eq(lineAccountTable.lineUserId, lineUserId)),
      )
      .limit(1);
    return rows[0] ? toAccount(rows[0]) : undefined;
  }

  async setFriendship(channelId: string, lineUserId: string, friend: boolean, at = this.now()) {
    await this.db
      .update(lineAccountTable)
      .set({ friend, friendCheckedAt: at, updatedAt: this.now() })
      .where(
        and(eq(lineAccountTable.channelId, channelId), eq(lineAccountTable.lineUserId, lineUserId)),
      );
  }
}

class PgPayloadStore implements PayloadStore {
  constructor(
    private readonly db: AnyPgDatabase,
    private readonly now: () => Date,
  ) {}

  private notExpired() {
    return or(isNull(payloadTable.expiresAt), gt(payloadTable.expiresAt, this.now()));
  }

  private toRecord(row: typeof payloadTable.$inferSelect): PayloadRecord {
    const p = { ...(row.payload as PayloadRecord) };
    if (row.consumedAt) p.consumed = Math.floor(row.consumedAt.getTime() / 1000);
    return p;
  }

  async upsert(model: string, id: string, payload: PayloadRecord, expiresInSeconds?: number) {
    const expiresAt =
      expiresInSeconds !== undefined
        ? new Date(this.now().getTime() + expiresInSeconds * 1000)
        : null;
    const values = {
      model,
      id,
      payload,
      uid: typeof payload.uid === 'string' ? payload.uid : null,
      userCode: typeof payload.userCode === 'string' ? payload.userCode : null,
      grantId: typeof payload.grantId === 'string' ? payload.grantId : null,
      expiresAt,
      consumedAt: null,
    };
    await this.db
      .insert(payloadTable)
      .values(values)
      .onConflictDoUpdate({ target: [payloadTable.model, payloadTable.id], set: values });
  }

  async find(model: string, id: string) {
    const rows = await this.db
      .select()
      .from(payloadTable)
      .where(and(eq(payloadTable.model, model), eq(payloadTable.id, id), this.notExpired()))
      .limit(1);
    return rows[0] ? this.toRecord(rows[0]) : undefined;
  }

  async findByUid(model: string, uid: string) {
    const rows = await this.db
      .select()
      .from(payloadTable)
      .where(and(eq(payloadTable.model, model), eq(payloadTable.uid, uid), this.notExpired()))
      .limit(1);
    return rows[0] ? this.toRecord(rows[0]) : undefined;
  }

  async findByUserCode(model: string, userCode: string) {
    const rows = await this.db
      .select()
      .from(payloadTable)
      .where(
        and(eq(payloadTable.model, model), eq(payloadTable.userCode, userCode), this.notExpired()),
      )
      .limit(1);
    return rows[0] ? this.toRecord(rows[0]) : undefined;
  }

  async consume(model: string, id: string) {
    await this.db
      .update(payloadTable)
      .set({ consumedAt: this.now() })
      .where(and(eq(payloadTable.model, model), eq(payloadTable.id, id)));
  }

  async destroy(model: string, id: string) {
    await this.db
      .delete(payloadTable)
      .where(and(eq(payloadTable.model, model), eq(payloadTable.id, id)));
  }

  async revokeByGrantId(model: string, grantId: string) {
    await this.db
      .delete(payloadTable)
      .where(and(eq(payloadTable.model, model), eq(payloadTable.grantId, grantId)));
  }

  /** Housekeeping: delete expired rows. Call from a cron or on an interval. */
  async purgeExpired() {
    await this.db.delete(payloadTable).where(sql`${payloadTable.expiresAt} <= ${this.now()}`);
  }
}
