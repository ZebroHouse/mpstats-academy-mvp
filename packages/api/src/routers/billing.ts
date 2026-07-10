import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure, superadminProcedure } from '../trpc';
import { isFeatureEnabled } from '../utils/feature-flags';
import { cancelCloudPaymentsSubscription } from '../utils/cloudpayments';
import { buildReceipt } from '@mpstats/shared';

/**
 * Billing tRPC router — 6 endpoints for subscription management.
 * All endpoints gated by billing_enabled feature flag.
 */
export const billingRouter = router({
  /**
   * Check if billing feature is enabled.
   * Public — used by frontend to conditionally show pricing UI.
   */
  isEnabled: publicProcedure.query(async () => {
    return isFeatureEnabled('billing_enabled');
  }),

  /**
   * Get courses list for pricing dropdown (public — no auth required).
   * Returns only id + title, no progress data.
   */
  getCourses: publicProcedure.query(async ({ ctx }) => {
    return ctx.prisma.course.findMany({
      where: { isHidden: false },
      select: { id: true, title: true },
      orderBy: { order: 'asc' },
    });
  }),

  /**
   * Get all active subscription plans.
   * Public — pricing page is visible to everyone.
   */
  getPlans: publicProcedure.query(async ({ ctx }) => {
    const enabled = await isFeatureEnabled('billing_enabled');
    if (!enabled) return [];

    return ctx.prisma.subscriptionPlan.findMany({
      where: { isActive: true, hidden: false },
      orderBy: { price: 'asc' },
    });
  }),

  /**
   * Get current user's subscription (most recent non-expired).
   */
  getSubscription: protectedProcedure.query(async ({ ctx }) => {
    const enabled = await isFeatureEnabled('billing_enabled');
    if (!enabled) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Billing is not enabled' });
    }

    return ctx.prisma.subscription.findFirst({
      where: {
        userId: ctx.user.id,
        status: { in: ['ACTIVE', 'TRIAL', 'PAST_DUE', 'CANCELLED', 'PENDING'] },
      },
      include: { plan: true, course: true },
      orderBy: { createdAt: 'desc' },
    });
  }),

  /**
   * Initiate payment: create PENDING subscription + payment record.
   * Frontend then opens CloudPayments widget with returned data.
   */
  initiatePayment: protectedProcedure
    .input(
      z.object({
        planType: z.enum(['COURSE', 'PLATFORM']),
        courseId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const enabled = await isFeatureEnabled('billing_enabled');
      if (!enabled) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Billing is not enabled' });
      }

      // Validate courseId requirements
      if (input.planType === 'COURSE' && !input.courseId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'courseId is required for COURSE plan',
        });
      }
      if (input.planType === 'PLATFORM' && input.courseId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'courseId must not be provided for PLATFORM plan',
        });
      }

      // Find public plan of requested type. With @unique dropped from
      // SubscriptionPlan.type to allow hidden test plans, the public plan
      // must be resolved by filtering hidden:false explicitly.
      const plan = await ctx.prisma.subscriptionPlan.findFirst({
        where: { type: input.planType, hidden: false, isActive: true },
      });
      if (!plan) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan not found or inactive' });
      }

      // Verify course exists if COURSE plan; capture title for receipt label
      let courseTitle: string | undefined;
      if (input.planType === 'COURSE' && input.courseId) {
        const course = await ctx.prisma.course.findUnique({
          where: { id: input.courseId },
          select: { title: true },
        });
        if (!course) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Course not found' });
        }
        courseTitle = course.title;
      }

      const now = new Date();

      // Check for existing subscription of same type for same course.
      // ACTIVE/PAST_DUE only block if still within billing period
      // (currentPeriodEnd > now). Otherwise the user has effectively
      // expired access (EXPIRED is computed lazily, not stored) and
      // should be allowed to subscribe again.
      //
      // TRIAL is intentionally NOT a blocker: the base trial is a PLATFORM
      // subscription (see createTrialSubscription), so counting it here made
      // every trial user unable to buy "Полный доступ" while the trial was
      // active. Paying converts a trial into a SEPARATE paid row (the trial
      // row is never mutated — see trial-subscription.ts invariant), and
      // handlePaymentSuccess stacks the paid period after the trial ends.
      const existing = await ctx.prisma.subscription.findFirst({
        where: {
          userId: ctx.user.id,
          plan: { type: input.planType },
          ...(input.courseId ? { courseId: input.courseId } : { courseId: null }),
          OR: [
            { status: 'PENDING' },
            { status: { in: ['ACTIVE', 'PAST_DUE'] }, currentPeriodEnd: { gt: now } },
          ],
        },
      });

      if (existing && existing.status !== 'PENDING') {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'You already have an active subscription for this plan',
        });
      }

      // Replace stale PENDING — user closed widget or payment failed
      if (existing?.status === 'PENDING') {
        await ctx.prisma.payment.deleteMany({
          where: { subscriptionId: existing.id },
        });
        await ctx.prisma.subscription.delete({
          where: { id: existing.id },
        });
      }

      // Create PENDING subscription
      const subscription = await ctx.prisma.subscription.create({
        data: {
          userId: ctx.user.id,
          planId: plan.id,
          courseId: input.courseId ?? null,
          status: 'PENDING',
          currentPeriodStart: now,
          currentPeriodEnd: now, // Will be set properly by webhook on payment success
        },
      });

      // Create PENDING payment
      await ctx.prisma.payment.create({
        data: {
          subscriptionId: subscription.id,
          amount: plan.price,
          status: 'PENDING',
        },
      });

      const receipt = buildReceipt({
        plan: { type: plan.type, intervalDays: plan.intervalDays },
        user: { email: ctx.user.email },
        amount: plan.price,
        courseTitle,
      });

      const description =
        input.planType === 'COURSE' && courseTitle
          ? `MPSTATS Academy — курс «${courseTitle}» (${plan.intervalDays} дней)`
          : `MPSTATS Academy — полный доступ (${plan.intervalDays} дней)`;

      return {
        subscriptionId: subscription.id,
        amount: plan.price,
        planName: plan.name,
        description,
        userId: ctx.user.id,
        receipt,
      };
    }),

  /**
   * SUPERADMIN: list hidden test plans (not exposed on /pricing).
   * Used by /admin/billing-test to drive prod CP smoke tests.
   */
  listTestPlans: superadminProcedure.query(async ({ ctx }) => {
    return ctx.prisma.subscriptionPlan.findMany({
      where: { hidden: true },
      orderBy: { createdAt: 'desc' },
    });
  }),

  /**
   * SUPERADMIN: initiate payment for a specific hidden plan by id.
   *
   * Mirrors initiatePayment but:
   *  - takes planId directly (not planType)
   *  - only resolves HIDDEN plans (refuses to charge against public plans
   *    via this route, so it can never be abused to bypass the normal flow)
   *  - PLATFORM-only (no courseId wiring), keeps the surface tiny
   */
  initiateTestPayment: superadminProcedure
    .input(z.object({ planId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const enabled = await isFeatureEnabled('billing_enabled');
      if (!enabled) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Billing is not enabled' });
      }

      const plan = await ctx.prisma.subscriptionPlan.findUnique({
        where: { id: input.planId },
      });
      if (!plan || !plan.isActive || !plan.hidden) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Hidden test plan not found or inactive',
        });
      }
      if (plan.type !== 'PLATFORM') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Test plans must be PLATFORM type',
        });
      }

      // Drop any stale PENDING of the same shape before creating a fresh one.
      const existing = await ctx.prisma.subscription.findFirst({
        where: {
          userId: ctx.user.id,
          status: 'PENDING',
          planId: plan.id,
        },
      });
      if (existing) {
        await ctx.prisma.payment.deleteMany({ where: { subscriptionId: existing.id } });
        await ctx.prisma.subscription.delete({ where: { id: existing.id } });
      }

      const now = new Date();
      const subscription = await ctx.prisma.subscription.create({
        data: {
          userId: ctx.user.id,
          planId: plan.id,
          courseId: null,
          status: 'PENDING',
          currentPeriodStart: now,
          currentPeriodEnd: now,
        },
      });
      await ctx.prisma.payment.create({
        data: {
          subscriptionId: subscription.id,
          amount: plan.price,
          status: 'PENDING',
        },
      });

      const receipt = buildReceipt({
        plan: { type: plan.type, intervalDays: plan.intervalDays },
        user: { email: ctx.user.email },
        amount: plan.price,
        labelOverride: `Тестовая операция — доступ к онлайн-платформе MPSTATS Academy, ${plan.intervalDays} дней`,
      });

      return {
        subscriptionId: subscription.id,
        amount: plan.price,
        planName: plan.name,
        description: `MPSTATS Academy — тестовая операция (${plan.price}₽)`,
        userId: ctx.user.id,
        intervalDays: plan.intervalDays,
        receipt,
      };
    }),

  /**
   * Get payment history for current user (excludes PENDING payments).
   */
  getPaymentHistory: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(20).default(10),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const enabled = await isFeatureEnabled('billing_enabled');
      if (!enabled) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Billing is not enabled' });
      }

      const limit = input?.limit ?? 10;

      return ctx.prisma.payment.findMany({
        where: {
          subscription: { userId: ctx.user.id },
          status: { not: 'PENDING' },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          subscription: {
            include: { plan: true, course: true },
          },
        },
      });
    }),

  /**
   * Cancel all ACTIVE subscriptions of the user.
   *
   * One user can end up with multiple ACTIVE rows in edge cases
   * (admin billing-test seeding, double-charge races, manual ops).
   * "Cancel" in the UI must mean "stop charging me, period" — so we
   * fan out across every ACTIVE sub, cancel on CP first for each
   * recurrent one, then flip the local row.
   *
   * If any CP cancel fails, we abort the whole operation with 500 so
   * state stays consistent (no half-cancelled-locally / still-active-in-CP).
   */
  cancelSubscription: protectedProcedure.mutation(async ({ ctx }) => {
    const enabled = await isFeatureEnabled('billing_enabled');
    if (!enabled) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Billing is not enabled' });
    }

    const subscriptions = await ctx.prisma.subscription.findMany({
      where: {
        userId: ctx.user.id,
        status: 'ACTIVE',
      },
    });
    if (subscriptions.length === 0) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'No active subscription found',
      });
    }

    // Phase 1: cancel CP-side for every recurrent. Abort on first failure
    // — we'd rather show an error than leave a half-applied state.
    for (const sub of subscriptions) {
      if (!sub.cpSubscriptionId) continue;
      const result = await cancelCloudPaymentsSubscription(sub.cpSubscriptionId);
      if (!result.ok) {
        console.error(
          `[Billing] cancelSubscription: CP cancel failed for sub=${sub.id} cp=${sub.cpSubscriptionId}: ${result.reason}`,
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message:
            'Не удалось отменить подписку на стороне платёжной системы. Попробуйте позже или напишите в поддержку.',
        });
      }
    }

    // Phase 2: flip every row locally in one transaction.
    const now = new Date();
    await ctx.prisma.subscription.updateMany({
      where: { id: { in: subscriptions.map((s) => s.id) } },
      data: { status: 'CANCELLED', cancelledAt: now },
    });

    // accessUntil = the latest period end across cancelled subs, so the
    // user sees the longest remaining access they paid for.
    const accessUntil = subscriptions.reduce(
      (latest, s) => (s.currentPeriodEnd > latest ? s.currentPeriodEnd : latest),
      subscriptions[0].currentPeriodEnd,
    );

    return {
      success: true,
      accessUntil,
      cancelledCount: subscriptions.length,
    };
  }),
});
