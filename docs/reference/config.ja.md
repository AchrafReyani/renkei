# 設定リファレンス

> English: [config.en.md](config.en.md)

renkei は環境変数で設定します（`.env` ファイル可）。プログラムから使う場合は
`createRenkei({ config, storage })` に同じ内容をオブジェクトで渡します（[`RenkeiConfig`](#プログラムからの設定)）。

## 必須

| 変数 | 説明 |
|---|---|
| `LINE_LOGIN_CHANNEL_ID` | LINE Login チャネルの Channel ID |
| `LINE_LOGIN_CHANNEL_SECRET` | 同 Channel secret。OAuth の `client_secret` と、id_token（HS256）の検証鍵を兼ねます |

## サーバー

| 変数 | 既定値 | 説明 |
|---|---|---|
| `ISSUER` | `http://localhost:3000` | renkei の公開 URL。**OIDC の issuer になり、全ての絶対 URL の元になります。** 末尾スラッシュなし。プロキシの内側にいる場合も外から見える URL を入れてください |
| `PORT` | `ISSUER` のポート、無ければ `3000` | 待ち受けポート |
| `DATABASE_URL` | なし | Postgres の接続文字列。未設定なら**インメモリ**（再起動で全消去、複数プロセス不可。開発専用） |
| `RENKEI_COOKIE_KEYS` | 起動ごとに生成 | Cookie 署名鍵。カンマ区切りで複数。ローテーションは先頭に新しい鍵を追加。**本番では必ず設定** |
| `RENKEI_JWKS` | 起動ごとに生成 | トークン署名用の秘密鍵（JWK の JSON 配列、`kid` と `alg` 付き）。未設定だと再起動で全トークンが無効になり、複数インスタンスで動きません。**本番では必ず設定**（[鍵の作り方](#署名鍵を作る)） |
| `RENKEI_DEV` | `RENKEI_CLIENTS` と `DATABASE_URL` が両方未設定なら `true` | `/dev` の動作確認用リライングパーティを有効化。**本番では無効に** |
| `RENKEI_CORS_ORIGINS` | なし | `/liff/exchange` をブラウザから直接呼ぶ LIFF アプリのオリジン（カンマ区切り）。未設定なら CORS なし |

## LINE チャネル

| 変数 | 既定値 | 説明 |
|---|---|---|
| `LINE_LOGIN_REGION` | `jp` | このチャネルが対象とする地域。`jp` / `tw` / `th` など。`line:region` クレームと `line_region` パラメータのルーティングに使います |
| `RENKEI_BOT_PROMPT` | `aggressive` | ログイン時の友だち追加。`aggressive`（専用画面）/ `normal`（同意画面内）/ `none`。チャネルに LINE 公式アカウントがリンクされていないと効きません |
| `RENKEI_REQUEST_EMAIL` | `false` | `true` で LINE に `email` スコープを要求。チャネルに**メールアドレス取得権限**が無いと LINE は黙ってスコープを落とします（renkei は起動時に警告を出します） |

複数地域（日本 + 台湾など）はプログラム設定の `channels` 配列で指定します（環境変数は 1 チャネル）。

## 下流クライアント（`RENKEI_CLIENTS`）

renkei に OIDC でログインしに来るアプリ／IdP の一覧。JSON 配列。

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

## トークンの有効期限（プログラム設定のみ）

`ttl.accessToken` 3600 秒、`ttl.idToken` 3600、`ttl.refreshToken` 14 日、`ttl.session` 14 日、`ttl.interaction` 600。

## 署名鍵を作る

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

const renkei = await createRenkei({
  storage: createPostgresStorage({ connectionString: process.env.DATABASE_URL! }),
  config: {
    issuer: 'https://auth.example.com',
    channels: [
      { channelId: '…', channelSecret: '…', region: 'jp', botPrompt: 'aggressive', requestEmail: true },
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
