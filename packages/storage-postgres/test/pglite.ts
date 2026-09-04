import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import type { Storage } from 'renkei-core';
import { migratePostgres } from '../src/migrate.js';
import { createDrizzleStorage } from '../src/storage.js';

/** A fresh, migrated, in-process Postgres (WASM) per call. Migrates from the embedded list, like `createPostgresStorage()`. */
export async function createPgliteStorage(
  now?: () => Date,
  options: { rowLevelSecurity?: boolean } = {},
): Promise<Storage> {
  const client = new PGlite();
  const db = drizzle(client);
  await migratePostgres(db, options);
  return createDrizzleStorage(db, { ...(now ? { now } : {}), close: () => client.close() });
}
