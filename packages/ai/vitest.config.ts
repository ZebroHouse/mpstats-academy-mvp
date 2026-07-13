import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  // react-server condition resolves `import 'server-only'` to its empty stub, so
  // tests can import server modules (openrouter/generation) без мока. Тот же приём,
  // что и в `embed-jobs.ts` (--conditions=react-server).
  resolve: { conditions: ['react-server'] },
  test: {
    globals: true,
    root: path.resolve(__dirname),
    include: ['src/**/*.test.ts'],
  },
});
