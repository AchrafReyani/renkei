---
title: "LINEログインの「その先」——アカウント連携をセルフホストで完結させる（renkei v0.2）"
emoji: "🔗"
type: "tech"
topics: ["line", "oidc", "typescript", "認証", "個人開発"]
published: false
---

> この記事は OSS「renkei（連携）」の作者による解説です。renkei は LINE 向けの
> セルフホスト型 ID ブローカー。標準 OIDC プロバイダーとして振る舞い、LINE ログインの
> *その先* にある面倒——友だち追加、LIFF、そして**アカウント連携**——を引き受けます。
> LINE は LINEヤフー株式会社の商標です。本プロジェクトは同社とは無関係です。

## LINE ログインは、実は「入口」でしかない

「LINE ログイン」だけなら Clerk / Auth0 / Logto など既存の IdP でも対応済みです。
けれど実運用でぶつかるのは、ログインした*後*の配線でした。

- ユーザーは**公式アカウント（OA）の友だち**になっているか？（プッシュ配信の前提）
- LIFF / ミニアプリのトークンを、サーバー側でどう検証して自前のセッションにするか？
- そして——**OA からそのユーザーに確実にメッセージを送るには、LINE ユーザーを
  自分のサービスのアカウントに結びつける必要がある**。これが「アカウント連携」です。

この最後のピースは OSS にほとんど無く、日本の有料 SaaS がまさにここを売っています。
renkei は v0.1 でログイン・友だち追加・LIFF・ID マッピングを、v0.2 で
**アカウント連携**を、すべて標準 OIDC の裏側に隠しました。ダウンストリームの
アプリは `line:linked` という**クレームを 1 つ読むだけ**で済みます。

## LINE のアカウント連携フロー（おさらい）

LINE の「ユーザー情報の連携」は 4 ステップです。

1. **link token を発行**: `POST /v2/bot/user/{userId}/linkToken`（Messaging API の
   チャネルアクセストークンが必要）。~10 分・1 回きり。
2. **連携ダイアログへ誘導**:
   `https://access.line.me/dialog/bot/accountLink?linkToken=...&nonce=...`。
   `nonce` はこちらが生成し、連携先アカウントに紐づけて保存する 1 回きりの値。
3. ユーザーが**同意**。
4. **`accountLink` Webhook** が届く（`{ link: { result, nonce }, source: { userId } }`）。
   `nonce` からアカウントを引き当て、`userId ↔ アカウント` を記録して完了。

ポイントは、**ダイアログはブラウザでアプリに戻ってこない**こと。連携の確定は
サーバー間の Webhook で非同期に起きます。ここを自前で組むと、署名検証・nonce 管理・
Webhook エンドポイントの用意……と地味に重い。renkei はこれを 2 通りの方式で引き受けます。

## 方式 A：renkei が連携を所有し、クレームで返す

「LINE でサインインする」タイプのアプリ向け。アプリが持っている renkei の
アクセストークンを渡すだけです。

```ts
// アプリ側（ログイン済みユーザーのアクセストークンを保持）
const res = await fetch(`${RENKEI_ISSUER}/link/start`, {
  method: "POST",
  headers: { authorization: `Bearer ${renkeiAccessToken}` },
});
const { url } = await res.json(); // accountLink ダイアログの URL
location.href = url;              // ここで LINE に飛ばす
```

renkei はトークンからユーザーを特定し、link token を発行し、`nonce → sub` を保存し、
ダイアログ URL を返します。あとは `accountLink` Webhook（`POST /line/webhook`）が
届いた時点で renkei が連携を記録し、次回以降のトークンで **`line:linked: true`** が
立ちます。

```jsonc
{
  "sub": "…renkei が発行した不透明 ID…",
  "line:user_id": "U4af4980629…",  // OA プッシュの宛先
  "line:friend": true,
  "line:linked": true
}
```

アクセストークンを持たないユーザー向けには、ブラウザ入口 **`GET /link`** も用意しました。
LINE ログインを済ませてから連携を開始し、そのままダイアログへ送ります。リッチメニューの
URI アクションを `${ISSUER}/link` に向ければ、「タップして連携」がそれだけで成立します。

アプリ側に Webhook のコードは一切要りません。`line:friend` を読むのと同じ感覚で
`line:linked` を読むだけ。これが renkei の設計思想です。

## 方式 B：アプリが連携を所有し、renkei は「検証して転送」するだけ

「メール／パスワードで登録済みのアカウントに、後から LINE をつなぐ」ケースは、
*アプリだけが*「この 2 つは同一人物だ」と保証できます。だから renkei は所有権を主張せず、
**署名検証済みの `accountLink` イベントをアプリの URL へ中継**するだけに徹します。

```bash
LINE_ACCOUNTLINK_FORWARD_URL=https://yourapp.example.com/hooks/renkei-accountlink
LINE_ACCOUNTLINK_FORWARD_SECRET=<共有シークレット>
```

これを設定すると、renkei が**所有していない** nonce の `accountLink` は、

```jsonc
{ "type": "accountLink", "userId": "U…", "nonce": "…", "result": "ok", "timestamp": 1700000000000 }
```

として上記 URL に POST されます。本文は `x-renkei-signature`（base64 HMAC-SHA256）で
署名されるので、アプリは LINE の Webhook とまったく同じやり方で検証できます。アプリは
nonce を自分のユーザーに突き合わせて紐づけを保存するだけ——**自前の Messaging Webhook も
署名検証コードも不要**です。方式 A（renkei 所有の nonce）と B は 1 つのデプロイで共存します。

## ランタイム非依存で書く（Web Crypto の話）

renkei は Node だけでなく Deno / Cloudflare Workers / Supabase Edge でも動くことを
狙っています。署名まわりは Node の `crypto` ではなく **Web Crypto（`crypto.subtle`）**で
統一しました。たとえば転送本文の署名はこれだけです。

```ts
export async function signWebhookBody(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  let bin = ""; for (const b of mac) bin += String.fromCharCode(b);
  return btoa(bin);
}
```

検証側は同じ鍵で MAC を計算し、**長さ一致を先に見てから定数時間比較**します。
`x-line-signature` の検証も同じ実装を共有しています。

## 「見える化」も薄く用意した

連携がちゃんと起きたかを確認できるよう、読み取り専用の `/inspect` を足しました
（`RENKEI_ADMIN_TOKEN` を設定したときだけマウント）。identity と LINE アカウント、
友だち状態、`line:linked`、そして直近の Webhook を Bearer 認証の JSON API と最小の
HTML 画面で覗けます。**一覧 API は無し・状態変更も無し**——管理コンソールではなく、
デバッグの当て木です。

## まとめ

- LINE ログインの価値は「その先」にある。renkei はそこを標準 OIDC の裏に隠す。
- **アカウント連携は `line:linked` クレーム 1 つに集約**（方式 A）。
- 既存アカウントへの後付け連携は、**検証＋転送**でアプリに委ねる（方式 B）。
- すべて Web Crypto でランタイム非依存。

renkei はまだ 0.x で、実アプリ（自分の求人マッチングサービス）で dogfooding しながら
育てています。リポジトリと日本語ドキュメントはこちら 👉
（README / チュートリアル / エンドポイントリファレンスへのリンクを貼る）

フィードバック・Issue・「自分の LINE 連携こう組んでる」的な話、歓迎です。
