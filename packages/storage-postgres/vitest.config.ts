import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'storage-postgres',
    include: ['test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
  },
});
