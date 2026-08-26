# LINE Developers Console の準備

> English: [line-console.en.md](line-console.en.md)

renkei を動かす前に LINE 側で作るものと、その順番。**順番が大事です** — チャネルは後からプロバイダー間を移動できません。

所要時間: 20 分。必要なもの: LINE Business ID（メールアドレスで作れます）、SMS を受け取れる電話、テスト用にスマホの LINE アプリ。

## 全体像

```
プロバイダー（会社・個人の単位）
 ├─ LINE Login チャネル      ← renkei が使う。国ごとに 1 つ
 │    └─ LIFF アプリ         ← ミニアプリ / LIFF を使うなら
 └─ Messaging API チャネル   ← 友だち追加・アカウント連携に使う（= LINE 公式アカウント）
        ▲
        └─ Login チャネルの「友だち追加オプション」でリンクする
```

**同じプロバイダーの下**にある Login / LIFF / Messaging API は、同じユーザーに同じ `userId` を返します。
別プロバイダーだと別 ID になり、renkei の ID 紐付けが成り立ちません。これが一番多い事故です。

## 1. プロバイダーを作る

[LINE Developers Console](https://developers.line.biz/console/) → **Create a new provider**。名前はサービス名（「LINE」を含む名前は不可）。

## 2. LINE Login チャネルを作る

プロバイダー → **Create a LINE Login channel**。

| 項目 | 値 |
|---|---|
| Region to provide the service | サービスを提供する国。**後から変更不可**。台湾・タイも対象なら国ごとにチャネルを作る |
| Channel name | 同意画面に表示される名前（「LINE」を含められない） |
| App types | **Web app** にチェック |
| Email address | 連絡先 |

作成後の **Basic settings** で:

- **Channel ID** と **Channel secret** を控える → `LINE_LOGIN_CHANNEL_ID` / `LINE_LOGIN_CHANNEL_SECRET`
- **LINE Login** タブ → **Callback URL** に `https://<renkei>/line/callback` を登録。開発中は `http://localhost:3000/line/callback` で OK（localhost は http が許可されています）

![チャネル基本設定: ステータス・チャネル ID・タブ](../images/console/login-channel-basic.png)

![LINE ログイン設定 → コールバック URL。localhost の http も登録できる](../images/console/callback-url.png)

## 3. LINE 公式アカウント（Messaging API チャネル）を作る

友だち追加（`bot_prompt`）とアカウント連携に必要です。ログインだけなら飛ばせますが、renkei を使う理由の大半はここにあります。

1. プロバイダー → **Create a Messaging API channel** → 「LINE Official Account を作成」へ飛ばされます（Console からは直接作れません）
2. **SMS 認証**を求められます（Business ID ごとに初回のみ）
3. 公式アカウント作成フォーム: アカウント名・業種を入れて完了
4. **LINE Official Account Manager** → 初回は「情報利用に関する同意」→ **設定 → Messaging API → Messaging API を利用する**
5. **⚠ プロバイダーを選ぶ画面**: 既定は「新規プロバイダー」です。**必ず手順 1 のプロバイダーを選ぶ**。新規にすると userId が一致しなくなります
6. Developers Console に戻ると Messaging API チャネルがプロバイダー配下に現れます

## 4. 公式アカウントを Login チャネルにリンクする

Login チャネル → **Basic settings** → **Add friend option / Linked LINE Official Account → Edit** → 手順 3 のアカウントを選択 → Update。

これをしないと `bot_prompt` は無視され、友だち状態 API は 4xx を返します。

![友だち追加オプション（リンク済み公式アカウント）と OpenID Connect（メールアドレス取得権限は「申請済み」）](../images/console/linked-oa-and-email.png)

## 5. LIFF アプリ（ミニアプリ / LIFF を使う場合）

Login チャネル → **LIFF** タブ → **Add**。

| 項目 | 値 |
|---|---|
| Size | Full（用途による） |
| Endpoint URL | **https 必須**。開発中はトンネル URL（`cloudflared tunnel --url http://localhost:3000` など）。作成時は仮の URL でも可 |
| Scopes | `openid`, `profile`（メールが必要なら `email` — 権限承認後） |
| Add friend option | On (aggressive) |

LIFF ID（`<channelId>-xxxxxxxx`）を `LIFF_ID` に。

![LIFF タブ: アプリ一覧（LIFF ID・LIFF URL・サイズ）](../images/console/liff-list.png)

![LIFF アプリ詳細: エンドポイント URL（https のトンネル）・Scope・友だち追加オプション](../images/console/liff-app-settings.png)

> LINE は LIFF を **LINE ミニアプリ**に統合中で、新規は「LINE MINI App チャネル」を推奨しています（日本、および審査済みの台湾）。既存の LIFF は使い続けられます。renkei は両方に対応予定です。

## 6. メールアドレス取得権限（必要なら）

Login チャネル → **Basic settings → OpenID Connect → Email address permission → Apply**。
2 つの誓約にチェックし、**メールの利用目的をユーザーに説明している画面のスクリーンショット**をアップロード → Submit。審査は数日。

承認されるまで LINE は `email` スコープを**エラーを出さずに落とします**。renkei は `RENKEI_REQUEST_EMAIL=true` のとき起動時に警告します。
Supabase など「メール必須」の下流に繋ぐ場合は、承認までの間 `placeholderEmailDomain` を使ってください。

## 7. チャネルを公開する（開発中ステータスの罠）

新しい Login チャネルは **Developing** です。この状態では、チャネルにロールのあるアカウントしかログインできず、それ以外は
`400 Bad Request — This channel is now developing status. User need to have developer role.` になります。
**Console にメールでログインしている場合、スマホの LINE アカウントは「ロールのあるアカウント」ではありません**。

- 開発・テスト用チャネルなら **Publish**（Basic settings 上部の「Developing」→ Publish）。**元には戻せません**（戻すには作り直し）
- 本番用チャネルで開発を続けるなら **Roles** タブでテスターを招待（招待先は LINE アカウントで Developers Console にログインして承認）

## チェックリスト

- [ ] Login / Messaging API / LIFF が**同じプロバイダー**の下にある
- [ ] Callback URL に `${ISSUER}/line/callback` が**完全一致**で登録されている
- [ ] 公式アカウントが Login チャネルにリンクされている
- [ ] チャネルが Published、またはテスターに自分が入っている
- [ ] （メールが要るなら）メールアドレス取得権限が Approved
- [ ] （LIFF なら）Endpoint URL が https で、実際のページを指している

## よくあるエラー

| エラー | 原因 |
|---|---|
| `400 … developing status` | 手順 7 |
| `redirect_uri` の不一致 | Callback URL が完全一致していない（http/https、末尾スラッシュ、ポート） |
| 友だち追加画面が出ない | 手順 4 のリンクがない、または `bot_prompt` を渡していない |
| `line:user_id` が Messaging API の userId と違う | プロバイダーが別（手順 3-5）。作り直すしかない |
| メールが取れない | 権限未承認、またはユーザーが同意しなかった。エラーにはならない |
