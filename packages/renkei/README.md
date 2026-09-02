# renkei（連携）

LINEログインの「その先」を全部引き受ける、セルフホスト型IDブローカー。
A self-hosted identity broker that owns everything after the LINE login.

```sh
npx renkei init                 # .env を生成（署名鍵・Cookie 鍵・SQLite ストレージ）/ writes a ready-to-run .env
#   → LINE_LOGIN_CHANNEL_ID / LINE_LOGIN_CHANNEL_SECRET だけ貼り付ける / paste the two channel values
npx renkei                      # サーバー起動 → http://localhost:3000/dev / starts the server
npx renkei add-client my-app --redirect https://app.example.com/api/auth/callback/renkei --preset authjs
#   → RENKEI_CLIENTS に登録し、アプリ側に貼る設定を表示 / registers the client and prints the app-side config
```

`--preset authjs | supabase | public | next`（Auth.js / Supabase の Keycloak プロバイダー / PKCE のパブリッククライアント / Next.js の renkei-next）。
Node 22.13+（組み込み SQLite）。/ Node 22.13+ (built-in SQLite).

Docs / ドキュメント: https://github.com/AchrafReyani/renkei

renkei は LINEヤフー株式会社とは無関係の個人プロジェクトです。Not affiliated with LY Corporation.
