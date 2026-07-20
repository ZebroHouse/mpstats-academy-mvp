import { describe, expect, it } from 'vitest';
import { buildFunnel, sumDaily, type DailyPoint } from './product-funnel';

const daily: DailyPoint[] = [
  { metricKey: 'visits', day: '2026-07-13', value: 260 },
  { metricKey: 'visits', day: '2026-07-14', value: 276 },
  { metricKey: 'goal_540626668_visits', day: '2026-07-13', value: 10 },
  { metricKey: 'goal_540626668_visits', day: '2026-07-14', value: 12 },
];

describe('sumDaily', () => {
  it('суммирует значения одного ключа', () => {
    expect(sumDaily(daily, 'visits')).toBe(536);
  });

  it('возвращает 0 для отсутствующего ключа', () => {
    expect(sumDaily(daily, 'goal_999_visits')).toBe(0);
  });
});

describe('buildFunnel', () => {
  it('считает конверсию каждого шага от предыдущего и от вершины', () => {
    const funnel = buildFunnel({
      visits: 1000,
      goalVisits: {
        signup: 200,
        diagnosticStart: 100,
        diagnosticComplete: 80,
        lessonOpen: 60,
        pricingView: 40,
      },
      trials: 30,
      payments: 3,
    });

    expect(funnel.map((s) => s.key)).toEqual([
      'visits',
      'signup',
      'diagnosticStart',
      'diagnosticComplete',
      'lessonOpen',
      'pricingView',
      'trials',
      'payments',
    ]);

    expect(funnel[0]).toMatchObject({ value: 1000, fromPrev: null, fromTop: 100 });
    expect(funnel[1]).toMatchObject({ value: 200, fromPrev: 20, fromTop: 20 });
    expect(funnel[2]).toMatchObject({ value: 100, fromPrev: 50, fromTop: 10 });
    expect(funnel[7]).toMatchObject({ value: 3, fromPrev: 10, fromTop: 0.3 });
  });

  it('помечает источник каждого шага, чтобы UI не выдавал Метрику за БД', () => {
    const funnel = buildFunnel({
      visits: 10,
      goalVisits: { signup: 5, diagnosticStart: 4, diagnosticComplete: 3, lessonOpen: 2, pricingView: 1 },
      trials: 1,
      payments: 1,
    });
    expect(funnel.find((s) => s.key === 'signup')?.source).toBe('metrika');
    expect(funnel.find((s) => s.key === 'trials')?.source).toBe('db');
    expect(funnel.find((s) => s.key === 'payments')?.source).toBe('db');
  });

  it('не делит на ноль: при пустом периоде конверсии равны нулю', () => {
    const funnel = buildFunnel({
      visits: 0,
      goalVisits: { signup: 0, diagnosticStart: 0, diagnosticComplete: 0, lessonOpen: 0, pricingView: 0 },
      trials: 0,
      payments: 0,
    });
    // Вершина всегда 100% (это доля от себя самой, а не деление).
    expect(funnel[0].fromTop).toBe(100);
    expect(funnel[0].fromPrev).toBeNull();
    // Все остальные шаги — нули, без NaN и без Infinity.
    for (const step of funnel.slice(1)) {
      expect(step.fromTop).toBe(0);
      expect(step.fromPrev).toBe(0);
      expect(Number.isFinite(step.fromPrev as number)).toBe(true);
    }
  });
});
