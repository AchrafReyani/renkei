---
"renkei-server": minor
"renkei": minor
---

Structured configuration: `renkei.yaml`. renkei now reads a config file from the working directory (`RENKEI_CONFIG` overrides the path) and, when there is one, it is the whole configuration — the `LINE_*` / `RENKEI_*` variables it supersedes are named on the boot banner instead of quietly taking effect, while `PORT`, `DATABASE_URL` and anything the file references keep working. The file goes through the same `renkeiConfigSchema`, takes `snake_case` keys (camelCase too, so a `RENKEI_CHANNELS` entry can be pasted in unchanged) and expands `${VAR}` / `${VAR:-fallback}` from the environment, so no secret has to live in it and it can be committed. The loader is `renkei-server/config-file`, a Node-only entry the Workers and Supabase Edge builds do not import.

The CLI writes it: `renkei init --yaml` creates a `renkei.yaml` plus the `.env` of secrets it references — converting an existing `.env` if there is one, including the secrets that were buried inside `RENKEI_CHANNELS` / `RENKEI_CLIENTS` JSON, which get a variable of their own. `renkei add-channel <id> [--region tw] [--miniapp] [--secret … | --secret-env VAR]` appends a channel, and `renkei add-client` appends to the file's `clients:` when there is one (otherwise `RENKEI_CLIENTS`, as before); both put the reference in the YAML and the value in `.env`, and comments in the file survive the edit.

Also fixed: `npx renkei` never loaded `.env`, so the quickstart (`renkei init` then `npx renkei`) only worked if you exported the variables yourself.
