/**
 * Admin Analytics sub-router — Phase 63.
 *
 * Groups platform-analytics procedures previously inlined in admin.ts:
 *   - getAnalytics       (user growth + diagnostic activity per day)
 *   - getActiveUserStats (DAU/WAU/MAU + stickiness)
 *   - getWatchStats      (video watch engagement)
 *
 * Mounted under `admin.analytics.*`. Revenue (Wave 2) and funnel (Wave 3)
 * procedures will be added here.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { Prisma } from '@mpstats/db';
import { router, adminProcedure, analyticsClientsProcedure } from '../trpc';
import { handleDatabaseError } from '../utils/db-errors';
import { mapActiveUserStats, type ActiveUserDayRow } from '../utils/active-user-stats';
import { computeRevenueOverview, computeUpcomingRenewals, groupRevenueByDay } from '../utils/revenue-metrics';
import { deriveTrialConversion } from '../utils/trial-conversion';
import { computeConversionFunnel, churnRate, type FunnelUserRow } from '../utils/funnel-metrics';
import { extractCheckpoints, tallyCheckpoints } from '../utils/checkpoint-analytics';
import { assembleReferralFunnel } from '../utils/referral-funnel';
import { fetchClientRegistry } from '../services/sales-registry';

/**
 * Pulls a valid checkpointChoices map out of a persisted `progressState`.
 * Returns null for anything malformed (null, wrong type, version !== 1,
 * missing/non-object checkpointChoices) so callers can skip it.
 */
function checkpointChoicesOf(progressState: unknown): Record<string, string> | null {
  if (typeof progressState !== 'object' || progressState === null) return null;
  const state = progressState as { version?: unknown; checkpointChoices?: unknown };
  if (state.version !== 1) return null;
  const choices = state.checkpointChoices;
  if (typeof choices !== 'object' || choices === null || Array.isArray(choices)) return null;
  return choices as Record<string, string>;
}

