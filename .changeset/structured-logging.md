---
'renkei-server': minor
---

Structured logging with redaction. renkei now wraps its log sink so every log
call deep-redacts sensitive metadata (tokens, channel secrets, cookies,
authorization headers, link tokens, nonces, …) by key name before anything is
emitted — redaction is always on. `RENKEI_LOG_FORMAT=json` (or
`logStructured: true`) emits one JSON object per line for aggregators; the
default stays human-readable. `createLogger()`, `redact()` and
`DEFAULT_REDACT_KEYS` are exported for embedders.
