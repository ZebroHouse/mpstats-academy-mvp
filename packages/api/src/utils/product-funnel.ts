/**
 * Task 7 — pure product funnel arithmetic. No DB, no Prisma.
 *
 * The funnel splices two systems: behavioral steps (visits → pricing view)
 * come from Yandex Metrika goals, while trials and payments come from our DB.
 * DB is authoritative for money — the client-side `platform_payment` Metrika
 * goal misses payments (ad blockers, page-exit before it fires), so the DB
 * count is always higher and correct. `source` on each step lets the UI be
 * honest about which system produced the number, so it doesn't read as a bug
 * next to the existing revenue tab.
 */

export interface DailyPoint {
  metricKey: string;
  day: string;
  value: number;
}

export type FunnelStepKey =
  | 'visits'
  | 'signup'
  | 'diagnosticStart'
  | 'diagnosticComplete'
  | 'lessonOpen'
  | 'pricingView'
  | 'trials'
  | 'payments';

export interface FunnelStep {
  key: FunnelStepKey;
  label: string;
  value: number;
  /** Конверсия от предыдущего шага, %. null у вершины. */
  fromPrev: number | null;
  /** Конверсия от визитов, %. */
  fromTop: number;
  /** Откуда цифра: Метрика (поведение) или БД (деньги и подписки). */
  source: 'metrika' | 'db';
}

const LABELS: Record<FunnelStepKey, string> = {
  visits: 'Визиты',
  signup: 'Регистрация',
  diagnosticStart: 'Начал диагностику',
  diagnosticComplete: 'Завершил диагностику',
  lessonOpen: 'Открыл урок',
  pricingView: 'Посмотрел тарифы',
  trials: 'Триал',
  payments: 'Оплата',
};

export function sumDaily(points: DailyPoint[], metricKey: string): number {
  return points.reduce((acc, p) => (p.metricKey === metricKey ? acc + p.value : acc), 0);
}

function percent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

export function buildFunnel(input: {
  visits: number;
  goalVisits: Record<
    'signup' | 'diagnosticStart' | 'diagnosticComplete' | 'lessonOpen' | 'pricingView',
    number
  >;
  trials: number;
  payments: number;
}): FunnelStep[] {
  const raw: Array<{ key: FunnelStepKey; value: number; source: 'metrika' | 'db' }> = [
    { key: 'visits', value: input.visits, source: 'metrika' },
    { key: 'signup', value: input.goalVisits.signup, source: 'metrika' },
    { key: 'diagnosticStart', value: input.goalVisits.diagnosticStart, source: 'metrika' },
    { key: 'diagnosticComplete', value: input.goalVisits.diagnosticComplete, source: 'metrika' },
    { key: 'lessonOpen', value: input.goalVisits.lessonOpen, source: 'metrika' },
    { key: 'pricingView', value: input.goalVisits.pricingView, source: 'metrika' },
    { key: 'trials', value: input.trials, source: 'db' },
    { key: 'payments', value: input.payments, source: 'db' },
  ];

  return raw.map((step, index) => ({
    key: step.key,
    label: LABELS[step.key],
    value: step.value,
    fromPrev: index === 0 ? null : percent(step.value, raw[index - 1].value),
    fromTop: index === 0 ? 100 : percent(step.value, input.visits),
    source: step.source,
  }));
}
