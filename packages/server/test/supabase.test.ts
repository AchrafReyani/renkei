/**
 * The Supabase Edge Functions entry: lazy per-isolate boot from `Deno.env`
 * (or an explicit env), storage selection (DATABASE_URL → SUPABASE_DB_URL →
 * memory), the `/functions/v1/<name>` issuer prefix, a failed boot that does
 * not poison later requests, and `serve()` on `Deno.serve`.
 */
import { exportJWK, generateKeyPair } from 'jose';
import { afterEach, describe, expect, it } from 'vitest';
import { createEdgeFunction, serve } from '../src/supabase.js';

const ISSUER = 'http://127.0.0.1:54321/functions/v1/renkei';
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

const g = globalThis as { Deno?: unknown };

describe('renkei-server/supabase', () => {
  afterEach(() => {
    delete g.Deno;
  });

  it('boots once from env, falls back to memory storage and serves under the function prefix', async () => {
    const { lines, logger } = capture();
    const fn = createEdgeFunction({ env: BASE, logger });

    // Supabase hands the function `/<name>/…`; the gateway URL also works; so does the bare path.
    for (const path of ['/renkei/healthz', '/functions/v1/renkei/healthz', '/healthz']) {
      const res = await fn.fetch(new Request(`http://edge-runtime.internal${path}`));
      expect(res.status, path).toBe(200);
    }
    const disc = await fn.fetch(
      new Request('http://edge-runtime.internal/renkei/.well-known/openid-configuration'),
    );
    const d = (await disc.json()) as Record<string, string>;
    expect(d.issuer).toBe(ISSUER);
    expect(d.authorization_endpoint).toBe(`${ISSUER}/oidc/auth`);
    expect(d.jwks_uri).toBe(`${ISSUER}/oidc/jwks`);

    const instance = await fn.renkei();
    expect(await fn.renkei()).toBe(instance);
    expect(instance.storage.init).toBeUndefined(); // memory
    expect(instance.config.dev).toBe(true); // no clients, no database → /dev on
    expect(lines.some((l) => l.includes('in-memory'))).toBe(true);
    const dev = await fn.fetch(new Request('http://edge-runtime.internal/renkei/dev'));
    expect(dev.status).toBe(200);
    expect(await dev.text()).toContain('href="/functions/v1/renkei/dev/login"');
  });

  it('routes the /dev page\u2019s own calls through SUPABASE_URL (the gateway seen from inside the container)', async () => {
    const fn = createEdgeFunction({
      env: { ...BASE, SUPABASE_URL: 'http://kong:8000' },
      logger: capture().logger,
    });
    const login = await fn.fetch(
      new Request('http://edge-runtime.internal/renkei/dev/login', { redirect: 'manual' }),
    );
    // The browser-facing redirect keeps the public issuer…
    expect(login.headers.get('location')).toContain(`${ISSUER}/oidc/auth?`);
    const cookie = login.headers.get('set-cookie')?.split(';')[0] ?? '';
    const state = new URL(login.headers.get('location') ?? '').searchParams.get('state');
    // …while the token exchange from the callback goes to the gateway.
    const calls: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response(JSON.stringify({ error: 'invalid_grant' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;
    try {
      const cb = await fn.fetch(
        new Request(`http://edge-runtime.internal/renkei/dev/callback?code=x&state=${state}`, {
          headers: { cookie },
        }),
      );
      expect(cb.status).toBe(400);
    } finally {
      globalThis.fetch = realFetch;
    }
    expect(calls).toEqual(['http://kong:8000/functions/v1/renkei/oidc/token']);
  });

  it('reads Deno.env when no env is given', async () => {
    g.Deno = { env: { toObject: () => ({ ...BASE }) } };
    const fn = createEdgeFunction({ logger: capture().logger });
    const res = await fn.fetch(new Request('http://edge-runtime.internal/renkei/healthz'));
    expect(res.status).toBe(200);
  });

  it('requires ISSUER and explains where it comes from', async () => {
    const { lines, logger } = capture();
    const { ISSUER: _i, ...noIssuer } = BASE;
    const fn = createEdgeFunction({ env: noIssuer, logger });
    const res = await fn.fetch(new Request('http://edge-runtime.internal/renkei/healthz'));
    expect(res.status).toBe(500);
    expect(await res.text()).toContain('functions/v1/<function-name>');
    expect(lines.some((l) => l.includes('failed to start'))).toBe(true);
  });

  it('picks Postgres from SUPABASE_DB_URL (with a warning) or DATABASE_URL, and refuses sqlite:', async () => {
    // A Postgres nobody listens on: selection is proven by the boot failing on the
    // connection, not on configuration, and the isolate recovers afterwards.
    const dead = 'postgres://renkei:renkei@127.0.0.1:1/renkei';
    const { lines, logger } = capture();
    const viaSupabase = createEdgeFunction({ env: { ...BASE, SUPABASE_DB_URL: dead }, logger });
    const res = await viaSupabase.fetch(new Request('http://edge-runtime.internal/renkei/healthz'));
    expect(res.status).toBe(500);
    expect(await res.text()).toMatch(/ECONNREFUSED|connect|Failed query/i);
    expect(lines.some((l) => l.includes('using SUPABASE_DB_URL'))).toBe(true);

    const explicit = createEdgeFunction({
      env: { ...BASE, DATABASE_URL: dead, SUPABASE_DB_URL: 'postgres://ignored' },
      logger: capture().logger,
    });
    await expect(explicit.renkei()).rejects.toThrow(/ECONNREFUSED|connect|Failed query/i);

    const sqlite = createEdgeFunction({
      env: { ...BASE, DATABASE_URL: 'sqlite:./renkei.db' },
      logger: capture().logger,
    });
    await expect(sqlite.renkei()).rejects.toThrow(/sqlite:.*not available/);
  }, 20_000);

  it('honours a storage factory and answers 500 until a broken config is fixed', async () => {
    let called = 0;
    const factory = createEdgeFunction({
      env: { ...BASE, SUPABASE_DB_URL: 'postgres://ignored' },
      logger: capture().logger,
      storage: (env) => {
        called++;
        expect(env.SUPABASE_DB_URL).toBe('postgres://ignored');
        return { identities: {} as never, payloads: {} as never };
      },
    });
    await factory.renkei().catch(() => undefined);
    expect(called).toBe(1);

    let env: Record<string, string | undefined> = { ...BASE, LINE_LOGIN_CHANNEL_ID: undefined };
    g.Deno = { env: { toObject: () => env } };
    const fn = createEdgeFunction({ logger: capture().logger });
    const broken = await fn.fetch(new Request('http://edge-runtime.internal/renkei/healthz'));
    expect(broken.status).toBe(500);
    expect(await broken.text()).toContain('LINE_LOGIN_CHANNEL_ID');
    env = { ...BASE };
    const ok = await fn.fetch(new Request('http://edge-runtime.internal/renkei/healthz'));
    expect(ok.status).toBe(200);
  });

  it('warns when RENKEI_JWKS / RENKEI_COOKIE_KEYS are absent (per-isolate keys)', async () => {
    const { lines, logger } = capture();
    const { RENKEI_JWKS: _j, RENKEI_COOKIE_KEYS: _c, ...bare } = BASE;
    await createEdgeFunction({ env: bare, logger }).renkei();
    expect(lines.some((l) => l.includes('RENKEI_JWKS / RENKEI_COOKIE_KEYS'))).toBe(true);
    expect(lines.some((l) => l.includes('supabase secrets set'))).toBe(true);
  });

  it('serve() hands the handler to Deno.serve and fails clearly without it', async () => {
    let handler: ((r: Request) => Response | Promise<Response>) | undefined;
    g.Deno = {
      env: { toObject: () => ({ ...BASE }) },
      serve: (h: (r: Request) => Response | Promise<Response>) => {
        handler = h;
      },
    };
    const fn = serve({ logger: capture().logger });
    expect(handler).toBe(fn.fetch);
    const res = await handler?.(new Request('http://edge-runtime.internal/renkei/healthz'));
    expect(res?.status).toBe(200);

    delete g.Deno;
    expect(() => serve({ env: BASE, logger: capture().logger })).toThrow(/Deno\.serve/);
  });
});
