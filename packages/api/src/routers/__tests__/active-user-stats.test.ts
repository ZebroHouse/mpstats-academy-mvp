import { describe, it, expect } from 'vitest';
import {
  computeStickiness,
  mapActiveUserStats,
  type ActiveUserDayRow,
} from '../../utils/active-user-stats';

describe('computeStickiness', () => {
  it('returns dau/mau as a 0..1 ratio', () => {
    expect(computeStickiness(5, 20)).toBe(0.25);
  });

  it('returns 0 when mau is 0 (no divide-by-zero)', () => {
    expect(computeStickiness(0, 0)).toBe(0);
  });

  it('returns 0 when mau is negative (defensive)', () => {
    expect(computeStickiness(3, -1)).toBe(0);
  });

  it('returns 1 when dau equals mau', () => {
    expect(computeStickiness(10, 10)).toBe(1);
  });
});

describe('mapActiveUserStats', () => {
  const rows: ActiveUserDayRow[] = [
    { date: '2026-06-01', dau: 2, wau: 5, mau: 8 },
    { date: '2026-06-02', dau: 3, wau: 6, mau: 9 },
    { date: '2026-06-03', dau: 4, wau: 7, mau: 16 },
  ];

  it('maps each row into a series point with derived stickiness', () => {
    const result = mapActiveUserStats(rows);
    expect(result.series).toHaveLength(3);
    expect(result.series[0]).toEqual({
      date: '2026-06-01',
      dau: 2,
      wau: 5,
      mau: 8,
      stickiness: 0.25,
    });
    expect(result.series[2].stickiness).toBe(0.25); // 4/16
  });

  it('current = last (most recent) day metrics including stickiness', () => {
    const result = mapActiveUserStats(rows);
    expect(result.current).toEqual({ dau: 4, wau: 7, mau: 16, stickiness: 0.25 });
  });

  it('previous = first day metrics (window baseline, no stickiness)', () => {
    const result = mapActiveUserStats(rows);
    expect(result.previous).toEqual({ dau: 2, wau: 5, mau: 8 });
  });

  it('stickiness is 0 when mau is 0 for a day', () => {
    const zeroMau: ActiveUserDayRow[] = [{ date: '2026-06-01', dau: 0, wau: 0, mau: 0 }];
    const result = mapActiveUserStats(zeroMau);
    expect(result.series[0].stickiness).toBe(0);
    expect(result.current).toEqual({ dau: 0, wau: 0, mau: 0, stickiness: 0 });
  });

  it('returns a zeroed result for an empty window', () => {
    const result = mapActiveUserStats([]);
    expect(result.series).toEqual([]);
    expect(result.current).toEqual({ dau: 0, wau: 0, mau: 0, stickiness: 0 });
    expect(result.previous).toEqual({ dau: 0, wau: 0, mau: 0 });
  });

  it('single-day window: current and previous are the same day', () => {
    const single: ActiveUserDayRow[] = [{ date: '2026-06-03', dau: 4, wau: 7, mau: 16 }];
    const result = mapActiveUserStats(single);
    expect(result.current).toEqual({ dau: 4, wau: 7, mau: 16, stickiness: 0.25 });
    expect(result.previous).toEqual({ dau: 4, wau: 7, mau: 16 });
  });
});
