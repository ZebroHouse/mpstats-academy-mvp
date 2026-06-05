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

  it('обычный платный урок (order>2, isPartnerFree=undefined) недоступен без подписки', () => {
    expect(
      isLessonAccessible({ order: 9, courseId: '01_analytics' }, noSubs, true, false),
    ).toBe(false);
  });

  it('обычный free-lesson (order<=2) по-прежнему доступен', () => {
    expect(
      isLessonAccessible({ order: 1, courseId: '01_analytics' }, noSubs, true, false),
    ).toBe(true);
  });
});
