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
export const LEGAL_VERSIONS = {
  OFFER: '2026-07-28',
  PDN: '2026-07-28',
  ADV: '2026-07-28',
} as const;

export type LegalConsentKind = keyof typeof LEGAL_VERSIONS;
