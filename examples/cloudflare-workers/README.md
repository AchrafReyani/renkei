# examples/cloudflare-workers

renkei を Cloudflare Workers + D1 で動かす例。Worker 本体は `renkei-server/workers` の re-export 1 行で、設定は `wrangler.toml` の `[vars]` とシークレットから読みます。
renkei on Cloudflare Workers with D1 storage. The Worker itself is a one-line re-export of `renkei-server/workers`; configuration comes from `[vars]` in `wrangler.toml` plus secrets.

ガイド / Guide: [docs/guides/deploy-cloudflare-workers.ja.md](../../docs/guides/deploy-cloudflare-workers.ja.md) · [en](../../docs/guides/deploy-cloudflare-workers.en.md)

```sh
# リポジトリのルートで / in the repo root (the example bundles the built packages):
pnpm install && pnpm build

# この例 / here:
cp .dev.vars.example .dev.vars   # チャネル ID・シークレット、RENKEI_JWKS / RENKEI_COOKIE_KEYS を貼る
                                 # paste the channel ID/secret and RENKEI_JWKS / RENKEI_COOKIE_KEYS (npx renkei init --print generates both)
pnpm dev                         # http://localhost:8787/dev — local D1 under .wrangler/
```

本番 / Production: `wrangler d1 create renkei` → `database_id` を `wrangler.toml` に、`ISSUER` を Worker の URL に → `wrangler secret put` で各シークレット → `pnpm deploy`。
`wrangler d1 create renkei` → paste the `database_id` into `wrangler.toml`, set `ISSUER` to the Worker's URL → `wrangler secret put` each secret → `pnpm deploy`.

| ファイル / file | 役割 / role |
|---|---|
| `src/index.ts` | `export { default } from 'renkei-server/workers'` — isolate ごとに 1 回起動、D1 binding `DB` に保存 / boots once per isolate, stores in the `DB` binding |
| `wrangler.toml` | `nodejs_compat`（oidc-provider は Node ライブラリ）、`[vars]`、`[[d1_databases]]` |
| `.dev.vars.example` | ローカル用シークレットの雛形 / template for local secrets |

テーブルは初回リクエストで自動作成されます（冪等）。マイグレーション手順はありません。
Tables are created on the first request (idempotent); there is no migration step.
