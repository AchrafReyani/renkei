# renkei-client

renkei（連携）サーバーと話すアプリ向けの小さな SDK。**依存ゼロ**で、ブラウザ / Node / Cloudflare Workers など `fetch`・`URL`・Web Crypto があるところで動きます。OIDC の URL やリクエストを手で組む代わりに使います。

A tiny SDK for apps that talk to a renkei (連携) server. **Zero dependencies**; runs wherever `fetch`, `URL` and Web Crypto exist — browsers, Node, Cloudflare Workers. Use it instead of hand-assembling OIDC URLs and requests.

```ts
import { createRenkeiClient, generatePkce, randomString } from 'renkei-client';

const renkei = createRenkeiClient({ issuer: 'https://auth.example.com', clientId: 'my-app' });

// 1. OIDC ログイン開始 / start an OIDC login (keep state, nonce, verifier in your session)
const state = randomString();
const nonce = randomString();
const { verifier, challenge } = await generatePkce();
location.href = renkei.loginUrl({
  redirectUri: 'https://app.example.com/cb',
  state,
  nonce,
  codeChallenge: challenge, // required for public clients
  botPrompt: 'normal', // 'aggressive' | 'normal' | 'none'
});

// 2. 戻り先で / on the callback
const tokens = await renkei.exchangeCode({ code, redirectUri: 'https://app.example.com/cb', codeVerifier: verifier });

// 3. LIFF: LINE のトークンを renkei の id_token に / LIFF tokens → renkei id_token with line:* claims
const { idToken, claims } = await renkei.exchangeLiffToken({
  idToken: liff.getIDToken(),
  accessToken: liff.getAccessToken(),
});
claims['line:user_id']; // typed: RenkeiClaims

// 4. セッションクッキーモード / session-cookie mode (RENKEI_SESSION_COOKIE=true)
location.href = renkei.sessionLoginUrl({ returnTo: '/account' });
const me = await renkei.session(); // RenkeiClaims | null
await renkei.logout();
```

`decodeClaimsUnverified(idToken)` は署名を**検証しません**。表示用です。トークンを信頼するバックエンドは `${issuer}/oidc/jwks` で検証してください（jose, openid-client など）。
`decodeClaimsUnverified(idToken)` does **not** verify the signature — it is for display. A backend that trusts a token must verify it against `${issuer}/oidc/jwks` (jose, openid-client, …).

ドキュメント / Docs: <https://github.com/AchrafReyani/renkei/blob/main/docs/reference/client.ja.md> · Apache-2.0
