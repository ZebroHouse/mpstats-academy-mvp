/**
 * Legal consent audit trail — `recordConsents` writes one `UserConsent` row
 * per (kind, source) pair whenever a user accepts a legal document (offer,
 * PDN processing consent, ad-distribution consent).
 *
 * Best-effort by design: consent bookkeeping must never block or fail the
 * caller's primary flow (registration, OAuth callback, checkout, onboarding).
 * Any error is reported to Sentry and swallowed.
 */
import type { PrismaClient, ConsentKind, ConsentSource } from '@mpstats/db';
import { LEGAL_VERSIONS } from '@mpstats/shared';

// Sentry — optional. In unit tests the module is mocked via `vi.mock`. At
// runtime (Next.js) it's available via @sentry/nextjs, but @mpstats/api must
// not depend on it directly (server-only / Edge collisions), so it's loaded
// lazily via dynamic import inside a try/catch. Mirrors the soft-import
// contract in packages/api/src/routers/material.ts, using dynamic `import()`
// instead of `require()` so the module graph (and test mocks) resolve it
// consistently regardless of whether the package is physically installed in
// this workspace package.
type SentryLike = {
  captureException: (e: unknown, ctx?: any) => void;
};
const sentryFallback: SentryLike = {
  captureException: () => undefined,
};
// Not a literal so `tsc` treats the specifier as untyped (`any`) rather than
// resolving @sentry/nextjs's real types — this package has no dependency on
// @sentry/nextjs (only apps/web does), so a literal import() would fail
// typecheck with "Cannot find module".
const SENTRY_SPECIFIER = '@sentry/nextjs';

let cachedSentry: SentryLike | null = null;
async function getSentry(): Promise<SentryLike> {
  if (cachedSentry) return cachedSentry;
  try {
    const mod: any = await import(SENTRY_SPECIFIER);
    cachedSentry = mod?.captureException
      ? { captureException: mod.captureException.bind(mod) }
      : sentryFallback;
  } catch {
    // Sentry not installed in this context (tests, non-Next builds) — fallback noop
    cachedSentry = sentryFallback;
  }
  return cachedSentry;
}

export interface RecordConsentsMeta {
  ip?: string | null;
  userAgent?: string | null;
  /** Override the default LEGAL_VERSIONS lookup per kind (e.g. for backfills). */
  version?: (kind: ConsentKind) => string;
}

/**
 * Records one `UserConsent` row per kind in a single `createMany` call.
 * Never throws — any failure is reported to Sentry (tagged `area: 'consent'`,
 * `source`) and swallowed so the caller's primary flow is unaffected.
 */
export async function recordConsents(
  prisma: PrismaClient,
  userId: string,
  kinds: ConsentKind[],
  source: ConsentSource,
  meta?: RecordConsentsMeta,
): Promise<void> {
  try {
    const data = kinds.map((kind) => ({
      userId,
      kind,
      source,
      version: meta?.version?.(kind) ?? LEGAL_VERSIONS[kind],
      ip: meta?.ip ?? null,
      userAgent: meta?.userAgent ?? null,
    }));
    await prisma.userConsent.createMany({ data });
  } catch (e) {
    // Best-effort means best-effort all the way down: the error-reporting
    // path itself must never be able to escape recordConsents. If getSentry()
    // or captureException() throws synchronously (e.g. a misbehaving Sentry
    // transport), swallow it too — losing an error report is acceptable,
    // breaking the caller's primary flow (register/OAuth/checkout/onboarding)
    // is not.
    try {
      const sentry = await getSentry();
      sentry.captureException(e, { tags: { area: 'consent', source } });
    } catch {
      // Swallow — see comment above.
    }
  }
}
