# LINE MINI App channels

> 日本語: [line-mini-app.ja.md](line-mini-app.ja.md)

LINE is folding LIFF into LINE MINI App: new in-LINE apps are created as **LINE MINI App channels**, not as LIFF apps on a Login channel. renkei accepts a MINI App's tokens on the same `POST /liff/exchange` it uses for LIFF, and maps the user onto the **same identity** (`sub`) the web login through your Login channel produced — LINE issues one user ID per provider, and both channels live under yours.

What you get: one `sub` per person whether they arrive on the web, in a LIFF app or in the MINI App; `line:channel_id` tells you which surface a token came from.

## 1. Create the channel

LINE Developers Console → your provider → **Create a new channel → LINE MINI App**. Fill in name, description and email; agree to the MINI App terms. The channel starts **Unverified**, which is enough for development.

A MINI App is really three LIFF apps, each on its own internal channel:

| Stage | Who can open it | Where the ID shows |
|---|---|---|
| Developing | channel admins and testers (Roles tab) | Web app settings → LIFF URL (`https://miniapp.line.me/<id>-…`) |
| Review | LY Corporation reviewers | same |
| Published | end users, after review | same |

Each stage's id_token carries its own channel ID in `aud`, and **each stage has its own channel secret** (Basic settings → Channel secret lists Developing, Review and Published), so renkei needs the ID *and* the secret of every stage you use.

To open the Developing stage on a phone, the LINE account on that phone must be the one **linked to your LINE Business ID** (console profile → *Go to Business ID Profile* → link your LINE account). The Admin / Tester role is matched by LINE account, not by console email; without the link LINE answers `400 … user need to have developer role`.

## 2. Point the MINI App at your page

Web app settings → **Endpoint URL** (Developing) → the page in your app that runs the LIFF SDK and calls renkei. For a first check, renkei's own test page works:

```
https://<your-renkei>/dev/liff?liff_id=<Developing LIFF ID>
```

(`RENKEI_DEV=true` and `LIFF_ID` set; the `liff_id` query swaps the LIFF app the page initialises.) Scopes: `openid` and `profile` are the defaults and all renkei needs.

## 3. Tell renkei about the channel

Environment (Node, Docker, Workers, Supabase — same names everywhere):

```sh
LINE_MINIAPP_CHANNEL_ID=2011444277,2011444279      # Developing, Published — the stages you use
LINE_MINIAPP_CHANNEL_SECRET=<dev secret>,<pub secret>   # one per ID, same order (a single value applies to all IDs)
```

Programmatic configuration — a channel with `kind: 'miniapp'` next to the Login channel:

```ts
channels: [
  { channelId: '2011257262', channelSecret: '…', region: 'jp' },                     // LINE Login
  { channelId: '2011444277', channelSecret: '…', region: 'jp', kind: 'miniapp' },    // MINI App, Developing
  { channelId: '2011444279', channelSecret: '…', region: 'jp', kind: 'miniapp' },    // MINI App, Published
],
```

MINI App channels share the Login channel's region and never serve the web redirect flow (`/oidc/auth` → LINE always uses a Login channel). They exist for `/liff/exchange`.

**Identity mapping.** Channels with the same `provider` value — including all channels that leave it unset — are one LINE provider: a LINE user ID seen on any of them is the same person, so the MINI App login reuses the `sub` the web login created (and vice versa). Set `provider` only if one renkei mixes channels from *different* LINE providers.

## 4. In the MINI App

Exactly the LIFF flow from the [endpoints reference](../reference/endpoints.en.md#post-liffexchange): `liff.init({ liffId })`, then send `liff.getIDToken()` and `liff.getAccessToken()` to `POST /liff/exchange` with your client ID. renkei verifies both with LINE, upserts the identity, and returns a renkei-signed id_token whose `line:channel_id` is the MINI App's channel ID and whose `sub` is the same as on the web. `renkei-client`'s `exchangeLiffToken()` wraps the call.

## Service messages — prerequisites

renkei does not send [service messages](https://developers.line.biz/en/docs/line-mini-app/develop/service-messages/); your app does, and it needs things renkei cannot provide:

- a **verified** MINI App for production (unverified apps can only test on the Developing stage);
- a **channel access token of the MINI App channel** (stateless tokens recommended) — not the Login channel's;
- the user's **LIFF access token** from the client (`liff.getAccessToken()`, valid 12 hours): `POST /notifier/token` turns it into a service notification token (valid 1 year, **up to 5 messages** per user action), and `POST /notifier/send?target=service` sends with it.

Keep the LIFF access token flow in your app alongside the renkei exchange: renkei's `line:user_id` alone is not enough to send a service message.

## Common errors

- **`invalid_token: id_token is not for one of our channels`** — the token's `aud` (a stage channel ID) is not in `LINE_MINIAPP_CHANNEL_ID`; add that stage.
- **`invalid_token` with a valid-looking id_token** — wrong secret for that stage; give per-ID secrets.
- **Two different `sub` values for the same person** — the channels were configured with different `provider` values, or the MINI App channel belongs to another LINE provider (then LINE user IDs really differ and no mapping is possible).
- **The Developing MINI App will not open (`400`, "developer role")** — the LINE account on the phone is not linked to the Business ID that holds the Admin / Tester role (see step 1), or is not a tester of the channel (Roles tab).
- **No `line:friend` claim from the MINI App** — the friendship check answers for the Official Account linked to the channel; a MINI App channel without a linked OA has none. The Login channel's row keeps its value.
