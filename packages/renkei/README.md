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

## `renkei.yaml` — チャネルが増えたら / once there is more than one channel

```sh
npx renkei init --yaml          # renkei.yaml（コミット可）+ シークレットの .env / a committable file + a .env of secrets
#   既存の .env があれば変換します / converts an existing .env instead of templating
npx renkei add-channel 2345678901 --region tw --secret <Channel secret>
#   → チャネルを追記。値は .env、ファイルには ${VAR} 参照だけ / the value goes to .env, the file gets the reference
npx renkei add-channel 3456789012 --miniapp --secret <Channel secret>   # LINE MINI App のステージ / a MINI App stage
npx renkei add-client my-app --redirect https://app.example.com/callback   # → renkei.yaml の clients:
```

`renkei.yaml` があるときは、それが設定のすべてです（`LINE_*` / `RENKEI_*` の環境変数は無視され、
起動時に名前が表示されます）。シークレットは `${VAR}` 参照だけなので、そのままコミットできます。
When a `renkei.yaml` is present it is the whole configuration — the `LINE_*` / `RENKEI_*`
variables are ignored and named at boot. Every secret is a `${VAR}` reference, so the file is committable.

Docs / ドキュメント: https://github.com/AchrafReyani/renkei

renkei は LINEヤフー株式会社とは無関係の個人プロジェクトです。Not affiliated with LY Corporation.
