/**
 * Phase 63 — pure revenue metrics over already-fetched subscription rows.
 *
 * "Paying base" = ACTIVE + TRIAL still within period. MRR counts ACTIVE only
 * (TRIAL pays 0₽ — it is pipeline). All money is honest, not period-normalized:
 * both plans are 30-day intervals today. If a plan with a different intervalDays
 * is ever added, normalize price → price * 30 / intervalDays here.
 */
import { isExcludedFromRevenue } from './test-exclusion';

export type PlanType = 'COURSE' | 'PLATFORM';
export type SubStatus = 'PENDING' | 'ACTIVE' | 'TRIAL' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED';

export interface RevenueSubRow {
  userId: string;
  status: SubStatus;
  currentPeriodEnd: Date;
  cpSubscriptionId: string | null;
  plan: { type: PlanType; price: number; hidden: boolean };
  user: { isTest: boolean };
}

export interface RevenueOverview {
  payingUsers: number;
  activePaying: number;
  recurringPayers: number;
  trialPipeline: number;
  mrr: number;
  arpu: number;
  planSplit: Array<{ type: PlanType; count: number; revenue: number }>;
}

export function computeRevenueOverview(rows: RevenueSubRow[], now: Date): RevenueOverview {
  const kept = rows.filter((r) => !isExcludedFromRevenue(r));
  const inPeriod = kept.filter((r) => r.currentPeriodEnd > now);

  const activeBase = inPeriod.filter((r) => r.status === 'ACTIVE' || r.status === 'TRIAL');
  const active = inPeriod.filter((r) => r.status === 'ACTIVE');
  const trials = inPeriod.filter((r) => r.status === 'TRIAL');

  // MRR = guaranteed recurring revenue → only ACTIVE subs on a real CP recurrent
  // (cpSubscriptionId != null). A non-recurrent ACTIVE sub (manual/promo/referral
  // activation, one-time pay) grants access now but won't auto-charge next period,
  // so it counts as a paying user but NOT toward MRR.
  const recurringActive = active.filter((r) => r.cpSubscriptionId != null);

  const payingUsers = new Set(activeBase.map((r) => r.userId)).size;
  const activePaying = new Set(active.map((r) => r.userId)).size;
  const recurringPayers = new Set(recurringActive.map((r) => r.userId)).size;
  const trialPipeline = new Set(trials.map((r) => r.userId)).size;

  const mrr = recurringActive.reduce((sum, r) => sum + r.plan.price, 0);
  const arpu = recurringPayers > 0 ? Math.round(mrr / recurringPayers) : 0;

  const splitMap = new Map<PlanType, { count: number; revenue: number }>();
  for (const r of recurringActive) {
    const e = splitMap.get(r.plan.type) ?? { count: 0, revenue: 0 };
    e.count += 1;
    e.revenue += r.plan.price;
    splitMap.set(r.plan.type, e);
  }
  const planSplit = (['COURSE', 'PLATFORM'] as PlanType[]).map((type) => ({
    type,
    count: splitMap.get(type)?.count ?? 0,
    revenue: splitMap.get(type)?.revenue ?? 0,
  }));

  return { payingUsers, activePaying, recurringPayers, trialPipeline, mrr, arpu, planSplit };
}

export interface RenewalRow {
  userId: string;
  planType: PlanType;
  amount: number;
  renewalDate: Date;
}

export function computeUpcomingRenewals(
  rows: RevenueSubRow[],
  now: Date,
  windowEnd: Date,
): { rows: RenewalRow[]; totalExpected: number } {
  const kept = rows
    .filter((r) => !isExcludedFromRevenue(r))
    .filter((r) => r.status === 'ACTIVE' && r.cpSubscriptionId != null)
    .filter((r) => r.currentPeriodEnd >= now && r.currentPeriodEnd <= windowEnd)
    .map((r) => ({
      userId: r.userId,
      planType: r.plan.type,
      amount: r.plan.price,
      renewalDate: r.currentPeriodEnd,
    }))
    .sort((a, b) => a.renewalDate.getTime() - b.renewalDate.getTime());

  return { rows: kept, totalExpected: kept.reduce((s, r) => s + r.amount, 0) };
}

export interface PaymentRow {
  paidAt: Date;
  amount: number;
  subscription: { plan: { hidden: boolean }; user: { isTest: boolean } };
}

export function groupRevenueByDay(
  payments: PaymentRow[],
  window?: { days: number; now: Date },
): { byDay: Array<{ date: string; amount: number }>; total: number } {
  const map = new Map<string, number>();

  // Zero-fill every UTC day in [now-days .. now] so an empty period renders a
  // flat "0" line with a date axis instead of a blank/broken chart. Without a
  // window we keep the legacy behaviour (only days that have payments).
  if (window) {
    const cur = new Date(window.now);
    cur.setUTCDate(cur.getUTCDate() - window.days);
    while (cur <= window.now) {
      map.set(cur.toISOString().split('T')[0], 0);
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }

  let total = 0;
  for (const p of payments) {
    if (isExcludedFromRevenue({ user: p.subscription.user, plan: p.subscription.plan })) continue;
    const key = p.paidAt.toISOString().split('T')[0];
    map.set(key, (map.get(key) ?? 0) + p.amount);
    total += p.amount;
  }
  const byDay = [...map.entries()]
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return { byDay, total };
}
