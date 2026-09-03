/**
 * The Workers entry: lazy per-isolate boot from `env`, D1 binding detection,
 * a failed boot that does not poison later requests, and the key warning.
 */
import { exportJWK, generateKeyPair } from 'jose';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createWorker } from '../src/workers.js';

const ISSUER = 'http://renkei.test';
const { privateKey } = await generateKeyPair('RS256', { modulusLength: 2048, extractable: true });
const BASE = {
  ISSUER,
  LINE_LOGIN_CHANNEL_ID: '2011257262',
  LINE_LOGIN_CHANNEL_SECRET: 'test-channel-secret-0123456789',
  RENKEI_COOKIE_KEYS: '0123456789abcdef0123',
  RENKEI_JWKS: JSON.stringify([
    { ...(await exportJWK(privateKey)), kid: 'test', alg: 'RS256', use: 'sig' },
  ]),
};

function capture() {
  const lines: string[] = [];
  const sink = (...a: unknown[]) => {
    lines.push(a.map(String).join(' '));
  };
  return { lines, logger: { info: sink, warn: sink, error: sink } };
}

describe('renkei-server/workers', () => {
  const mf = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("ok"); } };',
    d1Databases: { DB: 'renkei-workers-test' },
  });
  let DB: unknown;
  beforeAll(async () => {
    DB = await mf.getD1Database('DB');
  }, 60_000);
  afterAll(() => mf.dispose());

  it('boots once from env, stores in the D1 binding and serves discovery with the configured issuer', async () => {
    const { lines, logger } = capture();
    const worker = createWorker({ logger });
    const env = {
      ...BASE,
      RENKEI_CLIENTS: JSON.stringify([
        {
          clientId: 'app',
          clientSecret: 'app-secret-0123456789abcdef',
          redirectUris: ['http://app.test/cb'],
        },
      ]),
      DB,
    };

    const health = await worker.fetch(new Request(`${ISSUER}/healthz`), env);
    expect(health.status).toBe(200);
    const disc = await worker.fetch(new Request(`${ISSUER}/.well-known/openid-configuration`), env);
    expect(disc.status).toBe(200);
    expect(((await disc.json()) as { issuer: string }).issuer).toBe(ISSUER);

    const instance = await worker.renkei(env);
    expect(await worker.renkei(env)).toBe(instance); // same isolate, same instance
    expect(instance.storage.init).toBeDefined(); // D1, not memory
    // A D1 binding counts as a database: no in-memory warning, and /dev stays off
    // when RENKEI_DEV is not set…
    expect(lines.some((l) => l.includes('in-memory'))).toBe(false);
    expect(instance.config.dev).toBe(false);
    // …and the D1 tables exist after boot.
    const table = await (DB as { prepare(q: string): { first(): Promise<unknown> } })
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'renkei_identity'")
      .first();
    expect(table).toMatchObject({ name: 'renkei_identity' });
  });

  it('falls back to memory storage without a D1 binding and turns /dev on', async () => {
    const { lines, logger } = capture();
    const worker = createWorker({ logger });
    const instance = await worker.renkei({ ...BASE });
    expect(instance.storage.init).toBeUndefined();
    expect(instance.config.dev).toBe(true);
    expect(lines.some((l) => l.includes('in-memory'))).toBe(true);
    const dev = await worker.fetch(new Request(`${ISSUER}/dev`), { ...BASE });
    expect(dev.status).toBe(200);
  });

  it('honours a custom binding name and a storage factory', async () => {
    const custom = createWorker({ d1Binding: 'RENKEI_DB', logger: capture().logger });
    expect((await custom.renkei({ ...BASE, RENKEI_DB: DB })).storage.init).toBeDefined();

    let called = 0;
    const factory = createWorker({
      logger: capture().logger,
      storage: () => {
        called++;
        return { identities: {} as never, payloads: {} as never };
      },
    });
    await factory.renkei({ ...BASE, DB }).catch(() => undefined);
    expect(called).toBe(1);
  });

  it('answers 500 while the config is broken and recovers once it is fixed', async () => {
    const { lines, logger } = capture();
    const worker = createWorker({ logger });
    const broken = { ...BASE, LINE_LOGIN_CHANNEL_ID: undefined };
    const res = await worker.fetch(new Request(`${ISSUER}/healthz`), broken);
    expect(res.status).toBe(500);
    expect(await res.text()).toContain('LINE_LOGIN_CHANNEL_ID');
    expect(lines.some((l) => l.includes('failed to start'))).toBe(true);

    const ok = await worker.fetch(new Request(`${ISSUER}/healthz`), { ...BASE });
    expect(ok.status).toBe(200);
  });

  it('warns when RENKEI_JWKS / RENKEI_COOKIE_KEYS are absent (per-isolate keys)', async () => {
    const { lines, logger } = capture();
    const worker = createWorker({ logger });
    const { RENKEI_JWKS: _j, RENKEI_COOKIE_KEYS: _c, ...bare } = BASE;
    await worker.renkei(bare);
    const warning = lines.find((l) => l.includes('wrangler secret put'));
    expect(warning).toContain('RENKEI_JWKS / RENKEI_COOKIE_KEYS');
  });
});
