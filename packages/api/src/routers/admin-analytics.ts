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
});
