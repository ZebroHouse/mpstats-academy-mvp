import { router, protectedProcedure } from '../trpc';
import { resolveOfferBannerState, deriveOfferState } from '../services/offer/banner-state';

// Re-exported so the existing pure unit test keeps its import path.
export { deriveOfferState };

export const offerRouter = router({
  /**
   * Shared contract for the offer banner (Phase B) and pricing page (Phase C).
   * Server is the source of truth; the client only ticks the timer to offerEndsAt.
   * Delegates to resolveOfferBannerState (same helper the (main) layout uses).
   */
  getState: protectedProcedure.query(async ({ ctx }) => {
    return resolveOfferBannerState({ prisma: ctx.prisma, userId: ctx.user.id });
  }),
});
