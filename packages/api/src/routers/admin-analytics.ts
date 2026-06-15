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
import { router, adminProcedure } from '../trpc';
import { handleDatabaseError } from '../utils/db-errors';
import { mapActiveUserStats, type ActiveUserDayRow } from '../utils/active-user-stats';
import { computeRevenueOverview, computeUpcomingRenewals, groupRevenueByDay } from '../utils/revenue-metrics';
import { deriveTrialConversion } from '../utils/trial-conversion';
import { computeConversionFunnel, churnRate, type FunnelUserRow } from '../utils/funnel-metrics';

export const adminAnalyticsRouter = router({
  /**
   * Analytics: user growth and diagnostic activity grouped by day for a given period.
   */
  getAnalytics: adminProcedure
    .input(z.object({ days: z.number().int().min(1).max(90).default(7) }))
    .query(async ({ ctx, input }) => {
      try {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - input.days);

        // Generate date range
        const dates: string[] = [];
        for (let i = 0; i < input.days; i++) {
          const d = new Date();
          d.setDate(d.getDate() - input.days + i + 1);
          dates.push(d.toISOString().split('T')[0]);
        }

        // Query registrations
        const users = await ctx.prisma.userProfile.findMany({
          where: { createdAt: { gte: startDate } },
          select: { createdAt: true },
        });

        // Query completed diagnostics
        const diagnostics = await ctx.prisma.diagnosticSession.findMany({
          where: {
            status: 'COMPLETED',
            completedAt: { gte: startDate },
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
    .input(z.object({ days: z.number().int().min(1).max(90).default(30) }))
    .query(async ({ ctx, input }) => {
      try {
        const days = input.days;

        // generate_series of UTC calendar days for the window, then a rolling
        // distinct-count per day. $1 = days. End of window = current UTC date.
        const rows = await ctx.prisma.$queryRawUnsafe<
          Array<{ date: string; dau: number; wau: number; mau: number }>
        >(
          `
          WITH bounds AS (
            SELECT (now() AT TIME ZONE 'UTC')::date AS end_day
          ),
          day_series AS (
            SELECT gs::date AS d
            FROM bounds,
                 generate_series(end_day - ($1::int - 1), end_day, interval '1 day') AS gs
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
          days,
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
    .input(z.object({ days: z.number().int().min(1).max(90).default(30) }))
    .query(async ({ ctx, input }) => {
      try {
        const start = new Date();
        start.setDate(start.getDate() - input.days);
        const payments = await ctx.prisma.payment.findMany({
          where: { status: 'COMPLETED', paidAt: { gte: start } },
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
        return groupRevenueByDay(rows as never, { days: input.days, now: new Date() });
      } catch (error) {
        handleDatabaseError(error);
      }
    }),

  /** Registration → diagnostic → paid conversion within `days`. Excludes test users. */
  getConversionFunnel: adminProcedure
    .input(z.object({ days: z.number().int().min(1).max(90).default(30) }))
    .query(async ({ ctx, input }) => {
      try {
        const start = new Date();
        start.setDate(start.getDate() - input.days);

        const registered = await ctx.prisma.userProfile.findMany({
          where: { createdAt: { gte: start }, isTest: false },
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
        handleDatabaseError(error);
      }
    }),

  /** Accurate trial→paid, derived from TRIAL rows + COMPLETED payments. */
  getTrialConversion: adminProcedure
    .input(z.object({ days: z.number().int().min(1).max(90).default(90) }))
    .query(async ({ ctx, input }) => {
      try {
        const start = new Date();
        start.setDate(start.getDate() - input.days);

        const trials = await ctx.prisma.subscription.findMany({
          where: { status: 'TRIAL', currentPeriodStart: { gte: start } },
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
        handleDatabaseError(error);
      }
    }),

  /** Churn over `days`: cancellations, current PAST_DUE, approx churn rate. */
  getChurn: adminProcedure
    .input(z.object({ days: z.number().int().min(1).max(90).default(30) }))
    .query(async ({ ctx, input }) => {
      try {
        const now = new Date();
        const start = new Date();
        start.setDate(start.getDate() - input.days);
        const notTest = { user: { isTest: false }, plan: { hidden: false } };

        const [cancelled, pastDue, activeBase] = await Promise.all([
          ctx.prisma.subscription.count({ where: { status: 'CANCELLED', cancelledAt: { gte: start }, ...notTest } }),
          ctx.prisma.subscription.count({ where: { status: 'PAST_DUE', ...notTest } }),
          ctx.prisma.subscription.count({ where: { status: 'ACTIVE', currentPeriodEnd: { gt: now }, ...notTest } }),
        ]);

        return { cancelled, pastDue, activeBase, churnRate: churnRate(cancelled, activeBase) };
      } catch (error) {
        handleDatabaseError(error);
      }
    }),

  /** Revenue source: referred vs organic paying users within `days`. */
  getAttribution: adminProcedure
    .input(z.object({ days: z.number().int().min(1).max(90).default(30) }))
    .query(async ({ ctx, input }) => {
      try {
        const start = new Date();
        start.setDate(start.getDate() - input.days);

        const paidRows = await ctx.prisma.payment.findMany({
          where: { status: 'COMPLETED', paidAt: { gte: start }, subscription: { user: { isTest: false }, plan: { hidden: false } } },
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
        handleDatabaseError(error);
      }
    }),
});
