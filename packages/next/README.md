# renkei-next

Next.js（App Router）アプリを renkei（連携）の OIDC クライアントにする小さなパッケージ。Auth.js なしで、**ルートハンドラ・暗号化セッションクッキー・`getSession()`・`proxy.ts` ガード・LINE ガイドライン準拠の `<LineLoginButton />`** を提供します。

Next.js (App Router) helpers that make an app an OIDC client of a renkei (連携) server without Auth.js: **route handlers, an encrypted session cookie, `getSession()`, a `proxy.ts` guard and a LINE-guideline-compliant `<LineLoginButton />`**.

```ts
// renkei.ts
import { createRenkeiAuth } from 'renkei-next';
export const renkei = createRenkeiAuth({
  issuer: process.env.RENKEI_ISSUER!,
  clientId: process.env.RENKEI_CLIENT_ID!,
  clientSecret: process.env.RENKEI_CLIENT_SECRET,
  secret: process.env.RENKEI_NEXT_SECRET!, // 32+ chars
});

// app/api/renkei/[...renkei]/route.ts
export const { GET, POST } = renkei.handlers;

// proxy.ts (middleware.ts on Next ≤ 15)
export default renkei.proxy({ protect: ['/account'] });

// any Server Component
const session = await renkei.getSession(); // RenkeiClaims | null — name, picture, line:user_id, line:friend, …
```

```tsx
import { LineLoginButton } from 'renkei-next/button';
<LineLoginButton returnTo="/account" />            // 「LINEでログイン」
<LineLoginButton locale="en" size="sm" iconOnly />  // "Log in with LINE"
```

id_token は renkei の JWKS で検証され、クレームは JWE（`A256GCM`）で暗号化したクッキーに保存されます。
The id_token is verified against renkei's JWKS; the claims live in a JWE-encrypted (`A256GCM`) cookie.

ドキュメント / Docs: <https://github.com/AchrafReyani/renkei/blob/main/docs/reference/next.ja.md> · Apache-2.0 · LINE and the LINE logo are trademarks of LY Corporation.
