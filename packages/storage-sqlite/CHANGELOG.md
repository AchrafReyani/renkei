# renkei-storage-sqlite

## 0.3.0

### Minor Changes

- f05994c: New `renkei-storage-sqlite`: single-file storage on Node's built-in `node:sqlite` (Node 22.13+), with zero runtime dependencies, WAL mode and migrations applied on boot; `better-sqlite3` and Bun's `bun:sqlite` plug in through `createSqliteDriverStorage()`. `renkei-server` selects it with `DATABASE_URL=sqlite:./data/renkei.db` (`sqlite::memory:` for a throwaway database), so a single-box deploy no longer needs a Postgres.
