import { describe, it, expect } from 'vitest';
import { cosineSim, matchTopK } from './concierge-match';
import type { MapEmbedding } from './types';

describe('cosineSim', () => {
  it('идентичные векторы → 1', () => {
    expect(cosineSim([1, 0], [1, 0])).toBeCloseTo(1);
  });
  it('ортогональные → 0', () => {
    expect(cosineSim([1, 0], [0, 1])).toBeCloseTo(0);
  });
});

describe('matchTopK', () => {
  const entries: MapEmbedding[] = [
    { id: 'a', vec: [1, 0, 0] },
    { id: 'b', vec: [0, 1, 0] },
    { id: 'c', vec: [0.9, 0.1, 0] },
  ];

  it('возвращает топ-K по убыванию, выше порога', () => {
    const r = matchTopK([1, 0, 0], entries, { k: 2, threshold: 0.5 });
    expect(r.map((m) => m.id)).toEqual(['a', 'c']);
    expect(r[0].score).toBeGreaterThan(r[1].score);
  });

  it('пусто, если ничего выше порога', () => {
    const r = matchTopK([0, 0, 1], entries, { k: 3, threshold: 0.5 });
    expect(r).toEqual([]);
  });
});
