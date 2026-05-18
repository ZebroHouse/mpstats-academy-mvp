import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { ensureUserProfile } from '../utils/ensure-user-profile';
import { handleDatabaseError } from '../utils/db-errors';

// Locked qualification keys (CONTEXT.md Data Model). z.enum whitelists reject
// tampered keys before they reach the DB (Security V5 / threat T-56-04).
const MARKETPLACES = ['WB', 'OZON', 'YANDEX', 'ALIEXPRESS', 'MEGAMARKET', 'OWN_SHOP', 'OTHER'] as const;
const GOALS = ['SALES', 'ADS', 'CONTENT', 'ANALYTICS', 'OPERATIONS', 'FINANCE', 'NEW_MARKETPLACE'] as const;
const EXPERIENCE = ['PROSPECTING', 'BEGINNER', 'STABLE', 'ADVANCED'] as const;

export const onboardingRouter = router({
  // Current qualification state — consumed by /profile (edit) and clients
  // that need to read where the user stands in the welcome flow.
  getState: protectedProcedure.query(async ({ ctx }) => {
    try {
      await ensureUserProfile(ctx.prisma, ctx.user);
      const profile = await ctx.prisma.userProfile.findUnique({
        where: { id: ctx.user.id },
        select: {
          onboardingCompletedAt: true,
          marketplaces: true,
          experienceLevel: true,
          goals: true,
          goalText: true,
        },
      });
      return profile;
    } catch (error) {
      handleDatabaseError(error);
    }
  }),

  // Single persistence point of the welcome wizard. Called once at the fork.
  // Hard `where: { id: ctx.user.id }` — userId from server session, never from
  // input (threat T-56-05). Marks onboarding done so the (main) guard stops
  // redirecting to /welcome.
  complete: protectedProcedure
    .input(
      z.object({
        marketplaces: z.array(z.enum(MARKETPLACES)).default([]),
        experienceLevel: z.enum(EXPERIENCE).nullable().optional(),
        goals: z.array(z.enum(GOALS)).default([]),
        goalText: z.string().trim().max(500).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await ensureUserProfile(ctx.prisma, ctx.user);
        const profile = await ctx.prisma.userProfile.update({
          where: { id: ctx.user.id },
          data: { ...input, onboardingCompletedAt: new Date() },
        });
        return profile;
      } catch (error) {
        handleDatabaseError(error);
      }
    }),
});
