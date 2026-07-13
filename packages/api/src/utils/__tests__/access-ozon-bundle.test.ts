import { describe, it, expect } from 'vitest';
import { isLessonAccessible } from '../access';

// The two Ozon courses («Работа с Ozon» = 05_ozon, «Ozon PROдвижение» =
// 09_ozon_prodvizhenie) are sold as one bundle: the «Ozon» course tariff
// (courseId=05_ozon) unlocks both.
describe('isLessonAccessible — Ozon course bundle', () => {
  const ozonSub = [{ id: 's1', courseId: '05_ozon', plan: { type: 'COURSE' } }];

  it('подписка на 05_ozon открывает уроки 05_ozon', () => {
    expect(isLessonAccessible({ order: 9, courseId: '05_ozon' }, ozonSub, true, false)).toBe(true);
  });

  it('подписка на 05_ozon открывает уроки 09_ozon_prodvizhenie (бандл)', () => {
    expect(
      isLessonAccessible({ order: 9, courseId: '09_ozon_prodvizhenie' }, ozonSub, true, false),
    ).toBe(true);
  });

  it('подписка на 05_ozon НЕ открывает не-Ozon курс', () => {
    expect(isLessonAccessible({ order: 9, courseId: '01_analytics' }, ozonSub, true, false)).toBe(false);
  });

  it('подписка на не-Ozon курс НЕ открывает Ozon-курсы (бандл только между Ozon)', () => {
    const wbSub = [{ id: 's1', courseId: '01_analytics', plan: { type: 'COURSE' } }];
    expect(isLessonAccessible({ order: 9, courseId: '09_ozon_prodvizhenie' }, wbSub, true, false)).toBe(false);
  });
});
