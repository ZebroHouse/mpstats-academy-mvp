import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', '.next/', 'tests/'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // `server-only` throws in non-server contexts; stub it out for jsdom tests.
      // Production behavior enforced by Next.js bundler.
      'server-only': path.resolve(__dirname, './tests/server-only-stub.ts'),
      // `@sentry/nextjs` cannot run in jsdom/node test env; stub it out.
      // Route handlers that import Sentry are tested with this no-op stub.
      '@sentry/nextjs': path.resolve(__dirname, './tests/sentry-stub.ts'),
    },
  },
});
