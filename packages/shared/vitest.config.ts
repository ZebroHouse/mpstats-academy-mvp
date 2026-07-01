import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    root: path.resolve(__dirname),
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
