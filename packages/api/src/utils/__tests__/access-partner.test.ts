import { describe, it, expect } from 'vitest';
import { isLessonAccessible } from '../access';

describe('isLessonAccessible — partner free bypass', () => {
  const noSubs: never[] = [];

  it('партнёрский урок (isPartnerFree) доступен даже при order>2 без подписки', () => {
    expect(
      isLessonAccessible(
        { order: 9, courseId: 'mpstats_tools', isPartnerFree: true },
        noSubs,
        true,
        false,
      ),
    ).toBe(true);
  });

  it('обычный платный урок (не первый в джобе, isPartnerFree=undefined) недоступен без подписки', () => {
    expect(
      isLessonAccessible({ order: 9, courseId: '01_analytics' }, noSubs, true, false),
    ).toBe(false);
  });

  it('низкий order больше НЕ даёт бесплатный доступ (правило order<=2 убрано)', () => {
    expect(
      isLessonAccessible({ order: 1, courseId: '01_analytics' }, noSubs, true, false),
    ).toBe(false);
  });

  it('PLATFORM-подписка открывает любой урок', () => {
    const platformSub = [{ id: 's1', courseId: null, plan: { type: 'PLATFORM' } }];
    expect(
      isLessonAccessible({ order: 9, courseId: '01_analytics' }, platformSub, true, false),
    ).toBe(true);
  });

  it('COURSE-подписка открывает урок своего курса', () => {
    const courseSub = [{ id: 's1', courseId: '01_analytics', plan: { type: 'COURSE' } }];
    expect(
      isLessonAccessible({ order: 9, courseId: '01_analytics' }, courseSub, true, false),
    ).toBe(true);
    expect(
      isLessonAccessible({ order: 9, courseId: '02_ads' }, courseSub, true, false),
    ).toBe(false);
  });

  it('admin bypass открывает любой урок', () => {
    expect(
      isLessonAccessible({ order: 9, courseId: '01_analytics' }, noSubs, true, true),
    ).toBe(true);
  });

  it('billing выключен → всё открыто', () => {
    expect(
      isLessonAccessible({ order: 9, courseId: '01_analytics' }, noSubs, false, false),
    ).toBe(true);
  });
});
