import { defineProject } from 'vitest/config';

export default defineProject({
  resolve: { conditions: ['development'] },
  test: {
    name: 'renkei',
    include: ['test/**/*.test.js'],
    environment: 'node',
  },
});
