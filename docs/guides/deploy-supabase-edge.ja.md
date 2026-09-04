# Supabase Edge Functions にデプロイする

> English: [deploy-supabase-edge.en.md](deploy-supabase-edge.en.md)

renkei を Supabase プロジェクトの Edge Function 1 つとして動かし、データベースにはそのプロジェクトの Postgres を使う手順です。所要時間 15 分。試すだけなら無料プランで足ります。必要なもの: Supabase プロジェクト、[Supabase CLI](https://supabase.com/docs/guides/cli)、ローカルで先に動かすなら Docker。

関数本体は `renkei-server/supabase` を import する 2 行です。isolate ごとに 1 回、関数のシークレットから renkei を起動し、ID と OIDC の状態を Postgres に保存します。完成形は [`examples/supabase-edge`](https://github.com/AchrafReyani/renkei/tree/main/examples/supabase-edge) にあります。Supabase Auth と組み合わせる場合は [Supabase チュートリアル](../tutorials/supabase.ja.md) を参照してください。このガイドは renkei を Supabase 上で*ホストする*手順だけを扱います。

## 1. プロジェクト（ファイル 2 つ）

```sh
supabase init          # または example をコピー
```

`supabase/functions/renkei/index.ts`:

```ts
import { serve } from 'npm:renkei-server/supabase';

serve();
```

`supabase/config.toml` に追記:

```toml
[functions.renkei]
verify_jwt = false     # ブラウザも LINE のリダイレクトも Supabase の JWT を持っていない
```

`verify_jwt = false` は必須です。Supabase のゲートウェイは既定で `Authorization` ヘッダーに Supabase の JWT がないリクエストを拒否しますが、`/dev` を開くブラウザも `/line/callback` に戻ってくる LINE もそれを送りません。認証の層は renkei 自身のエンドポイントです。

## 2. シークレット

署名鍵と Cookie 鍵を一度だけ生成して**固定**します。関数は多数の isolate で動くので、固定しないと isolate ごとに別の鍵が作られ、ある isolate で始めたログインが次の isolate で失敗します。

```sh
npx renkei init --print          # .env 一式を表示。RENKEI_JWKS と RENKEI_COOKIE_KEYS の行をコピー
```

`supabase/` の隣に `.env`（gitignore 済み）を置きます:

```sh
ISSUER=https://<project-ref>.supabase.co/functions/v1/renkei   # 関数の URL。末尾スラッシュなし
RENKEI_DEV=true                                                 # /dev 動作確認ページ。本番では外す
LINE_LOGIN_CHANNEL_ID=…
LINE_LOGIN_CHANNEL_SECRET=…
RENKEI_JWKS=[…]
RENKEI_COOKIE_KEYS=…
```

```sh
supabase link --project-ref <project-ref>
supabase secrets set --env-file .env
```

[設定リファレンス](../reference/config.ja.md)の変数は同じ名前でそのまま使えます。Supabase 固有の点が 2 つ:

- **`ISSUER` にパスが付きます。** Supabase は関数を `/functions/v1/renkei` 配下で公開するので、それが renkei の公開 URL であり OIDC の issuer です。renkei は自分が渡す URL（discovery、`redirect_uri`、Cookie）すべてにこのパスを付け、受け取るリクエストからは取り除きます。discovery は `${ISSUER}/.well-known/openid-configuration` です。
- **ストレージはプロジェクトの Postgres で、設定不要です。** Edge Function には `SUPABASE_DB_URL` が自動で渡され、`DATABASE_URL` 未設定なら renkei はそれを使います（isolate あたり接続 1 本、アイドル 20 秒で切断）。実トラフィックが出てきたらトランザクションプーラー（ダッシュボードの port 6543 の URL）を `DATABASE_URL` に設定してください。直結の接続数上限は小さく、`DATABASE_URL` が優先されます。`sqlite:` の URL はここでは使えません。

renkei は初回リクエストでテーブル（`renkei_identity`, `renkei_line_account`, `renkei_payload`）を `public` スキーマに冪等に作成し、**行レベルセキュリティを有効化**します。プロジェクトの Data API（`anon` / `authenticated` キー）から ID が読めないようにするためで、DB オーナーとして接続する renkei 自身には影響しません。

## 3. LINE 側にコールバック URL を登録

LINE Developers Console → ログインチャネル → **LINE ログイン → コールバック URL** に
`https://<project-ref>.supabase.co/functions/v1/renkei/line/callback` を追加します（[コンソールガイド](line-console.ja.md#2-line-ログインチャネルを作る)）。

## 4. デプロイして確認

```sh
supabase functions deploy renkei
curl https://<project-ref>.supabase.co/functions/v1/renkei/.well-known/openid-configuration   # issuer が ISSUER と一致すること
open https://<project-ref>.supabase.co/functions/v1/renkei/dev                                # RENKEI_DEV=true のときの動作確認 RP
```

`/dev` で LINE ログインが完走し（友だち追加画面のあと）`line:*` クレーム付きの id_token が表示されれば完了です。

## ローカル開発

```sh
supabase start                                   # Docker。ローカル API の URL（port 54321）が表示される
supabase functions serve --env-file .env         # ISSUER=http://127.0.0.1:54321/functions/v1/renkei で
open http://127.0.0.1:54321/functions/v1/renkei/dev
```

チャネルには `http://127.0.0.1:54321/functions/v1/renkei/line/callback` も登録してください。ローカルでは `SUPABASE_DB_URL` が CLI の Postgres コンテナを指すので、テーブルはローカル DB に作られます（Studio → Table Editor、または `psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)"`）。

## 本番に向けて変えるもの

| | 試すとき | 本番 |
|---|---|---|
| `RENKEI_DEV` | `true`（`/dev` を公開） | 外す。アプリは `RENKEI_CLIENTS` に登録 |
| `RENKEI_CLIENTS` | — | `npx renkei add-client <id> --redirect <url> --preset next --print` が値を表示。クライアントシークレットを含むので `supabase secrets set` で保存 |
| データベース | `SUPABASE_DB_URL`（直結） | `DATABASE_URL` = トランザクションプーラーの URL |
| ドメイン | `<project-ref>.supabase.co` | プロジェクトの[カスタムドメイン](https://supabase.com/docs/guides/platform/custom-domains)。`ISSUER` を一致させる |
| `RENKEI_CORS_ORIGINS` | 不要 | LIFF アプリが `/liff/exchange` を直接呼ぶなら設定 |

## ストレージやロガーを自分で用意する

```ts
import { createEdgeFunction } from 'npm:renkei-server/supabase';
import { createPostgresStorage } from 'npm:renkei-storage-postgres';

Deno.serve(
  createEdgeFunction({
    storage: (env) => createPostgresStorage({ connectionString: env.MY_DATABASE_URL!, max: 1 }),
  }).fetch,
);
```

## よくあるエラー

- すべての URL で **`{"code":401,"message":"Invalid JWT"}`** — 関数の `verify_jwt = false` がない（ローカルの serve なら `--no-verify-jwt`）
- **`renkei failed to start: ISSUER is not set`**（HTTP 500） — シークレット未設定。設定後、次のリクエストで renkei が起動をやり直す
- **`renkei failed to start: … Failed query: CREATE TABLE …`** / 接続エラー — 関数からデータベースに届いていない。`DATABASE_URL` を確認するか、外して `SUPABASE_DB_URL` に戻す
- **一度は成功するのに `Login session not found` / まっさらな `/dev` に戻る** — `RENKEI_JWKS` か `RENKEI_COOKIE_KEYS` が固定されていない（手順 2）。起動ログにどちらか出る
- **`redirect_uri` の不一致** — コールバック URL が `ISSUER` と完全一致していない（`https`、`/functions/v1/renkei` のパス、末尾スラッシュなし）
- ログの **`oidc-provider WARNING: Unsupported runtime`** — 見た目だけ。Deno でもプロバイダーは全機能動く
