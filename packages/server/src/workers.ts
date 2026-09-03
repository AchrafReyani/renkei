/**
 * Cloudflare Workers entry point. The Worker's `fetch` handler boots renkei
 * once per isolate (lazily, on the first request) and serves every request
 * from it. Storage is the D1 binding named `DB` by default.
 *
 *   // src/index.ts
 *   export { default } from 'renkei-server/workers';
 *
 *   # wrangler.toml
 *   compatibility_flags = ["nodejs_compat"]      # oidc-provider is a Node library
 *   [[d1_databases]]
 *   binding = "DB"
 *   database_name = "renkei"
 *   database_id = "…"
 *
 * Configuration uses the same variable names as the Node entry (see `env.ts`):
 * non-secret values under `[vars]`, secrets via `wrangler secret put`.
 * `RENKEI_JWKS` and `RENKEI_COOKIE_KEYS` are mandatory here in practice —
 * Workers run many isolates, and keys generated per isolate would not match
 * across them.
 */
import { createMemoryStorage, type Storage } from 'renkei-core';
import { createD1Storage, type D1DatabaseLike } from 'renkei-storage-sqlite/d1';
import { createRenkei, type Renkei } from './app.js';
import type { RenkeiOptions } from './config.js';
import { configFromEnv, type EnvLike } from './env.js';

/** The Worker's `env`: string vars and secrets plus bindings (D1, Hyperdrive, …). */
export type WorkerEnv = Record<string, unknown>;

export interface CreateWorkerOptions {
  /** Name of the D1 binding to use as storage. Default `"DB"`. */
  d1Binding?: string;
  /**
   * Build storage yourself instead — Postgres through Hyperdrive with
   * `renkei-storage-postgres`, or any custom adapter. Takes precedence over
   * the D1 binding.
   */
  storage?: (env: WorkerEnv) => Storage;
  /** Forwarded to `createRenkei()`: LINE API fetch and the log sink. */
  fetch?: RenkeiOptions['fetch'];
  logger?: RenkeiOptions['logger'];
}

export interface RenkeiWorker {
  /** The Workers `fetch` handler. */
  fetch(request: Request, env: WorkerEnv, ctx?: unknown): Promise<Response>;
  /** The booted renkei instance for this isolate (boots it on first call). */
  renkei(env: WorkerEnv): Promise<Renkei>;
}

/** Build a Worker. `export default createWorker()` is the whole Worker. */
export function createWorker(options: CreateWorkerOptions = {}): RenkeiWorker {
  let booting: Promise<Renkei> | undefined;

  const boot = async (env: WorkerEnv): Promise<Renkei> => {
    const storage = selectStorage(env, options);
    const strings = stringEntries(env);
    const parsed = configFromEnv(strings, {
      hasDatabase: Boolean(strings.DATABASE_URL) || Boolean(storage.init),
    });
    const logger = options.logger ?? console;
    if (parsed.generated.cookieKeys || parsed.generated.jwks) {
      const missing = [
        ...(parsed.generated.jwks ? ['RENKEI_JWKS'] : []),
        ...(parsed.generated.cookieKeys ? ['RENKEI_COOKIE_KEYS'] : []),
      ].join(' / ');
      logger.warn(
        `[renkei] ${missing} が未設定です。Workers では isolate ごとに別の鍵が生成され、ログインが isolate をまたいだ時点で失敗します。wrangler secret put で固定してください。 / ${missing} not set: on Workers every isolate would generate its own keys and logins fail as soon as a request lands on another isolate. Pin them with wrangler secret put.`,
      );
    }
    return createRenkei({
      config: parsed.config,
      storage,
      liffId: parsed.liffId,
      logStructured: parsed.logStructured,
      ...(options.fetch ? { fetch: options.fetch } : {}),
      ...(options.logger ? { logger: options.logger } : {}),
    });
  };

  const renkei = (env: WorkerEnv): Promise<Renkei> => {
    // A failed boot (bad config, D1 unreachable) must not poison the isolate: drop the
    // promise so the next request tries again.
    booting ??= boot(env).catch((err: unknown) => {
      booting = undefined;
      throw err;
    });
    return booting;
  };

  return {
    renkei,
    async fetch(request, env, ctx) {
      let instance: Renkei;
      try {
        instance = await renkei(env);
      } catch (err) {
        (options.logger ?? console).error('[renkei] failed to start:', err);
        const message = err instanceof Error ? err.message : String(err);
        return new Response(`renkei failed to start: ${message}`, {
          status: 500,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      }
      return instance.app.fetch(request, env, ctx as never);
    },
  };
}

function selectStorage(env: WorkerEnv, options: CreateWorkerOptions): Storage {
  if (options.storage) return options.storage(env);
  const binding = env[options.d1Binding ?? 'DB'];
  if (isD1(binding)) return createD1Storage(binding);
  return createMemoryStorage();
}

function isD1(value: unknown): value is D1DatabaseLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as D1DatabaseLike).prepare === 'function' &&
    typeof (value as D1DatabaseLike).batch === 'function'
  );
}

function stringEntries(env: WorkerEnv): EnvLike {
  const out: EnvLike = {};
  for (const [k, v] of Object.entries(env)) if (typeof v === 'string') out[k] = v;
  return out;
}

export default createWorker();
