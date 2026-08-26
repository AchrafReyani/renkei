# Render にデプロイする（無料枠）

> English: [deploy-render.en.md](deploy-render.en.md)

Render の無料 Web サービスで renkei を動かす手順です。公開デモ（`https://renkei-demo.onrender.com/dev`）はこの手順そのままです。所要時間 15 分。必要なもの: Render アカウント（GitHub 連携）、Postgres（Neon 無料枠）。

> **無料枠の注意**: 15 分アクセスが無いとスリープし、次のアクセスで起きるまで **最大 1 分** かかります。また、Render 側の都合で **404 や無応答になることが時々あります**（アプリのログは正常なまま）。デモや検証には十分ですが、本番は有料プランか [Fly.io](deploy-fly.ja.md) を使ってください。Render の無料 Postgres は 30 日で消えるので DB は Neon にします。

## 1. Postgres（Neon）

[Neon](https://neon.tech) でプロジェクトを作成（リージョンは Singapore が Render に近い）→ 接続文字列（`postgres://...?sslmode=require`）を控える。マイグレーションは renkei が起動時に自動で流します。

## 2. 署名鍵を作る

```sh
node -e "
const { generateKeyPair, exportJWK } = await import('jose');
const { privateKey } = await generateKeyPair('RS256', { modulusLength: 2048, extractable: true });
const jwk = await exportJWK(privateKey);
console.log(JSON.stringify([{ ...jwk, kid: 'k' + Date.now().toString(36), alg: 'RS256', use: 'sig' }]));
" --input-type=module
```

出力（1 行の JSON 配列）を次で `RENKEI_JWKS` に貼ります。Cookie 鍵は Render が自動生成します（`generateValue: true`）。

## 3. Blueprint を適用する

リポジトリのルートに `render.yaml` があります。

1. Render ダッシュボード → **New → Blueprint** → このリポジトリを選択
2. `sync: false` の環境変数を聞かれるので入力: `LINE_LOGIN_CHANNEL_ID`、`LINE_LOGIN_CHANNEL_SECRET`、`DATABASE_URL`（手順 1）、`RENKEI_JWKS`（手順 2）
3. **Apply** → 初回ビルドは 3〜5 分

サービス名が既に使われていると Render が末尾に文字列を足します。その場合は **Environment → `ISSUER`** を実際の URL に直して再デプロイしてください（`ISSUER` は OIDC の issuer なので完全一致が必要）。

## 4. LINE 側にコールバックを登録する

LINE Developers Console → Login チャネル → **LINEログイン設定 → コールバックURL** に
`https://<service>.onrender.com/line/callback` を追加（[Console の準備](line-console.ja.md#2-line-login-チャネルを作る)）。

## 5. 確認する

```sh
curl https://<service>.onrender.com/.well-known/openid-configuration   # issuer が自分の URL
open https://<service>.onrender.com/dev                                 # テスト RP
```

`/dev` で LINE ログインが通り、友だち追加画面 → `line:*` クレーム入りの id_token が出れば完了です。初回アクセスはスリープからの復帰で遅いです。

## 本番で変えるところ

| 項目 | 無料デモ | 本番 |
|---|---|---|
| `plan` | `free`（スリープあり） | `starter` 以上 |
| `RENKEI_DEV` | `true`（`/dev` を公開） | 外す。`RENKEI_CLIENTS` に自分のアプリを登録 |
| Postgres | Neon 無料枠 | バックアップのあるもの |
| `autoDeploy` | 既定（main への push で再デプロイ） | ブランチを固定するか手動デプロイ |

## よくあるエラー

- **`redirect_uri` mismatch** — コールバック URL が `ISSUER` と完全一致していない（`https`、末尾スラッシュなし、Render が付けた suffix を含む）
- **Deploy failed / health check** — `DATABASE_URL` に到達できない。Neon なら `?sslmode=require` を付ける。ログは Render の **Logs** タブ
- **再デプロイでトークンが無効になる** — `RENKEI_JWKS` が空。Blueprint 適用時に貼り忘れていないか **Environment** で確認
