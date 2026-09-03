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
import type { Row, SqliteDriver, SqliteValue } from './driver.js';
import { migrateSqlite } from './schema.js';

export interface SqliteStorageOptions {
  now?: () => Date;
  /** Run the bundled migrations in `init()`. Default true. */
  autoMigrate?: boolean;
}

/**
 * Wrap any SQLite binding (see `SqliteDriver`) as renkei Storage.
 * `init()` migrates (unless `autoMigrate: false`), `close()` closes the driver.
 */
export function createSqliteDriverStorage(
  driver: SqliteDriver,
  options: SqliteStorageOptions = {},
): Storage {
  const now = options.now ?? (() => new Date());
  const storage: Storage = {
    identities: new SqliteIdentityStore(driver, now),
    payloads: new SqlitePayloadStore(driver, now),
    init: async () => {
      if (options.autoMigrate !== false) await migrateSqlite(driver);
    },
  };
  if (driver.close) {
    storage.close = async () => {
      await driver.close?.();
    };
  }
  return storage;
}

// ---- value mapping -------------------------------------------------------

type Col = [name: string, value: SqliteValue];

const ms = (d: Date): number => d.getTime();
const date = (v: unknown): Date => new Date(Number(v));
const bool = (v: boolean | undefined): SqliteValue => (v === undefined ? null : v ? 1 : 0);
const json = (v: unknown): SqliteValue => (v === undefined ? null : JSON.stringify(v));
const names = (cols: Col[]) => cols.map(([c]) => c).join(', ');
const marks = (cols: Col[]) => cols.map(() => '?').join(', ');
const values = (cols: Col[]) => cols.map(([, v]) => v);

/** `get()` yields `undefined` (node:sqlite, better-sqlite3) or `null` (D1) for no row. */
const row = async (result: unknown): Promise<Row | undefined> =>
  ((await result) ?? undefined) as Row | undefined;
const rows = async (result: unknown): Promise<Row[]> => (await result) as Row[];

function toIdentity(r: Row): Identity {
  return {
    sub: r.sub as string,
    createdAt: date(r.created_at),
    updatedAt: date(r.updated_at),
    ...(r.email != null ? { email: r.email as string } : {}),
    ...(r.email_verified != null ? { emailVerified: Number(r.email_verified) === 1 } : {}),
    ...(r.display_name != null ? { displayName: r.display_name as string } : {}),
    ...(r.picture_url != null ? { pictureUrl: r.picture_url as string } : {}),
  };
}

function toAccount(r: Row): LineAccount {
  return {
    identitySub: r.identity_sub as string,
    channelId: r.channel_id as string,
    lineUserId: r.line_user_id as string,
    kind: r.kind as LineAccountKind,
    createdAt: date(r.created_at),
    updatedAt: date(r.updated_at),
    ...(r.friend != null ? { friend: Number(r.friend) === 1 } : {}),
    ...(r.friend_checked_at != null ? { friendCheckedAt: date(r.friend_checked_at) } : {}),
    ...(r.raw_profile != null
      ? { rawProfile: JSON.parse(r.raw_profile as string) as Record<string, unknown> }
      : {}),
  };
}

/** Column assignments for the defined keys of a patch — `undefined` means "leave unchanged". */
function identityColumns(patch: IdentityPatch): Col[] {
  const cols: Col[] = [];
  if (patch.email !== undefined) cols.push(['email', patch.email]);
  if (patch.emailVerified !== undefined) cols.push(['email_verified', bool(patch.emailVerified)]);
  if (patch.displayName !== undefined) cols.push(['display_name', patch.displayName]);
  if (patch.pictureUrl !== undefined) cols.push(['picture_url', patch.pictureUrl]);
  return cols;
}

// ---- identities ----------------------------------------------------------

class SqliteIdentityStore implements IdentityStore {
  constructor(
    private readonly db: SqliteDriver,
    private readonly now: () => Date,
  ) {}

  async findIdentity(sub: string) {
    const r = await row(this.db.prepare('SELECT * FROM renkei_identity WHERE sub = ?').get(sub));
    return r ? toIdentity(r) : undefined;
  }

  async findIdentityByLineAccount(channelId: string, lineUserId: string) {
    const r = await row(
      this.db
        .prepare(
          `SELECT i.* FROM renkei_line_account a
           JOIN renkei_identity i ON i.sub = a.identity_sub
           WHERE a.channel_id = ? AND a.line_user_id = ?`,
        )
        .get(channelId, lineUserId),
    );
    return r ? toIdentity(r) : undefined;
  }

  async createIdentity(init: IdentityPatch & { sub: string }) {
    const t = ms(this.now());
    const cols: Col[] = [
      ['sub', init.sub],
      ...identityColumns(init),
      ['created_at', t],
      ['updated_at', t],
    ];
    await this.db
      .prepare(`INSERT INTO renkei_identity (${names(cols)}) VALUES (${marks(cols)})`)
      .run(...values(cols));
    const created = await this.findIdentity(init.sub);
    if (!created) throw new Error('insert returned no row');
    return created;
  }

  async updateIdentity(sub: string, patch: IdentityPatch) {
    const cols: Col[] = [...identityColumns(patch), ['updated_at', ms(this.now())]];
    const set = cols.map(([c]) => `${c} = ?`).join(', ');
    await this.db
      .prepare(`UPDATE renkei_identity SET ${set} WHERE sub = ?`)
      .run(...values(cols), sub);
    const updated = await this.findIdentity(sub);
    if (!updated) throw new Error(`identity ${sub} not found`);
    return updated;
  }

