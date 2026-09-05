# Multi-region: one renkei, several LINE Login channels

> 日本語: [multi-region.ja.md](multi-region.ja.md)

LINE Login channels are bound to the region they serve. To reach users in Japan **and** Taiwan you register one channel per region and route each login to the right one. renkei does that routing: you list the channels, and every login carries either a `line_region` parameter or a client pinned to a region.

```
                        ┌─ line_region=jp ─▶ LINE Login channel (jp)
your app ──OIDC──▶ renkei ┤
                        └─ line_region=tw ─▶ LINE Login channel (tw)
```

Time: 15 minutes on top of a running renkei ([README quickstart](../../README.en.md#try-it-in-5-minutes)).

## 1. Create the second channel

LINE Developers Console → your provider → **Create a new channel → LINE Login**. The form asks two separate questions:

- **Region to provide the service** — Japan / Taiwan / Thailand / Indonesia. This is the channel's region, the one you map to `region` below.
- **Company or owner's country or region** — where *you* are. It does not have to match the service region.

Register the same callback URL as your first channel: `https://<your-renkei>/line/callback`. Everything else (2FA, the LIFF tab, the linked Official Account) is per channel.

> **Who can log in.** The region says which market the channel serves; it is not automatically a wall around the login. A Japan-registered LINE account logged in to a Taiwan-region channel in our own test (2026-09-05), consent screen and all. Don't assume the reverse for every region or channel status, and test with an account from each market you target — but a refusal, if it comes, comes from LINE's screen and changes nothing on renkei's side.

## 2. Configure both channels

Two channels is the point at which a `renkei.yaml` starts paying for itself — one
entry per channel, secrets by reference, and `renkei add-channel` writes it for you:

```sh
npx renkei init --yaml                    # converts your existing .env
npx renkei add-channel 2011447387 --region tw --secret <Channel secret>
```

```yaml
# renkei.yaml — the TW channel's secret is in .env as LINE_TW_CHANNEL_SECRET
channels:
  - id: "2011257262"                      # the first Login channel is the default
    region: jp
    secret: "${LINE_LOGIN_CHANNEL_SECRET}"
  - id: "2011447387"
    region: tw
    secret: "${LINE_TW_CHANNEL_SECRET}"
```

→ [`renkei.yaml` reference](../reference/config.en.md#renkei-yaml). The rest of this
tutorial uses the environment-variable spelling, which is equivalent and is the
only one available on Cloudflare Workers and Supabase Edge Functions.

`RENKEI_CHANNELS` holds every channel beyond the primary `LINE_LOGIN_*` one, as JSON:

```sh
LINE_LOGIN_CHANNEL_ID=2011257262            # the primary channel — also the default
LINE_LOGIN_CHANNEL_SECRET=…
LINE_LOGIN_REGION=jp

RENKEI_CHANNELS=[{"channelId":"2011447387","channelSecret":"…","region":"tw"}]
```

Or put the whole list in `RENKEI_CHANNELS` and drop `LINE_LOGIN_*` entirely — the first Login channel in the list is then the default:

```sh
RENKEI_CHANNELS=[{"channelId":"2011257262","channelSecret":"…","region":"jp"},{"channelId":"2011447387","channelSecret":"…","region":"tw"}]
```

Each entry takes the full channel shape from the [configuration reference](../reference/config.en.md): `region`, `botPrompt`, `requestEmail`, `kind` (`login` or `miniapp`) and `provider`. Programmatically it is the same list:

```ts
channels: [
  { channelId: '2011257262', channelSecret: '…', region: 'jp' },
  { channelId: '2011447387', channelSecret: '…', region: 'tw', botPrompt: 'normal' },
],
```

Rules renkei enforces at boot: **one Login channel per region** (a duplicate region is a startup error, since `line_region` could not choose between them), and channel IDs are unique. Regions are free-form strings — `jp`, `tw`, `th` are conventions, not an enum.

## 3. Route the login

Three ways, in the order renkei checks them:

**a. `line_region` on the authorization request.** Your app decides — a language switch, a country picker, the user's profile:

```
GET /oidc/auth?client_id=my-app&response_type=code&scope=openid%20profile%20line&line_region=tw&…
```

`renkei-client` takes it as an option: `loginUrl({ redirectUri, state, nonce, lineRegion: 'tw' })`.

**b. A client pinned to one region.** Separate apps per market, each always on its channel:

```sh
RENKEI_CLIENTS=[
  {"clientId":"jp-app","clientSecret":"…","redirectUris":["https://jp.example.com/cb"],"lineRegion":"jp"},
  {"clientId":"tw-app","clientSecret":"…","redirectUris":["https://tw.example.com/cb"],"lineRegion":"tw"}
]
```

**c. Neither** — the first Login channel in the list is used. An unknown region falls back to it too, rather than failing the login. The boot log states which channel that is.

> **`line_region` only bites on a fresh authentication.** renkei keeps its own session, like any OpenID provider. If the browser already has one, a second authorization request is answered from that session: nobody re-authenticates, no channel is chosen, and the tokens keep describing the channel the session was established through — even when the request asked for another region. Send the standard **`prompt=login`** when you need the user authenticated through a specific region (a market switch, say). renkei's `/dev` region links do exactly that.

The same parameter works on the session-cookie routes (`GET /login?line_region=tw`) and on the account-linking entry (`GET /link?line_region=tw`). With `RENKEI_DEV=true`, the `/dev` page grows one login link per region, which is the quickest way to check your wiring.

## 4. What the tokens say

The id_token names the channel the user actually logged in through:

```json
{
  "sub": "j_QoAMmfl7tyAG-SFrz1XfE3YY04RdU0",
  "line:user_id": "U54de99…",
  "line:channel_id": "2011447387",
  "line:region": "tw"
}
```

Read `line:region` when your app needs to know the market; read `line:channel_id` when it needs the exact channel (a MINI App stage, for instance). A user who logs in through both regions gets the region of their **most recent** login on later tokens, so treat `line:region` as "where they came from this time", not as a permanent attribute of the person.

## 5. One person, two channels

This is the part that surprises people, and it depends on the **provider**, not the region:

- **Both channels under one LINE provider** (the normal case): LINE issues one user ID per provider, so the same person has the *same* `line:user_id` on both channels. renkei recognises them and keeps **one `sub`**, with one LINE-account row per channel. Nothing to configure. (Verified against real channels on 2026-09-05: the same person logging in through a JP and a TW channel of one provider came back with one identical `line:user_id` and one `sub`, each token carrying its own `line:region`.)
- **Channels under different providers**: LINE issues different user IDs, so renkei cannot tell the two apart — they are two identities with two `sub` values. That is LINE's boundary, not renkei's. If you need them merged, do it in your app, or move the channels under one provider.

Set `provider` on the channels only when one renkei brokers channels from several LINE providers and you want that grouping to be explicit; channels that leave it unset are treated as one provider.

## 6. Messaging API and webhooks

A Messaging API channel belongs to one region's users. Say which:

```sh
LINE_MESSAGING_CHANNEL_SECRET=…
LINE_MESSAGING_CHANNEL_REGION=tw     # default: LINE_LOGIN_REGION
```

Follow / unfollow events then update friendship on the `tw` channel's accounts. If the region names no Login channel, renkei warns at boot and falls back to the first channel — the check is in the startup log.

## Checklist

- [ ] Second channel created, region set, callback URL registered
- [ ] `RENKEI_CHANNELS` (or the full list) configured; boot log shows both regions and names the default
- [ ] `/dev` shows a login link per region, and each one reaches LINE with the right channel ID
- [ ] An id_token from each region carries the expected `line:region` and `line:channel_id` (use a private window, or `prompt=login`, so you are not answered from an existing session)
- [ ] If you use webhooks: `LINE_MESSAGING_CHANNEL_REGION` matches the Login channel those users belong to
