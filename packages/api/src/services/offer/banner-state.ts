import type { PrismaClient } from '@mpstats/db';
import {
  resolveApplicableOffer,
  isOfferEnabled,
  OFFER_GRACE_MS,
  type ResolvedOffer,
} from './resolve';
import { resolveApplicableDiscount } from '../discount/resolve';

export type OfferBannerState = 'trial_active' | 'grace' | 'expired' | 'none';

/** Pure: map a resolved offer to the live-timer display state. */
export function deriveOfferState(
  offer: ResolvedOffer | null,
): { state: 'trial_active' | 'grace' | 'none'; offerEndsAt: string | null } {
  if (!offer) return { state: 'none', offerEndsAt: null };
  return offer.inGrace
    ? { state: 'grace', offerEndsAt: offer.windowEnd.toISOString() }
    : { state: 'trial_active', offerEndsAt: offer.trialEnd.toISOString() };
}

/**
 * A former-trial user who missed the offer window and still isn't paying —
 * shown the generic "see plans" upsell. Guarded so we never nag anyone with
 * active paid access (any plan) or who already redeemed the offer.
 */
async function isExpiredUpsellAudience(args: {
  prisma: PrismaClient;
  userId: string;
}): Promise<boolean> {
  const { prisma, userId } = args;
  const now = new Date();

  const trial = await prisma.subscription.findFirst({
    where: { userId, status: 'TRIAL' },
    orderBy: { currentPeriodEnd: 'desc' },
    select: { currentPeriodEnd: true },
  });
  if (!trial) return false; // never had a trial
  // Still inside the offer window? Then the resolver already handled it.
  if (now.getTime() <= trial.currentPeriodEnd.getTime() + OFFER_GRACE_MS) return false;

  const redeemed = await prisma.offerRedemption.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (redeemed) return false;

  // Any active paid access (any plan) → don't upsell a paying customer.
  const paid = await prisma.subscription.findFirst({
    where: {
      userId,
      status: { in: ['ACTIVE', 'PAST_DUE', 'CANCELLED'] },
      currentPeriodEnd: { gt: now },
    },
    select: { id: true },
  });
  if (paid) return false;

  return true;
}

/**
 * Single source of truth for the offer banner (Phase B) AND pricing page
 * (Phase C). Server-authoritative; the client only ticks the timer to
 * `offerEndsAt`. Returns `none` (nothing renders) when the offer is disabled.
 */
export async function resolveOfferBannerState(args: {
  prisma: PrismaClient;
  userId: string;
}): Promise<{ state: OfferBannerState; offerEndsAt: string | null }> {
  const { prisma, userId } = args;
  if (!isOfferEnabled()) return { state: 'none', offerEndsAt: null };

  // Suppress the offer if a discount would win at checkout (spec §3.4) — mirror
  // billing.initiatePayment / the old offer.getState.
  const platformPlan = await prisma.subscriptionPlan.findFirst({
    where: { type: 'PLATFORM', hidden: false, isActive: true },
    select: { price: true },
  });
  const pendingDiscount = platformPlan
    ? await resolveApplicableDiscount({
        prisma,
        userId,
        planType: 'PLATFORM',
        basePrice: platformPlan.price,
        enteredCode: null,
      })
    : null;

  const offer = await resolveApplicableOffer({
    prisma,
    userId,
    planType: 'PLATFORM',
    suppressForDiscount: pendingDiscount != null,
  });
  if (offer) return deriveOfferState(offer);

  // Offer not active — is this a lapsed-trial upsell target?
  if (await isExpiredUpsellAudience({ prisma, userId })) {
    return { state: 'expired', offerEndsAt: null };
  }
  return { state: 'none', offerEndsAt: null };
}
