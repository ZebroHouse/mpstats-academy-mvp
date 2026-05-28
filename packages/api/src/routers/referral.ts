import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure, adminProcedure } from '../trpc';
import { prisma } from '@mpstats/db/client';
import { Prisma } from '@mpstats/db';
import { ReferralStatus } from '@mpstats/db';
import {
  activatePackage,
  PackageActivationError,
} from '../services/referral/activation';
import { generateAmbassadorCode } from '../services/referral/code-generator';
import { resolveReferralCode } from '../services/referral/code-resolver';

const AMB_CODE_SHAPE = /^[A-Z][A-Z0-9_]{0,15}-[A-Z0-9]{2,12}$/;

/**
 * Phase 60 — admin CRUD for AMBASSADOR referral codes.
 * Nested under `referral.admin.*` to keep top-level router intact.
 */
const adminCodesRouter = router({
  listAmbassadorCodes: adminProcedure
    .input(
      z.object({
        take: z.number().int().min(1).max(100).default(50),
        cursor: z.string().optional(),
        search: z.string().trim().max(100).optional(),
      }),
    )
    .query(async ({ input }) => {
      const where: Prisma.ReferralCodeWhereInput = { codeType: 'AMBASSADOR' };
      if (input.search) {
        const q = input.search;
        where.OR = [
          { code: { contains: q, mode: 'insensitive' } },
          { label: { contains: q, mode: 'insensitive' } },
        ];
      }
      const rows = await prisma.referralCode.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: input.take + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });
      const hasMore = rows.length > input.take;
      const pageRows = hasMore ? rows.slice(0, -1) : rows;

      // Compute per-code stats in parallel. N+1 is acceptable for v1 (<=100 per page).
      const items = await Promise.all(
        pageRows.map(async (code) => {
          const [activations, paidConvRows] = await Promise.all([
            prisma.referral.count({
              where: {
                codeId: code.id,
                status: { in: ['CONVERTED', 'PENDING_REVIEW'] },
              },
            }),
            prisma.$queryRaw<Array<{ count: bigint }>>`
              SELECT COUNT(DISTINCT s."userId")::bigint AS count
              FROM "Subscription" s
              INNER JOIN "Referral" r ON r."referredUserId" = s."userId"
              WHERE r."codeId" = ${code.id}
                AND s."cpSubscriptionId" IS NOT NULL
                AND s."status" = 'ACTIVE'
            `,
          ]);
          const paid_conversions = Number(paidConvRows[0]?.count ?? 0);
          return { ...code, activations, paid_conversions };
        }),
      );

      return {
        items,
        nextCursor: hasMore ? pageRows[pageRows.length - 1]?.id ?? null : null,
      };
    }),

  createAmbassadorCode: adminProcedure
    .input(
      z
        .object({
          label: z.string().trim().min(1).max(80),
          refereeTrialDays: z.number().int().min(1).max(365),
          maxUses: z.number().int().min(1).nullable().optional(),
          expiresAt: z
            .date()
            .nullable()
            .optional()
            .refine(
              (d) => d === null || d === undefined || d > new Date(),
              'expiresAt must be in the future',
            ),
          code: z.string().regex(AMB_CODE_SHAPE).optional(),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      const candidateCode = (input.code ?? generateAmbassadorCode()).toUpperCase();

      // Cross-table uniqueness: ReferralCode.code + UserProfile.referralCode.
      const [existsInCodes, existsInUsers] = await Promise.all([
        prisma.referralCode.findUnique({
          where: { code: candidateCode },
          select: { id: true },
        }),
        prisma.userProfile.findFirst({
          where: { referralCode: candidateCode },
          select: { id: true },
        }),
      ]);
      if (existsInCodes || existsInUsers) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Code already exists' });
      }

      return prisma.referralCode.create({
        data: {
          code: candidateCode,
          codeType: 'AMBASSADOR',
          label: input.label,
          refereeTrialDays: input.refereeTrialDays,
          maxUses: input.maxUses ?? null,
          expiresAt: input.expiresAt ?? null,
          isActive: true,
          createdByUserId: ctx.user.id,
        },
      });
    }),

  updateAmbassadorCode: adminProcedure
    .input(
      z
        .object({
          id: z.string().cuid(),
          label: z.string().trim().min(1).max(80).optional(),
          maxUses: z.number().int().min(1).nullable().optional(),
          expiresAt: z.date().nullable().optional(),
          isActive: z.boolean().optional(),
        })
        .strict(),
    )
    .mutation(async ({ input }) => {
      const data: Prisma.ReferralCodeUpdateInput = {};
      if (input.label !== undefined) data.label = input.label;
      if (input.maxUses !== undefined) data.maxUses = input.maxUses;
      if (input.expiresAt !== undefined) data.expiresAt = input.expiresAt;
      if (input.isActive !== undefined) data.isActive = input.isActive;

      try {
        return await prisma.referralCode.update({ where: { id: input.id }, data });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2025'
        ) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Code not found' });
        }
        throw err;
      }
    }),

  toggleAmbassadorCode: adminProcedure
    .input(z.object({ id: z.string().cuid(), isActive: z.boolean() }))
    .mutation(async ({ input }) => {
      try {
        return await prisma.referralCode.update({
          where: { id: input.id },
          data: { isActive: input.isActive },
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2025'
        ) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Code not found' });
        }
        throw err;
      }
    }),
});

