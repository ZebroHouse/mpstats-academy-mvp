// packages/api/src/utils/assistant-analytics.test.ts
import { describe, it, expect } from 'vitest';
import { mskDayKey, enumerateMskDays, fillDaySeries } from './assistant-analytics';

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
