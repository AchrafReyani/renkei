# Cloudflare Workers にデプロイする

> English: [deploy-cloudflare-workers.en.md](deploy-cloudflare-workers.en.md)

renkei を Worker として動かし、データベースに D1 を使う手順です。所要時間 15 分。試すだけなら無料プランで足ります（Workers: 10 万リクエスト/日、D1: 5 GB）。必要なもの: Cloudflare アカウント、Node 22、`npx wrangler login`。

Worker 本体は `renkei-server/workers` の re-export 1 行です。isolate ごとに 1 回、Worker の vars とシークレットから renkei を起動し、ID と OIDC の状態を D1 binding に保存します。完成形は [`examples/cloudflare-workers`](https://github.com/AchrafReyani/renkei/tree/main/examples/cloudflare-workers) にあります。

## 1. プロジェクト（ファイル 3 つ）

```sh
mkdir my-renkei && cd my-renkei
npm init -y && npm i renkei-server && npm i -D wrangler typescript
```

`src/index.ts`:

```ts
export { default } from 'renkei-server/workers';
```

`wrangler.toml`:

```toml
name = "renkei"
main = "src/index.ts"
compatibility_date = "2026-08-01"
compatibility_flags = ["nodejs_compat"]   # oidc-provider は Node ライブラリ

[vars]
ISSUER = "https://renkei.<your-subdomain>.workers.dev"   # Worker の URL。末尾スラッシュなし
RENKEI_DEV = "true"                                       # /dev テストページ。本番では外す

[[d1_databases]]
binding = "DB"
database_name = "renkei"
database_id = "<手順 2 で取得>"
```

`nodejs_compat` は必須です。renkei の OIDC 層（`oidc-provider`）が `node:events` / `node:stream` / `node:crypto` を使います。起動時に workerd が `oidc-provider WARNING: Unsupported runtime` と 1 行出しますが、見た目だけの警告です（プロバイダーはフル機能で動きます。縮小モードはありません）。

## 2. D1 データベースを作る

```sh
npx wrangler d1 create renkei     # 表示された database_id を wrangler.toml に貼る
```

テーブルは最初のリクエストで renkei が自動作成します（冪等。バージョンは `renkei_meta` テーブルで管理）。マイグレーションコマンドは、初回もアップグレード後も不要です。

## 3. シークレット

署名鍵と Cookie 鍵は一度だけ生成して**固定**します。Workers は多数の isolate で動くため、固定しないと isolate ごとに別の鍵が作られ、ある isolate で始めたログインが別の isolate で失敗します。

```sh
npx renkei init --print          # .env 一式を表示。RENKEI_JWKS と RENKEI_COOKIE_KEYS の行をコピー
npx wrangler secret put LINE_LOGIN_CHANNEL_ID
npx wrangler secret put LINE_LOGIN_CHANNEL_SECRET
npx wrangler secret put RENKEI_JWKS
npx wrangler secret put RENKEI_COOKIE_KEYS
```

[設定リファレンス](../reference/config.ja.md)の変数はすべて同じ名前で使えます。秘密でないものは `[vars]`、秘密は `wrangler secret put` に。例外は `DATABASE_URL` だけで、Workers ではストレージは D1 binding です。

## 4. LINE 側にコールバックを登録

LINE Developers Console → ログインチャネル → **LINE ログイン → コールバック URL** に
`https://renkei.<your-subdomain>.workers.dev/line/callback` を追加（[コンソールの手順](line-console.ja.md#2-line-login-チャネルを作る)）。

## 5. デプロイして確認

```sh
npx wrangler deploy
curl https://renkei.<your-subdomain>.workers.dev/.well-known/openid-configuration   # issuer が自分の URL なら OK
open https://renkei.<your-subdomain>.workers.dev/dev                                # RENKEI_DEV=true のときのテスト RP
```

`/dev` で LINE ログインが完走し（友だち追加画面 → `line:*` クレーム入りの id_token）たら完了です。

## ローカル開発

```sh
cp .dev.vars.example .dev.vars   # example の場合。それ以外は上の 4 つのシークレットを .dev.vars に書く
npx wrangler dev                 # http://localhost:8787/dev — ローカル D1 は .wrangler/ の下
```

開発中は `ISSUER = "http://localhost:8787"` にし、チャネルに `http://localhost:8787/line/callback` も登録しておきます。

## 本番で変えること

| | 試すとき | 本番 |
|---|---|---|
| `RENKEI_DEV` | `"true"`（`/dev` が公開される） | 外す。アプリは `RENKEI_CLIENTS` に登録 |
| `RENKEI_CLIENTS` | — | `npx renkei add-client <id> --redirect <url> --preset next --print` で値を表示し、`wrangler secret put RENKEI_CLIENTS` に保存（クライアントシークレットを含むため） |
| ドメイン | `*.workers.dev` | Worker にカスタムドメイン。`ISSUER` を合わせる |
| バックアップ | — | D1 Time Travel（有料プランで 30 日） |
| `RENKEI_CORS_ORIGINS` | 不要 | LIFF アプリが `/liff/exchange` を直接呼ぶなら設定 |

## D1 ではなく Postgres を使う

Postgres が既にあるならそのまま使えます。Hyperdrive で binding し、Worker を自分で組み立てます。

```ts
import { createPostgresStorage } from 'renkei-storage-postgres';
import { createWorker } from 'renkei-server/workers';

export default createWorker({
  storage: (env) =>
    createPostgresStorage({ connectionString: (env.HYPERDRIVE as Hyperdrive).connectionString }),
});
```

`renkei-storage-postgres` は `pg` を使い、Cloudflare は `nodejs_compat` 下で `pg` をサポートしています。ただしこの経路は renkei のテストでは検証していません（D1 経路は検証済み）。

## よくあるエラー

- **`No such module "node:events"`** — `compatibility_flags` に `nodejs_compat` がない
- **`renkei failed to start: LINE_LOGIN_CHANNEL_ID is not set`**（HTTP 500） — シークレット未登録。登録後の次のリクエストで renkei が起動をやり直します
- **ローカルでは通るのに本番で `invalid state` / `/dev` に戻される** — `RENKEI_JWKS` か `RENKEI_COOKIE_KEYS` が固定されていない（手順 3）。起動ログにどちらが欠けているか出ます
- **`redirect_uri` mismatch** — コールバック URL が `ISSUER` と完全一致していない（`https`、末尾スラッシュなし）
- **Using in-memory storage** の警告 — `DB` binding が無いか名前が違う。`createWorker({ d1Binding: '<name>' })` で指定
