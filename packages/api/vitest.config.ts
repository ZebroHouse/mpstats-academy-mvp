import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    root: path.resolve(__dirname),
    // Also collect root-level one-off script tests (e.g. data migrations).
    // They live in `scripts/__tests__/` (no package of their own) and reuse the
    // node-environment harness here.
    include: ['src/**/*.test.ts', '../../scripts/__tests__/**/*.test.ts'],
    environment: 'node',
  },
});
