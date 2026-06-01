import { describe, it, expect } from 'vitest';
import { pickDeckForUser } from './deck-picker';

const AXES = ['ANALYTICS', 'CONTENT', 'FINANCE', 'MARKETING', 'OPERATIONS'];

describe('pickDeckForUser', () => {
  it('WB-only returns all 15 WB questions sorted by (axis, level)', () => {
    const picked = pickDeckForUser(['WB'], 'any-seed');
    expect(picked).toHaveLength(15);
    for (const q of picked) expect(q.marketplace).toBe('WB');

    // covers 5×3 matrix
    for (const axis of AXES) {
      const subset = picked.filter((q) => q.axis === axis);
      expect(subset).toHaveLength(3);
      expect(subset.map((q) => q.level)).toEqual([1, 2, 3]);
    }
    // sorted by (axis ASC, level ASC)
    for (let i = 1; i < picked.length; i++) {
      const a = picked[i - 1]!;
      const b = picked[i]!;
      if (a.axis === b.axis) expect(b.level).toBeGreaterThan(a.level);
      else expect(b.axis.localeCompare(a.axis)).toBeGreaterThan(0);
    }
  });

  it('Ozon-only returns all 15 Ozon questions sorted', () => {
    const picked = pickDeckForUser(['OZON'], 'seed-z');
    expect(picked).toHaveLength(15);
    for (const q of picked) expect(q.marketplace).toBe('OZON');
    for (const axis of AXES) {
      expect(picked.filter((q) => q.axis === axis)).toHaveLength(3);
    }
  });

  it('BOTH returns 15 questions, one per (axis, level), split 7-8 or 8-7', () => {
    const picked = pickDeckForUser(['WB', 'OZON'], 'seed-both');
    expect(picked).toHaveLength(15);

    // exactly one per slot
    const slots = new Set<string>();
    for (const q of picked) slots.add(`${q.axis}::${q.level}`);
    expect(slots.size).toBe(15);

    const wbCount = picked.filter((q) => q.marketplace === 'WB').length;
    const ozCount = picked.filter((q) => q.marketplace === 'OZON').length;
    expect(wbCount + ozCount).toBe(15);
    expect([7, 8]).toContain(wbCount);
    expect([7, 8]).toContain(ozCount);
  });

  it('BOTH is deterministic for the same seed', () => {
    const a = pickDeckForUser(['WB', 'OZON'], 'seed-X');
    const b = pickDeckForUser(['WB', 'OZON'], 'seed-X');
    expect(a.map((q) => q.id)).toEqual(b.map((q) => q.id));
  });

  it('different seeds produce different selections', () => {
    const seeds = ['s-1', 's-2', 's-3', 's-4', 's-5'];
    const selections = seeds.map((s) =>
      pickDeckForUser(['WB', 'OZON'], s)
        .map((q) => q.id)
        .join('|'),
    );
    const unique = new Set(selections);
    // at least 2 distinct selection sets across 5 seeds
    expect(unique.size).toBeGreaterThanOrEqual(2);
  });

  it('empty userMarketplaces falls back to BOTH', () => {
    const seed = 'fallback-seed';
    const fromEmpty = pickDeckForUser([], seed).map((q) => q.id);
    const fromBoth = pickDeckForUser(['WB', 'OZON'], seed).map((q) => q.id);
    expect(fromEmpty).toEqual(fromBoth);
  });

  it('output sorted by (axis, level) regardless of marketplace mix', () => {
    const picked = pickDeckForUser(['WB', 'OZON'], 'sort-check');
    for (let i = 1; i < picked.length; i++) {
      const a = picked[i - 1]!;
      const b = picked[i]!;
      if (a.axis === b.axis) {
        expect(b.level).toBeGreaterThan(a.level);
      } else {
        expect(b.axis.localeCompare(a.axis)).toBeGreaterThan(0);
      }
    }
  });
});
