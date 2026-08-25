import { describe, expect, it } from 'vitest';
import { createMemoryStorage } from '../src/index.js';
import { storageContract } from './storage-contract.js';

storageContract('memory', () => createMemoryStorage());

describe('memory storage expiry', () => {
  it('expires payloads by the injected clock', async () => {
    let t = 1_000_000;
    const s = createMemoryStorage({ now: () => new Date(t) });
    await s.payloads.upsert('AccessToken', 'x', { v: 1 }, 10);
    expect(await s.payloads.find('AccessToken', 'x')).toBeDefined();
    t += 10_001;
    expect(await s.payloads.find('AccessToken', 'x')).toBeUndefined();
  });

  it('never expires payloads stored without a TTL', async () => {
    let t = 0;
    const s = createMemoryStorage({ now: () => new Date(t) });
    await s.payloads.upsert('Client', 'c', { v: 1 });
    t = Number.MAX_SAFE_INTEGER;
    expect(await s.payloads.find('Client', 'c')).toBeDefined();
  });
});
