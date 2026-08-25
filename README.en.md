# renkei (連携)

> **Under construction** — nothing runs yet. Design and planning live in [`docs/`](docs/).
> 日本語: [README.md](README.md)

**A self-hosted identity broker that owns everything after the LINE login.**

Getting a "Log in with LINE" button is solved — Auth0, Clerk and Logto all do
it. What none of them do is what comes next:

- **Friend-add at login** (`bot_prompt`) and keeping friendship status current
- **LIFF / LINE Mini App** id_token → verified server-side session
- **Messaging API account linking** (linkToken → nonce → `accountLink` webhook)
- **Mapping user IDs** across LINE Login, LIFF and the Messaging API
- **One channel per country** (Japan, Taiwan, Thailand)
- **Email** — which LINE only puts in the id_token, never in userinfo

renkei takes all of that and exposes plain **OpenID Connect** on the other
side. Point Supabase, Firebase, Cognito, Keycloak or your own app at it.

```
LINE Platform  ──▶  renkei (self-hosted)  ──▶  Supabase / Firebase / Cognito / Keycloak / your app
 Login · LIFF ·       friend-add · ID mapping ·      standard OIDC (+ line:* claims)
 Messaging API        token verification · linking
```

## Why

Japanese developers keep re-building this by hand. Cognito can't pass
`bot_prompt`. Auth0 needs a Management API hack. Supabase has no LINE
provider. LINE's own developer tips say, verbatim, that the ID-linking
mechanism "isn't provided by the LINE Platform — build your own."

Paid SaaS exists for this. Open source didn't.

## Non-goals

- Not a general-purpose IdP (no passwords, MFA, RBAC — use Logto or Keycloak
  behind renkei)
- Not a marketing tool (we expose friendship status; we never send messages)
- No hosted offering in v0.x

## Status

Planning. Roadmap: [`docs/ROADMAP.md`](docs/ROADMAP.md) · design:
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · decisions and their reasoning:
[`docs/DECISIONS.md`](docs/DECISIONS.md).

## License

Apache-2.0.

---

renkei is an independent project, not affiliated with LY Corporation. "LINE"
is a trademark of LY Corporation.
