import { describe, it, expect } from 'vitest';
import { tallyDuplicatePlatformSubs } from '../../utils/offer-duplicates';

describe('tallyDuplicatePlatformSubs', () => {
  it('keeps only (userId, intervalDays) pairs with 2+ active subs, sorted by count desc', () => {
    const rows = [
      { userId: 'a', plan: { intervalDays: 30 } },
      { userId: 'a', plan: { intervalDays: 30 } },
      { userId: 'a', plan: { intervalDays: 30 } },
      { userId: 'b', plan: { intervalDays: 30 } }, // not a duplicate
      { userId: 'c', plan: { intervalDays: 90 } },
      { userId: 'c', plan: { intervalDays: 90 } },
    ];
    const out = tallyDuplicatePlatformSubs(rows);
    expect(out.total).toBe(2);
    expect(out.rows).toEqual([
      { userId: 'a', intervalDays: 30, count: 3 },
      { userId: 'c', intervalDays: 90, count: 2 },
    ]);
  });

  it('returns empty when nobody has duplicates', () => {
    expect(tallyDuplicatePlatformSubs([{ userId: 'a', plan: { intervalDays: 30 } }])).toEqual({
      total: 0,
      rows: [],
    });
  });

  it('does not flag a legitimate tier switch — same user, different intervalDays', () => {
    // e.g. a 30d sub still active while a separately-obtained 90d sub exists —
    // these are different tiers, not the double-initiate race this monitors.
    const rows = [
      { userId: 'a', plan: { intervalDays: 30 } },
      { userId: 'a', plan: { intervalDays: 90 } },
    ];
    expect(tallyDuplicatePlatformSubs(rows)).toEqual({ total: 0, rows: [] });
  });
});
