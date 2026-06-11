// Empty stub for `@sentry/nextjs` in test env.
// Aliased via vitest.config.ts to prevent sentry from loading in jsdom.
export const captureException = () => {};
export const captureMessage = () => {};
export const withScope = () => {};
export const init = () => {};
export const setUser = () => {};
export const setTag = () => {};
export const setExtra = () => {};
export const startTransaction = () => ({});
export const configureScope = () => {};
