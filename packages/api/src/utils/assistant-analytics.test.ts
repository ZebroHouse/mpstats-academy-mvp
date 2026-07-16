// packages/api/src/utils/assistant-analytics.test.ts
import { describe, it, expect } from 'vitest';
import { mskDayKey, enumerateMskDays, fillDaySeries } from './assistant-analytics';
import { computeQuality } from './assistant-analytics';
import { labelProblem } from './assistant-analytics';
import { computeUpsell } from './assistant-analytics';

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

describe('labelProblem', () => {
  it('labels a complaint', () => {
    const out = labelProblem({
      createdAt: new Date('2026-07-02T09:00:00Z'),
      category: 'complaint',
      isFallback: false,
      query: 'всё тормозит',
    });
    expect(out).toEqual({ date: '2026-07-02', kind: 'complaint', label: 'Жалоба', query: 'всё тормозит' });
  });

  it('labels an off-domain refusal', () => {
    const out = labelProblem({
      createdAt: new Date('2026-07-02T09:00:00Z'),
      category: 'off_domain',
      isFallback: false,
      query: 'погода завтра',
    });
    expect(out.kind).toBe('off_domain');
    expect(out.label).toBe('Офф-топик');
  });

  it('labels a concierge fallback when category is not a problem category', () => {
    const out = labelProblem({
      createdAt: new Date('2026-07-02T09:00:00Z'),
      category: 'platform_help',
      isFallback: true,
      query: 'где кнопка X',
    });
    expect(out.kind).toBe('fallback');
    expect(out.label).toBe('Не смог помочь (→ поддержка)');
  });

  it('tolerates a null query', () => {
    const out = labelProblem({ createdAt: new Date('2026-07-02T09:00:00Z'), category: 'off_domain', isFallback: false, query: null });
    expect(out.query).toBe('');
  });
});

describe('computeUpsell', () => {
  const opts = { cap: 5, repeatThreshold: 2 };

  it('counts capped users, repeat cappers, and clamps the load histogram', () => {
    const rows = [
      { userId: 'a', dayCount: 5 }, // a capped day 1
      { userId: 'a', dayCount: 7 }, // a capped day 2 (clamped to bucket 5)
      { userId: 'b', dayCount: 5 }, // b capped once
      { userId: 'c', dayCount: 3 }, // c never capped
      { userId: 'c', dayCount: 1 },
    ];
    const out = computeUpsell(rows, opts);
    expect(out.cappedUsers).toBe(2); // a, b
    expect(out.repeatCappers).toBe(1); // only a (>=2 capped days)
    expect(out.loadHistogram).toEqual([
      { bucket: 1, userDays: 1 }, // c's 1
      { bucket: 2, userDays: 0 },
      { bucket: 3, userDays: 1 }, // c's 3
      { bucket: 4, userDays: 0 },
      { bucket: 5, userDays: 3 }, // a(5), a(7→5), b(5)
    ]);
  });

  it('returns zeroed buckets for an empty input', () => {
    const out = computeUpsell([], opts);
    expect(out.cappedUsers).toBe(0);
    expect(out.repeatCappers).toBe(0);
    expect(out.loadHistogram).toEqual([
      { bucket: 1, userDays: 0 },
      { bucket: 2, userDays: 0 },
      { bucket: 3, userDays: 0 },
      { bucket: 4, userDays: 0 },
      { bucket: 5, userDays: 0 },
    ]);
  });
});
