import { describe, it, expect } from 'vitest';
import { STATIC_DECK, type StaticQuestion } from './static-deck';

const AXES = ['ANALYTICS', 'MARKETING', 'CONTENT', 'OPERATIONS', 'FINANCE'] as const;

describe('STATIC_DECK', () => {
  it('exports exactly 15 WB questions and 15 Ozon questions', () => {
    expect(STATIC_DECK.wb).toHaveLength(15);
    expect(STATIC_DECK.ozon).toHaveLength(15);
  });

  it('covers the 5×3 (axis, level) matrix for each deck', () => {
    for (const deck of [STATIC_DECK.wb, STATIC_DECK.ozon]) {
      for (const axis of AXES) {
        const subset = deck.filter((q) => q.axis === axis);
        expect(subset, `axis ${axis}`).toHaveLength(3);
        const levels = subset.map((q) => q.level).sort();
        expect(levels).toEqual([1, 2, 3]);
      }
    }
  });

  it('every question has 4 unique non-empty options', () => {
    const allQuestions: StaticQuestion[] = [...STATIC_DECK.wb, ...STATIC_DECK.ozon];
    for (const q of allQuestions) {
      expect(q.options).toHaveLength(4);
      for (const opt of q.options) {
        expect(typeof opt).toBe('string');
        expect(opt.trim().length).toBeGreaterThan(0);
      }
      const unique = new Set(q.options);
      expect(unique.size).toBe(4);
    }
  });

  it('every question has a unique id with the expected format', () => {
    const wbIds = STATIC_DECK.wb.map((q) => q.id);
    const ozIds = STATIC_DECK.ozon.map((q) => q.id);
    expect(new Set(wbIds).size).toBe(15);
    expect(new Set(ozIds).size).toBe(15);
    for (const id of wbIds) expect(id).toMatch(/^q-wb-\d{2}$/);
    for (const id of ozIds) expect(id).toMatch(/^q-ozon-\d{2}$/);

    // WB IDs cover 01..15, Ozon IDs cover 16..30
    const wbNums = wbIds.map((id) => Number(id.slice(-2))).sort((a, b) => a - b);
    const ozNums = ozIds.map((id) => Number(id.slice(-2))).sort((a, b) => a - b);
    expect(wbNums).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    expect(ozNums).toEqual([16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30]);
  });

  it('every question has a non-empty prompt and explanation', () => {
    const allQuestions: StaticQuestion[] = [...STATIC_DECK.wb, ...STATIC_DECK.ozon];
    for (const q of allQuestions) {
      expect(q.prompt.trim().length).toBeGreaterThan(0);
      expect(q.explanation.trim().length).toBeGreaterThan(0);
    }
  });

  it('WB deck tagged "WB", Ozon deck tagged "OZON"', () => {
    for (const q of STATIC_DECK.wb) expect(q.marketplace).toBe('WB');
    for (const q of STATIC_DECK.ozon) expect(q.marketplace).toBe('OZON');
  });

  it('preserves cyrillic UTF-8 text', () => {
    // Q1 WB prompt contains the word "Wildberries"
    expect(STATIC_DECK.wb[0]!.prompt).toContain('Wildberries');
    // Q16 Ozon — first question
    const q16 = STATIC_DECK.ozon.find((q) => q.id === 'q-ozon-16');
    expect(q16).toBeDefined();
    expect(q16!.prompt).toMatch(/спрос/);
  });
});
