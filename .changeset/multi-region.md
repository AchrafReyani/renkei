---
"renkei-server": minor
---

Multi-region configuration. `RENKEI_CHANNELS` takes further LINE channels as JSON — a second region, a MINI App, or the whole list on its own (then `LINE_LOGIN_*` may be omitted and the first Login channel is the default) — so several regions no longer need programmatic configuration. `LINE_MESSAGING_CHANNEL_REGION` says which Login channel's users a Messaging channel's webhook events concern. With several regions configured, the boot checks name the channel a login without `line_region` will use, and the `/dev` page gains one login link per region and passes `line_region` through. Tutorial: docs/tutorials/multi-region.
