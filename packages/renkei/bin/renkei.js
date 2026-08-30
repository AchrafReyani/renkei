#!/usr/bin/env node
// `npx renkei` — start the renkei server from environment variables.
// `renkei init` / `renkei add-client` — set up .env; see lib/cli.js.
const args = process.argv.slice(2);
if (args.includes('--version') || args.includes('-v')) {
  const { createRequire } = await import('node:module');
  console.log(createRequire(import.meta.url)('../package.json').version);
  process.exit(0);
}
if (
  args.includes('--help') ||
  args.includes('-h') ||
  args[0] === 'init' ||
  args[0] === 'add-client'
) {
  const { run, HELP } = await import('../lib/cli.js');
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    process.exit(0);
  }
  process.exit(await run(args));
}
await import('renkei-server/node');
