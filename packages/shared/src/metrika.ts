/** Счётчик стоит на ВЕСЬ домен mpstats.academy. Без этого фильтра цифра
 *  завышена примерно втрое (10 889 против 3 299 визитов за 30 дней). */
export const METRIKA_PLATFORM_FILTER = "ym:s:startURL=*'*platform.mpstats.academy*'";

/** ID целей platform_* в счётчике 94592073. Подтверждены через management API 2026-07-20. */
export const METRIKA_GOAL_IDS = {
  signup: 540626668,
  login: 540626673,
  diagnosticStart: 540626712,
  diagnosticComplete: 540626734,
  lessonOpen: 540626804,
  pricingView: 540626808,
  payment: 540626853,
  /** Цель заведена в Метрике, но reachGoal с ней нигде не вызывается —
   *  0 срабатываний за 30 дней. Пишем в снапшот, в UI не показываем. */
  ctaClick: 540626878,
} as const;

export type MetrikaGoalKey = keyof typeof METRIKA_GOAL_IDS;

/** Трафиковые метрики верхнего уровня. */
export const METRIKA_TRAFFIC_METRICS = ['visits', 'users', 'pageviews'] as const;
export type MetrikaTrafficMetric = (typeof METRIKA_TRAFFIC_METRICS)[number];

/** Окна, для которых крон снимает периодные (дедуплицированные) уники.
 *  Совпадают с пресетами DEFAULT_RANGE_DAYS в AnalyticsDateRange. */
export const METRIKA_UNIQUE_WINDOWS = [7, 14, 30, 90] as const;

/** Ключ строки снапшота для цели. `visits` — аддитивная метрика шага воронки,
 *  `users` — люди (не аддитивны по дням). `reaches` осознанно не храним:
 *  это счётчик срабатываний, он ломает порядок шагов воронки. */
export function goalMetricKey(goal: MetrikaGoalKey, kind: 'visits' | 'users'): string {
  return `goal_${METRIKA_GOAL_IDS[goal]}_${kind}`;
}

/** Метрика Reporting API для цели. */
export function goalApiMetric(goal: MetrikaGoalKey, kind: 'visits' | 'users'): string {
  return `ym:s:goal${METRIKA_GOAL_IDS[goal]}${kind}`;
}

/** Шаги воронки в порядке отображения. ctaClick исключён — цель не стреляет. */
export const FUNNEL_GOAL_STEPS: MetrikaGoalKey[] = [
  'signup',
  'diagnosticStart',
  'diagnosticComplete',
  'lessonOpen',
  'pricingView',
];
