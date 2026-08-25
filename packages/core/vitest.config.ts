import { defineProject } from 'vitest/config';

export default defineProject({
  resolve: { conditions: ['development'] },
  test: { name: 'core', include: ['test/**/*.test.ts'], environment: 'node' },
});
