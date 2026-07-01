import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { ensureUserProfile } from '../utils/ensure-user-profile';
import { handleDatabaseError } from '../utils/db-errors';
import { cqSetUserProps, cqTrackEvent } from '../utils/carrotquest';
import { sendAcademyLead } from '../utils/albato-lead';

// Locked qualification keys (CONTEXT.md Data Model). z.enum whitelists reject
// tampered keys before they reach the DB (Security V5 / threat T-56-04).
const MARKETPLACES = ['WB', 'OZON'] as const;
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

        // Atomically claim the first completion: only one concurrent request can
        // flip onboardingCompletedAt from null → now, so the completion event and
        // the amoCRM lead fire exactly once even under a double-submit (race-proof,
        // unlike a read-then-write guard). updateMany never throws on 0 matches, so
        // a profile re-edit (already onboarded) just claims nothing.
        const claim = await ctx.prisma.userProfile.updateMany({
          where: { id: ctx.user.id, onboardingCompletedAt: null },
          data: { onboardingCompletedAt: new Date() },
        });
        const wasFirstCompletion = claim.count === 1;

        // Persist qualification on every call (incl. profile re-edits). onboarding-
        // CompletedAt is owned by the atomic claim above, so it is not set here.
        const profile = await ctx.prisma.userProfile.update({
          where: { id: ctx.user.id },
          data: { ...input },
        });

        // Mirror qualification to CarrotQuest — best-effort, never blocks
        // onboarding. The DB write above is already committed.
        try {
          await cqSetUserProps(ctx.user.id, {
            pa_marketplaces: input.marketplaces.join(', '),
            pa_experience: input.experienceLevel ?? '',
            pa_goals: input.goals.join(', '),
            pa_goal_text: input.goalText ?? '',
          });
          if (wasFirstCompletion) {
            await cqTrackEvent(ctx.user.id, 'pa_onboarding_completed');
          }
        } catch (cqError) {
          console.error(
            '[onboarding.complete] CarrotQuest mirror failed:',
            cqError,
          );
        }

        // Send the registration lead to amoCRM (via Albato) — best-effort, fires
        // exactly once (gated on wasFirstCompletion). The unskippable wizard means
        // every registered user reaches here, so this is the canonical lead event.
        // Extra reads (referral, trial) are scoped inside this block so they only
        // run on first completion and a failure never blocks/fails onboarding.
        //
        // Partner-origin users (MPSTATS seamless-entry, user_metadata.partner_source
        // === 'mpstats') are NOT sent to amoCRM — they are partner traffic, not
        // platform leads. They stay logged on our side: CarrotQuest (pa_partner_entry
        // + pa_partner_source at entry time) and queryable in auth.users metadata.
        const isPartnerUser = ctx.user.user_metadata?.partner_source === 'mpstats';
        if (wasFirstCompletion && !isPartnerUser) {
          try {
            const [referral, trialSub] = await Promise.all([
              ctx.prisma.referral.findUnique({
                where: { referredUserId: ctx.user.id },
                select: { code: true },
              }),
              ctx.prisma.subscription.findFirst({
                where: { userId: ctx.user.id, status: 'TRIAL' },
                orderBy: { currentPeriodEnd: 'desc' },
                select: { currentPeriodEnd: true },
              }),
            ]);

            await sendAcademyLead({
              userId: ctx.user.id,
              name: profile.name,
              phone: profile.phone,
              email: ctx.user.email ?? null,
              yandexId: profile.yandexId,
              referralCode: referral?.code ?? null,
              marketplaces: input.marketplaces,
              experienceLevel: input.experienceLevel ?? null,
              goals: input.goals,
              goalText: input.goalText ?? null,
              trialEndsAt: trialSub?.currentPeriodEnd ?? null,
              registeredAt: profile.createdAt,
              now: new Date(),
            });
          } catch (leadError) {
            console.error('[onboarding.complete] Albato lead failed:', leadError);
          }
        }

        return profile;
      } catch (error) {
        handleDatabaseError(error);
      }
    }),
});
