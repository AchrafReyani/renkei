#!/usr/bin/env node
// `npx renkei` — start the renkei server.
// `renkei init` / `add-channel` / `add-client` — set up the config; see lib/cli.js.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
if (args.includes('--version') || args.includes('-v')) {
  const { createRequire } = await import('node:module');
  console.log(createRequire(import.meta.url)('../package.json').version);
  process.exit(0);
}

// `renkei init` writes .env and the config (renkei.yaml or .env itself) reads
// from it, so `npx renkei` in the same directory has to see it — nothing else
// loads it, and `node --env-file` is not in play under npx.
const envFile = resolve(process.cwd(), '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const COMMANDS = ['init', 'add-channel', 'add-client'];
if (args.includes('--help') || args.includes('-h') || COMMANDS.includes(args[0])) {
  const { run, HELP } = await import('../lib/cli.js');
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    process.exit(0);
  }
  process.exit(await run(args));
}
await import('renkei-server/node');
