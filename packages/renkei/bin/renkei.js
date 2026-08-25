#!/usr/bin/env node
// `npx renkei` — start the renkei server from environment variables.
// See README / docs/reference/config for the variables.
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`renkei — self-hosted identity broker for LINE

usage: renkei            start the server (reads .env / environment)
       renkei --version

Required env: LINE_LOGIN_CHANNEL_ID, LINE_LOGIN_CHANNEL_SECRET
Recommended:  ISSUER, DATABASE_URL, RENKEI_COOKIE_KEYS, RENKEI_JWKS, RENKEI_CLIENTS
Docs:         https://github.com/AchrafReyani/renkei`);
  process.exit(0);
}
if (process.argv.includes('--version') || process.argv.includes('-v')) {
  const { createRequire } = await import('node:module');
  console.log(createRequire(import.meta.url)('../package.json').version);
  process.exit(0);
}
await import('@renkei/server/node');
