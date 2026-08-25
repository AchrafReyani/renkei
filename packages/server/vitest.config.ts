import { defineProject } from 'vitest/config';

export default defineProject({
  resolve: { conditions: ['development'] },
  test: {
    name: 'server',
    include: ['test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
  },
});
