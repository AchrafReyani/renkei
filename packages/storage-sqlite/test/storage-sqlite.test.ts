import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { storageContract } from '../../core/test/storage-contract.js';
import {
  createSqliteDriverStorage,
  createSqliteStorage,
  migrateSqlite,
  openNodeSqlite,
  readUserVersion,
  schemaVersion,
} from '../src/index.js';

async function memoryStorage(now?: () => Date) {
  const s = createSqliteStorage({ filename: ':memory:', ...(now ? { now } : {}) });
  await s.init?.();
  return s;
}

storageContract('sqlite (node:sqlite, :memory:)', () => memoryStorage());

describe('sqlite storage specifics', () => {
  const dir = mkdtempSync(join(tmpdir(), 'renkei-sqlite-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('expires payloads by the injected clock', async () => {
    let t = 1_000_000;
    const s = await memoryStorage(() => new Date(t));
    await s.payloads.upsert('AccessToken', 'x', { v: 1 }, 10);
    expect(await s.payloads.find('AccessToken', 'x')).toBeDefined();
    t += 10_001;
    expect(await s.payloads.find('AccessToken', 'x')).toBeUndefined();
    await s.close?.();
  });

  it('persists to a file and survives reopening; migrations are idempotent', async () => {
    const filename = join(dir, 'nested', 'dir', 'renkei.db');
    const a = createSqliteStorage({ filename });
    await a.init?.();
    await a.identities.createIdentity({ sub: 'keep', displayName: 'K', emailVerified: true });
    await a.identities.upsertLineAccount({
      identitySub: 'keep',
      channelId: 'c',
      lineUserId: 'U',
      kind: 'messaging',
      friend: true,
      friendCheckedAt: new Date(1_700_000_000_000),
      rawProfile: { displayName: 'K', nested: { ok: 1 } },
    });
    await a.payloads.upsert('Session', 's1', { uid: 'u1', n: 1 });
    await a.close?.();

    const b = createSqliteStorage({ filename });
    await b.init?.(); // second migrate on the same file must be a no-op
    expect(await b.identities.findIdentity('keep')).toMatchObject({
      displayName: 'K',
      emailVerified: true,
    });
    expect(await b.identities.findLineAccount('c', 'U')).toMatchObject({
      kind: 'messaging',
      friend: true,
      friendCheckedAt: new Date(1_700_000_000_000),
      rawProfile: { displayName: 'K', nested: { ok: 1 } },
    });
    expect(await b.payloads.findByUid('Session', 'u1')).toMatchObject({ n: 1 });
    await b.close?.();
  });

  it('records the schema version in PRAGMA user_version', async () => {
    const db = openNodeSqlite(':memory:');
    expect(await readUserVersion(db)).toBe(0);
    await migrateSqlite(db);
    expect(await readUserVersion(db)).toBe(schemaVersion);
    await migrateSqlite(db);
    expect(await readUserVersion(db)).toBe(schemaVersion);
    db.close?.();
  });

  it('cascades LINE accounts when an identity row is deleted (schema FK)', async () => {
    const db = openNodeSqlite(':memory:');
    const s = createSqliteDriverStorage(db);
    await s.init?.();
    await s.identities.createIdentity({ sub: 'gone' });
    await s.identities.upsertLineAccount({
      identitySub: 'gone',
      channelId: 'c',
      lineUserId: 'U',
      kind: 'login',
    });
    db.prepare('DELETE FROM renkei_identity WHERE sub = ?').run('gone');
    const left = db.prepare('SELECT count(*) AS n FROM renkei_line_account').get() as {
      n: number;
    };
    expect(Number(left.n)).toBe(0);
    await s.close?.();
  });

  it('rejects a duplicate identity sub', async () => {
    const s = await memoryStorage();
    await s.identities.createIdentity({ sub: 'dup' });
    await expect(s.identities.createIdentity({ sub: 'dup' })).rejects.toThrow();
    await s.close?.();
  });

  it('keeps stored values a later upsert omits, and clears consumed on re-upsert', async () => {
    const s = await memoryStorage();
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
    await s.close?.();
  });
});
