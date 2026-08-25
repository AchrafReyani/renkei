# Next.js アプリに LINE ログインを追加する（Auth.js + renkei）

> English: [nextjs.en.md](nextjs.en.md) · 動くコード: [`examples/nextjs`](../../examples/nextjs)

renkei は標準の OpenID Connect プロバイダーなので、Next.js 側は **Auth.js（next-auth v5）の汎用 OIDC プロバイダー**を
設定するだけです。LINE 固有のことは何も書きません。友だち追加も LIFF も renkei 側で済んでいます。

```
Next.js（Auth.js） ──OIDC──▶ renkei ──▶ LINE Login（友だち追加つき）
```

所要時間: 10 分。前提: renkei が動いていること（[README の 5 分クイックスタート](../../README.md#5分で試す)）。

## 1. renkei にクライアントを登録する

renkei の `RENKEI_CLIENTS` に Next.js アプリを追加します。Auth.js のコールバックは
`/api/auth/callback/<provider id>` です（以下 provider id は `renkei`）。

```json
[{
  "clientId": "my-next-app",
  "clientSecret": "<32文字以上のランダム文字列>",
  "redirectUris": ["http://localhost:3400/api/auth/callback/renkei"]
}]
```

## 2. Auth.js を設定する

```sh
pnpm add next-auth@beta
```

```ts
// auth.ts
import NextAuth from 'next-auth'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    {
      id: 'renkei',
      name: 'LINE',
      type: 'oidc',
      issuer: process.env.RENKEI_ISSUER,            // 例: http://localhost:3000
      clientId: process.env.RENKEI_CLIENT_ID,
      clientSecret: process.env.RENKEI_CLIENT_SECRET,
      authorization: { params: { scope: 'openid profile email line' } },
      profile(profile) {
        return { id: profile.sub, name: profile.name, email: profile.email, image: profile.picture }
      },
    },
  ],
  callbacks: {
    // line:* クレームを JWT セッションに持ち越す
    jwt({ token, profile }) {
      if (profile) {
        token.line = {
          userId: profile['line:user_id'],
          friend: profile['line:friend'],
          channelId: profile['line:channel_id'],
          region: profile['line:region'],
        }
      }
      return token
    },
    session({ session, token }) {
      ;(session as typeof session & { line?: unknown }).line = token.line
      return session
    },
  },
})
```

```ts
// app/api/auth/[...nextauth]/route.ts
import { handlers } from '@/auth'
export const { GET, POST } = handlers
```

`.env.local`:

```
AUTH_SECRET=<openssl rand -base64 32>
RENKEI_ISSUER=http://localhost:3000
RENKEI_CLIENT_ID=my-next-app
RENKEI_CLIENT_SECRET=<手順 1 と同じ>
```

## 3. ログインボタン

```tsx
// app/page.tsx
import { auth, signIn, signOut } from '@/auth'

export default async function Page() {
  const session = await auth()
  if (!session) {
    return (
      <form action={async () => { 'use server'; await signIn('renkei') }}>
        <button type="submit">LINEでログイン</button>
      </form>
    )
  }
  return (
    <>
      <p>{session.user?.name} さん</p>
      <pre>{JSON.stringify((session as { line?: unknown }).line, null, 2)}</pre>
      <form action={async () => { 'use server'; await signOut() }}>
        <button type="submit">ログアウト</button>
      </form>
    </>
  )
}
```

ボタンの見た目は [LINE ログインボタン デザインガイドライン](https://developers.line.biz/ja/docs/line-login/login-button/) に合わせてください。

## 4. 動作確認

1. renkei を起動（`RENKEI_CLIENTS` に手順 1 のクライアント）
2. `pnpm dev -p 3400` → http://localhost:3400 → 「LINEでログイン」
3. LINE の同意画面 → 友だち追加 → アプリに戻り、名前と `line` オブジェクトが表示される

`session.line.friend` が `true` なら、ユーザーは公式アカウントの友だちです。

## よくある質問

**`sub` は LINE の userId？** — いいえ。renkei が発行する不透明な ID です。LINE の userId は `line:user_id` に入ります（`line` スコープ）。
Messaging API でメッセージを送るならこちらを使います。

**メールが `null`** — LINE がメールを返すのは、チャネルにメール取得権限があり、ユーザーが同意した場合だけです。
renkei 側で `RENKEI_REQUEST_EMAIL=true` と、[権限の申請](../guides/line-console.ja.md#6-メールアドレス取得権限必要なら)が必要です。

**セッションを DB に置きたい** — Auth.js のアダプターをそのまま使えます。renkei は関係ありません。

**Auth.js を使わない** — [`openid-client`](https://github.com/panva/openid-client) など任意の OIDC クライアントで同じことができます。
ディスカバリ URL は `${RENKEI_ISSUER}/.well-known/openid-configuration`。
