/**
 * Node entry point. Configuration comes from `renkei.yaml` when there is one
 * (see `config-file.ts`), otherwise from environment variables (see `env.ts`).
 * Storage is selected from the URL, and an HTTP listener is started.
 *
 *   RENKEI_CONFIG  path to the config file; without it, `renkei.yaml` /
 *                  `renkei.yml` in the working directory is used if present
 *   PORT           listen port (default: the file's `port`, else from ISSUER, else 3000)
 *   DATABASE_URL   postgres://… (renkei-storage-postgres) or sqlite:<file> (renkei-storage-sqlite,
 *                  Node's built-in node:sqlite); in-memory storage if absent.
 *                  A `storage:` in the config file wins over it.
 */
import { readFileSync } from 'node:fs';
import { serve } from '@hono/node-server';
import { createMemoryStorage, type Storage } from 'renkei-core';
import { createPostgresStorage } from 'renkei-storage-postgres';
import { createSqliteStorage } from 'renkei-storage-sqlite';
import { createRenkei } from './app.js';
import type { RenkeiConfigInput } from './config.js';
import {
  findConfigFile,
  ignoredEnvVars,
  loadConfigFile,
  referencedEnvVars,
} from './config-file.js';
import { configFromEnv } from './env.js';

const env = process.env;

const file = findConfigFile(process.cwd(), env);
const from = file ? fromFile(file) : fromEnv();

const databaseUrl = from.storage ?? env.DATABASE_URL;
const storage: Storage = databaseUrl ? storageFor(databaseUrl) : createMemoryStorage();

const renkei = await createRenkei({
  config: from.config,
  storage,
  liffId: from.liffId,
  logStructured: from.logStructured,
});
const port =
  Number(env.PORT ?? from.port ?? new URL(from.issuer).port ?? 3000) || from.port || 3000;

serve({ fetch: renkei.app.fetch, port }, () => {
  console.log(
    `renkei → ${from.issuer}  (listening on :${port}, config: ${from.source}, storage: ${storageKind(databaseUrl)}${
      from.dev ? ', dev RP at /dev' : ''
    })`,
  );
  for (const line of from.warnings) console.warn(line);
});

interface Source {
  config: RenkeiConfigInput;
  issuer: string;
  dev: boolean;
  liffId: string | undefined;
  logStructured: boolean;
  storage: string | undefined;
  port: number | undefined;
  source: string;
  warnings: string[];
}

function fromEnv(): Source {
  const { config, issuer, dev, liffId, logStructured } = configFromEnv(env);
  return {
    config,
    issuer,
    dev,
    liffId,
    logStructured,
    storage: undefined,
    port: undefined,
    source: 'environment',
    warnings: [],
  };
}

/**
 * The file is the whole configuration: `configFromEnv` is not consulted at all,
 * so a leftover `LINE_LOGIN_CHANNEL_ID` in a shell cannot quietly add a channel.
 * Anything set but superseded is named on the banner instead of being dropped
 * in silence.
 */
function fromFile(path: string): Source {
  const loaded = loadConfigFile(path, env);
  const ignored = ignoredEnvVars(env, referencedEnvVars(readFileSync(path, 'utf8')));
  return {
    config: loaded.config,
    issuer: loaded.config.issuer,
    dev: loaded.config.dev ?? false,
    liffId: loaded.liffId,
    logStructured: loaded.logFormat === 'json',
    storage: loaded.storage,
    port: loaded.port,
    source: path,
    warnings: ignored.length
      ? [
          `[renkei] ${path} が設定なので次の環境変数は無視されます / ignored, because ${path} is the configuration: ${ignored.join(', ')}`,
        ]
      : [],
  };
}

/** `sqlite:./data/renkei.db` (or `sqlite::memory:`) selects SQLite; anything else is a Postgres URL. */
function storageFor(url: string): Storage {
  if (storageKind(url) === 'sqlite') {
    return createSqliteStorage({ filename: url.slice('sqlite:'.length).replace(/^\/\//, '') });
  }
  return createPostgresStorage({ connectionString: url });
}

function storageKind(url: string | undefined): 'memory' | 'sqlite' | 'postgres' {
  if (!url) return 'memory';
  return url.startsWith('sqlite:') ? 'sqlite' : 'postgres';
}
