---
"renkei-server": patch
---

The `/dev` page's per-region login links now send `prompt=login`. renkei keeps its own session, so a second authorization request in the same browser is answered from it without any LINE authentication — which meant the region links silently re-issued the previous region's claims instead of exercising the routing they exist to test. The multi-region tutorial and the endpoints reference now spell out that `line_region` only applies when a LINE authentication actually runs.
