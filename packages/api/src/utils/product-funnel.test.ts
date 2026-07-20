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
    expect(funnel[1]).toMatchObject({ value: 200, fromTop: 20 });
    expect(funnel[2]).toMatchObject({ value: 100, fromTop: 10 });
    expect(funnel[7]).toMatchObject({ value: 3, fromTop: 0.3 });
  });

  it('считает долю от предыдущего только у вложенных шагов', () => {
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
    const byKey = Object.fromEntries(funnel.map((s) => [s.key, s]));

    // Завершить диагностику, не начав её, нельзя — доля осмысленна.
    expect(byKey.diagnosticComplete.fromPrev).toBe(80);
    // Оплатить, не побывав в триале, в нашей воронке нельзя — тоже осмысленна.
    expect(byKey.payments.fromPrev).toBe(10);

    // А это независимые цели: попасть в них, минуя предыдущий шаг, можно.
    expect(byKey.signup.fromPrev).toBeNull();
    expect(byKey.diagnosticStart.fromPrev).toBeNull();
    expect(byKey.lessonOpen.fromPrev).toBeNull();
    expect(byKey.pricingView.fromPrev).toBeNull();
    expect(byKey.trials.fromPrev).toBeNull();
  });

  it('не выдаёт бессмысленную конверсию на реальных данных', () => {
    // Реальные июльские цифры платформы за 30 дней.
    const funnel = buildFunnel({
      visits: 3582,
      goalVisits: {
        signup: 198,
        diagnosticStart: 104,
        diagnosticComplete: 106,
        lessonOpen: 535,
        pricingView: 225,
      },
      trials: 60,
      payments: 12,
    });
    const byKey = Object.fromEntries(funnel.map((s) => [s.key, s]));

    // Уроков открыто в пять раз больше, чем завершено диагностик: шаги
    // независимы, наивная «доля от предыдущего» дала бы здесь 504,7%.
    expect(byKey.lessonOpen.fromPrev).toBeNull();
    expect(byKey.lessonOpen.fromTop).toBe(14.9);

    // А у вложенной пары доля считается — и законно чуть превышает 100%:
    // когорта пересекает границу окна (начал 12-го, завершил 14-го, в период
    // попал только финиш). Это свойство периода, а не ошибка счёта.
    expect(byKey.diagnosticComplete.fromPrev).toBe(101.9);
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
      // У вложенных шагов деление 0/0 обязано дать 0, у остальных — прочерк.
      if (step.fromPrev !== null) {
        expect(step.fromPrev).toBe(0);
        expect(Number.isFinite(step.fromPrev)).toBe(true);
      }
    }
    // Обе вложенные пары присутствуют и не свалились в NaN.
    expect(funnel.find((s) => s.key === 'diagnosticComplete')?.fromPrev).toBe(0);
    expect(funnel.find((s) => s.key === 'payments')?.fromPrev).toBe(0);
  });
});
