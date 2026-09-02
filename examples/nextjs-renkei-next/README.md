# examples/nextjs-renkei-next

Next.js（App Router）+ `renkei-next`。Auth.js を使わず、renkei-next のルートハンドラ・暗号化セッションクッキー・`proxy.ts` ガード・ガイドライン準拠の `<LineLoginButton />` だけでログインします。
Next.js (App Router) + `renkei-next`: no Auth.js — renkei-next's route handlers, encrypted session cookie, `proxy.ts` guard and the guideline-compliant `<LineLoginButton />`.

リファレンス / Reference: [docs/reference/next.ja.md](../../docs/reference/next.ja.md) · [en](../../docs/reference/next.en.md)

```sh
# renkei 側 / in the renkei checkout (renkei on :8787):
npx renkei add-client my-next-app --redirect http://localhost:3500/api/renkei/callback --preset next

# この例 / here:
cp .env.example .env.local        # paste the client secret the command printed
pnpm install && pnpm dev          # http://localhost:3500
```

| ファイル / file | 役割 / role |
|---|---|
| `renkei.ts` | `createRenkeiAuth({ issuer, clientId, clientSecret, secret })` — アプリ全体で 1 つ |
| `app/api/renkei/[...renkei]/route.ts` | `export const { GET, POST } = renkei.handlers` → `/login` `/callback` `/logout` `/session` |
| `proxy.ts` | `renkei.proxy({ protect: ['/account'] })` — 未ログインなら `return_to` 付きでログインへ（Next ≤ 15 は `middleware.ts`） |
| `app/page.tsx` | `renkei.getSession()` と `<LineLoginButton />`（ja / en / sm / icon-only） |
| `app/account/page.tsx` | 保護ページ。`line:*` クレームと `isFriend()` / `isLinked()` |
