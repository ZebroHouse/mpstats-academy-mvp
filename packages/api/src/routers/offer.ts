import { router, protectedProcedure } from '../trpc';
import { resolveApplicableOffer, type ResolvedOffer } from '../services/offer/resolve';
import { resolveApplicableDiscount } from '../services/discount/resolve';

export type OfferState = 'trial_active' | 'grace' | 'none';

/** Pure: turn a resolved offer into the banner/pricing display state. */
export function deriveOfferState(
  offer: ResolvedOffer | null,
): { state: OfferState; offerEndsAt: string | null } {
  if (!offer) return { state: 'none', offerEndsAt: null };
  return offer.inGrace
    ? { state: 'grace', offerEndsAt: offer.windowEnd.toISOString() }
    : { state: 'trial_active', offerEndsAt: offer.trialEnd.toISOString() };
}

export const offerRouter = router({
  /**
   * Shared contract for the offer banner (Phase B) and pricing page (Phase C).
   * Server is the source of truth; the client only ticks the timer to offerEndsAt.
   */
  getState: protectedProcedure.query(async ({ ctx }) => {
    // Suppress the offer if a discount would win at checkout (spec §3.4). Look up
    // a pending discount (no entered code — banner context) to stay consistent
    // with initiatePayment.
    const platformPlan = await ctx.prisma.subscriptionPlan.findFirst({
      where: { type: 'PLATFORM', hidden: false, isActive: true },
      select: { price: true },
    });
    const pendingDiscount = platformPlan
      ? await resolveApplicableDiscount({
          prisma: ctx.prisma,
          userId: ctx.user.id,
          planType: 'PLATFORM',
          basePrice: platformPlan.price,
          enteredCode: null,
        })
      : null;

    const offer = await resolveApplicableOffer({
      prisma: ctx.prisma,
      userId: ctx.user.id,
      planType: 'PLATFORM',
      suppressForDiscount: pendingDiscount != null,
    });
    return deriveOfferState(offer);
  }),
});
