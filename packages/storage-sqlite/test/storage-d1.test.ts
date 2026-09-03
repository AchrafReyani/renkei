/**
 * The D1 driver against a real D1: Miniflare runs workerd's local D1
 * implementation, the same one `wrangler dev` uses, so the PRAGMA allow-list,
 * the transaction restrictions and the `batch()` semantics are the real thing.
 */
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { storageContract } from '../../core/test/storage-contract.js';
import { createD1Storage, type D1DatabaseLike, d1Driver, splitStatements } from '../src/d1.js';
import { migrateSqlite, readUserVersion, schemaVersion } from '../src/index.js';

const mf = new Miniflare({
  modules: true,
  script: 'export default { fetch() { return new Response("ok"); } };',
  d1Databases: { DB: 'renkei-test' },
});
let db: D1DatabaseLike;

beforeAll(async () => {
  db = (await mf.getD1Database('DB')) as unknown as D1DatabaseLike;
}, 60_000);
afterAll(() => mf.dispose());

/** One D1 per Miniflare, so every test starts from empty tables instead of a fresh file. */
async function fresh(now?: () => Date) {
  const s = createD1Storage(db, now ? { now } : {});
  await s.init?.();
  await db.batch(
    ['renkei_payload', 'renkei_line_account', 'renkei_identity'].map((t) =>
      db.prepare(`DELETE FROM ${t}`),
    ),
  );
  return s;
}

storageContract('Cloudflare D1 (miniflare)', () => fresh());

describe('D1 storage specifics', () => {
  it('tracks the schema version in renkei_meta and migrates idempotently', async () => {
    const driver = d1Driver(db);
    await migrateSqlite(driver);
    expect(await readUserVersion(driver)).toBe(schemaVersion);
    await migrateSqlite(driver); // no-op on a current database
    expect(await readUserVersion(driver)).toBe(schemaVersion);
    const meta = await db
      .prepare('SELECT value FROM renkei_meta WHERE key = ?')
      .bind('schema_version')
      .first<{ value: string }>();
    expect(meta?.value).toBe(String(schemaVersion));
  });

  it('expires payloads by the injected clock', async () => {
    let t = 1_000_000;
    const s = await fresh(() => new Date(t));
    await s.payloads.upsert('AccessToken', 'x', { v: 1 }, 10);
    expect(await s.payloads.find('AccessToken', 'x')).toBeDefined();
    t += 10_001;
    expect(await s.payloads.find('AccessToken', 'x')).toBeUndefined();
  });

  it('cascades LINE accounts when an identity row is deleted (D1 has foreign keys on)', async () => {
    const s = await fresh();
    await s.identities.createIdentity({ sub: 'gone' });
    await s.identities.upsertLineAccount({
      identitySub: 'gone',
      channelId: 'c',
      lineUserId: 'U',
      kind: 'login',
    });
    await db.prepare('DELETE FROM renkei_identity WHERE sub = ?').bind('gone').run();
    const left = await db
      .prepare('SELECT count(*) AS n FROM renkei_line_account')
      .first<{ n: number }>();
    expect(Number(left?.n)).toBe(0);
  });

  it('keeps stored values a later upsert omits, and clears consumed on re-upsert', async () => {
    const s = await fresh();
    await s.identities.createIdentity({ sub: 'p' });
    await s.identities.upsertLineAccount({
      identitySub: 'p',
      channelId: 'c',
      lineUserId: 'U',
      kind: 'login',
      rawProfile: { a: 1 },
      friend: true,
    });
    const again = await s.identities.upsertLineAccount({
      identitySub: 'p',
      channelId: 'c',
      lineUserId: 'U',
      kind: 'liff',
    });
    expect(again).toMatchObject({ kind: 'liff', friend: true, rawProfile: { a: 1 } });

    await s.payloads.upsert('AuthorizationCode', 'code', { grantId: 'g' }, 60);
    await s.payloads.consume('AuthorizationCode', 'code');
    expect((await s.payloads.find('AuthorizationCode', 'code'))?.consumed).toBeTypeOf('number');
    await s.payloads.upsert('AuthorizationCode', 'code', { grantId: 'g' }, 60);
    expect(await s.payloads.find('AuthorizationCode', 'code')).not.toHaveProperty('consumed');
  });

  it('splits scripts on ; and drops line comments', () => {
    expect(
      splitStatements('-- head\nCREATE TABLE a (\n  id TEXT\n);\n\nCREATE INDEX i ON a (id);'),
    ).toEqual(['CREATE TABLE a (\n  id TEXT\n)', 'CREATE INDEX i ON a (id)']);
    expect(splitStatements('  ;; ')).toEqual([]);
  });
});
