# クライアント SDK（`renkei-client`）

> English: [client.en.md](client.en.md)

`renkei-client` は renkei サーバーと話すアプリ向けの小さな SDK です。**依存ゼロ**、`fetch` / `URL` / Web Crypto があればどこでも動きます（ブラウザ、Node 18+、Cloudflare Workers、Deno、Bun）。renkei のエンドポイントは固定パスなので、ディスカバリを引かずに URL を組み立てます。

```sh
npm i renkei-client
```

```ts
import { createRenkeiClient } from 'renkei-client';

const renkei = createRenkeiClient({
  issuer: 'https://auth.example.com', // renkei の公開 URL（= OIDC issuer）
  clientId: 'my-app',                  // renkei add-client で登録した ID
  // clientSecret: '…',                // サーバー側のコンフィデンシャルクライアントのみ。ブラウザに渡さない
  // fetch: customFetch,               // 差し替え可（テスト、独自エージェント）
});
```

`renkei add-client <id> --redirect <url>`（preset なし / `--preset public`）はこの SDK 用のスニペットも表示します。

## 何をして、何をしないか

| する | しない |
|---|---|
| `/oidc/auth` の URL 構築（`bot_prompt`, `line_region`, PKCE 付き） | id_token の署名検証（下記） |
| `/oidc/token` の認可コード交換、`/oidc/me` | リフレッシュトークンのローテーション管理 |
| `/liff/exchange` のラップ | LIFF SDK の初期化（`liff.init()` はアプリ側） |
| セッションクッキーモードの `/login` `/session` `/logout` | Cookie の保存（ブラウザなら自動、サーバー側なら `headers` で転送） |
| `line:*` クレームの型と、JWT ペイロードのデコード | |

**署名検証は SDK の外です。** `decodeClaimsUnverified()` は名前どおり検証せずにペイロードを読むだけで、「renkei からいま TLS 越しに受け取った id_token を表示に使う」ための関数です。トークンを**信頼**して認可判断をするバックエンドは `${issuer}/oidc/jwks` で検証してください — jose（`createRemoteJWKSet` + `jwtVerify`）、openid-client、Auth.js やフレームワークの OIDC 層など、既存の検証器がそのまま使えます（[DECISIONS.md §12](../DECISIONS.md)）。

## API

### `createRenkeiClient(options)`

| オプション | 説明 |
|---|---|
| `issuer` | renkei の公開 URL。末尾の `/` は除去。クエリ・フラグメントは不可 |
| `clientId` | 登録済みクライアント ID |
| `clientSecret?` | コンフィデンシャルクライアントの秘密。`exchangeCode()` と `exchangeLiffToken()` で Basic 認証に使う。**サーバー側専用** |
| `fetch?` | `fetch` の差し替え |

戻り値の `RenkeiClient`:

| メンバー | 説明 |
|---|---|
| `issuer`, `clientId` | 正規化済みの値 |
| `endpoints` | `discovery`, `authorization`, `token`, `userinfo`, `jwks`, `revocation`, `liffExchange`, `login`, `session`, `logout` の絶対 URL |
| `loginUrl(opts)` | `/oidc/auth` の URL（文字列）。ネットワークアクセスなし |
| `sessionLoginUrl(opts?)` | セッションクッキーモードの `/login` URL |
| `exchangeCode(opts)` | `/oidc/token` で認可コードをトークンに交換 |
| `userinfo(accessToken, req?)` | `/oidc/me` |
| `exchangeLiffToken(opts, req?)` | `/liff/exchange` |
| `session(req?)` | `/session` → `RenkeiClaims`、セッションが無ければ `null` |
| `logout(req?)` | `/logout` |

### `loginUrl(options)`

| オプション | 説明 |
|---|---|
| `redirectUri` | 必須。クライアントに登録した戻り先 |
| `state` | 必須。セッションに保存し、戻りで照合する CSRF トークン（`randomString()`） |
| `nonce?` | id_token の `nonce` と照合するリプレイ対策（`randomString()`） |
| `scope?` | 既定 `openid profile email line`。文字列または配列 |
| `botPrompt?` | `'aggressive'` / `'normal'` / `'none'`。省略時はチャネル既定（`RENKEI_BOT_PROMPT`）。`none` は友だち追加プロンプトを出さない |
| `lineRegion?` | 複数チャネル構成で `jp` / `tw` / `th` … のチャネルを選ぶ |
| `codeChallenge?` | `generatePkce()` の `challenge`。`code_challenge_method=S256` が付く。**公開クライアント（`tokenEndpointAuthMethod: 'none'`）では必須** |
| `extra?` | その他の OIDC パラメータ（`prompt`, `ui_locales`, `login_hint` …） |