export const referralRouter = router({
  getMyState: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;

    const [profile, totalReferred, totalConverted, pendingPackages, usedPackages] =
      await Promise.all([
        prisma.userProfile.findUnique({
          where: { id: userId },
          select: { referralCode: true },
        }),
        prisma.referral.count({ where: { referrerUserId: userId } }),
        prisma.referral.count({
          where: { referrerUserId: userId, status: 'CONVERTED' },
        }),
        prisma.referralBonusPackage.findMany({
          where: { ownerUserId: userId, status: 'PENDING' },
          orderBy: { issuedAt: 'desc' },
          select: { id: true, days: true, issuedAt: true, status: true, usedAt: true },
        }),
        prisma.referralBonusPackage.findMany({
          where: { ownerUserId: userId, status: 'USED' },
          orderBy: { usedAt: 'desc' },
          take: 10,
          select: { id: true, days: true, issuedAt: true, status: true, usedAt: true },
        }),
      ]);

    return {
      referralCode: profile?.referralCode ?? null,
      totalReferred,
      totalConverted,
      pendingPackages,
      usedPackages,
    };
  }),

  // PUBLIC — used by /register page where user is not yet authenticated.
  // Phase 60: returns code source + trialDays so the register banner can show
  // the correct day count for AMBASSADOR codes (which carry custom durations
  // per code) without leaking ambassador metadata beyond the public label.
  validateCode: publicProcedure
    .input(z.object({ code: z.string() }))
    .query(async ({ input }) => {
      const resolved = await resolveReferralCode(input.code);
      if (!resolved) {
        return { valid: false, referrerName: null, trialDays: null, type: null };
      }
      if (resolved.type === 'ambassador') {
        return {
          valid: true,
          referrerName: resolved.code.label,
          trialDays: resolved.code.refereeTrialDays,
          type: 'ambassador' as const,
        };
      }
      // type === 'user' — Phase 53A peer-to-peer code. trialDays for friend
      // is decided by the issuance orchestrator (i1=14, i2=7 via feature flag);
      // we expose null here and let the client fall back to its i1/i2 constant
      // so this endpoint stays read-only with no flag-eval cost.
      return {
        valid: true,
        referrerName: resolved.userProfile.name,
        trialDays: null,
        type: 'user' as const,
      };
    }),

  /**
   * Phase 53B: list referrals for admin moderation UI.
   * Default sort: createdAt DESC. Default filter: PENDING_REVIEW.
   * Search matches referrer or referred user name/email (case-insensitive contains).
   */
  adminList: adminProcedure
    .input(
      z.object({
        status: z.nativeEnum(ReferralStatus).nullable().optional(),
        search: z.string().trim().min(1).max(100).optional(),
        take: z.number().int().min(1).max(100).default(50),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ input }) => {
      const where: Prisma.ReferralWhereInput = {};
      if (input.status !== null && input.status !== undefined) {
        where.status = input.status;
      }
      if (input.search) {
        const q = input.search;
        where.OR = [
          { referrer: { name: { contains: q, mode: 'insensitive' } } },
          { referred: { name: { contains: q, mode: 'insensitive' } } },
        ];
      }
      const rows = await prisma.referral.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: input.take + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        include: {
          referrer: { select: { id: true, name: true } },
          referred: { select: { id: true, name: true } },
          bonusPackage: { select: { id: true, status: true, days: true } },
          reviewedBy: { select: { id: true, name: true } },
        },
      });
      const hasMore = rows.length > input.take;
      const items = hasMore ? rows.slice(0, -1) : rows;
      return {
        items,
        nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
      };
    }),

  /**
   * Aggregate count by status — for filter chip badges.
   */
  adminStatusCounts: adminProcedure.query(async () => {
    const groups = await prisma.referral.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    return Object.fromEntries(groups.map((g) => [g.status, g._count._all])) as Record<
      ReferralStatus,
      number
    >;
  }),

  activatePackage: protectedProcedure
    .input(z.object({ packageId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await activatePackage(input.packageId, ctx.user.id);
        return { ok: true };
      } catch (err) {
        if (err instanceof PackageActivationError) {
          const map: Record<string, 'NOT_FOUND' | 'FORBIDDEN' | 'BAD_REQUEST'> = {
            NOT_FOUND: 'NOT_FOUND',
            NOT_OWNER: 'FORBIDDEN',
            NOT_PENDING: 'BAD_REQUEST',
          };
          throw new TRPCError({
            code: map[err.code] ?? 'BAD_REQUEST',
            message: err.message,
          });
        }
        throw err;
      }
    }),

  admin: adminCodesRouter,
});
