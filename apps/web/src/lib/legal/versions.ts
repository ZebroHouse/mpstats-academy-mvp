/**
 * Single source of truth for legal document revision dates.
 *
 * Canonical constant now lives in `@mpstats/shared` (packages/shared) because
 * `packages/api` also needs it (recordConsents) and cannot import from
 * apps/web. Re-exported here so existing imports of `LEGAL_VERSIONS` /
 * `LegalConsentKind` from this module keep working unchanged.
 */
export { LEGAL_VERSIONS, type LegalConsentKind } from '@mpstats/shared';

const RU_MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
] as const;

/**
 * Formats an ISO date string (YYYY-MM-DD) as a readable Russian date,
 * e.g. "2026-07-28" -> "28 июля 2026".
 */
export function formatLegalDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const monthName = RU_MONTHS[month - 1];
  return `${day} ${monthName} ${year}`;
}
