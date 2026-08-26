# LINE ユーザーをアプリのアカウントに連携する（公式アカウントからの配信）

> English: [account-linking.en.md](account-linking.en.md)

ユーザーが renkei 経由で LINE ログインしたあと、**LINE 公式アカウントから
そのユーザーにメッセージを送りたい**ことがよくあります（予約リマインド、
「レポートができました」通知など）。確実に送るには、ユーザーの LINE アカウントを
*アプリ側のアカウント*に紐づけます。renkei が LINE のアカウント連携フローを
まわし、結果を 1 つのクレーム **`line:linked`** として返します。

```
アプリ（renkei のアクセストークンを保持）
   │  POST /link/start  (Bearer <access_token>)
   ▼
renkei ── link token を発行 ──▶ LINE
   │  { url }
   ▼
ブラウザ ──▶ accountLink ダイアログ ──▶ ユーザーが同意
                                          │  accountLink Webhook
                                          ▼
                                       renkei が連携を記録 → line:linked = true
```

所要時間: 約 15 分。前提:

- [LINE Developers Console の準備](../DEV_SETUP.md): LINE Login チャネル**と**
  Messaging API チャネルが**同一プロバイダー**配下にあり、互いにリンク済みで
  あること。（同一プロバイダーが重要 — でないと userId が一致しません。）
- renkei 経由の LINE ログインが動いていること —
  [Next.js チュートリアル](nextjs.md)を参照。本チュートリアルはログイン*後*、
  アプリがそのユーザーの renkei **アクセストークン**を持っている状態から始めます。

## 1. Messaging API の認証情報を renkei に渡す

アカウント連携は Messaging API 経由で一度きりの *link token* を発行するため、
そのチャネルの**チャネルアクセストークン**が必要です（Webhook 署名に使う
チャネル*シークレット*とは別物）。両方と Webhook を設定します:

```bash
LINE_MESSAGING_CHANNEL_SECRET=<Messaging チャネルシークレット>
LINE_MESSAGING_CHANNEL_ACCESS_TOKEN=<Messaging チャネルアクセストークン>
```

LINE Developers Console の **Messaging API チャネル**で:

- **Webhook URL** → `${ISSUER}/line/webhook`、**Webhookの利用**をオンに。
- **応答メッセージ**をオフに（任意。OA を静かに保てます）。

Messaging チャネルを設定すると renkei は起動時にリマインドを出します。
`channelAccessToken` が無いと `POST /link/start` は `404
account_linking_not_configured` を返します。

## 2. アプリから連携を開始する

アプリはログイン済みユーザーの renkei アクセストークン（OIDC トークン
エンドポイントで取得したもの）を持っています。それを付けて `POST /link/start`
を呼びます:

```ts
const res = await fetch(`${RENKEI_ISSUER}/link/start`, {
  method: 'POST',
  headers: { authorization: `Bearer ${renkeiAccessToken}` },
});
const { url } = await res.json(); // accountLink ダイアログの URL
```

renkei はトークンからユーザーを特定し、その LINE アカウント用の link token を
発行し、一度きりの nonce を紐づけて保存し、ダイアログ `url` を返します。

扱うべきエラー: `401`（トークンが無い／期限切れ）, `409 no_line_account`
（この identity は LINE ログイン歴が無く、連携対象が無い）, `502
link_start_failed`（LINE が発行を拒否 — 多くはチャネルアクセストークンの
不備・期限切れ）。

## 3. ユーザーをダイアログへ送る

ブラウザを `url` にリダイレクトします。ユーザーは LINE の同意画面で
**同意する**をタップします。注意: 同意後ユーザーは LINE 内にとどまり、
**ダイアログは結果を持ってアプリに戻ってきません**。連携はサーバー間の
Webhook（次のステップ）で確定するので、UI は「連携中…」と表示し、
次回のページ表示で結果を反映する設計にします（戻り URL には頼らない）。

## 4. renkei が連携を確定する（自動）

LINE は `${ISSUER}/line/webhook` に `accountLink` イベントを POST します。
renkei は署名を検証し、nonce をユーザーに突き合わせ、Messaging 側の
アカウントを記録し、nonce を破棄します。ここで作るものはありません —
`line:friend` を最新に保つのと同じ Webhook エンドポイントです。

## 5. `line:linked` を読んでメッセージを送る

次回ログイン（またはトークン更新、`/oidc/me` 呼び出し）で `line` スコープに
**`line:linked: true`** が入ります。**`line:user_id`**（Messaging API の push
先となる LINE userId）と並んで:

```jsonc
{
  "sub": "…renkei sub…",
  "line:user_id": "U4af4980629…",
  "line:friend": true,
  "line:linked": true
}
```

「OA メッセージを送る」処理は `line:linked`（通常は `line:friend` も。OA を
ブロックしたユーザーには届かないため）でガードします。

## 動作確認

[インスペクションエンドポイント](../reference/endpoints.md#その他)
（`RENKEI_ADMIN_TOKEN`）を有効にしていれば、`${ISSUER}/inspect` を開き、
admin トークンを貼って:

- **Recent webhooks** に `accountLink` イベント（result `ok`）の到着が見えます。
- **Identity by sub** に `messaging` 種別の LINE アカウントと `linked: true`
  が見えます。

ログを読まずに、ループ全体を端から端まで確認できます。

## リッチメニューから起動する

リッチメニューは入口にすぎません。リッチメニューのボタン（**URI アクション**）を
アプリの「LINE と連携する」ページ — ユーザーがログインしていてステップ 2 が
走るページ — に向けます。ユーザーが OA のトークでボタンをタップし、認証済みの
状態でアプリに着地（または先にログイン）し、同じ `/link/start` フローが走ります。
renkei 側にリッチメニュー専用のコードは不要で、ボタンがアプリへディープリンク
すればよいだけです。

## 注意と制限

- **すべて一度きり。** link token（約 10 分）も nonce も単回使用。試行ごとに
  新しく発行します（`/link/start` がそれを行います）。
- **同一人物の、自分のアプリアカウント。** このフローは renkei アクセス
  トークンの背後にあるアカウント（＝LINE でログインしたアカウント）に LINE
  identity を紐づけます。LINE を*既存のパスワードアカウント*に連携する
  （アプリ側だけが承認できるマージ）は、renkei の**フォワード方式**
  （`accountLinkForwardUrl`）を使います —
  [エンドポイントリファレンス](../reference/endpoints.md#アカウント連携)を参照。
- **`line:linked` は renkei が保持。** renkei が連携を保存しクレームとして
  公開するので、アプリ側に Webhook コードは不要です — `line:friend` と同じ
  パターンです。
