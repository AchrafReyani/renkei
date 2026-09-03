/**
 * The slice of a SQLite binding that this adapter needs. Node's built-in
 * `node:sqlite` (`DatabaseSync`), `better-sqlite3` and Bun's `bun:sqlite`
 * all satisfy it structurally, so any of them can be passed to
 * `createSqliteDriverStorage()` without a wrapper.
 *
 * Every method may return its result directly or as a Promise — the adapter
 * awaits them all. That is what lets an asynchronous binding such as
 * Cloudflare D1 (`renkei-storage-sqlite/d1`) implement the same interface.
 */
export interface SqliteDriver {
  /** Run one or more `;`-separated statements with no parameters (DDL, PRAGMAs). */
  exec(sql: string): unknown;
  prepare(sql: string): SqliteStatement;
  close?(): unknown;
  /**
   * How `migrateSqlite()` wraps and versions migrations. Omit for an ordinary
   * SQLite binding: each migration runs inside `BEGIN` … `COMMIT` and the
   * version lives in `PRAGMA user_version`. A binding that permits neither
   * (Cloudflare D1) supplies its own version store here.
   */
  migration?: SqliteMigrationSupport;
}

export interface SqliteMigrationSupport {
  /** Wrap each migration in `BEGIN` … `COMMIT` / `ROLLBACK`. */
  transactions: boolean;
  /** Current schema version; 0 for an empty database. */
  readVersion(): number | Promise<number>;
  /** Record the schema version once a migration has been applied. */
  writeVersion(version: number): unknown;
}

export interface SqliteStatement {
  /** Execute; the result is ignored. */
  run(...params: SqliteValue[]): unknown;
  /** First matching row as a plain object; `undefined` or `null` when there is none. */
  get(...params: SqliteValue[]): unknown;
  /** All matching rows as an array of plain objects. */
  all(...params: SqliteValue[]): unknown;
}

/** What SQLite can bind directly. Booleans, Dates and JSON are converted by the adapter. */
export type SqliteValue = null | number | bigint | string | Uint8Array;

export type Row = Record<string, unknown>;
