# Add LINE Login to Supabase Auth (through renkei)

> 日本語: [supabase.ja.md](supabase.ja.md)

Supabase Auth has no LINE provider. Put renkei in front of it and Supabase's
**built-in Keycloak provider** works as-is — no dashboard custom-provider
feature, no paid plan, no Edge Function. It also works in the local CLI
(`supabase start`).

```
Browser ──▶ Supabase Auth ──▶ renkei ──▶ LINE Login (with friend-add)
                ▲                │
                └── userinfo ◀───┘   sub / name / email / line:*
```

Time: ~15 minutes. Prerequisite: the LINE Developers Console setup from the
[prerequisites guide](../DEV_SETUP.md) (LINE Login channel + Messaging API
channel under one provider, linked to each other).

## 1. Run renkei

`docker compose` is the shortest path.

```yaml
# docker-compose.yml (excerpt)
services:
  renkei:
    image: ghcr.io/achrafreyani/renkei:latest
    ports: ["3000:3000"]
    environment:
      ISSUER: https://auth.example.com          # renkei's public URL
      LINE_LOGIN_CHANNEL_ID: "2011257262"
      LINE_LOGIN_CHANNEL_SECRET: ${LINE_LOGIN_CHANNEL_SECRET}
      RENKEI_BOT_PROMPT: aggressive             # offer friend-add at login
      RENKEI_COOKIE_KEYS: ${RENKEI_COOKIE_KEYS}
      DATABASE_URL: postgres://...              # your Supabase Postgres works too
      RENKEI_CLIENTS: >
        [{"clientId":"supabase",
          "clientSecret":"${SUPABASE_CLIENT_SECRET}",
          "redirectUris":["https://<project-ref>.supabase.co/auth/v1/callback"],
          "placeholderEmailDomain":"line-users.example.com"}]
```

- `redirectUris` is Supabase's **Callback URL**: hosted
  `https://<project-ref>.supabase.co/auth/v1/callback`, local CLI
  `http://127.0.0.1:54321/auth/v1/callback`.
- Read [§4](#4-about-email-addresses-read-this) before you decide on `placeholderEmailDomain`.
- Running renkei from `.env` instead of compose? `npx renkei add-client supabase --redirect <callback URL> --preset supabase`
  writes this client for you and prints the dashboard / `config.toml` values for step 2.
- Register `${ISSUER}/line/callback` as a **Callback URL** in the LINE Developers Console.

Check it's up:

```sh
curl https://auth.example.com/.well-known/openid-configuration | jq .issuer
```

## 2. Configure Supabase (as a Keycloak provider)

renkei also answers on Keycloak's paths (`/protocol/openid-connect/{auth,token,userinfo}`),
so to Supabase it looks like Keycloak.

**Hosted (dashboard)**: Authentication → Providers → enable **Keycloak**:

| Field | Value |
|---|---|
| Client ID | `supabase` |
| Client Secret | the `clientSecret` from `RENKEI_CLIENTS` |
| Realm URL | `https://auth.example.com` (renkei's `ISSUER`, no trailing slash) |

**Local CLI**: add to `supabase/config.toml`, then `supabase stop && supabase start`.

```toml
[auth.external.keycloak]
enabled = true
client_id = "supabase"
secret = "env(SUPABASE_CLIENT_SECRET)"
url = "https://auth.example.com"   # for a local renkei, an https tunnel URL
```

> The local CLI cannot reach a renkei on `localhost:3000` (Supabase Auth runs
> inside Docker). Get an https URL with e.g. `cloudflared tunnel --url http://localhost:3000`
> and use it for both `ISSUER` and `url`.

## 3. Sign in from your app

Exactly like any other Supabase social login.

```ts
const { error } = await supabase.auth.signInWithOAuth({
  provider: 'keycloak',
  options: { scopes: 'openid profile email' },
})
```

The resulting `user` looks like:

```json
{
  "id": "…",                                   // Supabase UUID
  "email": "x15addw11…@line-users.example.com", // see §4
  "user_metadata": {
    "name": "Achraf",
    "full_name": "Achraf",
    "provider_id": "x15Addw11TEKxkLTIJwrsRl7uZvGmzCR", // renkei's sub (not the LINE userId)
    "iss": "https://auth.example.com"
  },
  "identities": [{ "provider": "keycloak", "id": "x15Addw11…" }]
}
```

If you need the LINE userId or friendship status, call renkei's `/oidc/me`
with the `line` scope, or use renkei's own id_token (it carries `line:*` claims).

## 4. About email addresses (read this)

Supabase Auth **rejects users without an email**
(`Error getting user email from external provider`). LINE returns one only when

1. the channel has been granted **email permission** in the LINE Developers Console, and
2. the user **consented** to share it at login.

If either is missing, LINE silently drops the `email` scope — no error.

With `placeholderEmailDomain` set, users without an email get a placeholder of
the form `<sub>@line-users.example.com` with `email_verified: true`, plus an
`email_placeholder: true` claim.

- Use a domain you control and **never send mail** to those addresses (exclude
  `email_placeholder` users from Supabase's email features).
- A real email, when available, always wins; no placeholder is added then.
- Without the setting, users without an email fail on the Supabase side. The
  hosted **custom OIDC provider** route (`custom:` identifier, `email_optional`)
  accepts them without a placeholder — see the [appendix](#appendix-using-a-custom-oidc-provider).

## 5. Verification checklist

- [ ] `GET ${ISSUER}/.well-known/openid-configuration` responds
- [ ] `${ISSUER}/line/callback` is in the channel's Callback URLs
- [ ] The LINE Login channel is **Published** (in Developing status, users
      without a role get `400 developing status`)
- [ ] `signInWithOAuth({ provider: 'keycloak' })` → LINE consent → friend-add
      screen → back in your app
- [ ] `user.user_metadata.provider_id` is renkei's `sub` (**not** a LINE userId
      starting with `U`)

## Appendix: using a custom OIDC provider

On hosted Supabase (since 2026-04) you can instead create `custom:renkei` under
Authentication → Providers → **Auto-discovery (OIDC)** with renkei's `ISSUER`
as the Issuer URL, and call `signInWithOAuth({ provider: 'custom:renkei' })`.
That route supports `email_optional`, so no placeholder is needed. It isn't
available in the local CLI, which is why this tutorial leads with Keycloak.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Error getting user email from external provider` | §4. Set `placeholderEmailDomain` or get email permission + consent |
| LINE shows `400 Bad Request … developing status` | Publish the channel (or add yourself as a Tester) |
| LINE `redirect_uri` error | The console Callback URL must equal `${ISSUER}/line/callback` exactly |
| No friend-add screen | Link the Official Account to the Login channel (Basic settings → Add friend option) |
| Connection error from Supabase | Supabase Auth must reach `ISSUER` (https tunnel for local setups) |
