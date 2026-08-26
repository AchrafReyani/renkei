# Link LINE users to their app account (Official Account messaging)

> 日本語: [account-linking.ja.md](account-linking.ja.md)

Once a user has signed in with LINE through renkei, you often want to **message
them from your LINE Official Account** — a booking reminder, a "your report is
ready" push. To do that reliably you bind the user's LINE account to *their
account in your app*. renkei drives LINE's account-linking flow and hands you
the result as a single claim: **`line:linked`**.

```
Your app (has a renkei access token)
   │  POST /link/start  (Bearer <access_token>)
   ▼
renkei ── mint link token ──▶ LINE
   │  { url }
   ▼
Browser ──▶ accountLink dialog ──▶ user consents
                                      │  accountLink webhook
                                      ▼
                                   renkei records the link → line:linked = true
```

Time: ~15 minutes. Prerequisites:

- The [LINE Developers Console setup](../DEV_SETUP.md): a LINE Login channel
  **and** a Messaging API channel **under the same provider**, linked to each
  other. (Same-provider matters — otherwise the user IDs don't match.)
- A working LINE login through renkei — see the [Next.js tutorial](nextjs.md).
  This tutorial picks up *after* the user is logged in and your app holds a
  renkei **access token** for them.

## 1. Give renkei the Messaging API credentials

Account linking mints a one-time *link token* via the Messaging API, so renkei
needs that channel's **channel access token** (this is separate from the
channel *secret* used for webhook signatures). Set both, plus the webhook:

```bash
LINE_MESSAGING_CHANNEL_SECRET=<messaging channel secret>
LINE_MESSAGING_CHANNEL_ACCESS_TOKEN=<messaging channel access token>
```

In the LINE Developers Console, on the **Messaging API channel**:

- **Webhook URL** → `${ISSUER}/line/webhook`, and turn **Use webhook** on.
- Turn **Auto-reply messages** off (optional, but it keeps the OA quiet).

renkei logs a reminder at boot when messaging channels are configured; if a
`channelAccessToken` is missing, `POST /link/start` answers `404
account_linking_not_configured`.

## 2. Start the link from your app

Your app already holds a renkei access token for the signed-in user (the one it
got from the OIDC token endpoint). Call `POST /link/start` with it:

```ts
const res = await fetch(`${RENKEI_ISSUER}/link/start`, {
  method: 'POST',
  headers: { authorization: `Bearer ${renkeiAccessToken}` },
});
const { url } = await res.json(); // the accountLink dialog URL
```

renkei resolves the token to the user, mints the link token for their LINE
account, stores a one-time nonce against them, and returns the dialog `url`.

Error responses to handle: `401` (missing/expired access token), `409
no_line_account` (this identity has never logged in with LINE, so there's
nothing to link), `502 link_start_failed` (LINE rejected the mint — usually a
bad or expired channel access token).

## 3. Send the user to the dialog

Redirect the browser to `url`. The user sees LINE's consent screen and taps
**Agree**. Note: after consent the user stays in LINE — **the dialog does not
redirect back to your app with the result**. The linkage is confirmed
server-to-server by a webhook (next step), so design your UI to say
"linking…" and reflect the result on the next page load, not via a return URL.

## 4. renkei finalises the link (automatic)

LINE POSTs an `accountLink` event to `${ISSUER}/line/webhook`. renkei verifies
the signature, matches the nonce back to the user, records the messaging-side
account, and drops the nonce. Nothing for you to build here — it's the same
webhook endpoint that already keeps `line:friend` current.

## 5. Read `line:linked` and message the user

On the user's next login (or a token refresh, or a `/oidc/me` call) the `line`
scope now carries **`line:linked: true`**, alongside **`line:user_id`** — the
LINE user ID you send Messaging API pushes to:

```jsonc
{
  "sub": "…renkei sub…",
  "line:user_id": "U4af4980629…",
  "line:friend": true,
  "line:linked": true
}
```

Gate your "send OA message" logic on `line:linked` (and usually `line:friend`,
since a user who blocked the OA won't receive pushes).

## Verifying it worked

If you enabled the [inspection endpoints](../reference/endpoints.md#other)
(`RENKEI_ADMIN_TOKEN`), open `${ISSUER}/inspect`, paste your admin token, and:

- **Recent webhooks** shows the `accountLink` event arriving (result `ok`).
- **Identity by sub** shows a `messaging`-kind LINE account and `linked: true`.

That's the whole loop, end to end, without reading logs.

## Triggering it from a rich menu

A rich menu is just an entry point. Point a rich-menu button (a **URI action**)
at your app's "Connect LINE" page — the page where the user is signed in and
step 2 runs. The user taps the button in the OA chat, lands in your app
already-authenticated (or logs in first), and the same `/link/start` flow runs.
No special rich-menu code in renkei; the button only has to deep-link into your
app.

## Notes and limits

- **One-time everything.** The link token (~10 min) and the nonce are both
  single-use; mint a fresh link per attempt (that's what `/link/start` does).
- **Same person, their own app account.** This flow binds a LINE identity to
  the account behind the renkei access token — i.e. the account they logged
  into with LINE. Linking LINE to a *pre-existing password account* (a merge
  only your app can authorise) uses renkei's **forwarded mode**
  (`accountLinkForwardUrl`) instead — see the
  [endpoints reference](../reference/endpoints.md#account-linking).
- **`line:linked` is renkei-owned.** renkei stores the link and exposes it as a
  claim, so your app needs no webhook code of its own — the same pattern as
  `line:friend`.
