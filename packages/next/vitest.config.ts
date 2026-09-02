import { fileURLToPath } from 'node:url';
import { defineProject } from 'vitest/config';

export default defineProject({
  resolve: {
    conditions: ['development'],
    // renkei-client ships no development condition (app bundlers must get dist); test against its source.
    alias: { 'renkei-client': fileURLToPath(new URL('../client/src/index.ts', import.meta.url)) },
  },
  esbuild: { jsx: 'automatic' },
  test: {
    name: 'next',
    include: ['test/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
