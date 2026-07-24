/**
 * Экстренный ЧП-блок «Склады WB под ударом» (2026-07). Единый источник констант.
 * Флаг — рантайм env (как OFFER_ENABLED): смена значения + `up -d web`, без пересборки.
 */
export const EMERGENCY_JOB_SLUG = 'wb-warehouse-crisis-2026';

/** 3 урока набора — бесплатны для всех (решение D2, spec §D). */
export const EMERGENCY_FREE_LESSON_IDS: ReadonlySet<string> = new Set([
  '04_workshops_w12_jul26_crisis_001',
  '04_workshops_text_d1db18c6-7275-4e16-ab16-8ca58117cd50',
  '04_workshops_text_3bd9fe05-4195-41f8-a507-96fde377ec91',
]);

export function emergencyBannerEnabled(): boolean {
  return process.env.EMERGENCY_BANNER_ENABLED === 'true';
}
