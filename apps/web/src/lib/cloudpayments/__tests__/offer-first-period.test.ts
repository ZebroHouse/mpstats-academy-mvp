import { describe, it, expect } from 'vitest';
import { computeFirstPeriodEnd } from '../subscription-service';

const DAY = 24 * 60 * 60 * 1000;

describe('computeFirstPeriodEnd', () => {
  it('uses offerFirstPeriodDays (60) when set', () => {
    const start = new Date('2026-07-15T00:00:00.000Z');
    const end = computeFirstPeriodEnd(start, { intervalDays: 30, offerFirstPeriodDays: 60 });
    expect(Math.round((end.getTime() - start.getTime()) / DAY)).toBe(60);
  });

  it('falls back to plan.intervalDays when offer field is null', () => {
    const start = new Date('2026-07-15T00:00:00.000Z');
    const end = computeFirstPeriodEnd(start, { intervalDays: 30, offerFirstPeriodDays: null });
    expect(Math.round((end.getTime() - start.getTime()) / DAY)).toBe(30);
  });
});
