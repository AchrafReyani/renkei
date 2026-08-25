# renkei（連携）

> **開発中 / Under construction** — まだ動くものはありません。設計・計画は [`docs/`](docs/) を参照。
> English: [README.en.md](README.en.md)

**LINEログインの「その先」を全部引き受ける、セルフホスト型IDブローカー。**

LINEでログインさせるだけなら、Auth0でもClerkでもLogtoでもできます。
できないのは、その先です。

- ログイン時の**友だち追加**（`bot_prompt`）と友だち状態の追跡
- **LIFF / LINEミニアプリ**のIDトークンをサーバー側で検証してセッションにする
- **Messaging APIのアカウント連携**（linkToken → nonce → `accountLink` webhook）
- LINEログイン / LIFF / Messaging API それぞれの**ユーザーIDの紐付け**
- **国ごとに別チャネル**（日本・台湾・タイ）の扱い
- IDトークンにしか入っていない**メールアドレス**の正しい取り出し方

renkei はこれらを引き受け、反対側には**標準のOpenID Connect**を出します。
Supabase、Firebase、Cognito、Keycloak、あるいは自前のアプリにそのまま繋げます。

```
LINE Platform  ──▶  renkei（自分でホスト）  ──▶  Supabase / Firebase / Cognito / Keycloak / 自前アプリ
 Login・LIFF・         友だち追加・ID紐付け・             標準OIDC（+ line:* クレーム）
 Messaging API         トークン検証・アカウント連携
```

## なぜ作るのか

日本の開発者は同じものを何度も自作しています。CognitoはLINEの`bot_prompt`を渡せない。Auth0はManagement APIのハックが要る。SupabaseにはLINEプロバイダーが無い。LINE公式のTipsですら「ID連携の仕組み自体はLINEプラットフォームでは提供していないので、自分で作ってください」と書いてあります。

有償SaaSは存在します。OSSは存在しませんでした。

## やらないこと

- 汎用IdPにはなりません（パスワード認証・MFA・RBACは Logto や Keycloak に任せ、renkei はその手前に立ちます）
- マーケティング配信はしません（友だち状態を**公開**するだけで、メッセージは送りません）
- v0.x ではホスティング版を提供しません

## 状況

計画段階です。ロードマップは [`docs/ROADMAP.md`](docs/ROADMAP.md)、設計は [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)、決定事項とその理由は [`docs/DECISIONS.md`](docs/DECISIONS.md)。

## ライセンス

Apache-2.0。

---

renkei は LINEヤフー株式会社とは無関係の個人プロジェクトです。「LINE」はLINEヤフー株式会社の商標です。
