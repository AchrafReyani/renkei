import { PGlite } from '@electric-sql/pglite';
import type { Storage } from '@renkei/core';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { migrationsFolder } from '../src/migrations-path.js';
import { createDrizzleStorage } from '../src/storage.js';

/** A fresh, migrated, in-process Postgres (WASM) per call. */
export async function createPgliteStorage(now?: () => Date): Promise<Storage> {
  const client = new PGlite();
  const db = drizzle(client);
  await migrate(db, { migrationsFolder });
  return createDrizzleStorage(db, { ...(now ? { now } : {}), close: () => client.close() });
}
