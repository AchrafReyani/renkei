/**
 * Cloudflare D1 driver. D1 is SQLite with an asynchronous API and a few
 * restrictions that this file works around:
 *
 * - `exec()` splits scripts on newlines, so multi-line DDL fails — statements
 *   are split on `;` here and run as one atomic `batch()` instead.
 * - `BEGIN` / `COMMIT` are refused (transactions only via `batch()`), so
 *   migrations run unwrapped; `batch()` keeps each migration atomic.
 * - `PRAGMA user_version` is not authorised, so the schema version lives in a
 *   `renkei_meta` table.
 *
 * Foreign keys are on by default on D1, so `ON DELETE CASCADE` behaves as it
 * does on Node. The types are structural on purpose — `@cloudflare/workers-types`
 * is not a dependency; pass the `D1Database` binding straight in.
 */
import type { Storage } from 'renkei-core';
import type { SqliteDriver, SqliteValue } from './driver.js';
import { createSqliteDriverStorage, type SqliteStorageOptions } from './storage.js';

/** The part of Cloudflare's `D1Database` this driver uses. */
export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike;
  batch(statements: D1PreparedStatementLike[]): Promise<unknown>;
}

/** The part of Cloudflare's `D1PreparedStatement` this driver uses. */
export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}

const META_TABLE = 'renkei_meta';
const VERSION_KEY = 'schema_version';

/** Storage on a D1 binding. `init()` creates the tables on first use (idempotent). */
export function createD1Storage(db: D1DatabaseLike, options: SqliteStorageOptions = {}): Storage {
  return createSqliteDriverStorage(d1Driver(db), options);
}

/** Wrap a D1 binding in the `SqliteDriver` interface used by `createSqliteDriverStorage()`. */
export function d1Driver(db: D1DatabaseLike): SqliteDriver {
  return {
    async exec(sql: string) {
      const statements = splitStatements(sql).map((s) => db.prepare(s));
      if (statements.length === 0) return;
      if (statements.length === 1) return (statements[0] as D1PreparedStatementLike).run();
      return db.batch(statements);
    },
    prepare(sql: string) {
      return {
        run: (...params: SqliteValue[]) =>
          db
            .prepare(sql)
            .bind(...params)
            .run(),
        get: (...params: SqliteValue[]) =>
          db
            .prepare(sql)
            .bind(...params)
            .first(),
        all: async (...params: SqliteValue[]) =>
          (
            await db
              .prepare(sql)
              .bind(...params)
              .all()
          ).results,
      };
    },
    migration: {
      transactions: false,
      async readVersion() {
        await db
          .prepare(
            `CREATE TABLE IF NOT EXISTS ${META_TABLE} (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)`,
          )
          .run();
        const row = await db
          .prepare(`SELECT value FROM ${META_TABLE} WHERE key = ?`)
          .bind(VERSION_KEY)
          .first<{ value: string }>();
        return Number(row?.value ?? 0);
      },
      writeVersion(version: number) {
        return db
          .prepare(
            `INSERT INTO ${META_TABLE} (key, value) VALUES (?, ?)
             ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
          )
          .bind(VERSION_KEY, String(version))
          .run();
      },
    },
  };
}

/**
 * Split a SQL script into statements on `;`. Sufficient for the bundled
 * migrations, which never put `;` inside a string; `--` line comments are
 * dropped.
 */
export function splitStatements(sql: string): string[] {
  return sql
    .replace(/^\s*--.*$/gm, '')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