export const adminAnalyticsRouter = router({
  /**
   * Analytics: user growth and diagnostic activity grouped by day for a given period.
   */
  getAnalytics: adminProcedure
    .input(z.object({
      days: z.number().int().min(1).max(90).default(7),
      from: z.date().optional(),
      to: z.date().optional(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const to = input.to ?? new Date();
        const from = input.from ?? new Date(to.getTime() - input.days * 24 * 60 * 60 * 1000);
        if ((to.getTime() - from.getTime()) / 86_400_000 > 366) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Диапазон не больше 366 дней' });
        }

        // Generate each UTC calendar day in [from .. to] inclusive.
        const dates: string[] = [];
        const cur = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
        const endKey = to.toISOString().split('T')[0];
        while (cur.toISOString().split('T')[0] <= endKey) {
          dates.push(cur.toISOString().split('T')[0]);
          cur.setUTCDate(cur.getUTCDate() + 1);
        }

        // Query registrations
        const users = await ctx.prisma.userProfile.findMany({
          where: { createdAt: { gte: from, lte: to } },
          select: { createdAt: true },
        });

        // Query completed diagnostics
        const diagnostics = await ctx.prisma.diagnosticSession.findMany({
          where: {
            status: 'COMPLETED',
            completedAt: { gte: from, lte: to },
          },
          select: { completedAt: true },
        });

        // Group by date
        const userGrowthMap = new Map<string, number>();
        const activityMap = new Map<string, number>();
        dates.forEach((d) => {
          userGrowthMap.set(d, 0);
          activityMap.set(d, 0);
        });

        users.forEach((u) => {
          const key = u.createdAt.toISOString().split('T')[0];
          if (userGrowthMap.has(key)) {
            userGrowthMap.set(key, (userGrowthMap.get(key) || 0) + 1);
          }
        });

        diagnostics.forEach((d) => {
          if (d.completedAt) {
            const key = d.completedAt.toISOString().split('T')[0];
            if (activityMap.has(key)) {
              activityMap.set(key, (activityMap.get(key) || 0) + 1);
            }
          }
        });

        const userGrowth = dates.map((date) => ({ date, count: userGrowthMap.get(date) || 0 }));
        const activity = dates.map((date) => ({ date, count: activityMap.get(date) || 0 }));

        return { userGrowth, activity };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        handleDatabaseError(error);
      }
    }),

  /**
   * Active-user analytics: per-day DAU / WAU / MAU + stickiness over a window.
   *
   * Source of truth = "UserActivityDay" (one row per user per UTC calendar day).
   * For each day d in [today-(days-1) .. today]:
   *   dau(d) = distinct users active ON d
   *   wau(d) = distinct users active in [d-6 .. d]   (rolling 7-day)
   *   mau(d) = distinct users active in [d-29 .. d]  (rolling 30-day)
   * Counts are cast ::int to avoid BigInt serialization issues.
   *
   * `current` = last day's metrics; `previous` = the first day's metrics in the
   * window (baseline for trend deltas). `days` is clamped 1..90 → safe to embed,
   * but date math is still parameterized.
   */
  getActiveUserStats: adminProcedure
    .input(z.object({
      days: z.number().int().min(1).max(90).default(30),
      from: z.date().optional(),
      to: z.date().optional(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const to = input.to ?? new Date();
        const from = input.from ?? new Date(to.getTime() - input.days * 24 * 60 * 60 * 1000);
        if ((to.getTime() - from.getTime()) / 86_400_000 > 366) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Диапазон не больше 366 дней' });
        }

        // generate_series of UTC calendar days across [from .. to], then a rolling
        // distinct-count per day. $1 = from (start day), $2 = to (end day); both
        // cast ::date so the day math and BETWEEN windows stay in UTC calendar days.
        const rows = await ctx.prisma.$queryRawUnsafe<
          Array<{ date: string; dau: number; wau: number; mau: number }>
        >(
          `
          WITH day_series AS (
            SELECT gs::date AS d
            FROM generate_series($1::date, $2::date, interval '1 day') AS gs
          )
          SELECT
            to_char(ds.d, 'YYYY-MM-DD') AS date,
            (SELECT COUNT(DISTINCT a."userId")::int
               FROM "UserActivityDay" a
              WHERE a."day" = ds.d) AS dau,
            (SELECT COUNT(DISTINCT a."userId")::int
               FROM "UserActivityDay" a
              WHERE a."day" BETWEEN ds.d - 6 AND ds.d) AS wau,
            (SELECT COUNT(DISTINCT a."userId")::int
               FROM "UserActivityDay" a
              WHERE a."day" BETWEEN ds.d - 29 AND ds.d) AS mau
          FROM day_series ds
          ORDER BY ds.d ASC
          `,
          from,
          to,
        );

        // Numeric coercion guard: ::int may surface as number already, but
        // normalize defensively before the pure mapper.
        const normalized: ActiveUserDayRow[] = rows.map((r) => ({
          date: r.date,
          dau: Number(r.dau),
          wau: Number(r.wau),
          mau: Number(r.mau),
        }));

        return mapActiveUserStats(normalized);
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        handleDatabaseError(error);
      }
    }),

  /**
   * Watch engagement stats: avg watch %, total sessions, completion rate,
   * per-course breakdown, and top 5 active users.
   */
  getWatchStats: adminProcedure.query(async ({ ctx }) => {
    try {
      // All lesson progress records with any watch activity
      const allProgress = await ctx.prisma.lessonProgress.findMany({
        where: { watchedPercent: { gt: 0 } },
        include: {
          lesson: {
            include: { course: { select: { id: true, title: true } } },
          },
          path: { select: { userId: true } },
        },
      });

      // KPI: avg watch percent
      const avgWatchPercent = allProgress.length > 0
        ? Math.round(allProgress.reduce((sum, p) => sum + p.watchedPercent, 0) / allProgress.length)
        : 0;

      // KPI: total watch sessions
      const totalWatchSessions = allProgress.length;

      // KPI: completion rate (started -> completed)
      const completedCount = allProgress.filter((p) => p.status === 'COMPLETED').length;
      const completionRate = totalWatchSessions > 0
        ? Math.round((completedCount / totalWatchSessions) * 100)
        : 0;

      // Per-course engagement
      const courseMap = new Map<string, {
        courseId: string;
        courseTitle: string;
        totalPercent: number;
        startedCount: number;
        completedCount: number;
      }>();

      for (const p of allProgress) {
        const courseId = p.lesson.course.id;
        const courseTitle = p.lesson.course.title;
        const existing = courseMap.get(courseId) || {
          courseId,
          courseTitle,
          totalPercent: 0,
          startedCount: 0,
          completedCount: 0,
        };
        existing.totalPercent += p.watchedPercent;
        existing.startedCount += 1;
        if (p.status === 'COMPLETED') existing.completedCount += 1;
        courseMap.set(courseId, existing);
      }

      const courseEngagement = Array.from(courseMap.values()).map((c) => ({
        courseId: c.courseId,
        courseTitle: c.courseTitle,
        avgPercent: Math.round(c.totalPercent / c.startedCount),
        startedCount: c.startedCount,
        completedCount: c.completedCount,
      }));

      // Top 5 active users
      const userMap = new Map<string, { userId: string; lessonsWatched: number; lessonsCompleted: number; totalPercent: number }>();
      for (const p of allProgress) {
        const userId = p.path.userId;
        const existing = userMap.get(userId) || { userId, lessonsWatched: 0, lessonsCompleted: 0, totalPercent: 0 };
        existing.lessonsWatched += 1;
        if (p.status === 'COMPLETED') existing.lessonsCompleted += 1;
        existing.totalPercent += p.watchedPercent;
        userMap.set(userId, existing);
      }

      const topUserIds = Array.from(userMap.values())
        .sort((a, b) => b.lessonsWatched - a.lessonsWatched)
        .slice(0, 5);

      // Fetch user names
      const userProfiles = topUserIds.length > 0
        ? await ctx.prisma.userProfile.findMany({
            where: { id: { in: topUserIds.map((u) => u.userId) } },
            select: { id: true, name: true },
          })
        : [];

      const nameMap = new Map(userProfiles.map((u) => [u.id, u.name]));

      // Fetch emails from auth.users for the top 5
      const emailMap = new Map<string, string>();
      if (topUserIds.length > 0) {
        try {
          const rows = await ctx.prisma.$queryRawUnsafe<Array<{ id: string; email: string | null }>>(
            `SELECT id::text AS id, email FROM auth.users WHERE id IN (${topUserIds.map((_, i) => `$${i + 1}::uuid`).join(',')})`,
            ...topUserIds.map((u) => u.userId),
          );
          rows.forEach((r) => {
            if (r.email) emailMap.set(r.id, r.email);
          });
        } catch {
          // emails won't be shown if query fails
        }
      }

      const topActiveUsers = topUserIds.map((u) => ({
        userId: u.userId,
        name: nameMap.get(u.userId) || 'Unknown',
        email: emailMap.get(u.userId) || null,
        lessonsWatched: u.lessonsWatched,
        lessonsCompleted: u.lessonsCompleted,
        avgPercent: Math.round(u.totalPercent / u.lessonsWatched),
      }));

      return {
        avgWatchPercent,
        totalWatchSessions,
        completionRate,
        courseEngagement,
        topActiveUsers,
      };
    } catch (error) {
      handleDatabaseError(error);
    }
  }),

  /** Revenue overview: paying base, MRR, ARPU, plan split. Excludes test users. */
  getRevenueOverview: adminProcedure.query(async ({ ctx }) => {
    try {
      const subs = await ctx.prisma.subscription.findMany({
        where: { status: { in: ['ACTIVE', 'TRIAL'] } },
        select: {
          userId: true,
          status: true,
          currentPeriodEnd: true,
          cpSubscriptionId: true,
          plan: { select: { type: true, price: true, hidden: true } },
          user: { select: { isTest: true } },
        },
      });
      return computeRevenueOverview(subs as never, new Date());
    } catch (error) {
      handleDatabaseError(error);
    }
  }),

  /** Upcoming recurrent renewals within `days`. Returns enriched rows + total. */
  getUpcomingRenewals: adminProcedure
    .input(z.object({ days: z.number().int().min(1).max(90).default(30) }))
    .query(async ({ ctx, input }) => {
      try {
        const now = new Date();
        const windowEnd = new Date(now.getTime() + input.days * 24 * 60 * 60 * 1000);

        const subs = await ctx.prisma.subscription.findMany({
          where: { status: 'ACTIVE', cpSubscriptionId: { not: null }, currentPeriodEnd: { gte: now, lte: windowEnd } },
          select: {
            userId: true,
            status: true,
            currentPeriodEnd: true,
            cpSubscriptionId: true,
            plan: { select: { type: true, price: true, hidden: true } },
            user: { select: { isTest: true } },
          },
        });

        const { rows, totalExpected } = computeUpcomingRenewals(subs as never, now, windowEnd);

        // Enrich with name + email (same pattern as getWatchStats).
        const userIds = [...new Set(rows.map((r) => r.userId))];
        const profiles = userIds.length
          ? await ctx.prisma.userProfile.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
          : [];
        const nameMap = new Map(profiles.map((p) => [p.id, p.name]));
        const emailMap = new Map<string, string>();
        if (userIds.length) {
          try {
            const r = await ctx.prisma.$queryRawUnsafe<Array<{ id: string; email: string | null }>>(
              `SELECT id::text AS id, email FROM auth.users WHERE id IN (${userIds.map((_, i) => `$${i + 1}::uuid`).join(',')})`,
              ...userIds,
            );
            r.forEach((row) => { if (row.email) emailMap.set(row.id, row.email); });
          } catch { /* emails optional */ }
        }

        return {
          rows: rows.map((r) => ({
            ...r,
            name: nameMap.get(r.userId) ?? 'Unknown',
            email: emailMap.get(r.userId) ?? null,
          })),
          totalExpected,
        };
      } catch (error) {
        handleDatabaseError(error);
      }
    }),

  /** Actual cash-in: COMPLETED payments per day within `days`. Excludes test users. */
  getActualRevenue: adminProcedure
    .input(z.object({
      days: z.number().int().min(1).max(90).default(30),
      from: z.date().optional(),
      to: z.date().optional(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const to = input.to ?? new Date();
        const from = input.from ?? new Date(to.getTime() - input.days * 24 * 60 * 60 * 1000);
        if ((to.getTime() - from.getTime()) / 86_400_000 > 366) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Диапазон не больше 366 дней' });
        }
        const payments = await ctx.prisma.payment.findMany({
          where: { status: 'COMPLETED', paidAt: { gte: from, lte: to } },
          select: {
            paidAt: true,
            amount: true,
            subscription: {
              select: { plan: { select: { hidden: true } }, user: { select: { isTest: true } } },
            },
          },
        });
        // paidAt is nullable in schema but COMPLETED rows have it; filter defensively.
        const rows = payments.filter((p) => p.paidAt != null);
        // Pass the window so an empty period renders a flat zero line, not a blank chart.
        return groupRevenueByDay(rows as never, { from, to });
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        handleDatabaseError(error);
      }
    }),

  /** Registration → diagnostic → paid conversion within `days`. Excludes test users. */
  getConversionFunnel: adminProcedure
    .input(z.object({
      days: z.number().int().min(1).max(90).default(30),
      from: z.date().optional(),
      to: z.date().optional(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const to = input.to ?? new Date();
        const from = input.from ?? new Date(to.getTime() - input.days * 24 * 60 * 60 * 1000);
        if ((to.getTime() - from.getTime()) / 86_400_000 > 366) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Диапазон не больше 366 дней' });
        }

        const registered = await ctx.prisma.userProfile.findMany({
          where: { createdAt: { gte: from, lte: to }, isTest: false },
          select: { id: true },
        });
        const ids = registered.map((u) => u.id);
        if (ids.length === 0) return computeConversionFunnel([]);

        const diagUsers = await ctx.prisma.diagnosticSession.findMany({
          where: { status: 'COMPLETED', userId: { in: ids } },
          select: { userId: true },
          distinct: ['userId'],
        });
        const diagSet = new Set(diagUsers.map((d) => d.userId));

        const paidRows = await ctx.prisma.payment.findMany({
          where: { status: 'COMPLETED', subscription: { userId: { in: ids }, user: { isTest: false }, plan: { hidden: false } } },
          select: { subscription: { select: { userId: true } } },
        });
        const paidSet = new Set(paidRows.map((p) => p.subscription.userId));

        const rows: FunnelUserRow[] = ids.map((id) => ({
          userId: id,
          completedDiagnostic: diagSet.has(id),
          paid: paidSet.has(id),
        }));
        return computeConversionFunnel(rows);
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        handleDatabaseError(error);
      }
    }),

  /** Accurate trial→paid, derived from TRIAL rows + COMPLETED payments. */
  getTrialConversion: adminProcedure
    .input(z.object({
      days: z.number().int().min(1).max(90).default(90),
      from: z.date().optional(),
      to: z.date().optional(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const to = input.to ?? new Date();
        const from = input.from ?? new Date(to.getTime() - input.days * 24 * 60 * 60 * 1000);
        if ((to.getTime() - from.getTime()) / 86_400_000 > 366) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Диапазон не больше 366 дней' });
        }

        const trials = await ctx.prisma.subscription.findMany({
          where: { status: 'TRIAL', currentPeriodStart: { gte: from, lte: to } },
          select: {
            userId: true,
            currentPeriodStart: true,
            currentPeriodEnd: true,
            user: { select: { isTest: true } },
            plan: { select: { hidden: true } },
          },
        });

        const payments = await ctx.prisma.payment.findMany({
          where: { status: 'COMPLETED' },
          select: {
            paidAt: true,
            subscription: { select: { userId: true, user: { select: { isTest: true } }, plan: { select: { hidden: true } } } },
          },
        });

        const trialRows = trials.map((t) => ({
          userId: t.userId,
          trialStart: t.currentPeriodStart,
          trialEnd: t.currentPeriodEnd,
          user: t.user,
          plan: t.plan,
        }));
        const paymentRows = payments
          .filter((p) => p.paidAt != null)
          .map((p) => ({
            userId: p.subscription.userId,
            paidAt: p.paidAt as Date,
            subscription: { user: p.subscription.user, plan: p.subscription.plan },
          }));

        return deriveTrialConversion(trialRows, paymentRows, new Date());
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        handleDatabaseError(error);
      }
    }),

  /** Churn over `days`: cancellations, current PAST_DUE, approx churn rate. */
  getChurn: adminProcedure
    .input(z.object({
      days: z.number().int().min(1).max(90).default(30),
      from: z.date().optional(),
      to: z.date().optional(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const to = input.to ?? new Date();
        const from = input.from ?? new Date(to.getTime() - input.days * 24 * 60 * 60 * 1000);
        if ((to.getTime() - from.getTime()) / 86_400_000 > 366) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Диапазон не больше 366 дней' });
        }
        const now = new Date();
        const notTest = { user: { isTest: false }, plan: { hidden: false } };

        const [cancelled, pastDue, activeBase] = await Promise.all([
          ctx.prisma.subscription.count({ where: { status: 'CANCELLED', cancelledAt: { gte: from, lte: to }, ...notTest } }),
          ctx.prisma.subscription.count({ where: { status: 'PAST_DUE', ...notTest } }),
          ctx.prisma.subscription.count({ where: { status: 'ACTIVE', currentPeriodEnd: { gt: now }, ...notTest } }),
        ]);

        return { cancelled, pastDue, activeBase, churnRate: churnRate(cancelled, activeBase) };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        handleDatabaseError(error);
      }
    }),

  /** Revenue source: referred vs organic paying users within `days`. */
  getAttribution: adminProcedure
    .input(z.object({
      days: z.number().int().min(1).max(90).default(30),
      from: z.date().optional(),
      to: z.date().optional(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const to = input.to ?? new Date();
        const from = input.from ?? new Date(to.getTime() - input.days * 24 * 60 * 60 * 1000);
        if ((to.getTime() - from.getTime()) / 86_400_000 > 366) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Диапазон не больше 366 дней' });
        }

        const paidRows = await ctx.prisma.payment.findMany({
          where: { status: 'COMPLETED', paidAt: { gte: from, lte: to }, subscription: { user: { isTest: false }, plan: { hidden: false } } },
          select: { amount: true, subscription: { select: { userId: true } } },
        });

        const userIds = [...new Set(paidRows.map((p) => p.subscription.userId))];
        const referredRows = userIds.length
          ? await ctx.prisma.referral.findMany({ where: { referredUserId: { in: userIds } }, select: { referredUserId: true } })
          : [];
        const referredSet = new Set(referredRows.map((r) => r.referredUserId));

        const acc = { referred: { users: new Set<string>(), revenue: 0 }, organic: { users: new Set<string>(), revenue: 0 } };
        for (const p of paidRows) {
          const uid = p.subscription.userId;
          const bucket = referredSet.has(uid) ? acc.referred : acc.organic;
          bucket.users.add(uid);
          bucket.revenue += p.amount;
        }
        return {
          referred: { users: acc.referred.users.size, revenue: acc.referred.revenue },
          organic: { users: acc.organic.users.size, revenue: acc.organic.revenue },
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        handleDatabaseError(error);
      }
    }),

  /**
   * Per-ambassador-code funnel: Clicks → Registrations → Onboarded → Sales,
   * with conversion %, plus an aggregate per-day series for charting. Clicks are
   * counted going-forward only (ReferralCodeClickDay); registrations/sales come
   * from existing Referral + Payment data. Test users excluded throughout.
   */
  getReferralFunnel: adminProcedure
    .input(z.object({
      days: z.number().int().min(1).max(365).default(30),
      from: z.date().optional(),
      to: z.date().optional(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        // Single [from .. to] window used for ALL three stages (clicks,
        // registrations, sales) so the funnel and the per-day series align on the
        // same days — clicks are stored as @db.Date, the rest as timestamps; both
        // compare fine against Date bounds.
        const to = input.to ?? new Date();
        const from = input.from ?? new Date(to.getTime() - input.days * 24 * 60 * 60 * 1000);
        if ((to.getTime() - from.getTime()) / 86_400_000 > 366) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Диапазон не больше 366 дней' });
        }

        const codes = await ctx.prisma.referralCode.findMany({
          where: { codeType: 'AMBASSADOR' },
          select: { id: true, code: true, label: true, landingTarget: true },
        });
        const codeIds = codes.map((c) => c.id);

        const [clickSums, clickDays, referrals, payments, checkouts] = await Promise.all([
          ctx.prisma.referralCodeClickDay.groupBy({
            by: ['codeId'],
            where: { day: { gte: from, lte: to } },
            _sum: { count: true },
          }),
          ctx.prisma.referralCodeClickDay.groupBy({
            by: ['day'],
            where: { day: { gte: from, lte: to } },
            _sum: { count: true },
          }),
          codeIds.length
            ? ctx.prisma.referral.findMany({
                where: { codeId: { in: codeIds }, createdAt: { gte: from, lte: to } },
                select: {
                  codeId: true,
                  referredUserId: true,
                  createdAt: true,
                  referred: { select: { isTest: true, onboardingCompletedAt: true } },
                },
              })
            : [],
          ctx.prisma.payment.findMany({
            where: {
              status: 'COMPLETED',
              paidAt: { gte: from, lte: to },
              subscription: { user: { isTest: false }, plan: { hidden: false } },
            },
            select: { paidAt: true, subscription: { select: { userId: true } } },
          }),
          ctx.prisma.checkoutAttempt.findMany({
            where: { createdAt: { gte: from, lte: to }, userId: { not: null } },
            select: { userId: true },
            distinct: ['userId'],
          }),
        ]);

        return assembleReferralFunnel({
          codes,
          clicksByCode: clickSums.map((c) => ({ codeId: c.codeId, clicks: c._sum.count ?? 0 })),
          clicksByDay: clickDays.map((c) => ({
            day: c.day.toISOString().slice(0, 10),
            clicks: c._sum.count ?? 0,
          })),
          referrals: referrals.map((r) => ({
            codeId: r.codeId as string,
            referredUserId: r.referredUserId,
            createdAt: r.createdAt,
            isTest: r.referred?.isTest ?? false,
            onboarded: r.referred?.onboardingCompletedAt != null,
          })),
          payments: payments
            .filter((p) => p.paidAt != null)
            .map((p) => ({ userId: p.subscription.userId, paidAt: p.paidAt as Date })),
          checkoutUserIds: checkouts
            .map((c) => c.userId)
            .filter((u): u is string => !!u),
        });
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        handleDatabaseError(error);
      }
    }),

  /**
   * Sales client registry for a registration-date range: contact, acquisition
   * source, and payment status per registered user. Powers the «Клиенты» tab and
   * shares its fetch with the CSV export route. Test users excluded.
   */
  getClientRegistry: analyticsClientsProcedure
    .input(
      z.object({
        from: z.date().optional(),
        to: z.date().optional(),
        dateField: z.enum(['registration', 'payment']).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        const to = input.to ?? new Date();
        const from = input.from ?? new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
        const MAX_DAYS = 366;
        if ((to.getTime() - from.getTime()) / 86_400_000 > MAX_DAYS) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Диапазон не больше 366 дней' });
        }
        const rows = await fetchClientRegistry(ctx.prisma, { from, to, dateField: input.dateField });
        return { rows, total: rows.length };
      } catch (error) {
        handleDatabaseError(error);
      }
    }),

  /**
   * Lists text/interactive lessons that contain at least one checkpoint, with a
   * per-lesson count of non-test students who answered any checkpoint. Sorted
   * by respondentCount desc, then title asc. Powers the checkpoint dashboard's
   * lesson picker (Phase C).
   */
  listInteractiveLessons: adminProcedure.query(async ({ ctx }) => {
    try {
      const lessons = await ctx.prisma.lesson.findMany({
        where: { contentType: { in: ['TEXT', 'INTERACTIVE'] } },
        select: {
          id: true,
          title: true,
          isHidden: true,
          body: true,
          course: { select: { title: true } },
        },
      });

      const withCheckpoints = lessons.filter((l) => extractCheckpoints(l.body).length > 0);
      if (withCheckpoints.length === 0) return [];

      const ids = withCheckpoints.map((l) => l.id);
      const progress = await ctx.prisma.lessonProgress.findMany({
        where: { lessonId: { in: ids }, progressState: { not: Prisma.DbNull } },
        select: {
          lessonId: true,
          progressState: true,
          path: { select: { user: { select: { isTest: true } } } },
        },
      });

      // Count non-test respondents (≥1 checkpoint choice) per lesson.
      const respondents = new Map<string, number>();
      for (const row of progress) {
        if (row.path?.user?.isTest === true) continue;
        const choices = checkpointChoicesOf(row.progressState);
        if (!choices || Object.keys(choices).length === 0) continue;
        respondents.set(row.lessonId, (respondents.get(row.lessonId) ?? 0) + 1);
      }

      return withCheckpoints
        .map((l) => ({
          lessonId: l.id,
          title: l.title,
          courseTitle: l.course?.title ?? '',
          isHidden: l.isHidden,
          respondentCount: respondents.get(l.id) ?? 0,
        }))
        .sort((a, b) => b.respondentCount - a.respondentCount || a.title.localeCompare(b.title));
    } catch (error) {
      handleDatabaseError(error);
    }
  }),

  /**
   * Per-checkpoint answer distribution for one lesson, excluding test users.
   * NOT_FOUND if the lesson is missing.
   */
  getCheckpointAnalytics: adminProcedure
    .input(z.object({ lessonId: z.string() }))
    .query(async ({ ctx, input }) => {
      try {
        const lesson = await ctx.prisma.lesson.findUnique({
          where: { id: input.lessonId },
          select: { id: true, title: true, body: true, course: { select: { title: true } } },
        });
        if (!lesson) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Lesson not found' });
        }

        const progress = await ctx.prisma.lessonProgress.findMany({
          where: { lessonId: input.lessonId, progressState: { not: Prisma.DbNull } },
          select: {
            progressState: true,
            path: { select: { user: { select: { isTest: true } } } },
          },
        });

        const choiceMaps: Record<string, string>[] = [];
        for (const row of progress) {
          if (row.path?.user?.isTest === true) continue;
          const choices = checkpointChoicesOf(row.progressState);
          if (!choices) continue;
          choiceMaps.push(choices);
        }

        return {
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          courseTitle: lesson.course?.title ?? '',
          totalRespondents: choiceMaps.length,
          checkpoints: tallyCheckpoints(lesson.body, choiceMaps),
        };
      } catch (error) {
        // Re-throw intentional tRPC errors (e.g. NOT_FOUND); only DB errors get wrapped.
        if (error instanceof TRPCError) throw error;
        handleDatabaseError(error);
      }
    }),
});
