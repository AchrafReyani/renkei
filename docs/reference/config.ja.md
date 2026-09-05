# 設定リファレンス

> English: [config.en.md](config.en.md)

renkei の設定方法は 2 つあり、使われるのはどちらか一方だけです。

- **`renkei.yaml`**（作業ディレクトリに置く。[後述](#renkei-yaml)）— すべてを 1 ファイルで表します。
  シークレットは `${VAR}` 参照なので、そのままコミットできます。チャネルやクライアントが
  複数になったらこちらを推奨します。
- **環境変数**（`.env` ファイル可）— 以下の表のとおり。`renkei init` が書き出すのはこちらで、
  ファイルシステムのない Cloudflare Workers・Supabase Edge Functions ではこちらのみです。

`renkei.yaml` があるときは、それが設定のすべてです。renkei は `LINE_*` / `RENKEI_*` の
環境変数を一切読まず、設定されていたものは起動時に「無視した」と名前を挙げます
（黙って効いていることがないように）。`PORT` と `DATABASE_URL`、およびファイルが
`${VAR}` で参照している変数はそのまま使えます。

プログラムから使う場合は `createRenkei({ config, storage })` に同じ内容を
オブジェクトで渡します（[`RenkeiConfig`](#プログラムからの設定)）。

## 必須

| 変数 | 説明 |
|---|---|
| `LINE_LOGIN_CHANNEL_ID` | LINE Login チャネルの Channel ID |
| `LINE_LOGIN_CHANNEL_SECRET` | 同 Channel secret。OAuth の `client_secret` と、id_token（HS256）の検証鍵を兼ねます |

## サーバー

| 変数 | 既定値 | 説明 |
|---|---|---|
| `ISSUER` | `http://localhost:3000` | renkei の公開 URL。**OIDC の issuer になり、全ての絶対 URL の元になります。** 末尾スラッシュなし。プロキシの内側にいる場合も外から見える URL を入れてください。パス付きでも可（`https://x.supabase.co/functions/v1/renkei`、`https://example.com/auth`）: renkei は渡す URL すべてにそのパスを付け、受け取るリクエストからは取り除きます |
| `PORT` | `ISSUER` のポート、無ければ `3000` | 待ち受けポート |
| `DATABASE_URL` | なし | `postgres://…` なら Postgres、`sqlite:./data/renkei.db` なら SQLite（Node 22.13+ 組み込みの `node:sqlite`。依存ゼロ、DB サーバー不要、1 プロセス向け。ファイルは永続ディスクに置くこと）。未設定なら**インメモリ**（再起動で全消去、複数プロセス不可。開発専用）。Cloudflare Workers ではこの変数は使わず、D1 binding `DB` がストレージになる（[ガイド](../guides/deploy-cloudflare-workers.ja.md)）。Supabase Edge Functions では未設定なら自動で渡される `SUPABASE_DB_URL`（プロジェクトの Postgres）を使う（[ガイド](../guides/deploy-supabase-edge.ja.md)） |
| `RENKEI_COOKIE_KEYS` | 起動ごとに生成 | Cookie 署名鍵。カンマ区切りで複数。ローテーションは先頭に新しい鍵を追加。**本番では必ず設定** |
| `RENKEI_JWKS` | 起動ごとに生成 | トークン署名用の秘密鍵（JWK の JSON 配列、`kid` と `alg` 付き）。未設定だと再起動で全トークンが無効になり、複数インスタンスで動きません。**本番では必ず設定**（[鍵の作り方](#署名鍵を作る)） |
| `RENKEI_DEV` | `RENKEI_CLIENTS` と `DATABASE_URL` が両方未設定なら `true` | `/dev` の動作確認用リライングパーティを有効化。`RENKEI_CLIENTS` と併用時は `renkei-dev` / `renkei-dev-liff` クライアントが自動で追加される。**本番では無効に** |
| `RENKEI_CORS_ORIGINS` | なし | `/liff/exchange` をブラウザから直接呼ぶ LIFF アプリのオリジン（カンマ区切り）。未設定なら CORS なし |
| `RENKEI_ADMIN_TOKEN` | なし | 設定すると読み取り専用の `/inspect`（identity・LINE アカウント・直近 Webhook の参照）を有効化。このトークンで Bearer 認証。未設定なら未マウント。十分に長くランダムな値を使ってください |
| `RENKEI_LOG_FORMAT` | pretty | `json` にするとログを 1 行 1 JSON（`{ level, msg, … }`）で出力（ログ集約向け）。形式に関わらず、ログのメタデータからシークレット（トークン・チャネルシークレット・Cookie など）は**常に**マスクされます |
| `RENKEI_SESSION_COOKIE` | なし | `true` で第一者セッションクッキーモード（`/login`, `/session`, `/logout`）を有効化。自前の OIDC クライアントを持たず renkei を直接使うアプリ向け |
| `RENKEI_SESSION_RETURN_URLS` | なし | `/login` 後の `return_to` として許可する絶対 URL のオリジン（カンマ区切り）。同一オリジンの相対パスは常に許可 |

## LINE チャネル

| 変数 | 既定値 | 説明 |
|---|---|---|
| `LINE_LOGIN_REGION` | `jp` | このチャネルが対象とする地域。`jp` / `tw` / `th` など。`line:region` クレームと `line_region` パラメータのルーティングに使います |
| `RENKEI_CHANNELS` | なし | 主チャネルの後ろに追加するチャネルを JSON で: `[{ channelId, channelSecret, region, kind?, provider?, botPrompt?, requestEmail? }]`。2 つめの地域、ミニアプリ、あるいは全チャネルをここだけに書く（その場合 `LINE_LOGIN_*` は省略でき、先頭のログインチャネルが既定）。ログインチャネルは地域ごとに 1 つ（[チュートリアル](../tutorials/multi-region.ja.md)） |
| `LINE_MINIAPP_CHANNEL_ID` | なし | 同じプロバイダーの LINE ミニアプリチャネル。`POST /liff/exchange` で受け付け、Login チャネルと同じ `sub` に対応づける。ステージ（開発用 / 審査用 / 公開用）ごとの ID をカンマ区切りで。[ガイド](../guides/line-mini-app.ja.md) |
| `LINE_MINIAPP_CHANNEL_SECRET` | なし | ミニアプリチャネルのシークレット。全 ID 共通なら 1 つ、ID ごとなら同じ順でカンマ区切り |
| `RENKEI_BOT_PROMPT` | `aggressive` | ログイン時の友だち追加。`aggressive`（専用画面）/ `normal`（同意画面内）/ `none`。チャネルに LINE 公式アカウントがリンクされていないと効きません |
| `RENKEI_REQUEST_EMAIL` | `false` | `true` で LINE に `email` スコープを要求。チャネルに**メールアドレス取得権限**が無いと LINE は黙ってスコープを落とします（renkei は起動時に警告を出します） |

複数地域（日本 + 台湾など）はプログラム設定の `channels` 配列で指定します（環境変数は 1 チャネル）。

## Messaging API チャネル（Webhook・アカウント連携）

| 変数 | 既定値 | 説明 |
|---|---|---|
| `LINE_MESSAGING_CHANNEL_SECRET` | なし | Messaging API チャネルシークレット。設定すると `POST /line/webhook` が有効化（`x-line-signature` を検証し `line:friend` を最新に保つ）。ログインチャネルのシークレットとは**別物** |
| `LINE_MESSAGING_CHANNEL_ID` | なし | Messaging API チャネル ID。参考情報 |
| `LINE_MESSAGING_CHANNEL_REGION` | `LINE_LOGIN_REGION` | このチャネルの Webhook イベントがどのログインチャネルのユーザーに関するものか。複数地域のときだけ意味を持ちます |
| `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN` | なし | Messaging API チャネルアクセストークン。設定すると `POST /link/start`（アカウント連携。これを使って一度きりの link token を発行）が有効化 |
| `LINE_ACCOUNTLINK_FORWARD_URL` | なし | フォワード方式（アプリ主導）の連携: renkei が所有しない nonce の `accountLink` イベントを `{ type, userId, nonce, result, timestamp }` としてここへ POST。nonce → アカウントの対応はアプリ側が管理 |
| `LINE_ACCOUNTLINK_FORWARD_SECRET` | なし | 上記フォワードの共有シークレット。renkei が本文を署名（base64 HMAC-SHA256）して `x-renkei-signature` ヘッダーに付与するので、アプリは LINE の Webhook と同じ方法で検証できます |

Messaging API チャネルはログインチャネルと**同一の LINE プロバイダー**配下にある必要があります（でないと LINE userId が一致しません）。プログラム設定では `messagingChannels` 配列に対応します。

## 下流クライアント（`RENKEI_CLIENTS`）

renkei に OIDC でログインしに来るアプリ／IdP の一覧。JSON 配列。手で書くより
`npx renkei add-client <id> --redirect <url> [--preset authjs|supabase|public]` が楽です:
シークレットを生成して `.env` の `RENKEI_CLIENTS` に追記し、アプリ側（Auth.js の provider / Supabase の Keycloak 欄）に貼る設定を表示します。
`--replace` で上書き、`--print` で書き込まずに表示。

```json
[
  {
    "clientId": "my-app",
    "clientSecret": "…32文字以上…",
    "redirectUris": ["https://app.example.com/api/auth/callback/renkei"],
    "tokenEndpointAuthMethod": "client_secret_basic",
    "lineRegion": "jp",
    "placeholderEmailDomain": "line-users.example.com"
  },
  {
    "clientId": "my-liff-app",
    "redirectUris": ["https://liff.example.com/"],
    "tokenEndpointAuthMethod": "none"
  }
]
```

| キー | 必須 | 説明 |
|---|---|---|
| `clientId` | ✅ | OIDC の `client_id` |
| `clientSecret` | `tokenEndpointAuthMethod` が `none` 以外なら ✅ | |
| `redirectUris` | ✅ | 完全一致で検証されます |
| `tokenEndpointAuthMethod` | | `client_secret_basic`（既定）/ `client_secret_post` / `none`（パブリッククライアント。**PKCE 必須**） |
| `lineRegion` | | このクライアントが使う LINE チャネルの地域。既定は最初のチャネル |
| `placeholderEmailDomain` | | メールの無いユーザーに `<sub>@<domain>` を `email_verified: true` + `email_placeholder: true` で発行。Supabase など「メール必須」の下流向け。[理由と注意](../tutorials/supabase.ja.md#4-メールアドレスについて必読) |

未設定のときは開発用に `renkei-dev`（secret `renkei-dev-secret`, redirect `${ISSUER}/dev/callback`）と
`renkei-dev-liff`（パブリック）が作られます。

## `renkei.yaml`

`renkei init --yaml` が生成します（既存の `.env` があれば、それを変換します）。
renkei は作業ディレクトリから読み込みます。`RENKEI_CONFIG=<パス>` で別のファイルを
指定できます（`renkei.yml` も認識されます）。

```yaml
issuer: https://auth.example.com
storage: postgres://…            # または sqlite:./data/renkei.db。なければ DATABASE_URL
port: 3000                       # PORT が優先されます
liff_id: 1234567890-abcdefgh     # /dev/liff ページ専用
log_format: json                 # 1 行 1 JSON でログを出す
dev: false                       # /dev テストページを有効化（専用クライアントは自動登録）

cookie_keys: "${RENKEI_COOKIE_KEYS}"
jwks: "${RENKEI_JWKS}"

channels:
  - id: "1234567890"             # LINE Login・日本
    region: jp
    secret: "${LINE_JP_CHANNEL_SECRET}"
    bot_prompt: aggressive
    request_email: false
    liff_ids: ["1234567890-abcdefgh"]
  - id: "2345678901"             # 2 つ目のリージョン
    region: tw
    secret: "${LINE_TW_CHANNEL_SECRET}"
  - id: "3456789012"             # LINE MINI App のステージ
    kind: miniapp
    region: jp
    secret: "${LINE_MINIAPP_CHANNEL_SECRET}"

messaging:                       # 複数なら messaging_channels: [ … ]
  channel_id: "4567890123"
  channel_secret: "${LINE_MESSAGING_CHANNEL_SECRET}"
  channel_access_token: "${LINE_MESSAGING_CHANNEL_ACCESS_TOKEN}"

clients:
  - client_id: my-app
    client_secret: "${RENKEI_MY_APP_CLIENT_SECRET}"
    redirect_uris: ["https://app.example.com/callback"]
    line_region: tw              # このクライアントをこのチャネルに固定
  - client_id: spa
    token_endpoint_auth_method: none
    redirect_uris: ["https://spa.example.com/callback"]

cors_origins: ["https://liff.example.com"]
session_cookie:
  enabled: true
  return_urls: ["https://app.example.com"]
admin_token: "${RENKEI_ADMIN_TOKEN}"
```

[`RenkeiConfig`](#プログラムからの設定) の全項目を `snake_case` で書けます。camelCase も
受け付けるので、`RENKEI_CHANNELS` や `RENKEI_CLIENTS` のエントリをそのまま貼れます。
スキーマにない書き方が 2 つあります。チャネルの `id` / `secret`（`channel_id` /
`channel_secret` も可）と、1 件だけの `messaging_channels:` を `messaging:`
マッピングとして書けることです。

### `${VAR}` — シークレットをファイルに置かない

どの文字列でも環境変数を参照できます。`${VAR}` は未設定なら起動時に失敗し、変数名と
該当フィールドを示します。`${VAR:-代替値}` は未設定のとき代替値を使い、`$${` は
リテラルの `${` です。

これがコミットできる理由です。**`renkei.yaml` にシークレットを書かないでください。**
参照だけを書き、値は `.env`（開発）かプラットフォームのシークレットストア（本番）に
置きます。`renkei add-channel` と `renkei add-client` も同じ規則で、ファイルには参照を、
`.env` には値を書きます。

`cookie_keys` と `jwks` は文字列 1 つも受け付けます。つまり `RENKEI_COOKIE_KEYS`
（カンマ区切り）や `RENKEI_JWKS`（JSON）の中身をそのまま 1 つの参照で書けます。

### CLI

| | |
|---|---|
| `renkei init --yaml` | `renkei.yaml` とシークレット用の `.env` を書き出す。既存の `.env` があれば変換する |
| `renkei add-channel <id> [--region tw] [--miniapp] [--secret <値>]` | チャネルを追記。`--secret-env VAR` は値を書かずに変数を参照するだけ |
| `renkei add-client <id> --redirect <url>` | クライアントを追記（`renkei.yaml` があればそちら、なければ `RENKEI_CLIENTS`） |

### 環境変数からの移行

`.env` のあるディレクトリで `renkei init --yaml` を実行します。設定はサーバーと同じ
手順で組み立てられるので、その環境変数で実際に起動していた内容がそのままファイルに
なります。シークレットはすべて参照として書き戻され、`RENKEI_CHANNELS` /
`RENKEI_CLIENTS` の JSON に埋もれていたものには `.env` 側に専用の変数が作られます。
`.env` はそれ以外は変更されません。renkei を起動して「無視した環境変数」の行を確認し、
問題なく起動したらそれらの行を `.env` から削除できます。

## トークンの有効期限（プログラム設定のみ）

`ttl.accessToken` 3600 秒、`ttl.idToken` 3600、`ttl.refreshToken` 14 日、`ttl.session` 14 日、`ttl.interaction` 600。

## 署名鍵を作る

`npx renkei init` が `RENKEI_JWKS` と `RENKEI_COOKIE_KEYS` を生成した `.env` を書きます。手動なら:

```sh
node -e "
const { generateKeyPair, exportJWK } = await import('jose');
const { privateKey } = await generateKeyPair('RS256', { modulusLength: 2048, extractable: true });
const jwk = await exportJWK(privateKey);
console.log(JSON.stringify([{ ...jwk, kid: 'k' + Date.now().toString(36), alg: 'RS256', use: 'sig' }]));
" --input-type=module
```

出力を `RENKEI_JWKS` に入れます。ローテーションは配列の**先頭**に新しい鍵を足し、古い鍵はトークンの有効期限が切れるまで残します。

## プログラムからの設定

```ts
import { createRenkei } from 'renkei-server';
import { createPostgresStorage } from 'renkei-storage-postgres';
// または SQLite: import { createSqliteStorage } from 'renkei-storage-sqlite';
// Cloudflare D1: import { createD1Storage } from 'renkei-storage-sqlite/d1'; → createD1Storage(env.DB)

const renkei = await createRenkei({
  storage: createPostgresStorage({ connectionString: process.env.DATABASE_URL! }),
  // storage: createSqliteStorage({ filename: './data/renkei.db' }),
  config: {
    issuer: 'https://auth.example.com',
    channels: [
      { channelId: '…', channelSecret: '…', region: 'jp', botPrompt: 'aggressive', requestEmail: true },
      // 隣に置く LINE ミニアプリチャネル（同じプロバイダー → 同じ sub）。`provider` は LINE プロバイダー
      // ごとにチャネルをまとめる値で、1 つの renkei に複数プロバイダーを混ぜるときだけ必要。
      { channelId: '…', channelSecret: '…', region: 'jp', kind: 'miniapp' },
      { channelId: '…', channelSecret: '…', region: 'tw' },
    ],
    clients: [ /* 上と同じ */ ],
    cookieKeys: ['…'],
    jwks: [ /* JWK */ ],
    corsOrigins: ['https://liff.example.com'],
  },
});
// renkei.app は Hono アプリ。Node なら @hono/node-server の serve() に渡す。
```

設定は zod で検証され、不正なら起動時に日本語と英語のメッセージで落ちます。
