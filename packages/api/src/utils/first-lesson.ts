// Pure resolver: wizard answers (goals, marketplaces) → the single "first lesson" id.
// Mapping approved by methodologists 2026-07-07 (docs/first-lesson-shortlist-2026-07-07.md).
// No IO — unit-tested in isolation.

const FIRST_LESSON_MAP: Record<string, { WB: string; OZON: string }> = {
  ANALYTICS:       { WB: 'skill_analytics_sales_forecast_001',     OZON: '05_ozon_m03_promotion_003' },
  SALES:           { WB: 'skill_analytics_sales_forecast_001',     OZON: '05_ozon_m02_product_card_004' },
  ADS:             { WB: 'skill_marketing_seo_optimization_001',   OZON: 'skill_marketing_seo_optimization_001' },
  CONTENT:         { WB: '03_ai_m03_visual_009',                   OZON: '03_ai_m03_visual_009' },
  FINANCE:         { WB: '01_analytics_m02_economics_001',         OZON: '01_analytics_m02_economics_001' },
  OPERATIONS:      { WB: '01_analytics_m04_product_selection_007', OZON: '05_ozon_m03_promotion_003' },
  NEW_MARKETPLACE: { WB: '01_analytics_m01_start_002',             OZON: '05_ozon_m03_promotion_003' },
};

// Highest-priority goal present wins. Order = strength of the first-lesson hook
// (short / high-engagement first); NEW_MARKETPLACE is the fallback (only wins alone).
const GOAL_PRIORITY = ['ANALYTICS', 'SALES', 'ADS', 'CONTENT', 'FINANCE', 'OPERATIONS', 'NEW_MARKETPLACE'] as const;

// ANALYTICS×WB — universal default when no goal matches or the mapped lesson is gone.
export const FIRST_LESSON_FALLBACK_ID = 'skill_analytics_sales_forecast_001';

/**
 * Resolve the hero "first lesson" from wizard answers.
 * Marketplace: OZON only if OZON selected AND WB not selected; otherwise WB.
 * Goal: highest-priority goal present; ANALYTICS if none match.
 * Always returns a lessonId (existence/visibility is checked by the caller).
 */
export function resolveFirstLesson(goals: string[], marketplaces: string[]): string {
  const mp: 'WB' | 'OZON' =
    marketplaces.includes('OZON') && !marketplaces.includes('WB') ? 'OZON' : 'WB';
  const goal = GOAL_PRIORITY.find((g) => goals.includes(g)) ?? 'ANALYTICS';
  return FIRST_LESSON_MAP[goal][mp];
}

/** Highest-priority goal the user selected, or null. */
export function resolvePrimaryGoal(goals: string[]): string | null {
  return GOAL_PRIORITY.find((g) => goals.includes(g)) ?? null;
}

/**
 * Ordered, de-duplicated first-lessons for every goal the user picked (priority order).
 * Element [0] is the hero (primary goal); the rest feed the «Начни отсюда» shelf.
 */
export function resolveGoalLessons(goals: string[], marketplaces: string[]): string[] {
  const mp: 'WB' | 'OZON' =
    marketplaces.includes('OZON') && !marketplaces.includes('WB') ? 'OZON' : 'WB';
  const ids = GOAL_PRIORITY.filter((g) => goals.includes(g)).map((g) => FIRST_LESSON_MAP[g][mp]);
  return [...new Set(ids)];
}
