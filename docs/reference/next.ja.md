# Next.js ヘルパー（`renkei-next`）

> English: [next.en.md](next.en.md) · 動くコード: [`examples/nextjs-renkei-next`](../../examples/nextjs-renkei-next)

`renkei-next` は Next.js（App Router）アプリを renkei の OIDC クライアントにするための小さなパッケージです。Auth.js を使わずに、**ルートハンドラ 4 つ、暗号化セッションクッキー、`getSession()`、`proxy.ts` / `middleware.ts` 用のガード、LINE のデザインガイドラインに沿った `<LineLoginButton />`** を提供します。内部では [`renkei-client`](client.ja.md) で URL とトークン交換を組み、id_token は renkei の JWKS で検証します。

Auth.js を使うなら不要です — その場合は [Next.js チュートリアル](../tutorials/nextjs.ja.md) へ。

```sh
npm i renkei-next
# renkei 側でクライアントを登録（アプリ側の設定を表示）
npx renkei add-client my-next-app --redirect https://app.example.com/api/renkei/callback --preset next
```

## 3 ファイル

```ts
// renkei.ts — アプリ全体で 1 つ
import { createRenkeiAuth } from 'renkei-next';

export const renkei = createRenkeiAuth({
  issuer: process.env.RENKEI_ISSUER!,          // renkei の公開 URL
  clientId: process.env.RENKEI_CLIENT_ID!,
  clientSecret: process.env.RENKEI_CLIENT_SECRET, // 省略すると PKCE のみのパブリッククライアント
  secret: process.env.RENKEI_NEXT_SECRET!,     // 32 文字以上。クッキーの暗号化鍵
  botPrompt: 'normal',                         // 任意
});
```

```ts
// app/api/renkei/[...renkei]/route.ts
import { renkei } from '@/renkei';
export const { GET, POST } = renkei.handlers;
// → /api/renkei/login, /api/renkei/callback, /api/renkei/logout, /api/renkei/session
```

```ts
// proxy.ts（Next 16。Next 15 以前は middleware.ts に同じコード）
import { renkei } from '@/renkei';
export default renkei.proxy({ protect: ['/account'] });
export const config = { matcher: ['/account/:path*'] };
```

あとはページで:

```tsx
import { renkei } from '@/renkei';
import { LineLoginButton } from 'renkei-next/button';

export default async function Page() {
  const session = await renkei.getSession(); // RenkeiClaims | null
  if (!session) return <LineLoginButton returnTo="/account" />;
  return <p>{session.name} · LINE {session['line:user_id']} · <a href={renkei.logoutPath('/')}>ログアウト</a></p>;
}
```

## 流れ

1. `GET /api/renkei/login?return_to=/account` — `state` / `nonce` / PKCE verifier / `return_to` を暗号化した短命クッキー（10 分）に入れ、renkei の `/oidc/auth` へリダイレクト。
2. renkei が LINE ログイン（友だち追加プロンプト含む）を済ませ、`GET /api/renkei/callback?code=&state=` に戻す。
3. `state` を照合 → `/oidc/token` でコード交換（PKCE、コンフィデンシャルなら Basic 認証）→ id_token を **renkei の JWKS で検証**（`iss`, `aud`, 署名, `nonce`）→ クレームを暗号化セッションクッキーに保存 → `return_to` へ。
4. `getSession()` / `getSessionFromRequest()` はそのクッキーを復号して返すだけ。renkei への通信はありません。

セッションはログイン時点のクレームのスナップショットです。`line:friend` の変化を追うなら再ログインさせるか、renkei の Webhook 連携をアプリ側で受けてください。

## API

### `createRenkeiAuth(options)`

| オプション | 既定 | 説明 |
|---|---|---|
| `issuer` | — | renkei の公開 URL |
| `clientId` / `clientSecret?` | — | 登録済みクライアント。`clientSecret` を省くとパブリッククライアント（PKCE は常に使用） |
| `secret` | — | クッキー暗号化の秘密（32 文字以上）。JWE `dir` / `A256GCM`、鍵は SHA-256(secret)。変えると全員ログアウト |
| `basePath` | `/api/renkei` | ハンドラのマウント先 |
| `scope` | `openid profile email line` | |
| `botPrompt` / `lineRegion` | — | renkei に渡す `bot_prompt` / `line_region` |
| `session.cookieName` | `renkei_next_session` | フロークッキーは `<name>_flow` |
| `session.maxAge` | 7 日（秒） | |
| `defaultReturnTo` | `/` | `return_to` が無い／不正なときの戻り先 |
| `errorRedirect` | なし（400/401 のテキスト） | 失敗時のリダイレクト先。`?error=&error_description=` 付き |
| `fetch` | `globalThis.fetch` | renkei への通信の差し替え |

戻り値 `RenkeiAuth`:

