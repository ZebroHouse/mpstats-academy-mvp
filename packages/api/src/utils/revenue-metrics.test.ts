import { describe, it, expect } from 'vitest';
import { computeRevenueOverview, type RevenueSubRow } from './revenue-metrics';
import { computeUpcomingRenewals, groupRevenueByDay, type PaymentRow } from './revenue-metrics';

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

  it('MRR counts only recurrent ACTIVE subs; non-recurrent ACTIVE still counts as paying', () => {
    const r = computeRevenueOverview([
      sub({ userId: 'a', status: 'ACTIVE', cpSubscriptionId: 'sc_a', plan: { type: 'PLATFORM', price: 2990, hidden: false } }),
      sub({ userId: 'b', status: 'ACTIVE', cpSubscriptionId: null, plan: { type: 'PLATFORM', price: 2990, hidden: false } }),
    ], NOW);
    expect(r.activePaying).toBe(2);     // both have active paid access
    expect(r.recurringPayers).toBe(1);  // only 'a' auto-renews
    expect(r.mrr).toBe(2990);           // MRR = recurrent only
    expect(r.arpu).toBe(2990);          // mrr / recurringPayers
  });
});

describe('computeUpcomingRenewals', () => {
  const NOW2 = new Date('2026-06-08T00:00:00Z');
  const within = new Date('2026-06-12T00:00:00Z');
  const beyond = new Date('2026-07-20T00:00:00Z');

  it('keeps only ACTIVE recurrent subs renewing within the window, sorted', () => {
    const r = computeUpcomingRenewals([
      sub({ userId: 'a', status: 'ACTIVE', cpSubscriptionId: 'sc_a', currentPeriodEnd: within, plan: { type: 'PLATFORM', price: 2990, hidden: false } }),
      sub({ userId: 'b', status: 'ACTIVE', cpSubscriptionId: null, currentPeriodEnd: within }),    // not recurrent
      sub({ userId: 'c', status: 'TRIAL', cpSubscriptionId: 'sc_c', currentPeriodEnd: within }),   // not ACTIVE
      sub({ userId: 'd', status: 'ACTIVE', cpSubscriptionId: 'sc_d', currentPeriodEnd: beyond }),  // out of window
    ], NOW2, new Date('2026-06-15T00:00:00Z'));
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ userId: 'a', planType: 'PLATFORM', amount: 2990 });
    expect(r.totalExpected).toBe(2990);
  });
});

describe('groupRevenueByDay', () => {
  function pay(p: Partial<PaymentRow>): PaymentRow {
    return { paidAt: new Date('2026-06-05T10:00:00Z'), amount: 2990, subscription: { plan: { hidden: false }, user: { isTest: false } }, ...p };
  }
  it('sums COMPLETED payments per UTC day, excluding test/hidden', () => {
    const r = groupRevenueByDay([
      pay({ paidAt: new Date('2026-06-05T10:00:00Z'), amount: 2990 }),
      pay({ paidAt: new Date('2026-06-05T20:00:00Z'), amount: 1990 }),
      pay({ amount: 999, subscription: { plan: { hidden: false }, user: { isTest: true } } }),
    ]);
    const day = r.byDay.find((d) => d.date === '2026-06-05')!;
    expect(day.amount).toBe(4980);
    expect(r.total).toBe(4980);
  });
});
