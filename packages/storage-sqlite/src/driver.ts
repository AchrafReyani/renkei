/**
 * The slice of a synchronous SQLite binding that this adapter needs. Node's
 * built-in `node:sqlite` (`DatabaseSync`), `better-sqlite3` and Bun's
 * `bun:sqlite` all satisfy it structurally, so any of them can be passed to
 * `createSqliteDriverStorage()` without a wrapper.
 */
export interface SqliteDriver {
  /** Run one or more statements with no parameters (DDL, PRAGMAs, BEGIN/COMMIT). */
  exec(sql: string): unknown;
  prepare(sql: string): SqliteStatement;
  close?(): unknown;
}

export interface SqliteStatement {
  run(...params: SqliteValue[]): unknown;
  get(...params: SqliteValue[]): unknown;
  all(...params: SqliteValue[]): unknown;
}

/** What SQLite can bind directly. Booleans, Dates and JSON are converted by the adapter. */
export type SqliteValue = null | number | bigint | string | Uint8Array;

export type Row = Record<string, unknown>;
