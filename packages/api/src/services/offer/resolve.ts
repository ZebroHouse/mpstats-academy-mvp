import type { PrismaClient, SubscriptionType } from '@mpstats/db';

/** Trial 2-for-1 offer: first paid period is 60 days instead of plan.intervalDays. */
export const OFFER_FIRST_PERIOD_DAYS = 60;
/** Offer stays open for 24h after the trial ends (grace window). */
export const OFFER_GRACE_MS = 24 * 60 * 60 * 1000;
/** Stable key stored on OfferRedemption. */
export const OFFER_KEY = 'trial_2for1';

/**
 * Master kill-switch for the trial 2-for-1 offer. Env-gated (like
 * PARTNER_COURSES_ENABLED / ASSISTANT_ENABLED) so we can ship the engine dark
 * and flip it on at launch — or off instantly if something goes wrong.
 */
export function isOfferEnabled(): boolean {
  return process.env.OFFER_ENABLED === 'true';
}

export interface ResolvedOffer {
  firstPeriodDays: number; // OFFER_FIRST_PERIOD_DAYS
  trialEnd: Date;          // the trial's currentPeriodEnd
  windowEnd: Date;         // trialEnd + OFFER_GRACE_MS (offer closes)
  inGrace: boolean;        // now > trialEnd (still <= windowEnd)
}

/**
 * Decide whether the one-time PLATFORM "2 months for the price of one" offer
 * applies for `userId`. Eligible when ALL hold:
 *  - planType === 'PLATFORM' (COURSE is always normal)
 *  - no discount is being applied (discount wins — spec §3.4)
 *  - the user has a TRIAL subscription and `now` is within the window
 *    [trialEnd, trialEnd + 24h grace]
 *  - the user has no active paid PLATFORM subscription
 *  - the offer has not been redeemed before (OfferRedemption is one-per-user)
 *
 * Server-side source of truth — the browser never decides eligibility.
 */
export async function resolveApplicableOffer(args: {
  prisma: PrismaClient;
  userId: string;
  planType: SubscriptionType;
  suppressForDiscount: boolean;
}): Promise<ResolvedOffer | null> {
  const { prisma, userId, planType, suppressForDiscount } = args;
  if (!isOfferEnabled()) return null; // kill-switch — offer off ⇒ engine invisible
  if (planType !== 'PLATFORM') return null;
  if (suppressForDiscount) return null;

  const now = new Date();

  // Latest trial (active or recently ended).
  const trial = await prisma.subscription.findFirst({
    where: { userId, status: 'TRIAL' },
    orderBy: { currentPeriodEnd: 'desc' },
    select: { currentPeriodEnd: true },
  });
  if (!trial) return null;

  const trialEnd = trial.currentPeriodEnd;
  const windowEnd = new Date(trialEnd.getTime() + OFFER_GRACE_MS);
  if (now > windowEnd) return null; // trial ended > 24h ago

  // Already redeemed once → never again.
  const redeemed = await prisma.offerRedemption.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (redeemed) return null;

  // Already has paid PLATFORM access → not a trial-conversion target.
  // CANCELLED with a still-future currentPeriodEnd counts: the user paid and
  // merely turned auto-renew off, so they retain access until period end.
  // Mirrors access.ts's active-access definition (ACTIVE|TRIAL|CANCELLED &&
  // currentPeriodEnd > now); TRIAL is handled by the trial lookup above.
  const paid = await prisma.subscription.findFirst({
    where: {
      userId,
      plan: { type: 'PLATFORM' },
      status: { in: ['ACTIVE', 'PAST_DUE', 'CANCELLED'] },
      currentPeriodEnd: { gt: now },
    },
    select: { id: true },
  });
  if (paid) return null;

  return {
    firstPeriodDays: OFFER_FIRST_PERIOD_DAYS,
    trialEnd,
    windowEnd,
    inGrace: now > trialEnd,
  };
}
