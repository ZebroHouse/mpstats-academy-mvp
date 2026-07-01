import { describe, it, expect } from 'vitest';
import { parseLearningPath } from '../index';
import type { AxisLearningPath } from '../index';

describe('parseLearningPath v3', () => {
  it('recognizes version:3 AxisLearningPath', () => {
    const v3: AxisLearningPath = {
      version: 3,
      sections: [{
        axis: 'ANALYTICS', label: 'Аналитика', score: 33, tier: 'weak',
        collapsed: false, jobIds: ['job-1'], lessonIds: ['l1', 'l2'], errorLessonIds: ['l1'],
      }],
      generatedFromSessionId: 'sess-1',
    };
    const parsed = parseLearningPath(v3);
    expect(Array.isArray(parsed)).toBe(false);
    expect((parsed as AxisLearningPath).version).toBe(3);
    expect((parsed as AxisLearningPath).sections[0].axis).toBe('ANALYTICS');
  });

  it('still recognizes v2 SectionedLearningPath', () => {
    const v2 = { version: 2, sections: [], generatedFromSessionId: 's' };
    expect((parseLearningPath(v2) as any).version).toBe(2);
  });

  it('still recognizes flat string[]', () => {
    expect(parseLearningPath(['a', 'b'])).toEqual(['a', 'b']);
  });

  it('unknown version falls back to [] (no throw)', () => {
    expect(parseLearningPath({ version: 99 })).toEqual([]);
    expect(parseLearningPath(null)).toEqual([]);
  });
});
