/**
 * Single source of truth for legal document revision dates.
 *
 * Update the relevant key here whenever a legal document (offer, PDN consent,
 * ad-distribution consent) is amended — the visible "Последнее обновление"
 * date on the corresponding /legal/* page is sourced from this constant.
 */
export const LEGAL_VERSIONS = {
  OFFER: '2026-07-28',
  PDN: '2026-07-28',
  ADV: '2026-07-28',
} as const;

export type LegalConsentKind = keyof typeof LEGAL_VERSIONS;

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
