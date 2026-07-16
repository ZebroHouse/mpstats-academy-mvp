import { describe, it, expect } from 'vitest';
import { tallyDuplicatePlatformSubs } from '../../utils/offer-duplicates';

describe('tallyDuplicatePlatformSubs', () => {
  it('keeps only userIds with 2+ active PLATFORM subs, sorted by count desc', () => {
    const rows = [
      { userId: 'a', _count: { _all: 3 } },
      { userId: 'b', _count: { _all: 1 } }, // not a duplicate
      { userId: 'c', _count: { _all: 2 } },
    ];
    const out = tallyDuplicatePlatformSubs(rows);
    expect(out.total).toBe(2);
    expect(out.rows).toEqual([
      { userId: 'a', count: 3 },
      { userId: 'c', count: 2 },
    ]);
  });

  it('returns empty when nobody has duplicates', () => {
    expect(tallyDuplicatePlatformSubs([{ userId: 'a', _count: { _all: 1 } }])).toEqual({ total: 0, rows: [] });
  });
});
