import { describe, expect, it } from 'vitest';
import {
  buildClaims,
  createMemoryStorage,
  LINE_CLAIMS,
  upsertIdentityFromLine,
} from '../src/index.js';

const channelId = '2011257262';
const claims = { sub: 'Uaaa', name: 'Taro', picture: 'https://p/1' };

describe('upsertIdentityFromLine', () => {
  it('creates an identity with a minted sub on first login', async () => {
    const s = createMemoryStorage();
    const r = await upsertIdentityFromLine(s, {
      channelId,
      claims,
      friend: true,
      generateSub: () => 'sub-A',
    });
    expect(r.created).toBe(true);
    expect(r.identity).toMatchObject({
      sub: 'sub-A',
      displayName: 'Taro',
      pictureUrl: 'https://p/1',
    });
    expect(r.identity.email).toBeUndefined();
    expect(r.account).toMatchObject({
      identitySub: 'sub-A',
      channelId,
      lineUserId: 'Uaaa',
      kind: 'login',
      friend: true,
    });
  });

  it('finds the same identity on the next login and refreshes name/picture', async () => {
    const s = createMemoryStorage();
    const first = await upsertIdentityFromLine(s, {
      channelId,
      claims,
      generateSub: () => 'sub-A',
    });
    const second = await upsertIdentityFromLine(s, {
      channelId,
      claims: { ...claims, name: 'Taro2', picture: 'https://p/2' },
      generateSub: () => 'sub-SHOULD-NOT-BE-USED',
    });
    expect(second.created).toBe(false);
    expect(second.identity.sub).toBe(first.identity.sub);
    expect(second.identity).toMatchObject({ displayName: 'Taro2', pictureUrl: 'https://p/2' });
  });

  it('adds email when granted and never removes it on a later login without it', async () => {
    const s = createMemoryStorage();
    await upsertIdentityFromLine(s, { channelId, claims, generateSub: () => 'sub-A' });
    const withEmail = await upsertIdentityFromLine(s, {
      channelId,
      claims: { ...claims, email: 't@example.com' },
    });
    expect(withEmail.identity).toMatchObject({ email: 't@example.com', emailVerified: true });
    const without = await upsertIdentityFromLine(s, { channelId, claims });
    expect(without.identity.email).toBe('t@example.com');
  });

  it('prefers the profile endpoint over id_token for name and picture, and keeps rawProfile', async () => {
    const s = createMemoryStorage();
    const r = await upsertIdentityFromLine(s, {
      channelId,
      claims,
      profile: { userId: 'Uaaa', displayName: 'FromProfile', pictureUrl: 'https://p/profile' },
    });
    expect(r.identity).toMatchObject({
      displayName: 'FromProfile',
      pictureUrl: 'https://p/profile',
    });
    expect(r.account.rawProfile).toMatchObject({ displayName: 'FromProfile' });
  });

  it('does not link by email across channels — different channel + different userId is a new identity', async () => {
    const s = createMemoryStorage();
    const jp = await upsertIdentityFromLine(s, {
      channelId: 'jp',
      claims: { ...claims, email: 'same@example.com' },
    });
    const tw = await upsertIdentityFromLine(s, {
      channelId: 'tw',
      claims: { ...claims, sub: 'Utw', email: 'same@example.com' },
    });
    expect(tw.created).toBe(true);
    expect(tw.identity.sub).not.toBe(jp.identity.sub);
  });

  it('reuses the identity when the same LINE user arrives through a sibling channel of the provider', async () => {
    const s = createMemoryStorage();
    const web = await upsertIdentityFromLine(s, {
      channelId,
      claims,
      generateSub: () => 'sub-web',
    });
    // A LINE MINI App channel of the same provider: same LINE user ID, different channel.
    const mini = await upsertIdentityFromLine(s, {
      channelId: '2011444277',
      claims: { ...claims, name: 'Taro (mini)' },
      kind: 'liff',
      providerChannelIds: [channelId, '2011444277'],
      generateSub: () => 'sub-should-not-be-used',
    });
    expect(mini.created).toBe(false);
    expect(mini.identity.sub).toBe(web.identity.sub);
    expect(mini.identity.displayName).toBe('Taro (mini)');
    const accounts = await s.identities.listLineAccounts('sub-web');
    expect(accounts.map((a) => [a.channelId, a.kind]).sort()).toEqual([
      [channelId, 'login'],
      ['2011444277', 'liff'],
    ]);
    // Without the provider hint (or for a channel outside it) the old rule holds: a new identity.
    const other = await upsertIdentityFromLine(s, {
      channelId: '3000000000',
      claims,
      generateSub: () => 'sub-other',
    });
    expect(other.created).toBe(true);
    expect(other.identity.sub).toBe('sub-other');
  });

  it('keeps a collapsed link (kind messaging) across later logins and LIFF exchanges', async () => {
    // Seen live on renkei-demo 2026-08-30: after linking without a configured
    // messaging channelId the login row's kind is 'messaging'; the next LIFF
    // exchange upserted kind 'liff' over it and line:linked went back to false.
    const s = createMemoryStorage();
    await upsertIdentityFromLine(s, { channelId, claims, generateSub: () => 'sub-A' });
    await s.identities.upsertLineAccount({
      identitySub: 'sub-A',
      channelId,
      lineUserId: 'Uaaa',
      kind: 'messaging',
    });
    const liff = await upsertIdentityFromLine(s, { channelId, claims, kind: 'liff', friend: true });
    expect(liff.created).toBe(false);
    expect(liff.account).toMatchObject({ kind: 'messaging', friend: true });
    const login = await upsertIdentityFromLine(s, { channelId, claims });
    expect(login.account.kind).toBe('messaging');
    const identity = await s.identities.findIdentity('sub-A');
    if (!identity) throw new Error('identity missing');
    const c = buildClaims(identity, await s.identities.listLineAccounts('sub-A'));
    expect(c).toMatchObject({ [LINE_CLAIMS.userId]: 'Uaaa', [LINE_CLAIMS.linked]: true });
  });

  it('leaves friendship untouched when the call did not check it', async () => {
    const s = createMemoryStorage();
    await upsertIdentityFromLine(s, { channelId, claims, friend: true });
    const r = await upsertIdentityFromLine(s, { channelId, claims });
    expect(r.account.friend).toBe(true);
  });
});

