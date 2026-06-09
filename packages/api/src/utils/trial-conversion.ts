/**
 * Phase 63 — accurate trial→paid derivation.
 *
 * INVARIANT (guarded by trial-invariant.test.ts): a TRIAL Subscription row is
 * NEVER status-mutated. Payment creates a SEPARATE row. Therefore:
 *   - trial cohort      = rows with status=TRIAL (immutable historical fact)
 *   - conversion        = the user has a COMPLETED payment on a non-excluded sub
 *   - conversion moment = that user's earliest COMPLETED payment
 * Conversion physically happens after trial end (billing.ts blocks paying while
 * a trial is active), so days-to-convert is measured from trialEnd (clamped ≥0).
 */
import { isExcludedFromRevenue } from './test-exclusion';

export interface TrialRow {
  userId: string;
  trialStart: Date;
  trialEnd: Date;
  user: { isTest: boolean };
  plan: { hidden: boolean };
}

export interface ConversionPayment {
  userId: string;
  paidAt: Date;
  subscription: { user: { isTest: boolean }; plan: { hidden: boolean } };
}

export interface TrialConversionResult {
  trialsStarted: number;
  converted: number;
  conversionRate: number; // % over matured trials only
  activeTrials: number;
  churnedTrials: number;
  avgDaysToConvert: number;
}

const DAY = 24 * 60 * 60 * 1000;

export function deriveTrialConversion(
  trials: TrialRow[],
  payments: ConversionPayment[],
  now: Date,
): TrialConversionResult {
  // earliest trial per user (excluding test/hidden)
  const byUser = new Map<string, { trialStart: Date; trialEnd: Date }>();
  for (const t of trials) {
    if (isExcludedFromRevenue({ user: t.user, plan: t.plan })) continue;
    const cur = byUser.get(t.userId);
    if (!cur || t.trialStart < cur.trialStart) byUser.set(t.userId, { trialStart: t.trialStart, trialEnd: t.trialEnd });
  }

  // earliest qualifying payment per user (excluding test/hidden)
  const firstPaid = new Map<string, Date>();
  for (const p of payments) {
    if (isExcludedFromRevenue({ user: p.subscription.user, plan: p.subscription.plan })) continue;
    const cur = firstPaid.get(p.userId);
    if (!cur || p.paidAt < cur) firstPaid.set(p.userId, p.paidAt);
  }

  let converted = 0, activeTrials = 0, churnedTrials = 0, maturedTotal = 0, maturedConverted = 0;
  const daysToConvert: number[] = [];

  for (const [userId, t] of byUser) {
    const paid = firstPaid.get(userId);
    const matured = t.trialEnd < now;
    if (paid) {
      converted += 1;
      daysToConvert.push(Math.max(0, (paid.getTime() - t.trialEnd.getTime()) / DAY));
    } else if (matured) {
      churnedTrials += 1;
    } else {
      activeTrials += 1;
    }
    if (matured) {
      maturedTotal += 1;
      if (paid) maturedConverted += 1;
    }
  }

  const conversionRate = maturedTotal > 0 ? Math.round((maturedConverted / maturedTotal) * 100) : 0;
  const avgDaysToConvert = daysToConvert.length
    ? Math.round(daysToConvert.reduce((s, d) => s + d, 0) / daysToConvert.length)
    : 0;

  return { trialsStarted: byUser.size, converted, conversionRate, activeTrials, churnedTrials, avgDaysToConvert };
}
