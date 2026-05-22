import { describe, it, expect } from 'vitest';
import { lessonsToRemoveOnJobRemove } from '../learning-jobs-utils';

describe('lessonsToRemoveOnJobRemove', () => {
  it('removes job lessons not present in other still-added jobs', () => {
    const result = lessonsToRemoveOnJobRemove(
      ['L1', 'L2', 'L3'],
      [{ id: 'JOB_OTHER', lessonIds: ['L2', 'L4'] }],
    );
    expect(result.sort()).toEqual(['L1', 'L3']);
  });
  it('returns all lessons when no other jobs added', () => {
    expect(lessonsToRemoveOnJobRemove(['L1', 'L2'], [])).toEqual(['L1', 'L2']);
  });
  it('handles overlapping lessons across multiple other jobs', () => {
    const result = lessonsToRemoveOnJobRemove(
      ['L1', 'L2', 'L3'],
      [{ id: 'JA', lessonIds: ['L1'] }, { id: 'JB', lessonIds: ['L3'] }],
    );
    expect(result).toEqual(['L2']);
  });
});
