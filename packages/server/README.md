# renkei-server

renkei（連携）本体: LINE Login・友だち追加・LIFF トークン交換・ID の紐付けを引き受けて、標準の OpenID Connect プロバイダーとして公開します。Hono + `oidc-provider`。

The renkei (連携) server: LINE Login with friend-add, LIFF token exchange and user-ID mapping, exposed as a standard OpenID Connect provider. Hono + `oidc-provider`.

```sh
npx renkei            # same as this package's `node` entry, via the CLI
```

```ts
import { createRenkei } from 'renkei-server';
```

設定・エンドポイント・チュートリアル（Supabase / Next.js）/ Configuration, endpoints, tutorials: <https://github.com/AchrafReyani/renkei> · Apache-2.0

LINE および関連ロゴは LINEヤフー株式会社の商標です。renkei は同社とは無関係の個人プロジェクトです。 / LINE is a trademark of LY Corporation; renkei is an independent project.
