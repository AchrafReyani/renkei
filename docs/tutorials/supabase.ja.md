# Supabase Auth に LINE ログインを追加する（renkei 経由）

> English: [supabase.en.md](supabase.en.md)

Supabase Auth には LINE プロバイダーがありません。renkei を Supabase の前に置くと、
**Supabase 標準の Keycloak プロバイダー**がそのまま使えます — ダッシュボードの
カスタムプロバイダー機能も、有料プランも、Edge Function も不要です。ローカル CLI
（`supabase start`）でも動きます。

```
ブラウザ ──▶ Supabase Auth ──▶ renkei ──▶ LINE Login（友だち追加つき）
                 ▲                │
                 └── userinfo ◀───┘   sub / name / email / line:*
```

所要時間: 15 分程度。前提: LINE Developers Console の準備が済んでいること
（[前提条件ガイド](../DEV_SETUP.md) — プロバイダー配下に LINE Login チャネル、
Messaging API チャネル、両者のリンク）。

## 1. renkei を起動する

`docker compose` が最短です。

```yaml
# docker-compose.yml（抜粋）
services:
  renkei:
    image: ghcr.io/achrafreyani/renkei:latest
    ports: ["3000:3000"]
    environment:
      ISSUER: https://auth.example.com          # renkei の公開 URL
      LINE_LOGIN_CHANNEL_ID: "2011257262"
      LINE_LOGIN_CHANNEL_SECRET: ${LINE_LOGIN_CHANNEL_SECRET}
      RENKEI_BOT_PROMPT: aggressive             # ログイン時に友だち追加を促す
      RENKEI_COOKIE_KEYS: ${RENKEI_COOKIE_KEYS}
      DATABASE_URL: postgres://...              # Supabase の Postgres でも可
      RENKEI_CLIENTS: >
        [{"clientId":"supabase",
          "clientSecret":"${SUPABASE_CLIENT_SECRET}",
          "redirectUris":["https://<project-ref>.supabase.co/auth/v1/callback"],
          "placeholderEmailDomain":"line-users.example.com"}]
```

- `redirectUris` は Supabase の **Callback URL** です。ホスト版は
  `https://<project-ref>.supabase.co/auth/v1/callback`、ローカル CLI は
  `http://127.0.0.1:54321/auth/v1/callback`。
