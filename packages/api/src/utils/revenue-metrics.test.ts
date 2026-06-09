import { describe, it, expect } from 'vitest';
import { computeRevenueOverview, type RevenueSubRow } from './revenue-metrics';

const NOW = new Date('2026-06-08T00:00:00Z');
const future = new Date('2026-07-01T00:00:00Z');
const past = new Date('2026-06-01T00:00:00Z');

function sub(p: Partial<RevenueSubRow>): RevenueSubRow {
  return {
    userId: 'u1', status: 'ACTIVE', currentPeriodEnd: future, cpSubscriptionId: 'sc_1',
    plan: { type: 'PLATFORM', price: 2990, hidden: false }, user: { isTest: false },
    ...p,
  };
}

describe('computeRevenueOverview', () => {
  it('counts ACTIVE as paying + MRR, TRIAL as pipeline only', () => {
    const r = computeRevenueOverview([
      sub({ userId: 'a', status: 'ACTIVE', plan: { type: 'PLATFORM', price: 2990, hidden: false } }),
      sub({ userId: 'b', status: 'TRIAL', plan: { type: 'PLATFORM', price: 2990, hidden: false } }),
    ], NOW);
    expect(r.payingUsers).toBe(2);     // active base = ACTIVE + TRIAL within period
    expect(r.activePaying).toBe(1);    // only ACTIVE
    expect(r.trialPipeline).toBe(1);
    expect(r.mrr).toBe(2990);          // TRIAL contributes 0₽
    expect(r.arpu).toBe(2990);
  });

  it('excludes test users and hidden plans', () => {
    const r = computeRevenueOverview([
      sub({ userId: 'a', user: { isTest: true } }),
      sub({ userId: 'b', plan: { type: 'COURSE', price: 1990, hidden: true } }),
      sub({ userId: 'c', status: 'ACTIVE', plan: { type: 'COURSE', price: 1990, hidden: false } }),
    ], NOW);
    expect(r.activePaying).toBe(1);
    expect(r.mrr).toBe(1990);
  });

  it('ignores expired/cancelled and out-of-period rows', () => {
    const r = computeRevenueOverview([
      sub({ userId: 'a', status: 'CANCELLED' }),
      sub({ userId: 'b', status: 'ACTIVE', currentPeriodEnd: past }),
    ], NOW);
    expect(r.payingUsers).toBe(0);
    expect(r.mrr).toBe(0);
    expect(r.arpu).toBe(0);
  });

  it('splits revenue by plan type', () => {
    const r = computeRevenueOverview([
      sub({ userId: 'a', status: 'ACTIVE', plan: { type: 'PLATFORM', price: 2990, hidden: false } }),
      sub({ userId: 'b', status: 'ACTIVE', plan: { type: 'COURSE', price: 1990, hidden: false } }),
    ], NOW);
    const platform = r.planSplit.find((p) => p.type === 'PLATFORM')!;
    const course = r.planSplit.find((p) => p.type === 'COURSE')!;
    expect(platform).toMatchObject({ count: 1, revenue: 2990 });
    expect(course).toMatchObject({ count: 1, revenue: 1990 });
  });
});
