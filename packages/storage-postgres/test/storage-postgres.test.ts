import { describe, expect, it } from 'vitest';
import { storageContract } from '../../core/test/storage-contract.js';
import { createPgliteStorage } from './pglite.js';

storageContract('postgres (PGlite)', () => createPgliteStorage());

describe('postgres storage specifics', () => {
  it('enables row level security on its tables when asked, and still works as the owner', async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    const { sql } = await import('drizzle-orm');
    const { migratePostgres, RENKEI_TABLES } = await import('../src/migrate.js');
    const { createDrizzleStorage } = await import('../src/storage.js');
    const client = new PGlite();
    const db = drizzle(client);
    await migratePostgres(db, { rowLevelSecurity: true });
    await migratePostgres(db, { rowLevelSecurity: true }); // idempotent
    const rows = await db.execute(
      sql`SELECT relname, relrowsecurity FROM pg_class WHERE relname = ANY(${sql.param([...RENKEI_TABLES])}) ORDER BY relname`,
    );
    expect(rows.rows.map((r) => [r.relname, r.relrowsecurity])).toEqual(
      [...RENKEI_TABLES].sort().map((t) => [t, true]),
    );
    const s = createDrizzleStorage(db, {});
    await s.identities.createIdentity({ sub: 'rls' });
    expect(await s.identities.findIdentity('rls')).toMatchObject({ sub: 'rls' });
    await client.close();
  });

  it('expires payloads by the injected clock', async () => {
    let t = 1_000_000;
    const s = await createPgliteStorage(() => new Date(t));
    await s.payloads.upsert('AccessToken', 'x', { v: 1 }, 10);
    expect(await s.payloads.find('AccessToken', 'x')).toBeDefined();
    t += 10_001;
    expect(await s.payloads.find('AccessToken', 'x')).toBeUndefined();
    await s.close?.();
  });

  it('cascades LINE accounts when an identity row is deleted (schema FK)', async () => {
    const s = await createPgliteStorage();
    await s.identities.createIdentity({ sub: 'gone' });
    await s.identities.upsertLineAccount({
      identitySub: 'gone',
      channelId: 'c',
      lineUserId: 'U',
      kind: 'login',
    });
    // No delete API on purpose (GDPR-style deletion is a v0.2 feature); exercise the constraint via SQL.
    const { sql } = await import('drizzle-orm');
    const { drizzle } = await import('drizzle-orm/pglite');
    const { PGlite } = await import('@electric-sql/pglite');
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    const { migrationsFolder } = await import('../src/migrations-path.js');
    const client = new PGlite();
    const db = drizzle(client);
    await migrate(db, { migrationsFolder });
    await db.execute(sql`insert into renkei_identity (sub) values ('gone')`);
    await db.execute(
      sql`insert into renkei_line_account (identity_sub, channel_id, line_user_id, kind) values ('gone','c','U','login')`,
    );
    await db.execute(sql`delete from renkei_identity where sub = 'gone'`);
    const left = await db.execute(sql`select count(*)::int as n from renkei_line_account`);
    expect((left.rows[0] as { n: number }).n).toBe(0);
    await client.close();
    await s.close?.();
  });
});
