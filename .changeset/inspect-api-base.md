---
'renkei-server': patch
---

Fix the `/inspect` page calling `/api/...` instead of `/inspect/api/...`: the shell used a bare relative `fetch('api/...')`, which resolves against `/inspect` (no trailing slash) to the site root and 404s. The API base is now derived from `location.pathname`, so it works at `/inspect`, `/inspect/` and any embedder prefix. "Save token" now echoes the saved length so the click has visible feedback.
