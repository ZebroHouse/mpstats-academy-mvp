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

  const payingUsers = new Set(activeBase.map((r) => r.userId)).size;
  const activePaying = new Set(active.map((r) => r.userId)).size;
  const trialPipeline = new Set(trials.map((r) => r.userId)).size;

  const mrr = active.reduce((sum, r) => sum + r.plan.price, 0);
  const arpu = activePaying > 0 ? Math.round(mrr / activePaying) : 0;

  const splitMap = new Map<PlanType, { count: number; revenue: number }>();
  for (const r of active) {
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

  return { payingUsers, activePaying, trialPipeline, mrr, arpu, planSplit };
}