| メンバー | 説明 |
|---|---|
| `handlers.GET` / `handlers.POST` | ルートハンドラ（`[...renkei]/route.ts` で再エクスポート） |
| `handle(request)` | ハンドラの本体。独自のマウントに |
| `paths` | `{ login, callback, logout, session }` の絶対パス |
| `loginPath(returnTo?, { botPrompt? })` | `/api/renkei/login?return_to=…` |
| `logoutPath(returnTo?)` | `/api/renkei/logout?return_to=…`（GET でも POST でも可） |
| `getSession()` | Server Component / Server Action / Route Handler から。`next/headers` の `cookies()` を使用 |
| `getSessionFromRequest(request)` | 任意の `Request` から（proxy、独自ハンドラ） |
| `proxy(options?)` / `middleware(options?)` | `(request) => Response \| undefined`。未ログインの保護パスを `307` でログインへ |
| `client` | 内部の `RenkeiClient` |

`proxy({ protect })`: プレフィックスの配列、または `(url) => boolean`。省略時は `basePath`、`/_next/*`、拡張子付きファイル以外をすべて保護します。

### `GET /api/renkei/session`

クライアントコンポーネントから `fetch('/api/renkei/session')` すると現在のクレーム（JSON）、未ログインなら `401 { error: "no_session" }`。

### `<LineLoginButton />`（`renkei-next/button`）

[LINE ログインボタン デザインガイドライン](https://developers.line.biz/ja/docs/line-login/login-button/)に沿った `<a>` です: ベース `#06C755`、ホバーで黒 10 %、押下で黒 30 % のオーバーレイ、白文字、**公式の LINE アイコン（テンプレート同梱の PNG をそのまま埋め込み）**、黒 8 % の縦線、左右の余白は吹き出し幅以上。無効状態は白地・`#1E1E1E` 20 %・`#E5E5E5` 60 % の枠。hooks を使わないので Server Component からもそのまま使えます。スタイルは `<style>` として一緒に出力されます（React 19 は 1 回に重複排除）。

| prop | 既定 | 説明 |
|---|---|---|
| `href` | `/api/renkei/login` | ログインルート |
| `returnTo` | — | `?return_to=` |
| `botPrompt` | — | `?bot_prompt=`（`aggressive` / `normal` / `none`） |
| `locale` | `ja` | `ja`「LINEでログイン」/ `en` "Log in with LINE" |
| `label` | — | 独自の文言。「LINE でログインする」ことが明確で、改行なし（ガイドライン） |
| `size` | `md` | `md` = 44px / `sm` = 32px |
| `iconOnly` | `false` | アイコンのみ（ガイドラインで許可） |
| `disabled` | `false` | |
| その他 | | `<a>` の属性（`className`, `style`, `id`, `target` …）をそのまま透過 |

**React を使わない場合**は、`renkei-server` が同じボタンをフレームワーク不要・ビルド不要で提供します。
renkei 自身の `/dev` ページもこれを描画しています:

```ts
import { lineLoginButton, lineLoginButtonCss } from 'renkei-server';

const page = `<style>${lineLoginButtonCss()}</style>
${lineLoginButton({ href: '/login' })}`;
```

`lineLoginButton({ href, locale?, label?, size?, iconOnly?, disabled?, className? })` は `<a>` を
文字列で返し、埋め込む値はエスケープします。`lineLoginButtonCss()` はスタイルシートを返すので、
ページに 1 回だけ出力してください。アイコンは React 版とバイト単位で同一です（ガイドラインが
アイコンの改変を禁じているため、`packages/next/test` で検証しています）。

LINE および LINE ロゴは LY 株式会社の商標です。ボタンの配色・アイコンを変更しないでください。

### 再エクスポート

`renkei-client` から `RenkeiClaims`, `LineClaims`, `LINE_CLAIMS`, `isFriend()`, `isLinked()`, `BotPrompt` を再エクスポートしています。

## セキュリティメモ

- id_token は毎回 renkei の JWKS（`/oidc/jwks`）で署名・`iss`・`aud`・`nonce` を検証します。`renkei-client` の `decodeClaimsUnverified()` は使いません。
- PKCE（S256）は常に有効。`state` は暗号化クッキーに保存して照合。
- `return_to` は同一オリジンのパスのみ（`//host` や絶対 URL は `defaultReturnTo` に置き換え）。
- セッションクッキーは `HttpOnly` / `SameSite=Lax` / `Path=/`、HTTPS なら `Secure`。中身は JWE で、改ざん・期限切れ・別の `secret` は `null` になります。
- renkei の「セッションクッキーモード」（`RENKEI_SESSION_COOKIE`）は使いません — そのクッキーは renkei のオリジンに属し、別オリジンの Next.js からは読めないためです（[DECISIONS.md §13](../DECISIONS.md)）。