### `exchangeCode({ code, redirectUri, codeVerifier? })`

`/oidc/token` に `grant_type=authorization_code` を送ります。`clientSecret` があれば HTTP Basic、無ければ `client_id` をボディに入れます（公開クライアント）。戻り値は生の `TokenResponse`（`access_token`, `id_token`, `refresh_token`, `expires_in`, `scope`）。id_token の `nonce` を保存した値と照合し、検証はバックエンドで。

### `exchangeLiffToken({ idToken?, accessToken?, scope? })`

`liff.getIDToken()` と `liff.getAccessToken()` を renkei に送り、renkei が署名した id_token（`aud` = `clientId`）を受け取ります。少なくとも片方は必須。戻り値:

```ts
{ idToken: string; expiresIn: number; sub: string; claims: RenkeiClaims }
```

`claims` は `idToken` をデコードしたもの（検証なし。同じレスポンスで renkei から届いたものなので、フロントの表示にはそのまま使えます）。ブラウザから呼ぶ場合はサーバー側で `RENKEI_CORS_ORIGINS` に LIFF アプリのオリジンを設定してください。

### セッションクッキーモード

`RENKEI_SESSION_COOKIE=true` のサーバー向け。

- `sessionLoginUrl({ returnTo?, botPrompt?, lineRegion? })` — ユーザーをここへ送ると、LINE ログイン後に署名付き HttpOnly クッキーが設定されて `returnTo` に戻ります（同一オリジンのパス、または `RENKEI_SESSION_RETURN_URLS` の絶対 URL）。
- `session()` — クレームを返す。無ければ `null`。ブラウザでは `credentials: 'include'` で送るので、renkei とアプリが同一サイトである必要があります。
- `logout()` — セッション破棄。

サーバー側（Next.js の middleware や Route Handler、Hono など）から呼ぶときは、受信リクエストの `cookie` ヘッダーを転送します:

```ts
const me = await renkei.session({ headers: { cookie: req.headers.get('cookie') ?? '' } });
```

### クレーム

```ts
import { type RenkeiClaims, LINE_CLAIMS, decodeClaimsUnverified, isFriend, isLinked } from 'renkei-client';
```

`RenkeiClaims` は標準クレーム（`sub`, `name`, `picture`, `email`, `email_verified`, `email_placeholder`, `nonce`, `amr` …）と `line:*` を型付けしたものです:

| クレーム | 型 | 意味 |
|---|---|---|
| `line:user_id` | `string` | LINE ユーザー ID（`U…`） |
| `line:friend` | `boolean` | 公式アカウントの友だちか（不明なら未定義） |
| `line:channel_id` | `string` | ログインチャネル ID |
| `line:region` | `string` | チャネルのリージョン |
| `line:linked` | `boolean` | Messaging API アカウント連携が完了しているか |

`isFriend(claims)` / `isLinked(claims)` は未定義を `false` として読みます。`LINE_CLAIMS` は renkei-core と同じ定数（テストで一致を保証）。

### PKCE / 乱数

```ts
import { generatePkce, randomString } from 'renkei-client';

const { verifier, challenge, method } = await generatePkce(); // method: 'S256'
const state = randomString(); // 32 バイトの base64url
```

### エラー

renkei が 2xx 以外を返すと `RenkeiClientError` が投げられます: `status`, `error`（`invalid_client`, `invalid_grant`, `invalid_token`, `no_session` …）, `errorDescription?`。`session()` の 401 だけは例外ではなく `null` です。

## Auth.js / Supabase を使っている場合

不要です。それらは標準の OIDC クライアントとして renkei と直接話します（[Next.js](../tutorials/nextjs.ja.md) / [Supabase](../tutorials/supabase.ja.md) チュートリアル）。この SDK は、自前でフローを書くアプリ、LIFF フロント、セッションクッキーモードのためのものです。
