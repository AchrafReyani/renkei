import { describe, expect, it } from 'vitest';
import type { Storage } from '../src/index.js';

/**
 * Behavioural contract every Storage implementation must satisfy. Imported by
 * the memory tests here and by @renkei/storage-postgres, so both stay in sync.
 */
export function storageContract(name: string, factory: () => Promise<Storage> | Storage) {
  describe(`Storage contract: ${name}`, () => {
    describe('identities', () => {
      it('creates, finds and updates an identity', async () => {
        const s = await factory();
        const created = await s.identities.createIdentity({ sub: 'sub-1', displayName: 'A' });
        expect(created.sub).toBe('sub-1');
        expect(created.createdAt).toBeInstanceOf(Date);
        expect(await s.identities.findIdentity('sub-1')).toMatchObject({
          sub: 'sub-1',
          displayName: 'A',
        });
        const updated = await s.identities.updateIdentity('sub-1', {
          email: 'a@example.com',
          emailVerified: true,
        });
        expect(updated).toMatchObject({
          displayName: 'A',
          email: 'a@example.com',
          emailVerified: true,
        });
        expect(await s.identities.findIdentity('nope')).toBeUndefined();
      });

      it('update ignores undefined fields instead of erasing them', async () => {
        const s = await factory();
        await s.identities.createIdentity({
          sub: 'sub-2',
          email: 'keep@example.com',
          emailVerified: true,
        });
        const u = await s.identities.updateIdentity('sub-2', {
          displayName: 'B',
          email: undefined,
        });
        expect(u.email).toBe('keep@example.com');
        expect(u.displayName).toBe('B');
      });

      it('links LINE accounts and looks identities up by them', async () => {
        const s = await factory();
        await s.identities.createIdentity({ sub: 'sub-3' });
        const acc = await s.identities.upsertLineAccount({
          identitySub: 'sub-3',
          channelId: 'ch-jp',
          lineUserId: 'U1',
          kind: 'login',
          friend: true,
          rawProfile: { displayName: 'x' },
        });
        expect(acc).toMatchObject({
          identitySub: 'sub-3',
          channelId: 'ch-jp',
          lineUserId: 'U1',
          friend: true,
        });
        expect(await s.identities.findIdentityByLineAccount('ch-jp', 'U1')).toMatchObject({
          sub: 'sub-3',
        });
        expect(await s.identities.findIdentityByLineAccount('ch-tw', 'U1')).toBeUndefined();

        await s.identities.upsertLineAccount({
          identitySub: 'sub-3',
          channelId: 'ch-tw',
          lineUserId: 'U9',
          kind: 'login',
        });
        const list = await s.identities.listLineAccounts('sub-3');
        expect(list.map((a) => a.channelId).sort()).toEqual(['ch-jp', 'ch-tw']);
      });

      it('upsert keeps createdAt and unspecified fields, setFriendship updates friend', async () => {
        const s = await factory();
        await s.identities.createIdentity({ sub: 'sub-4' });
        const first = await s.identities.upsertLineAccount({
          identitySub: 'sub-4',
          channelId: 'c',
          lineUserId: 'U',
          kind: 'login',
          friend: false,
        });
        const second = await s.identities.upsertLineAccount({
          identitySub: 'sub-4',
          channelId: 'c',
          lineUserId: 'U',
          kind: 'login',
        });
        expect(second.friend).toBe(false);
        expect(second.createdAt.getTime()).toBe(first.createdAt.getTime());
        await s.identities.setFriendship('c', 'U', true);
        expect((await s.identities.findLineAccount('c', 'U'))?.friend).toBe(true);
        await s.identities.setFriendship('c', 'unknown', true); // no-op, no throw
      });
    });

    describe('payloads', () => {
      it('upserts, finds, consumes and destroys', async () => {
        const s = await factory();
        await s.payloads.upsert('AccessToken', 'id1', { grantId: 'g1', foo: 'bar' }, 60);
        expect(await s.payloads.find('AccessToken', 'id1')).toMatchObject({
          grantId: 'g1',
          foo: 'bar',
        });
        expect(await s.payloads.find('RefreshToken', 'id1')).toBeUndefined();
        await s.payloads.consume('AccessToken', 'id1');
        const consumed = await s.payloads.find('AccessToken', 'id1');
        expect(typeof consumed?.consumed).toBe('number');
        await s.payloads.destroy('AccessToken', 'id1');
        expect(await s.payloads.find('AccessToken', 'id1')).toBeUndefined();
      });

      it('finds by uid and userCode within a model', async () => {
        const s = await factory();
        await s.payloads.upsert('Session', 's1', { uid: 'uid-1' }, 60);
        await s.payloads.upsert('DeviceCode', 'd1', { userCode: 'ABCD-EFGH' }, 60);
        expect(await s.payloads.findByUid('Session', 'uid-1')).toMatchObject({ uid: 'uid-1' });
        expect(await s.payloads.findByUid('Interaction', 'uid-1')).toBeUndefined();
        expect(await s.payloads.findByUserCode('DeviceCode', 'ABCD-EFGH')).toMatchObject({
          userCode: 'ABCD-EFGH',
        });
      });

      it('revokes every payload of a grant within a model', async () => {
        const s = await factory();
        await s.payloads.upsert('AccessToken', 'a1', { grantId: 'g' }, 60);
        await s.payloads.upsert('AccessToken', 'a2', { grantId: 'g' }, 60);
        await s.payloads.upsert('AccessToken', 'a3', { grantId: 'other' }, 60);
        await s.payloads.revokeByGrantId('AccessToken', 'g');
        expect(await s.payloads.find('AccessToken', 'a1')).toBeUndefined();
        expect(await s.payloads.find('AccessToken', 'a2')).toBeUndefined();
        expect(await s.payloads.find('AccessToken', 'a3')).toBeDefined();
      });

      it('upsert replaces the payload entirely', async () => {
        const s = await factory();
        await s.payloads.upsert('Grant', 'g1', { a: 1, b: 2 }, 60);
        await s.payloads.upsert('Grant', 'g1', { a: 9 }, 60);
        const p = await s.payloads.find('Grant', 'g1');
        expect(p).toMatchObject({ a: 9 });
        expect(p).not.toHaveProperty('b');
      });
    });
  });
}
