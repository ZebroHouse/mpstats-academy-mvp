/**
 * Single source of truth for legal document revision dates.
 *
 * Update the relevant key here whenever a legal document (offer, PDN consent,
 * ad-distribution consent) is amended — the visible "Последнее обновление"
 * date on the corresponding /legal/* page (apps/web) is sourced from this
 * constant, and `recordConsents` (packages/api) uses it as the default
 * version stamped onto each `UserConsent` row.
 *
 * Lives in packages/shared (not apps/web) because both apps/web (signUp,
 * OAuth callbacks, partner-entry) AND packages/api (onboarding, billing)
 * need it, and packages/api cannot import from apps/web.
 */
import type { ConsentKind } from '@mpstats/db';

// `satisfies Record<ConsentKind, string>` binds this constant to Prisma's
// ConsentKind enum at compile time: if a future kind is added to the enum
// (schema.prisma) without a matching version here, this line fails to
// typecheck instead of silently producing `undefined` — which would make
// `recordConsents`'s `LEGAL_VERSIONS[kind]` insert a NOT NULL `version`
// column as undefined, throw, and get swallowed by its best-effort catch
// (consent silently dropped, no error surfaced).
export const LEGAL_VERSIONS = {
  OFFER: '2026-07-28',
  PDN: '2026-07-28',
  ADV: '2026-07-28',
} as const satisfies Record<ConsentKind, string>;

export type LegalConsentKind = keyof typeof LEGAL_VERSIONS;
