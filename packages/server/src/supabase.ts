/**
 * Supabase Edge Functions (Deno) entry point. The function boots renkei once
 * per isolate (lazily, on the first request) and serves every request from
 * it. Storage is Postgres — `DATABASE_URL`, else the `SUPABASE_DB_URL` every
 * Edge Function gets for its own project database.
 *
 *   // supabase/functions/renkei/index.ts
 *   import { serve } from 'npm:renkei-server/supabase';
 *   serve();
 *
 *   # supabase/config.toml
 *   [functions.renkei]
 *   verify_jwt = false        # browsers and LINE's redirect carry no Supabase JWT
 *
 * Configuration uses the same variable names as the Node entry (see `env.ts`),
 * loaded with `supabase secrets set` (or `--env-file` locally). `ISSUER` is
 * the function's public URL — `https://<ref>.supabase.co/functions/v1/renkei`
 * — and carries the `/functions/v1/renkei` path: renkei keeps it on every URL
 * it builds and strips it from incoming requests (Supabase hands the
 * function `/renkei/…`). `RENKEI_JWKS` and `RENKEI_COOKIE_KEYS` must be
 * pinned: the function runs in many isolates, and keys generated per isolate
 * would not match across them.
 */
import { createMemoryStorage, type Storage } from 'renkei-core';
import { createPostgresStorage } from 'renkei-storage-postgres';
import { createRenkei, type Renkei } from './app.js';
import type { RenkeiOptions } from './config.js';
import { configFromEnv, type EnvLike } from './env.js';

export interface CreateEdgeFunctionOptions {
  /** Variables to configure from. Default: `Deno.env.toObject()` (or `process.env` off Deno). */
  env?: EnvLike;
  /**
   * Build storage yourself instead — a different Postgres, a pool you manage,
   * or any custom adapter. Takes precedence over `DATABASE_URL` / `SUPABASE_DB_URL`.
   */
  storage?: (env: EnvLike) => Storage;
  /** Forwarded to `createRenkei()`: LINE API fetch and the log sink. */
  fetch?: RenkeiOptions['fetch'];
  logger?: RenkeiOptions['logger'];
}

export interface RenkeiEdgeFunction {
  /** The request handler: `Deno.serve(fn.fetch)`. */
  fetch(request: Request): Promise<Response>;
  /** The booted renkei instance for this isolate (boots it on first call). */
  renkei(): Promise<Renkei>;
}

interface DenoLike {
  env?: { toObject(): Record<string, string> };
  serve?: (handler: (request: Request) => Response | Promise<Response>) => unknown;
}

const deno = (): DenoLike | undefined => (globalThis as { Deno?: DenoLike }).Deno;

/** Build the function. `Deno.serve(createEdgeFunction().fetch)` — or just `serve()`. */
export function createEdgeFunction(options: CreateEdgeFunctionOptions = {}): RenkeiEdgeFunction {
  let booting: Promise<Renkei> | undefined;

  const boot = async (): Promise<Renkei> => {
    const env = options.env ?? runtimeEnv();
    if (!env.ISSUER) {
      throw new Error(
        'ISSUER is not set — on Supabase it is the function URL, https://<project-ref>.supabase.co/functions/v1/<function-name> (locally http://127.0.0.1:54321/functions/v1/<function-name>)',
      );
    }
    const logger = options.logger ?? console;
    const storage = selectStorage(env, options, logger);
    const parsed = configFromEnv(env, { hasDatabase: Boolean(storage.init) });
    if (parsed.generated.cookieKeys || parsed.generated.jwks) {
      const missing = [
        ...(parsed.generated.jwks ? ['RENKEI_JWKS'] : []),
        ...(parsed.generated.cookieKeys ? ['RENKEI_COOKIE_KEYS'] : []),
      ].join(' / ');
      logger.warn(
        `[renkei] ${missing} が未設定です。Edge Functions では isolate ごとに別の鍵が生成され、ログインが isolate をまたいだ時点で失敗します。supabase secrets set で固定してください。 / ${missing} not set: on Edge Functions every isolate would generate its own keys and logins fail as soon as a request lands on another isolate. Pin them with supabase secrets set.`,
      );
    }
    return createRenkei({
      config: parsed.config,
      storage,
      liffId: parsed.liffId,
      logStructured: parsed.logStructured,
      // The /dev page calls renkei back through the gateway. Locally the public
      // 127.0.0.1:54321 is not reachable from inside the container; SUPABASE_URL
      // (http://kong:8000 there, the project URL in production) is.
      devInternalIssuer: internalIssuer(env),
      ...(options.fetch ? { fetch: options.fetch } : {}),
      ...(options.logger ? { logger: options.logger } : {}),
    });
  };

  const renkei = (): Promise<Renkei> => {
    // A failed boot (missing secret, Postgres unreachable) must not poison the
    // isolate: drop the promise so the next request tries again.
    booting ??= boot().catch((err: unknown) => {
      booting = undefined;
      throw err;
    });
    return booting;
  };

  return {
    renkei,
    async fetch(request) {
      let instance: Renkei;
      try {
        instance = await renkei();
      } catch (err) {
        (options.logger ?? console).error('[renkei] failed to start:', err);
        const message = err instanceof Error ? err.message : String(err);
        return new Response(`renkei failed to start: ${message}`, {
          status: 500,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      }
      return instance.fetch(request);
    },
  };
}

/** `createEdgeFunction()` + `Deno.serve()`. The whole function body on Supabase. */
export function serve(options: CreateEdgeFunctionOptions = {}): RenkeiEdgeFunction {
  const fn = createEdgeFunction(options);
  const d = deno();
  if (!d?.serve) {
    throw new Error(
      'Deno.serve is not available — serve() is for Supabase Edge Functions / Deno; elsewhere use createEdgeFunction().fetch with your own listener',
    );
  }
  d.serve(fn.fetch);
  return fn;
}

function internalIssuer(env: EnvLike): string | undefined {
  if (!env.SUPABASE_URL || !env.ISSUER) return undefined;
  return `${env.SUPABASE_URL.replace(/\/+$/, '')}${new URL(env.ISSUER).pathname.replace(/\/+$/, '')}`;
}

function runtimeEnv(): EnvLike {
  const d = deno();
  if (d?.env) return d.env.toObject();
  const p = (globalThis as { process?: { env?: EnvLike } }).process;
  return p?.env ?? {};
}

function selectStorage(
  env: EnvLike,
  options: CreateEdgeFunctionOptions,
  logger: Pick<Console, 'warn'>,
): Storage {
  if (options.storage) return options.storage(env);
  const url = env.DATABASE_URL || env.SUPABASE_DB_URL;
  if (!url) return createMemoryStorage();
  if (url.startsWith('sqlite:')) {
    throw new Error(
      'DATABASE_URL=sqlite:… is not available on Supabase Edge Functions (no node:sqlite) — use a Postgres URL, or unset it to use SUPABASE_DB_URL',
    );
  }
  if (!env.DATABASE_URL) {
    logger.warn(
      '[renkei] DATABASE_URL 未設定のため SUPABASE_DB_URL（プロジェクトの Postgres）を使います / DATABASE_URL not set: using SUPABASE_DB_URL (the project database)',
    );
  }
  // One connection per isolate, closed when idle: Edge Function isolates are
  // many and short-lived, and the project database has a small connection cap.
  // RLS on renkei's tables keeps the project's Data API (anon key) away from them.
  return createPostgresStorage({
    connectionString: url,
    max: 1,
    idleTimeout: 20,
    rowLevelSecurity: true,
  });
}
