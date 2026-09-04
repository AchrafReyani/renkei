# renkei-storage-sqlite

## 0.5.0

### Minor Changes

- df00b94: Cloudflare Workers deploy target. `renkei-storage-sqlite/d1` adds `createD1Storage(env.DB)`: the same SQL as the SQLite adapter on a D1 binding (statements batched atomically, schema version in a `renkei_meta` table because D1 refuses `PRAGMA user_version` and `BEGIN`). The `SqliteDriver` interface now accepts asynchronous bindings — every method may return a Promise — and `migrateSqlite()` / `readUserVersion()` are async accordingly. `renkei-server/workers` exports `createWorker()` (and a default Worker): renkei boots once per isolate from the Worker's vars and secrets, stores in the `DB` binding (or a custom one, or a storage you build for Hyperdrive + Postgres), answers 500 and retries on a failed boot, and warns when `RENKEI_JWKS` / `RENKEI_COOKIE_KEYS` are not pinned. `configFromEnv()` is exported from `renkei-server` so the Node entry and the Worker parse the same variables.

## 0.3.0

### Minor Changes

- f05994c: New `renkei-storage-sqlite`: single-file storage on Node's built-in `node:sqlite` (Node 22.13+), with zero runtime dependencies, WAL mode and migrations applied on boot; `better-sqlite3` and Bun's `bun:sqlite` plug in through `createSqliteDriverStorage()`. `renkei-server` selects it with `DATABASE_URL=sqlite:./data/renkei.db` (`sqlite::memory:` for a throwaway database), so a single-box deploy no longer needs a Postgres.
