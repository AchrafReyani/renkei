/**
 * Node entry point: configuration from environment variables (see `env.ts`
 * for the list), storage selection from `DATABASE_URL`, and an HTTP listener.
 *
 *   PORT          listen port (default: from ISSUER, else 3000)
 *   DATABASE_URL  postgres://… (renkei-storage-postgres) or sqlite:<file> (renkei-storage-sqlite,
 *                 Node's built-in node:sqlite); in-memory storage if absent
 */
import { serve } from '@hono/node-server';
import { createMemoryStorage, type Storage } from 'renkei-core';
import { createPostgresStorage } from 'renkei-storage-postgres';
import { createSqliteStorage } from 'renkei-storage-sqlite';
import { createRenkei } from './app.js';
import { configFromEnv } from './env.js';

const env = process.env;
const { config, issuer, dev, liffId, logStructured } = configFromEnv(env);

const storage: Storage = env.DATABASE_URL ? storageFor(env.DATABASE_URL) : createMemoryStorage();

const renkei = await createRenkei({ config, storage, liffId, logStructured });
const port = Number(env.PORT ?? new URL(issuer).port ?? 3000) || 3000;

serve({ fetch: renkei.app.fetch, port }, () => {
  console.log(
    `renkei → ${issuer}  (listening on :${port}, storage: ${storageKind(env.DATABASE_URL)}${dev ? ', dev RP at /dev' : ''})`,
  );
});

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
