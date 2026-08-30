import { defineProject } from 'vitest/config';

// node:sqlite is unflagged from Node 22.13; older 22.x still ships it behind a flag.
const [major = 0, minor = 0] = process.versions.node.split('.').map(Number);
const needsFlag = major === 22 && minor < 13;

export default defineProject({
  resolve: { conditions: ['development'] },
  test: {
    name: 'storage-sqlite',
    include: ['test/**/*.test.ts'],
    environment: 'node',
    ...(needsFlag ? { execArgv: ['--experimental-sqlite'] } : {}),
  },
});
