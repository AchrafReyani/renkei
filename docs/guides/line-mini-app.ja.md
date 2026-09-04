# LINE ミニアプリチャネル

> English: [line-mini-app.en.md](line-mini-app.en.md)

LINE は LIFF を LINE ミニアプリに統合しつつあり、LINE 内で動く新しいアプリは Login チャネル上の LIFF アプリではなく **LINE ミニアプリチャネル**として作ります。renkei は LIFF と同じ `POST /liff/exchange` でミニアプリのトークンを受け付け、そのユーザーを Login チャネル経由の Web ログインが作った**同じ ID（`sub`）**に対応づけます。LINE のユーザー ID はプロバイダーごとに 1 つで、どちらのチャネルもあなたのプロバイダー配下にあるからです。

得られるもの: Web でも LIFF でもミニアプリでも、1 人につき 1 つの `sub`。どの面から来たトークンかは `line:channel_id` で分かります。

## 1. チャネルを作る

LINE Developers Console → プロバイダー → **新規チャネル作成 → LINE ミニアプリ**。名前・説明・メールアドレスを入れ、ミニアプリの規約に同意します。作成直後は**未認証**ですが、開発にはそれで十分です。

ミニアプリは実体として 3 つの LIFF アプリで、それぞれ内部チャネルを持ちます:

| ステージ | 開けるのは | ID の場所 |
|---|---|---|
| 開発用（Developing） | チャネルの管理者とテスター（Roles タブ） | ウェブアプリ設定 → LIFF URL（`https://miniapp.line.me/<id>-…`） |
| 審査用（Review） | LY Corporation の審査者 | 同上 |
| 公開用（Published） | 審査後、エンドユーザー | 同上 |

各ステージの id_token は `aud` に自分のチャネル ID を持ち、**チャネルシークレットもステージごとに別**です（チャネル基本設定 → チャネルシークレットに開発用・審査用・公開用の 3 つが並びます）。使うステージの ID *と*シークレットを renkei に登録してください。

開発用ステージをスマートフォンで開くには、その端末の LINE アカウントが **LINE Business ID に連携されたアカウント**である必要があります（コンソールのプロフィール → *Business ID プロフィールへ* → LINE アカウントを連携）。Admin / Tester の役割は LINE アカウントで照合され、コンソールのメールアドレスでは照合されません。連携がないと LINE は `400 … user need to have developer role` を返します。

## 2. ミニアプリをあなたのページに向ける

ウェブアプリ設定 → **エンドポイント URL**（開発用）→ LIFF SDK を動かして renkei を呼ぶ、あなたのアプリのページ。最初の確認には renkei 自身のテストページが使えます:

```
https://<your-renkei>/dev/liff?liff_id=<開発用 LIFF ID>
```

（`RENKEI_DEV=true` と `LIFF_ID` を設定。`liff_id` クエリでページが初期化する LIFF アプリを差し替えます。）スコープは既定の `openid` と `profile` で足ります。

## 3. renkei にチャネルを教える

環境変数（Node / Docker / Workers / Supabase 共通）:

```sh
LINE_MINIAPP_CHANNEL_ID=2011444277,2011444279      # 開発用、公開用 — 使うステージ
LINE_MINIAPP_CHANNEL_SECRET=<開発用シークレット>,<公開用シークレット>   # ID ごとに同じ順で（1 つだけ書くと全 ID に適用）
```

プログラムからの設定 — Login チャネルの隣に `kind: 'miniapp'` のチャネルを置きます:

```ts
channels: [
  { channelId: '2011257262', channelSecret: '…', region: 'jp' },                     // LINE Login
  { channelId: '2011444277', channelSecret: '…', region: 'jp', kind: 'miniapp' },    // ミニアプリ・開発用
  { channelId: '2011444279', channelSecret: '…', region: 'jp', kind: 'miniapp' },    // ミニアプリ・公開用
],
```

ミニアプリチャネルは Login チャネルと同じ region を共有し、Web のリダイレクトフローには使われません（`/oidc/auth` → LINE は常に Login チャネル）。`/liff/exchange` のためのチャネルです。

**ID の対応づけ。** `provider` の値が同じチャネル — 未設定のチャネル同士も含む — は 1 つの LINE プロバイダーとして扱われ、そのどれかで見た LINE ユーザー ID は同じ人です。ミニアプリからのログインは Web ログインが作った `sub` を再利用します（逆も同じ）。`provider` を設定するのは、1 つの renkei に*別々の* LINE プロバイダーのチャネルを混ぜるときだけです。

## 4. ミニアプリ側

[エンドポイントリファレンス](../reference/endpoints.ja.md#post-liffexchange)の LIFF フローそのままです: `liff.init({ liffId })` のあと、`liff.getIDToken()` と `liff.getAccessToken()` をクライアント ID と一緒に `POST /liff/exchange` へ。renkei は両方を LINE で検証し、ID を upsert し、`line:channel_id` がミニアプリのチャネル ID で `sub` が Web と同じ renkei 署名の id_token を返します。`renkei-client` の `exchangeLiffToken()` がこの呼び出しを包んでいます。

## サービスメッセージ — 前提条件

renkei は[サービスメッセージ](https://developers.line.biz/ja/docs/line-mini-app/develop/service-messages/)を送りません。送るのはあなたのアプリで、renkei では用意できないものが要ります:

- 本番では**認証済み**ミニアプリ（未認証は開発用ステージでのテストのみ）
- **ミニアプリチャネルのチャネルアクセストークン**（ステートレスが推奨） — Login チャネルのものではない
- クライアントから受け取るユーザーの **LIFF アクセストークン**（`liff.getAccessToken()`、有効 12 時間）: `POST /notifier/token` でサービス通知トークン（有効 1 年、ユーザーの 1 操作につき**最大 5 通**）に替え、`POST /notifier/send?target=service` で送信

renkei との交換と並行して、アプリ側で LIFF アクセストークンの流れを残しておいてください。renkei の `line:user_id` だけではサービスメッセージは送れません。

## よくあるエラー

- **`invalid_token: id_token is not for one of our channels`** — トークンの `aud`（ステージのチャネル ID）が `LINE_MINIAPP_CHANNEL_ID` にない。そのステージを追加
- **id_token は正しそうなのに `invalid_token`** — そのステージのシークレットが違う。ID ごとにシークレットを渡す
- **同じ人に別々の `sub` が出る** — チャネルの `provider` が異なる値になっているか、ミニアプリチャネルが別の LINE プロバイダーにある（その場合 LINE のユーザー ID 自体が異なり、対応づけは不可能）
- **開発用ミニアプリが開かない（`400`、"developer role"）** — 端末の LINE アカウントが Admin / Tester を持つ Business ID に連携されていない（手順 1）、またはチャネルのテスターではない（Roles タブ）
- **ミニアプリから `line:friend` が来ない** — 友だち状態の確認はチャネルに連携された公式アカウントに対して行われ、公式アカウント未連携のミニアプリチャネルには値がない。Login チャネルの行には残る
