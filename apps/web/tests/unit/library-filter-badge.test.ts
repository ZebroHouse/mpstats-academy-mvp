import { describe, it, expect } from 'vitest';
import { filterLessonByState } from '@/components/learning/library-filter';
import { DEFAULT_FILTERS } from '@/components/learning/FilterPanel';

const base: any = { skillCategory: 'MARKETING', status: 'NOT_STARTED', duration: 5, topics: [], courseId: '02_ads', badges: ['NEW'] };

describe('filterLessonByState — badge', () => {
  it('badge=ALL → passes', () => {
    expect(filterLessonByState(base, { ...DEFAULT_FILTERS })).toBe(true);
  });
  it('badge=NEW + lesson has NEW → passes', () => {
    expect(filterLessonByState(base, { ...DEFAULT_FILTERS, badge: 'NEW' })).toBe(true);
  });
  it('badge=HOT + lesson lacks HOT → filtered out', () => {
    expect(filterLessonByState(base, { ...DEFAULT_FILTERS, badge: 'HOT' })).toBe(false);
  });
  it('badge=NEW + lesson has no badges field → filtered out', () => {
    const noBadges: any = { skillCategory: 'MARKETING', status: 'NOT_STARTED', duration: 5, topics: [], courseId: '02_ads' };
    expect(filterLessonByState(noBadges, { ...DEFAULT_FILTERS, badge: 'NEW' })).toBe(false);
  });
});
