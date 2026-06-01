import { describe, it, expect } from 'vitest';
import { shuffleOptions } from './option-shuffler';
import type { StaticQuestion } from './static-deck';

const SAMPLE: StaticQuestion = {
  id: 'q-test-01',
  axis: 'ANALYTICS',
  level: 1,
  marketplace: 'WB',
  prompt: 'sample prompt',
  options: ['CORRECT', 'wrong-1', 'wrong-2', 'wrong-3'],
  explanation: 'explanation',
};

describe('shuffleOptions', () => {
  it('returns 4 options and correctIndex in [0,3]', () => {
    const result = shuffleOptions(SAMPLE, 'seed-1');
    expect(result.options).toHaveLength(4);
    expect(result.correctIndex).toBeGreaterThanOrEqual(0);
    expect(result.correctIndex).toBeLessThanOrEqual(3);
  });

  it('correctIndex points at the originally-correct option (input options[0])', () => {
    const result = shuffleOptions(SAMPLE, 'seed-2');
    expect(result.options[result.correctIndex]).toBe(SAMPLE.options[0]);
  });

  it('returned options are exactly the input set (no loss or duplication)', () => {
    const result = shuffleOptions(SAMPLE, 'seed-3');
    expect(new Set(result.options)).toEqual(new Set(SAMPLE.options));
    expect(result.options).toHaveLength(SAMPLE.options.length);
  });

  it('is idempotent for the same (sessionSeed, questionId)', () => {
    const a = shuffleOptions(SAMPLE, 'seed-X');
    const b = shuffleOptions(SAMPLE, 'seed-X');
    expect(a.options).toEqual(b.options);
    expect(a.correctIndex).toBe(b.correctIndex);
  });

  it('different sessionSeed produces at least 2 distinct correctIndex positions across 10 seeds', () => {
    const positions = new Set<number>();
    for (let i = 0; i < 10; i++) {
      positions.add(shuffleOptions(SAMPLE, `s-${i}`).correctIndex);
    }
    expect(positions.size).toBeGreaterThanOrEqual(2);
  });

  it('different questionId with same sessionSeed produces independent shuffles', () => {
    const ids = ['qA', 'qB', 'qC', 'qD', 'qE'];
    const positions = new Set<number>();
    for (const id of ids) {
      const q: StaticQuestion = { ...SAMPLE, id };
      positions.add(shuffleOptions(q, 'shared-seed').correctIndex);
    }
    // Different question IDs should not all land at the same correctIndex.
    expect(positions.size).toBeGreaterThanOrEqual(2);
  });
});