- `placeholderEmailDomain` については [§4](#4-メールアドレスについて必読) を必ず読んでください。
- compose ではなく `.env` で動かすなら `npx renkei add-client supabase --redirect <Callback URL> --preset supabase`
  がこのクライアントを書き込み、手順 2 で使うダッシュボード / `config.toml` の値を表示します。
- LINE Developers Console の **Callback URL** に `${ISSUER}/line/callback` を登録します。

起動確認:

```sh
curl https://auth.example.com/.well-known/openid-configuration | jq .issuer
```

## 2. Supabase 側の設定（Keycloak プロバイダーとして登録）

renkei は Keycloak と同じパス（`/protocol/openid-connect/{auth,token,userinfo}`）にも
応答するので、Supabase からは Keycloak に見えます。

**ホスト版（ダッシュボード）**: Authentication → Providers → **Keycloak** を有効化し、

| 項目 | 値 |
|---|---|
| Client ID | `supabase` |
| Client Secret | `RENKEI_CLIENTS` で設定した `clientSecret` |
| Realm URL | `https://auth.example.com`（renkei の `ISSUER`。末尾スラッシュなし） |

**ローカル CLI**: `supabase/config.toml` に追記して `supabase stop && supabase start`。

```toml
[auth.external.keycloak]
enabled = true
client_id = "supabase"
secret = "env(SUPABASE_CLIENT_SECRET)"
url = "https://auth.example.com"   # ローカルの renkei を使うなら https のトンネル URL
```

> ローカル CLI から `localhost:3000` の renkei には届きません（Supabase Auth は
> Docker 内で動くため）。`cloudflared tunnel --url http://localhost:3000` などで
> https の URL を用意し、それを `ISSUER` と `url` の両方に使ってください。

## 3. アプリからログインする

普通の Supabase のソーシャルログインと同じです。

```ts
const { error } = await supabase.auth.signInWithOAuth({
  provider: 'keycloak',
  options: { scopes: 'openid profile email' },
})
```

ログイン後の `user` はこうなります:

```json
{
  "id": "…",                                   // Supabase の UUID
  "email": "x15addw11…@line-users.example.com", // §4 参照
  "user_metadata": {
    "name": "Achraf",
    "full_name": "Achraf",
    "provider_id": "x15Addw11TEKxkLTIJwrsRl7uZvGmzCR", // renkei の sub（LINE の userId ではない）
    "iss": "https://auth.example.com"
  },
  "identities": [{ "provider": "keycloak", "id": "x15Addw11…" }]
}
```

LINE の userId・友だち状態が必要なら renkei の `/oidc/me` を `line` スコープ付きで
呼ぶか、`line:*` クレームを含む renkei の id_token を直接使ってください（次節）。

## 4. メールアドレスについて（必読）

Supabase Auth は**メールアドレスのないユーザーを拒否します**
（`Error getting user email from external provider`）。一方 LINE がメールを返すのは、

1. チャネルが LINE Developers Console で**メールアドレス取得権限を申請・承認**されていて、
2. ユーザーがログイン時にメール提供に**同意**した

場合だけです。どちらかが欠けると LINE は黙って email スコープを落とします
（エラーにはなりません）。

renkei の `placeholderEmailDomain` を設定すると、メールのないユーザーには
`<sub>@line-users.example.com` の形の**プレースホルダー**を `email_verified: true` で
発行し、あわせて `email_placeholder: true` クレームを付けます。

- 自分が管理するドメインを使い、そのアドレスに**メールを送らない**でください
  （Supabase のメール送信を使う場合は `email_placeholder` で除外する）。
- 本物のメールが取れた場合はそちらが優先され、プレースホルダーは付きません。
- 設定しなければ、メールのないユーザーは Supabase 側で失敗します。ホスト版の
  **カスタム OIDC プロバイダー**（`custom:` 識別子、`email_optional`）を使えば
  プレースホルダーなしでも受け入れられます — [補足](#補足-カスタム-oidc-プロバイダーを使う場合)。

## 5. 動作確認のチェックリスト

- [ ] `GET ${ISSUER}/.well-known/openid-configuration` が返る
- [ ] LINE Developers Console の Callback URL に `${ISSUER}/line/callback` がある
- [ ] LINE Login チャネルは **公開** 状態（開発中だとロール未設定のユーザーは
      `400 developing status` で弾かれます）
- [ ] `signInWithOAuth({ provider: 'keycloak' })` → LINE の同意画面 →
      友だち追加画面 → アプリに戻る
- [ ] `user.user_metadata.provider_id` が renkei の `sub`（`U` で始まる LINE userId
      **ではない**こと）

## 補足: カスタム OIDC プロバイダーを使う場合

Supabase ホスト版（2026-04 以降）では Authentication → Providers →
**Auto-discovery (OIDC)** で `custom:renkei` を作り、Issuer URL に renkei の `ISSUER` を
入れるだけでも動きます。`signInWithOAuth({ provider: 'custom:renkei' })`。
この経路では `email_optional` を有効にでき、プレースホルダーが不要になります。
ローカル CLI では使えないため、このチュートリアルは Keycloak 経路を主にしています。

## つまずきどころ

| 症状 | 原因 / 対処 |
|---|---|
| `Error getting user email from external provider` | §4。`placeholderEmailDomain` を設定するか、メール権限＋同意を揃える |
| LINE で `400 Bad Request … developing status` | チャネルを公開する（または自分をテスターに追加） |
| LINE で `redirect_uri` エラー | Console の Callback URL と `${ISSUER}/line/callback` が完全一致しているか |
| 友だち追加画面が出ない | Login チャネルに LINE 公式アカウントがリンクされているか（Basic settings → Add friend option） |
| Supabase からの接続エラー | Supabase Auth から `ISSUER` に到達できるか（ローカルなら https トンネル） |
