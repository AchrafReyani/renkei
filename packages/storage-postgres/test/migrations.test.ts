/**
 * The embedded migration list (src/migrations.ts, generated) must be exactly
 * what drizzle reads from the migrations/ folder: a stale generated file would
 * make a database migrated on Node disagree with one migrated on an edge
 * runtime. Regenerate with `pnpm db:generate` (or `node scripts/embed-migrations.mjs`).
 */
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { describe, expect, it } from 'vitest';
import { migrations } from '../src/migrations.js';
import { migrationsFolder } from '../src/migrations-path.js';

describe('embedded migrations', () => {
  it('match the migrations/ folder statement for statement', () => {
    const fromDisk = readMigrationFiles({ migrationsFolder }).map((m) => ({
      ...m,
      // The on-disk read keeps whatever line endings the checkout has; the embedded list is LF.
      sql: m.sql.map((s) => s.replace(/\r\n/g, '\n')),
    }));
    expect(migrations.map((m) => ({ ...m, hash: undefined }))).toEqual(
      fromDisk.map((m) => ({ ...m, hash: undefined })),
    );
    expect(migrations.map((m) => m.hash)).toEqual(fromDisk.map((m) => m.hash));
  });
});
