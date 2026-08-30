# examples/nextjs

Next.js (App Router) + Auth.js v5 logging in through renkei as a plain OIDC provider.
Tutorial: [docs/tutorials/nextjs.ja.md](../../docs/tutorials/nextjs.ja.md) / [en](../../docs/tutorials/nextjs.en.md).

```sh
cp .env.example .env.local     # set RENKEI_* to match a client in renkei's RENKEI_CLIENTS
#   (in the renkei directory: npx renkei add-client my-next-app --redirect http://localhost:3400/api/auth/callback/renkei --preset authjs)
pnpm install && pnpm dev       # http://localhost:3400
```
