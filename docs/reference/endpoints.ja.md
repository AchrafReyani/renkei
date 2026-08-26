# エンドポイントとクレーム

> English: [endpoints.en.md](endpoints.en.md)

## OIDC プロバイダー

renkei は OpenID Connect プロバイダー（[node-oidc-provider](https://github.com/panva/node-oidc-provider) ベース、認可コードフロー）です。

| パス | 内容 |
|---|---|
| `GET /.well-known/openid-configuration` | ディスカバリ。issuer は `ISSUER` |
| `GET /oidc/jwks` | 公開鍵（RS256） |
| `GET /oidc/auth` | 認可エンドポイント。標準パラメータに加えて **`bot_prompt`**（`normal` / `aggressive`）と **`line_region`**（`jp` / `tw` …）を受け付けます。`ui_locales` は LINE の同意画面の言語に渡されます |
| `POST /oidc/token` | トークン。`authorization_code` と `refresh_token`。クライアント認証は Basic / POST / なし（パブリック、PKCE 必須） |
| `GET /oidc/me` | userinfo（Bearer） |
| `POST /oidc/token/revocation` | 失効 |

- 同意画面は出しません（ユーザーは LINE 側で同意済み）。要求されたスコープはそのまま付与されます。
- PKCE は**パブリッククライアントに必須**、コンフィデンシャルクライアントには任意（Cognito など PKCE を送れない下流のため）。
- `conformIdTokenClaims` は無効: profile / email / line のクレームは **id_token にも userinfo にも**入ります。

## Keycloak 互換エイリアス

Keycloak を想定したクライアント（Supabase Auth の `keycloak` プロバイダーなど）向けに、同じ機能を Keycloak のパスでも提供します。

| パス | 転送先 |
|---|---|
| `/protocol/openid-connect/auth` | `/oidc/auth`（`openid` スコープが無ければ自動で付与） |
| `/protocol/openid-connect/token` | `/oidc/token` |
| `/protocol/openid-connect/userinfo` | `/oidc/me` |
| `/protocol/openid-connect/certs` | `/oidc/jwks` |
| `/protocol/openid-connect/logout` | `/oidc/session/end` |
| `/protocol/openid-connect/revoke` | `/oidc/token/revocation` |

Keycloak の「Realm URL」には renkei の `ISSUER` をそのまま入れます。

## スコープとクレーム

| スコープ | クレーム |
|---|---|
| `openid` | `sub` — renkei が発行する不透明な ID。**LINE の userId から導出されません**（下流に LINE の ID を漏らさない） |
| `profile` | `name`, `picture` |
| `email` | `email`, `email_verified`, `email_placeholder`（プレースホルダー発行時のみ `true`） |
| `line` | `line:user_id`（このチャネルでの LINE userId）, `line:friend`（リンク済み公式アカウントとの友だち状態。不明なら省略）, `line:channel_id`, `line:region`, `line:linked`（アカウント連携が完了すると `true`） |
| `offline_access` | リフレッシュトークン |

`sub` は初回ログイン時に一度だけ発行され、以後変わりません。名前と画像はログインのたびに更新、メールは**追加・更新はされても削除はされません**（メールスコープなしの再ログインで消えない）。

## LIFF / ミニアプリ

### `POST /liff/exchange`

LIFF SDK が持つ LINE のトークンを renkei の id_token に交換します。JSON または form。

| フィールド | 説明 |
|---|---|
| `id_token` | `liff.getIDToken()`。本人確認に使用。`aud` からチャネルを特定し、チャネルシークレット（HS256）または LINE の JWKS（ES256）で検証 |
| `access_token` | `liff.getAccessToken()`。あると `/v2/profile` と友だち状態を取得。単独でも可（LINE の `/oauth2/v2.1/verify` で検証） |
| `client_id` | renkei に登録したクライアント。コンフィデンシャルなら `client_secret` も（または Basic 認証） |
| `scope` | 既定 `openid profile email line` |

レスポンス: `{ token_type: "Bearer", id_token, expires_in, sub }`。`id_token` は renkei の鍵で署名（RS256、`aud` = `client_id`）され、`/oidc/jwks` で検証できます。`amr` は LINE の値（例 `["linesso"]`）、無ければ `["liff"]`。

エラー: `401 invalid_client` / `401 invalid_token`（別チャネルのトークン、改ざん、期限切れ、id_token と access_token のユーザー不一致）/ `400 invalid_request`。

ブラウザから直接呼ぶ場合は `RENKEI_CORS_ORIGINS` に LIFF アプリのオリジンを設定します。

## LINE との接点

| パス | 内容 |
|---|---|
| `GET /interaction/:uid` | OIDC プロバイダーがユーザー認証を必要とした時の入口。LINE に転送します（内部用） |
| `GET /line/callback` | LINE からの戻り先。**Console の Callback URL に `${ISSUER}/line/callback` を登録**。パスは `lineCallbackPath` で変更可 |
| `POST /line/webhook` | Messaging API の Webhook。`x-line-signature`（HMAC-SHA256、Messaging API チャネルシークレット）を検証し、`follow`/`unfollow` を `line:friend` に反映し、`accountLink` イベントを確定（nonce → identity、`line:linked` を有効化）。`messagingChannels` で有効化。**OA の Webhook URL に `${ISSUER}/line/webhook` を設定** |
| `GET /interaction/:uid/finish` | ログイン結果の受け渡し（内部用） |

## アカウント連携

| パス | 内容 |
|---|---|
| `GET /link` | renkei アクセストークンをまだ持たないユーザー向けのブラウザ入口。renkei が LINE でログイン（共有コールバックでの通常のログイン往復）させた後、そのまま accountLink ダイアログへリダイレクトする。任意で `?line_region=`。 |
| `POST /link/start` | 渡された renkei アクセストークン（`Authorization: Bearer <access_token>`）のユーザーについて LINE アカウント連携を開始。renkei が一度きりの LINE link token を発行し、`{ url }`（リダイレクト先の accountLink ダイアログ URL）を返す。連携は LINE が `accountLink` Webhook を送信した時点で非同期に確定し、`line:linked` が有効になる。 |

`channelAccessToken`（`LINE_MESSAGING_CHANNEL_ACCESS_TOKEN`）を持つ `messagingChannels` エントリが必要。未設定なら `404 account_linking_not_configured` を返す。その他のエラー: `401`（アクセストークンが無い／無効）, `409 no_line_account`（identity にまだ LINE ログインアカウントが無い）, `502 link_start_failed`（LINE が link token 発行を拒否）。

## その他

| パス | 内容 |
|---|---|
| `GET /healthz` | `{ ok: true }` |
| `/dev/*` | `RENKEI_DEV=true` のときだけ。動作確認用の OIDC クライアント（`/dev`）、LIFF テスト（`/dev/liff`）、下流からの着地確認（`/dev/landing`） |
| `/inspect` + `/inspect/api/*` | `RENKEI_ADMIN_TOKEN` を設定したときだけ。読み取り専用の参照ページとその JSON API（`GET /inspect/api/identity/:sub`, `/inspect/api/line/:channelId/:userId`, `/inspect/api/webhooks`）。API は admin トークンで Bearer 認証。ページ自体にデータは含まれず、トークンの入力を求めます。読み取り専用（状態を変更しません） |