describe('buildClaims', () => {
  it('emits standard claims plus namespaced line:* claims', async () => {
    const s = createMemoryStorage();
    const r = await upsertIdentityFromLine(s, {
      channelId,
      claims: { ...claims, email: 'e@example.com' },
      friend: true,
      generateSub: () => 'sub-A',
    });
    const c = buildClaims(r.identity, await s.identities.listLineAccounts('sub-A'), {
      regionOf: () => 'jp',
    });
    expect(c).toEqual({
      sub: 'sub-A',
      name: 'Taro',
      picture: 'https://p/1',
      email: 'e@example.com',
      email_verified: true,
      [LINE_CLAIMS.userId]: 'Uaaa',
      [LINE_CLAIMS.channelId]: channelId,
      [LINE_CLAIMS.friend]: true,
      [LINE_CLAIMS.region]: 'jp',
      [LINE_CLAIMS.linked]: false,
    });
  });

  it('picks the preferred channel when the identity spans several', async () => {
    const s = createMemoryStorage();
    await upsertIdentityFromLine(s, { channelId: 'jp', claims, generateSub: () => 'sub-A' });
    const identity = await s.identities.findIdentity('sub-A');
    if (!identity) throw new Error('identity missing');
    await s.identities.upsertLineAccount({
      identitySub: 'sub-A',
      channelId: 'tw',
      lineUserId: 'Utw',
      kind: 'login',
    });
    await s.identities.upsertLineAccount({
      identitySub: 'sub-A',
      channelId: 'msg',
      lineUserId: 'Umsg',
      kind: 'messaging',
    });
    const accounts = await s.identities.listLineAccounts('sub-A');
    expect(buildClaims(identity, accounts, { preferChannelId: 'tw' })[LINE_CLAIMS.userId]).toBe(
      'Utw',
    );
    // messaging accounts are never surfaced as the login identity
    expect(
      buildClaims(identity, accounts, { preferChannelId: 'msg' })[LINE_CLAIMS.userId],
    ).not.toBe('Umsg');
    // ...but their presence flips line:linked to true
    expect(buildClaims(identity, accounts)[LINE_CLAIMS.linked]).toBe(true);
  });

  it('reports line:linked false until a messaging account is linked', async () => {
    const s = createMemoryStorage();
    await upsertIdentityFromLine(s, { channelId, claims, generateSub: () => 'sub-A' });
    const identity = await s.identities.findIdentity('sub-A');
    if (!identity) throw new Error('identity missing');
    expect(
      buildClaims(identity, await s.identities.listLineAccounts('sub-A'))[LINE_CLAIMS.linked],
    ).toBe(false);
  });

  it('keeps line:user_id/friend when the link collapses onto the login row', async () => {
    // Login and Messaging channels under one provider share the userId. When the
    // messaging channelId is not configured, the accountLink handler records the
    // messaging account under the login channelId — the same row — and its kind
    // becomes 'messaging'. That must not make the identity look account-less
    // (seen live on renkei-demo 2026-08-27: line:linked true, line:user_id gone).
    const s = createMemoryStorage();
    await upsertIdentityFromLine(s, {
      channelId,
      claims,
      friend: true,
      generateSub: () => 'sub-A',
    });
    await s.identities.upsertLineAccount({
      identitySub: 'sub-A',
      channelId,
      lineUserId: 'Uaaa',
      kind: 'messaging',
    });
    const identity = await s.identities.findIdentity('sub-A');
    if (!identity) throw new Error('identity missing');
    const c = buildClaims(identity, await s.identities.listLineAccounts('sub-A'), {
      regionOf: () => 'jp',
    });
    expect(c).toMatchObject({
      [LINE_CLAIMS.userId]: 'Uaaa',
      [LINE_CLAIMS.channelId]: channelId,
      [LINE_CLAIMS.friend]: true,
      [LINE_CLAIMS.region]: 'jp',
      [LINE_CLAIMS.linked]: true,
    });
  });
});
