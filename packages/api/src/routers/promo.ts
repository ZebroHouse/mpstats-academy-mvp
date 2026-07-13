import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure, adminProcedure } from '../trpc';

const codeSchema = z.string().min(1).max(50).transform((s) => s.trim().toUpperCase());

/**
 * Promo code tRPC router.
 * Public: validate. Protected: activate. Admin: CRUD + activations list.
 */
export const promoRouter = router({
  /**
   * Validate a promo code without activating it.
   * Public — no auth required (used for instant feedback on /pricing).
   */
  validate: publicProcedure
    .input(z.object({ code: codeSchema }))
    .query(async ({ ctx, input }) => {
      const promo = await ctx.prisma.promoCode.findUnique({
        where: { code: input.code },
        select: {
          id: true,
          planType: true,
          courseId: true,
          durationDays: true,
          discountType: true,
          discountValue: true,
          isActive: true,
          expiresAt: true,
          maxUses: true,
          currentUses: true,
          course: { select: { title: true } },
        },
      });

      if (!promo || !promo.isActive) {
        return { valid: false as const, error: 'Промо-код не найден' };
      }
      if (promo.expiresAt && promo.expiresAt < new Date()) {
        return { valid: false as const, error: 'Срок действия промо-кода истёк' };
      }
      if (promo.currentUses >= promo.maxUses) {
        return { valid: false as const, error: 'Промо-код уже использован' };
      }

      const isDiscount = promo.discountType != null && promo.discountValue != null;
      return {
        valid: true as const,
        kind: isDiscount ? ('discount' as const) : ('duration' as const),
        planType: promo.planType,
        courseTitle: promo.course?.title || null,
        durationDays: promo.durationDays,
        discountType: promo.discountType,
        discountValue: promo.discountValue,
      };
    }),

  /**
   * Activate a promo code — creates subscription in a transaction.
   * Protected — user must be authenticated.
   *
   * Validation order per D-07:
   * 1. Code not found or inactive
   * 2. Expired
   * 3. Max uses reached
   * 4. Already used by this user
   * 5. Active subscription of same type exists
   */
  activate: protectedProcedure
    .input(z.object({ code: codeSchema }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;

      // Step 1: Find promo code
      const promo = await ctx.prisma.promoCode.findUnique({
        where: { code: input.code },
        include: { course: { select: { title: true } } },
      });
      if (!promo || !promo.isActive) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Промо-код не найден' });
      }

      // Discount codes are not "activated" — they are applied at payment time.
      if (promo.discountType != null) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Это скидочный код — примените его при оплате',
        });
      }

      // Step 2: Check expiration (per D-07)
      if (promo.expiresAt && promo.expiresAt < new Date()) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Срок действия промо-кода истёк' });
      }

      // Step 3: Check uses (per D-07)
      if (promo.currentUses >= promo.maxUses) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Промо-код уже использован' });
      }

      // Step 4: Check duplicate activation (per D-07)
      const existingActivation = await ctx.prisma.promoActivation.findUnique({
        where: { promoCodeId_userId: { promoCodeId: promo.id, userId } },
      });
      if (existingActivation) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Вы уже использовали этот промо-код' });
      }

      // Step 5: Check existing subscription of same type (per D-07)
      const now = new Date();
      const existingSub = await ctx.prisma.subscription.findFirst({
        where: {
          userId,
          status: 'ACTIVE',
          currentPeriodEnd: { gt: now },
          plan: { type: promo.planType },
          ...(promo.planType === 'COURSE' && promo.courseId ? { courseId: promo.courseId } : {}),
          ...(promo.planType === 'PLATFORM' ? { courseId: null } : {}),
        },
        include: { plan: true },
      });
      if (existingSub) {
        const msg =
          promo.planType === 'PLATFORM'
            ? 'У вас уже есть активная подписка'
            : 'У вас уже есть доступ к этому курсу';
        throw new TRPCError({ code: 'CONFLICT', message: msg });
      }

      // Find matching public subscription plan by type. @unique on type
      // was dropped to support hidden test plans — promo codes must only
      // bind against the public (non-hidden) plan of the requested type.
      const plan = await ctx.prisma.subscriptionPlan.findFirst({
        where: { type: promo.planType, hidden: false, isActive: true },
      });
      if (!plan) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Тарифный план не найден',
        });
      }

      // Steps 6-8: Transaction (per D-08)
      const periodStart = now;
      const periodEnd = new Date(now.getTime() + promo.durationDays * 24 * 60 * 60 * 1000);

      const result = await ctx.prisma.$transaction(async (tx) => {
        // Create subscription
        const subscription = await tx.subscription.create({
          data: {
            userId,
            planId: plan.id,
            courseId: promo.courseId,
            status: 'ACTIVE',
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            promoCodeId: promo.id,
          },
        });

        // Create activation record
        await tx.promoActivation.create({
          data: {
            promoCodeId: promo.id,
            userId,
            subscriptionId: subscription.id,
          },
        });

        // Increment uses
        await tx.promoCode.update({
          where: { id: promo.id },
          data: { currentUses: { increment: 1 } },
        });

        return subscription;
      });

      // Strip pending_promo from auth metadata so the (main) layout salvage net
      // doesn't loop the user back to /pricing on the next request, and so a
      // future promo-flow signup wouldn't incorrectly inherit a stale code.
      // Fire-and-forget — promo activation is the source of truth.
      ctx.prisma
        .$executeRaw`UPDATE auth.users SET raw_user_meta_data = raw_user_meta_data - 'pending_promo' WHERE id = ${userId}::uuid`
        .catch((err: unknown) =>
          console.error('[promo] failed to clear pending_promo for', userId, err),
        );

      // CQ event pa_promo_activated fired from frontend after successful response
      return {
        success: true,
        subscriptionId: result.id,
        planType: promo.planType,
        courseTitle: promo.course?.title || null,
        durationDays: promo.durationDays,
        accessUntil: periodEnd,
      };
    }),

  // ============== ADMIN PROCEDURES ==============

  /**
   * List all promo codes with activation counts.
   */
  getPromoCodes: adminProcedure.query(async ({ ctx }) => {
    return ctx.prisma.promoCode.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        course: { select: { id: true, title: true } },
        _count: { select: { activations: true } },
      },
    });
  }),

  /**
   * Create a new promo code.
   * Auto-generates code if not provided: PROMO-XXXXX.
   */
  createPromoCode: adminProcedure
    .input(
      z
        .object({
          code: z
            .string()
            .min(3)
            .max(50)
            .transform((s) => s.trim().toUpperCase())
            .optional(),
          planType: z.enum(['COURSE', 'PLATFORM']),
          courseId: z.string().optional(),
          durationDays: z.number().int().min(1).max(365).optional(),
          discountType: z.enum(['PERCENT', 'FIXED']).optional(),
          discountValue: z.number().int().positive().optional(),
          maxUses: z.number().int().min(1).max(100000).default(1),
          expiresAt: z.string().datetime().optional(),
        })
        .refine(
          (d) =>
            (d.durationDays != null) !==
            (d.discountType != null && d.discountValue != null),
          { message: 'Укажите либо длительность (дни), либо скидку (тип + значение) — но не оба' },
        )
        .refine(
          (d) => d.discountType !== 'PERCENT' || (d.discountValue ?? 0) <= 100,
          { message: 'Процент скидки не может превышать 100' },
        ),
    )
    .mutation(async ({ ctx, input }) => {
      // Validate courseId for COURSE type
      if (input.planType === 'COURSE' && !input.courseId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Выберите курс для типа COURSE' });
      }
      if (input.planType === 'PLATFORM' && input.courseId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'courseId не нужен для PLATFORM',
        });
      }

      // Auto-generate code if not provided
      const code =
        input.code ||
        `PROMO-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

      // Check uniqueness
      const existing = await ctx.prisma.promoCode.findUnique({ where: { code } });
      if (existing) {
        throw new TRPCError({ code: 'CONFLICT', message: `Код "${code}" уже существует` });
      }

      return ctx.prisma.promoCode.create({
        data: {
          code,
          planType: input.planType,
          courseId: input.courseId || null,
          durationDays: input.durationDays ?? 0,
          discountType: input.discountType ?? null,
          discountValue: input.discountValue ?? null,
          maxUses: input.maxUses,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          isActive: true,
          createdBy: ctx.user!.id,
        },
      });
    }),

  /**
   * Deactivate a promo code (soft delete).
   */
  deactivatePromoCode: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.promoCode.update({
        where: { id: input.id },
        data: { isActive: false },
      });
    }),

  /**
   * Get activations for a specific promo code.
   */
  getPromoActivations: adminProcedure
    .input(z.object({ promoCodeId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.promoActivation.findMany({
        where: { promoCodeId: input.promoCodeId },
        orderBy: { activatedAt: 'desc' },
        include: {
          user: { select: { id: true, name: true } },
          subscription: { select: { status: true, currentPeriodEnd: true } },
        },
      });
    }),
});
