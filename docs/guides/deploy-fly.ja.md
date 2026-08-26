# Fly.io にデプロイする

> English: [deploy-fly.en.md](deploy-fly.en.md)

Docker イメージをそのまま Fly.io（東京リージョン `nrt`）で動かす手順です。所要時間 15 分。Fly は従量課金です（自動停止ありの最小構成で月数十円〜数百円程度）。必要なもの: [flyctl](https://fly.io/docs/flyctl/install/)、Fly アカウント、Postgres（下記）。

## 1. Postgres を用意する

どちらでも構いません。`DATABASE_URL` が 1 本あればよいです。

- **Neon**（無料枠、手軽）: プロジェクトを作り、接続文字列（`postgres://...?sslmode=require`）を控える
- **Fly Managed Postgres**: `fly mpg create --region nrt` → `fly mpg attach <cluster> --app <app>` で `DATABASE_URL` が自動設定されます

マイグレーションは renkei が起動時に自動で流します（`autoMigrate`）。

## 2. アプリを作る

リポジトリのルートに `fly.toml` があります。`app` 名と `ISSUER` を自分のものに書き換えてから:

```sh
fly launch --copy-config --no-deploy   # 既存の fly.toml を使う。DB の自動作成は No
```

## 3. シークレットを入れる

```sh
# 署名鍵と Cookie 鍵を生成（docs/reference/config 参照）
JWKS=$(node -e "
const { generateKeyPair, exportJWK } = await import('jose');
const { privateKey } = await generateKeyPair('RS256', { modulusLength: 2048, extractable: true });
const jwk = await exportJWK(privateKey);
console.log(JSON.stringify([{ ...jwk, kid: 'k' + Date.now().toString(36), alg: 'RS256', use: 'sig' }]));
" --input-type=module)
COOKIE=$(openssl rand -base64 32)

fly secrets set \
  LINE_LOGIN_CHANNEL_ID=... \
  LINE_LOGIN_CHANNEL_SECRET=... \
  DATABASE_URL='postgres://...' \
  RENKEI_JWKS="$JWKS" \
  RENKEI_COOKIE_KEYS="$COOKIE"
```

`RENKEI_JWKS` と `RENKEI_COOKIE_KEYS` は **必ず固定**してください。無いと再起動のたびにトークンとセッションが無効になります。

## 4. LINE 側にコールバックを登録する

LINE Developers Console → Login チャネル → **LINEログイン設定 → コールバックURL** に
`https://<app>.fly.dev/line/callback` を追加（[Console の準備](line-console.ja.md#2-line-login-チャネルを作る)）。

## 5. デプロイして確認する

```sh
fly deploy
curl https://<app>.fly.dev/.well-known/openid-configuration   # issuer が自分の URL
open https://<app>.fly.dev/dev                                 # RENKEI_DEV=true のときのテスト RP
```

`/dev` で LINE ログインが通り、友だち追加画面 → `line:*` クレーム入りの id_token が出れば完了です。

## 本番で変えるところ

| 項目 | お試し | 本番 |
|---|---|---|
| `RENKEI_DEV` | `true`（`/dev` を公開） | 外す。`RENKEI_CLIENTS` に自分のアプリを登録 |
| `min_machines_running` | `0`（コールドスタートあり） | `1` |
| Postgres | Neon 無料枠 | バックアップのあるもの |
| `RENKEI_CORS_ORIGINS` | 不要 | LIFF から直接 `/liff/exchange` を叩くなら設定 |

## よくあるエラー

- **`redirect_uri` mismatch** — コールバック URL が `ISSUER` と完全一致していない（`https`、末尾スラッシュなし）
- **起動直後に 502** — `DATABASE_URL` の接続先に到達できない。Neon なら `?sslmode=require` を付ける
- **再デプロイでログアウトされる** — `RENKEI_COOKIE_KEYS` / `RENKEI_JWKS` がシークレットに入っていない
