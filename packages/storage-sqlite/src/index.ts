import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Storage } from 'renkei-core';
import type { SqliteDriver } from './driver.js';
import { createSqliteDriverStorage, type SqliteStorageOptions } from './storage.js';

export type { Row, SqliteDriver, SqliteStatement, SqliteValue } from './driver.js';
export { migrateSqlite, migrations, readUserVersion, schemaVersion } from './schema.js';
export { createSqliteDriverStorage, type SqliteStorageOptions } from './storage.js';

export interface SqliteStorageConfig extends SqliteStorageOptions {
  /** File path, or `:memory:` for a throwaway database. Parent directories are created. */
  filename: string;
}

/**
 * Storage backed by Node's built-in `node:sqlite` (Node 22.13+; on 22.5–22.12
 * start Node with `--experimental-sqlite`). No native module to compile, no
 * separate database server: one file on disk, WAL mode, foreign keys on.
 *
 * On Bun or with `better-sqlite3`, open the database yourself and pass it to
 * `createSqliteDriverStorage()` instead — the driver interface is the same.
 */
export function createSqliteStorage(config: SqliteStorageConfig): Storage {
  const { filename, ...options } = config;
  return createSqliteDriverStorage(openNodeSqlite(filename), options);
}

/** Open a `node:sqlite` database with renkei's pragmas applied. */
export function openNodeSqlite(filename: string): SqliteDriver {
  const sqlite = loadNodeSqlite();
  if (!sqlite) {
    throw new Error(
      'renkei-storage-sqlite: node:sqlite is not available. Use Node 22.13 or newer ' +
        '(or run `node --experimental-sqlite` on 22.5-22.12), or pass your own driver to ' +
        'createSqliteDriverStorage().',
    );
  }
  const inMemory = filename === ':memory:' || filename === '';
  if (!inMemory) mkdirSync(dirname(filename), { recursive: true });
  const db = new sqlite.DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  if (!inMemory) {
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA synchronous = NORMAL');
  }
  return db;
}

/** Synchronous, import-free lookup so this module loads on runtimes without node:sqlite. */
function loadNodeSqlite(): typeof import('node:sqlite') | undefined {
  try {
    return process.getBuiltinModule('node:sqlite') as typeof import('node:sqlite') | undefined;
  } catch {
    return undefined;
  }
}
