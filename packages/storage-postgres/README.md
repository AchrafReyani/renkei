# renkei-storage-postgres

renkei（連携）の Postgres ストレージ。Drizzle ORM、マイグレーション同梱（起動時に自動適用）。`renkei-server` は `DATABASE_URL` を設定すると自動でこれを使います。

Postgres storage for renkei (連携): Drizzle ORM with bundled migrations, applied on boot. `renkei-server` picks it up automatically when `DATABASE_URL` is set.

```ts
import { createPostgresStorage } from 'renkei-storage-postgres';
```

ドキュメント / Docs: <https://github.com/AchrafReyani/renkei> · Apache-2.0
