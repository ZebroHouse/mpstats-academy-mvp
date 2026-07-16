// packages/api/src/utils/assistant-analytics.test.ts
import { describe, it, expect } from 'vitest';
import { mskDayKey, enumerateMskDays, fillDaySeries } from './assistant-analytics';
import { computeQuality } from './assistant-analytics';

describe('mskDayKey', () => {
  it('shifts UTC into MSK before taking the calendar day', () => {
    // 2026-07-01T22:30:00Z is 2026-07-02 01:30 MSK → MSK day 2026-07-02
    expect(mskDayKey(new Date('2026-07-01T22:30:00Z'))).toBe('2026-07-02');
    // 2026-07-01T20:00:00Z is 2026-07-01 23:00 MSK → still 2026-07-01
    expect(mskDayKey(new Date('2026-07-01T20:00:00Z'))).toBe('2026-07-01');
  });
});

describe('enumerateMskDays', () => {
  it('lists every MSK calendar day in [from..to] inclusive', () => {
    const keys = enumerateMskDays(new Date('2026-07-01T00:00:00Z'), new Date('2026-07-03T12:00:00Z'));
    expect(keys).toEqual(['2026-07-01', '2026-07-02', '2026-07-03']);
  });
});

describe('fillDaySeries', () => {
  it('fills missing days with 0 and preserves order', () => {
    const out = fillDaySeries(
      [{ date: '2026-07-02', count: 5 }],
      ['2026-07-01', '2026-07-02', '2026-07-03'],
    );
    expect(out).toEqual([
      { date: '2026-07-01', count: 0 },
      { date: '2026-07-02', count: 5 },
      { date: '2026-07-03', count: 0 },
    ]);
  });
});

describe('computeQuality', () => {
  it('computes rates and guards division by zero', () => {
    expect(computeQuality({ total: 0, offDomain: 0, complaint: 0, fallback: 0 })).toEqual({
      total: 0,
      offDomain: 0, offDomainRate: 0,
      complaint: 0, complaintRate: 0,
      fallback: 0, fallbackRate: 0,
    });
  });

  it('divides each problem count by total', () => {
    const q = computeQuality({ total: 200, offDomain: 20, complaint: 10, fallback: 30 });
    expect(q.offDomainRate).toBeCloseTo(0.1);
    expect(q.complaintRate).toBeCloseTo(0.05);
    expect(q.fallbackRate).toBeCloseTo(0.15);
    expect(q.total).toBe(200);
  });
});
