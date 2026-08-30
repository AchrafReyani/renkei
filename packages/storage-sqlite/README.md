# renkei-storage-sqlite

renkei（連携）の SQLite ストレージ。Node 22.13+ の組み込み `node:sqlite` を使うので**依存ゼロ、ネイティブビルドなし、DB サーバー不要** — ファイル 1 つで動きます（WAL モード、外部キー有効、起動時に自動マイグレーション）。`renkei-server` は `DATABASE_URL=sqlite:./data/renkei.db` で自動的にこれを使います。

SQLite storage for renkei (連携). Built on Node 22.13+'s bundled `node:sqlite`: **zero dependencies, no native build, no database server** — one file on disk (WAL mode, foreign keys on, migrations applied on boot). `renkei-server` picks it up with `DATABASE_URL=sqlite:./data/renkei.db`.

```ts
import { createSqliteStorage } from 'renkei-storage-sqlite';

const storage = createSqliteStorage({ filename: './data/renkei.db' }); // or ':memory:'
```

`better-sqlite3` や Bun の `bun:sqlite` を使う場合は、開いた DB をそのまま渡します。
With `better-sqlite3` or Bun's `bun:sqlite`, pass the opened database as the driver:

```ts
import Database from 'better-sqlite3';
import { createSqliteDriverStorage } from 'renkei-storage-sqlite';

const storage = createSqliteDriverStorage(new Database('./data/renkei.db'));
```

Node 22.5–22.12 では `node --experimental-sqlite` が必要です。
On Node 22.5–22.12 start Node with `--experimental-sqlite`.

ドキュメント / Docs: <https://github.com/AchrafReyani/renkei> · Apache-2.0