  async upsertLineAccount(record: LineAccountUpsert) {
    const t = ms(this.now());
    // Always-written columns; the optional ones join only when defined, so an
    // upsert that omits `friend` keeps the stored friendship.
    const update: Col[] = [
      ['identity_sub', record.identitySub],
      ['kind', record.kind],
      ['updated_at', t],
    ];
    if (record.friend !== undefined) update.push(['friend', bool(record.friend)]);
    if (record.friendCheckedAt !== undefined) {
      update.push(['friend_checked_at', ms(record.friendCheckedAt)]);
    }
    if (record.rawProfile !== undefined) update.push(['raw_profile', json(record.rawProfile)]);
    const insert: Col[] = [
      ['channel_id', record.channelId],
      ['line_user_id', record.lineUserId],
      ['created_at', t],
      ...update,
    ];
    const set = update.map(([c]) => `${c} = excluded.${c}`).join(', ');
    await this.db
      .prepare(
        `INSERT INTO renkei_line_account (${names(insert)}) VALUES (${marks(insert)})
         ON CONFLICT (channel_id, line_user_id) DO UPDATE SET ${set}`,
      )
      .run(...values(insert));
    const account = await this.findLineAccount(record.channelId, record.lineUserId);
    if (!account) throw new Error('upsert returned no row');
    return account;
  }

  async listLineAccounts(sub: string) {
    const rs = await rows(
      this.db.prepare('SELECT * FROM renkei_line_account WHERE identity_sub = ?').all(sub),
    );
    return rs.map(toAccount);
  }

  async findLineAccount(channelId: string, lineUserId: string) {
    const r = await row(
      this.db
        .prepare('SELECT * FROM renkei_line_account WHERE channel_id = ? AND line_user_id = ?')
        .get(channelId, lineUserId),
    );
    return r ? toAccount(r) : undefined;
  }

  async setFriendship(channelId: string, lineUserId: string, friend: boolean, at = this.now()) {
    await this.db
      .prepare(
        `UPDATE renkei_line_account SET friend = ?, friend_checked_at = ?, updated_at = ?
         WHERE channel_id = ? AND line_user_id = ?`,
      )
      .run(bool(friend), ms(at), ms(this.now()), channelId, lineUserId);
  }
}

// ---- payloads ------------------------------------------------------------

const NOT_EXPIRED = '(expires_at IS NULL OR expires_at > ?)';

class SqlitePayloadStore implements PayloadStore {
  constructor(
    private readonly db: SqliteDriver,
    private readonly now: () => Date,
  ) {}

  private toRecord(r: Row): PayloadRecord {
    const p = JSON.parse(r.payload as string) as PayloadRecord;
    if (r.consumed_at != null) p.consumed = Math.floor(Number(r.consumed_at) / 1000);
    return p;
  }

  private async findOne(column: 'id' | 'uid' | 'user_code', model: string, value: string) {
    const r = await row(
      this.db
        .prepare(
          `SELECT * FROM renkei_payload WHERE model = ? AND ${column} = ? AND ${NOT_EXPIRED}`,
        )
        .get(model, value, ms(this.now())),
    );
    return r ? this.toRecord(r) : undefined;
  }

  async upsert(model: string, id: string, payload: PayloadRecord, expiresInSeconds?: number) {
    const expiresAt =
      expiresInSeconds !== undefined ? ms(this.now()) + expiresInSeconds * 1000 : null;
    await this.db
      .prepare(
        `INSERT INTO renkei_payload (model, id, payload, uid, user_code, grant_id, expires_at, consumed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT (model, id) DO UPDATE SET
           payload = excluded.payload, uid = excluded.uid, user_code = excluded.user_code,
           grant_id = excluded.grant_id, expires_at = excluded.expires_at, consumed_at = NULL`,
      )
      .run(
        model,
        id,
        JSON.stringify(payload),
        typeof payload.uid === 'string' ? payload.uid : null,
        typeof payload.userCode === 'string' ? payload.userCode : null,
        typeof payload.grantId === 'string' ? payload.grantId : null,
        expiresAt,
      );
  }

  async find(model: string, id: string) {
    return this.findOne('id', model, id);
  }

  async findByUid(model: string, uid: string) {
    return this.findOne('uid', model, uid);
  }

  async findByUserCode(model: string, userCode: string) {
    return this.findOne('user_code', model, userCode);
  }

  async consume(model: string, id: string) {
    await this.db
      .prepare('UPDATE renkei_payload SET consumed_at = ? WHERE model = ? AND id = ?')
      .run(ms(this.now()), model, id);
  }

  async destroy(model: string, id: string) {
    await this.db.prepare('DELETE FROM renkei_payload WHERE model = ? AND id = ?').run(model, id);
  }

  async revokeByGrantId(model: string, grantId: string) {
    await this.db
      .prepare('DELETE FROM renkei_payload WHERE model = ? AND grant_id = ?')
      .run(model, grantId);
  }

  /** Housekeeping: delete expired rows. Call from a cron or on an interval. */
  async purgeExpired() {
    await this.db.prepare('DELETE FROM renkei_payload WHERE expires_at <= ?').run(ms(this.now()));
  }
}
