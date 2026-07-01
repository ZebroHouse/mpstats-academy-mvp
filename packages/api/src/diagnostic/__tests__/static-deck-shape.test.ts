import { describe, it, expect } from 'vitest';
import { STATIC_DECK } from '../static-deck';
import type { StaticQuestion } from '../static-deck';

describe('StaticQuestion optional source fields', () => {
  it('accepts sourceLessonIds/sourceTimecodes as optional', () => {
    const q: StaticQuestion = {
      id: 'q-x', axis: 'ANALYTICS', level: 1, marketplace: 'WB',
      prompt: 'p', options: ['a','b','c','d'], explanation: 'e',
      sourceLessonIds: ['lesson-1'],
      sourceTimecodes: [{ lessonId: 'lesson-1', label: 'intro', start: 0, end: 30 }],
    };
    expect(q.sourceLessonIds).toEqual(['lesson-1']);
  });
  it('deck questions remain valid without source fields (30 total)', () => {
    const all = [...STATIC_DECK.wb, ...STATIC_DECK.ozon];
    expect(all).toHaveLength(30);
    for (const q of all) expect(q.options).toHaveLength(4);
  });
});
