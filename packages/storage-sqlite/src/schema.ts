import type { SqliteDriver } from './driver.js';

/**
 * Schema, one entry per version. Applied in order by `migrateSqlite()`, which
 * tracks the current version in `PRAGMA user_version`. Append, never edit.
 *
 * Column names match `renkei-storage-postgres`; only the types differ:
 * timestamps are epoch milliseconds (INTEGER), booleans are 0/1, JSON is TEXT.
 * Tables are prefixed `renkei_` so the file can be shared with an application.
 */
export const migrations: readonly string[] = [
  `
CREATE TABLE IF NOT EXISTS renkei_identity (
  sub            TEXT PRIMARY KEY NOT NULL,
  email          TEXT,
  email_verified INTEGER,
  display_name   TEXT,
  picture_url    TEXT,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS renkei_line_account (
  identity_sub      TEXT NOT NULL REFERENCES renkei_identity(sub) ON DELETE CASCADE,
  channel_id        TEXT NOT NULL,
  line_user_id      TEXT NOT NULL,
  kind              TEXT NOT NULL,
  friend            INTEGER,
  friend_checked_at INTEGER,
  raw_profile       TEXT,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  PRIMARY KEY (channel_id, line_user_id)
);
CREATE INDEX IF NOT EXISTS renkei_line_account_identity_idx ON renkei_line_account (identity_sub);
CREATE TABLE IF NOT EXISTS renkei_payload (
  model       TEXT NOT NULL,
  id          TEXT NOT NULL,
  payload     TEXT NOT NULL,
  uid         TEXT,
  user_code   TEXT,
  grant_id    TEXT,
  expires_at  INTEGER,
  consumed_at INTEGER,
  PRIMARY KEY (model, id)
);
CREATE INDEX IF NOT EXISTS renkei_payload_uid_idx ON renkei_payload (model, uid);
CREATE INDEX IF NOT EXISTS renkei_payload_user_code_idx ON renkei_payload (model, user_code);
CREATE INDEX IF NOT EXISTS renkei_payload_grant_idx ON renkei_payload (model, grant_id);
CREATE INDEX IF NOT EXISTS renkei_payload_expires_idx ON renkei_payload (expires_at);
`,
];

/** The schema version a fully migrated database reports in `PRAGMA user_version`. */
export const schemaVersion = migrations.length;

/**
 * Bring the database up to `schemaVersion`. Idempotent: a database that is
 * already current is left untouched, so this is safe to run on every boot.
 * Each pending version runs inside one transaction.
 */
export function migrateSqlite(driver: SqliteDriver): void {
  const current = readUserVersion(driver);
  for (let v = current; v < migrations.length; v++) {
    driver.exec('BEGIN');
    try {
      driver.exec(migrations[v] as string);
      driver.exec(`PRAGMA user_version = ${v + 1}`);
      driver.exec('COMMIT');
    } catch (err) {
      driver.exec('ROLLBACK');
      throw err;
    }
  }
}

export function readUserVersion(driver: SqliteDriver): number {
  const row = driver.prepare('PRAGMA user_version').get() as
    | { user_version?: number | bigint }
    | undefined;
  return Number(row?.user_version ?? 0);
}
