import type { Storage } from '@renkei/core';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { migrationsFolder } from './migrations-path.js';
import { createDrizzleStorage } from './storage.js';

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
}

/**
 * Storage backed by a real Postgres via postgres.js. `init()` runs the
 * bundled migrations (idempotent), `close()` ends the pool.
 */
export function createPostgresStorage(config: PostgresStorageConfig): Storage {
  const client = postgres(config.connectionString, { max: config.max ?? 5, prepare: false });
  const db = drizzle(client);
  return createDrizzleStorage(db, {
    ...(config.autoMigrate === false ? {} : { migrate: () => migrate(db, { migrationsFolder }) }),
    close: () => client.end(),
  });
}
