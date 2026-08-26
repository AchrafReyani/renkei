---
'renkei-server': minor
---

Read-only inspection endpoints (`/inspect`), mounted only when `adminToken`
(env `RENKEI_ADMIN_TOKEN`) is set. A Bearer-gated JSON API — look up an identity
by `sub` or by LINE `channelId + userId`, see its LINE accounts with friendship
and `line:linked`, and glance at recent webhook events (an in-memory,
per-process ring) — plus a self-contained HTML shell that prompts for the token
and calls the API. Deliberately not an admin console: no list-all, nothing
mutates. New config `adminToken`; `createWebhookLog()` / `inspectRoutes()`
exported for embedders. A first-run check notes when `/inspect` is enabled.
