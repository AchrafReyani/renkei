import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { Storage } from 'renkei-core';
import { migratePostgres } from './migrate.js';
import { createDrizzleStorage } from './storage.js';

export { type MigratePostgresOptions, migratePostgres, RENKEI_TABLES } from './migrate.js';
export { migrations } from './migrations.js';
export { migrationsFolder } from './migrations-path.js';
export * from './schema.js';
export {
  type AnyPgDatabase,
  createDrizzleStorage,
  type PostgresStorageOptions,
} from './storage.js';

export interface PostgresStorageConfig {
  /** e.g. postgres://user:pass@host:5432/db — Supabase's pooler URL works too. */
  connectionString: string;
  /** Run migrations in `init()`. Default true. */
  autoMigrate?: boolean;
  /** postgres.js pool size. Default 5; use 1 on serverless/edge. */
  max?: number;
  /**
   * Seconds an idle connection stays open before postgres.js closes it.
   * Default: never (long-running servers). Set it on serverless/edge runtimes,
   * where an isolate may be frozen with its connections still open.
   */
  idleTimeout?: number;
  /** Enable row level security on renkei's tables after migrating (Supabase: keeps the Data API out). Default false. */
  rowLevelSecurity?: boolean;
}

/**
 * Storage backed by a real Postgres via postgres.js. `init()` runs the
 * bundled migrations (idempotent), `close()` ends the pool.
 *
 * The migrations are embedded in the module (`migrations`), not read from
 * disk, so the adapter works wherever postgres.js does — Node, Deno / Supabase
 * Edge Functions, Workers over Hyperdrive — including inside bundles.
 */
export function createPostgresStorage(config: PostgresStorageConfig): Storage {
  const client = postgres(config.connectionString, {
    max: config.max ?? 5,
    prepare: false,
    ...(config.idleTimeout !== undefined ? { idle_timeout: config.idleTimeout } : {}),
  });
  const db = drizzle(client);
  return createDrizzleStorage(db, {
    ...(config.autoMigrate === false
      ? {}
      : {
          migrate: () =>
            migratePostgres(db, { rowLevelSecurity: config.rowLevelSecurity ?? false }),
        }),
    close: () => client.end(),
  });
}
