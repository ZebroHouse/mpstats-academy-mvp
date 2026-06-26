/**
 * Trial subscription helpers (Phase 53A).
 *
 * createTrialSubscription — creates a TRIAL Subscription on PLATFORM tier
 * with periodEnd = now + N days. Used by:
 *  - Friend registration with ?ref= cookie (Phase 53A — initial trial)
 *  - Package activation when no current sub exists (Phase 53A — packages.ts)
 */

import { prisma as defaultPrisma, type PrismaClient } from '@mpstats/db';

export interface CreateTrialOpts {
  userId: string;
  durationDays: number;
  prismaClient?: PrismaClient | any; // accepts transaction client
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Auto-trial length for referral-less signups (T2). */
export const BASE_TRIAL_DAYS = 3;

// INVARIANT (Phase 63 analytics): a TRIAL row's `status` is never mutated.
// Paying creates a SEPARATE Subscription row (see billing.initiatePayment).
// deriveTrialConversion() relies on this to read the trial cohort historically.
// Guarded by apps/web/src/lib/cloudpayments/__tests__/trial-invariant.test.ts.
export async function createTrialSubscription(opts: CreateTrialOpts) {
  const tx = opts.prismaClient ?? defaultPrisma;

  // Find PLATFORM plan id
  const platformPlan = await tx.subscriptionPlan.findFirst({
    where: { type: 'PLATFORM', isActive: true },
    select: { id: true },
  });
  if (!platformPlan) {
    throw new Error('No active PLATFORM SubscriptionPlan found');
  }

  const now = new Date();
  return tx.subscription.create({
    data: {
      userId: opts.userId,
      planId: platformPlan.id,
      courseId: null,
      status: 'TRIAL',
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getTime() + opts.durationDays * DAY_MS),
    },
  });
}

/**
 * Idempotent base trial for referral-less signups (T2).
 *
 * If the user has NO subscription at all, grants a BASE_TRIAL_DAYS PLATFORM
 * trial. If any subscription already exists (e.g. a referral trial was issued
 * via issueReferralOnSignup), does nothing. Errors are swallowed and logged —
 * a failed trial must never break the auth flow.
 */
export async function ensureBaseTrial(
  userId: string,
  prismaClient?: PrismaClient | any,
): Promise<void> {
  const tx = prismaClient ?? defaultPrisma;
  try {
    const existing = await tx.subscription.findFirst({ where: { userId } });
    if (existing) return;
    await createTrialSubscription({ userId, durationDays: BASE_TRIAL_DAYS, prismaClient: tx });
  } catch (err) {
    console.error('[ensureBaseTrial] failed to create base trial:', err);
  }
}

export async function extendSubscriptionByDays(opts: {
  subscriptionId: string;
  days: number;
  prismaClient?: PrismaClient | any;
}) {
  const tx = opts.prismaClient ?? defaultPrisma;
  const sub = await tx.subscription.findUnique({
    where: { id: opts.subscriptionId },
    select: { currentPeriodEnd: true },
  });
  if (!sub) throw new Error('Subscription not found');
  return tx.subscription.update({
    where: { id: opts.subscriptionId },
    data: {
      currentPeriodEnd: new Date(sub.currentPeriodEnd.getTime() + opts.days * DAY_MS),
    },
  });
}
