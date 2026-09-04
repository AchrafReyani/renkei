import { sql } from 'drizzle-orm';
import type { MigrationConfig, MigrationMeta } from 'drizzle-orm/migrator';
import { migrations } from './migrations.js';
import { migrationsFolder } from './migrations-path.js';
import type { AnyPgDatabase } from './storage.js';

/**
 * Apply renkei's bundled migrations to any Drizzle Postgres database
 * (postgres.js, PGlite, neon, …) from the embedded list — no filesystem
 * access, so it runs on edge runtimes and inside bundles. Idempotent: uses
 * drizzle's `__drizzle_migrations` bookkeeping, the same table drizzle's own
 * `migrate()` writes, so switching between the two is safe.
 */
export interface MigratePostgresOptions {
  /**
   * Also `ENABLE ROW LEVEL SECURITY` on renkei's tables (idempotent). For Supabase,
   * whose Data API exposes every table in `public` to the `anon` /
   * `authenticated` roles unless RLS is on. renkei connects as the table owner,
   * which bypasses RLS, so nothing else changes.
   */
  rowLevelSecurity?: boolean;
}

/** renkei's tables, for `rowLevelSecurity`. */
export const RENKEI_TABLES = ['renkei_identity', 'renkei_line_account', 'renkei_payload'] as const;

export async function migratePostgres(
  db: AnyPgDatabase,
  options: MigratePostgresOptions = {},
): Promise<void> {
  // `dialect` and `session` are public at runtime but marked @internal in
  // drizzle's published types; this is exactly what drizzle's migrate() does.
  const { dialect, session } = db as unknown as {
    dialect: { migrate(m: MigrationMeta[], s: unknown, c: MigrationConfig): Promise<void> };
    session: unknown;
  };
  await dialect.migrate(migrations, session, { migrationsFolder });
  if (options.rowLevelSecurity) {
    for (const table of RENKEI_TABLES) {
      await db.execute(sql`ALTER TABLE ${sql.identifier(table)} ENABLE ROW LEVEL SECURITY`);
    }
  }
}
