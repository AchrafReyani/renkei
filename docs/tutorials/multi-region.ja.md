# 多地域対応: 1 つの renkei と複数の LINE ログインチャネル

> English: [multi-region.en.md](multi-region.en.md)

LINE ログインチャネルは提供する地域に紐づきます。日本**と**台湾のユーザーに届けるには地域ごとにチャネルを 1 つ登録し、ログインごとに正しいチャネルへ振り分けます。その振り分けが renkei の仕事です。チャネルを並べて設定し、各ログインに `line_region` パラメータを付けるか、クライアントを地域に固定します。

```
                        ┌─ line_region=jp ─▶ LINE ログインチャネル（jp）
あなたのアプリ ──OIDC──▶ renkei ┤
                        └─ line_region=tw ─▶ LINE ログインチャネル（tw）
```

所要時間: 動いている renkei に対して 15 分（[README クイックスタート](../../README.md#5分で試す)）。

## 1. 2 つめのチャネルを作る

LINE Developers Console → プロバイダー → **新規チャネル作成 → LINE ログイン**。フォームは別々の 2 つを聞いてきます:

- **サービス提供地域** — 日本 / 台湾 / タイ / インドネシア。これがチャネルの地域で、下の `region` に対応します。
- **会社・事業者の所在国** — *あなた*がどこにいるか。サービス提供地域と一致している必要はありません。

コールバック URL は 1 つめのチャネルと同じ `https://<your-renkei>/line/callback` を登録します。2 要素認証、LIFF タブ、連携する公式アカウントはチャネルごとの設定です。

> **誰がログインできるか。** チャネルは選んだ地域向けです。別地域の LINE アカウントは LINE 側の画面で拒否されることがあるため、地域ごとにその地域のアカウントでテストしてください。renkei 側の挙動は変わりません。

## 2. 両方のチャネルを設定する

`RENKEI_CHANNELS` に、主となる `LINE_LOGIN_*` 以外のチャネルを JSON で並べます:

```sh
LINE_LOGIN_CHANNEL_ID=2011257262            # 主チャネル（既定のチャネルでもある）
LINE_LOGIN_CHANNEL_SECRET=…
LINE_LOGIN_REGION=jp

RENKEI_CHANNELS=[{"channelId":"2011447387","channelSecret":"…","region":"tw"}]
```

`LINE_LOGIN_*` を使わず、`RENKEI_CHANNELS` に全部を書いても構いません。その場合は先頭のログインチャネルが既定になります:

```sh
RENKEI_CHANNELS=[{"channelId":"2011257262","channelSecret":"…","region":"jp"},{"channelId":"2011447387","channelSecret":"…","region":"tw"}]
```

各要素は[設定リファレンス](../reference/config.ja.md)のチャネル定義そのままで、`region`、`botPrompt`、`requestEmail`、`kind`（`login` / `miniapp`）、`provider` が使えます。プログラムから設定する場合も同じ配列です:

```ts
channels: [
  { channelId: '2011257262', channelSecret: '…', region: 'jp' },
  { channelId: '2011447387', channelSecret: '…', region: 'tw', botPrompt: 'normal' },
],
```

起動時に renkei が守らせるルール: **地域ごとにログインチャネルは 1 つ**（`line_region` が選べなくなるため、重複は起動エラー）、チャネル ID は一意。region は自由な文字列で、`jp` / `tw` / `th` は列挙型ではなく慣習です。

## 3. ログインを振り分ける

方法は 3 つ。renkei はこの順で見ます:

**a. 認可リクエストの `line_region`。** アプリ側が決めます（言語切り替え、国の選択、ユーザーのプロフィールなど）:

```
GET /oidc/auth?client_id=my-app&response_type=code&scope=openid%20profile%20line&line_region=tw&…
```

`renkei-client` ではオプションです: `loginUrl({ redirectUri, state, nonce, lineRegion: 'tw' })`。

**b. 地域に固定したクライアント。** 市場ごとにアプリが分かれていて、常に同じチャネルを使う場合:

```sh
RENKEI_CLIENTS=[
  {"clientId":"jp-app","clientSecret":"…","redirectUris":["https://jp.example.com/cb"],"lineRegion":"jp"},
  {"clientId":"tw-app","clientSecret":"…","redirectUris":["https://tw.example.com/cb"],"lineRegion":"tw"}
]
```

**c. どちらも無し** — 先頭のログインチャネルが使われます。未知の地域名もログインを失敗させず、そこにフォールバックします。どのチャネルが既定かは起動ログに出ます。

同じパラメータはセッション Cookie モード（`GET /login?line_region=tw`）とアカウント連携の入口（`GET /link?line_region=tw`）でも使えます。`RENKEI_DEV=true` なら `/dev` ページに地域ごとのログインリンクが増えるので、配線の確認はそこが一番早いです。

## 4. トークンに何が入るか

id_token には、実際にログインしたチャネルが入ります:

```json
{
  "sub": "j_QoAMmfl7tyAG-SFrz1XfE3YY04RdU0",
  "line:user_id": "U54de99…",
  "line:channel_id": "2011447387",
  "line:region": "tw"
}
```

市場を知りたいときは `line:region`、正確なチャネルが要るとき（ミニアプリのステージなど）は `line:channel_id` を見ます。両方の地域でログインしたユーザーは、以降のトークンでは**最後にログインした**地域になります。`line:region` は「その人の属性」ではなく「今回どこから来たか」として扱ってください。

## 5. 1 人のユーザーと 2 つのチャネル

ここが直感に反するところで、効いてくるのは地域ではなく**プロバイダー**です:

- **同じ LINE プロバイダー配下の 2 チャネル**（通常はこちら）: LINE のユーザー ID はプロバイダーごとなので、同じ人は両方のチャネルで*同じ* `line:user_id` を持ちます。renkei はそれを見て **`sub` を 1 つ**に保ち、LINE アカウント行をチャネルごとに 1 行持ちます。設定は不要です。
- **別々のプロバイダー配下**: LINE のユーザー ID が異なるため、renkei には同一人物と判定できません。2 つの ID、2 つの `sub` になります。これは LINE 側の境界で、renkei の制約ではありません。まとめたい場合はアプリ側で行うか、チャネルを 1 つのプロバイダーにまとめてください。

チャネルの `provider` を設定するのは、1 つの renkei が複数の LINE プロバイダーのチャネルを扱っていて、そのまとまりを明示したいときだけです。未設定のチャネル同士は 1 つのプロバイダーとして扱われます。

## 6. Messaging API と Webhook

Messaging API チャネルはどれか 1 つの地域のユーザーに属します。どれかを指定してください:

```sh
LINE_MESSAGING_CHANNEL_SECRET=…
LINE_MESSAGING_CHANNEL_REGION=tw     # 既定は LINE_LOGIN_REGION
```

follow / unfollow イベントは、その地域のチャネルのアカウントの友だち状態を更新します。指定した地域に対応するログインチャネルが無い場合、renkei は起動時に警告し、先頭のチャネルにフォールバックします（起動ログに出ます）。

## チェックリスト

- [ ] 2 つめのチャネルを作り、地域を選び、コールバック URL を登録した
- [ ] `RENKEI_CHANNELS`（または全件のリスト）を設定し、起動ログに両方の地域と既定チャネルが出ている
- [ ] `/dev` に地域ごとのログインリンクが出て、それぞれが正しいチャネル ID で LINE に飛ぶ
- [ ] 各地域の id_token に期待どおりの `line:region` と `line:channel_id` が入っている
- [ ] Webhook を使うなら、`LINE_MESSAGING_CHANNEL_REGION` がそのユーザーのログインチャネルと一致している
