# Add LINE Login to a Next.js app (Auth.js + renkei)

> 日本語: [nextjs.ja.md](nextjs.ja.md) · Runnable code: [`examples/nextjs`](../../examples/nextjs)

renkei is a standard OpenID Connect provider, so on the Next.js side you configure
**Auth.js (next-auth v5)'s generic OIDC provider** and nothing else. No LINE-specific
code: friend-add and LIFF are handled by renkei.

```
Next.js (Auth.js) ──OIDC──▶ renkei ──▶ LINE Login (with friend-add)
```

Time: 10 minutes. Prerequisite: a running renkei ([README quickstart](../../README.en.md#try-it-in-5-minutes)).

## 1. Register the client with renkei

Add the Next.js app to renkei's `RENKEI_CLIENTS`. Auth.js's callback path is
`/api/auth/callback/<provider id>` (provider id `renkei` below).

```json
[{
  "clientId": "my-next-app",
  "clientSecret": "<32+ random chars>",
  "redirectUris": ["http://localhost:3400/api/auth/callback/renkei"]
}]
```

## 2. Configure Auth.js

```sh
pnpm add next-auth@beta
```

```ts
// auth.ts
import NextAuth from 'next-auth'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    {
      id: 'renkei',
      name: 'LINE',
      type: 'oidc',
      issuer: process.env.RENKEI_ISSUER,            // e.g. http://localhost:3000
      clientId: process.env.RENKEI_CLIENT_ID,
      clientSecret: process.env.RENKEI_CLIENT_SECRET,
      authorization: { params: { scope: 'openid profile email line' } },
      profile(profile) {
        return { id: profile.sub, name: profile.name, email: profile.email, image: profile.picture }
      },
    },
  ],
  callbacks: {
    // carry the line:* claims into the JWT session
    jwt({ token, profile }) {
      if (profile) {
        token.line = {
          userId: profile['line:user_id'],
          friend: profile['line:friend'],
          channelId: profile['line:channel_id'],
          region: profile['line:region'],
        }
      }
      return token
    },
    session({ session, token }) {
      ;(session as typeof session & { line?: unknown }).line = token.line
      return session
    },
  },
})
```

```ts
// app/api/auth/[...nextauth]/route.ts
import { handlers } from '@/auth'
export const { GET, POST } = handlers
```

`.env.local`:

```
AUTH_SECRET=<openssl rand -base64 32>
RENKEI_ISSUER=http://localhost:3000
RENKEI_CLIENT_ID=my-next-app
RENKEI_CLIENT_SECRET=<same as step 1>
```

## 3. The login button

```tsx
// app/page.tsx
import { auth, signIn, signOut } from '@/auth'

export default async function Page() {
  const session = await auth()
  if (!session) {
    return (
      <form action={async () => { 'use server'; await signIn('renkei') }}>
        <button type="submit">Log in with LINE</button>
      </form>
    )
  }
  return (
    <>
      <p>Hello, {session.user?.name}</p>
      <pre>{JSON.stringify((session as { line?: unknown }).line, null, 2)}</pre>
      <form action={async () => { 'use server'; await signOut() }}>
        <button type="submit">Log out</button>
      </form>
    </>
  )
}
```

Style the button per the [LINE Login button design guidelines](https://developers.line.biz/en/docs/line-login/login-button/).

## 4. Try it

1. Start renkei with the client from step 1 in `RENKEI_CLIENTS`
2. `pnpm dev -p 3400` → http://localhost:3400 → "Log in with LINE"
3. LINE consent → friend-add → back in the app with your name and the `line` object

`session.line.friend === true` means the user is friends with your Official Account.

## FAQ

**Is `sub` the LINE userId?** — No. It's an opaque ID minted by renkei. The LINE userId is in `line:user_id` (`line` scope);
use that for Messaging API pushes.

**`email` is `null`** — LINE returns an email only if the channel has email permission and the user consented.
Set `RENKEI_REQUEST_EMAIL=true` on renkei and [apply for the permission](../guides/line-console.en.md#6-email-permission-if-you-need-email).

**Database sessions** — use any Auth.js adapter as usual; renkei is not involved.

**Not using Auth.js** — any OIDC client works ([`openid-client`](https://github.com/panva/openid-client), for instance).
Discovery URL: `${RENKEI_ISSUER}/.well-known/openid-configuration`.
