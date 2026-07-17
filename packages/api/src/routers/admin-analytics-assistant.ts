// packages/api/src/routers/admin-analytics-assistant.ts
/**
 * Assistant analytics — mounted at `admin.analytics.assistant.*`.
 * Read-only aggregation over AssistantMessage / AssistantConversation.
 * All aggregates filter role='assistant' where category/inDomain/cards matter,
 * exclude test users (UserProfile.isTest=false), and bucket by MSK calendar day.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, adminProcedure } from '../trpc';
import { handleDatabaseError } from '../utils/db-errors';
import { FREE_DAILY } from '../utils/assistant-quota';
import {
  enumerateMskDays,
  fillDaySeries,
  mskDayKey,
  computeQuality,
  labelProblem,
  computeUpsell,
  type RawProblemRow,
} from '../utils/assistant-analytics';
import { computeLessonChatQuality } from '../utils/lesson-chat-analytics';

const rangeInput = z.object({ from: z.date(), to: z.date() });

function assertRange(from: Date, to: Date) {
  if ((to.getTime() - from.getTime()) / 86_400_000 > 366) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Диапазон не больше 366 дней' });
  }
}

export const assistantAnalyticsRouter = router({
  /** Section 1 — adoption pulse: KPI totals + daily user-message & DAU series. */
  getPulse: adminProcedure.input(rangeInput).query(async ({ ctx, input }) => {
    try {
      const { from, to } = input;
      assertRange(from, to);
      const dayKeys = enumerateMskDays(from, to);

      const messagesByDayRows = await ctx.prisma.$queryRawUnsafe<Array<{ date: string; count: number }>>(
        `
        SELECT to_char((m."createdAt" + interval '3 hours'), 'YYYY-MM-DD') AS date,
               COUNT(*)::int AS count
        FROM "AssistantMessage" m
        JOIN "AssistantConversation" c ON c.id = m."conversationId"
        JOIN "UserProfile" up ON up.id = c."userId"
        WHERE m.role = 'user' AND m."createdAt" BETWEEN $1 AND $2 AND up."isTest" = false
        GROUP BY 1 ORDER BY 1
        `,
        from,
        to,
      );

      const usersByDayRows = await ctx.prisma.$queryRawUnsafe<Array<{ date: string; count: number }>>(
        `
        SELECT to_char((m."createdAt" + interval '3 hours'), 'YYYY-MM-DD') AS date,
               COUNT(DISTINCT c."userId")::int AS count
        FROM "AssistantMessage" m
        JOIN "AssistantConversation" c ON c.id = m."conversationId"
        JOIN "UserProfile" up ON up.id = c."userId"
        WHERE m."createdAt" BETWEEN $1 AND $2 AND up."isTest" = false
        GROUP BY 1 ORDER BY 1
        `,
        from,
        to,
      );

      const [totals] = await ctx.prisma.$queryRawUnsafe<
        Array<{ messages: number; users: number; conversations: number }>
      >(
        `
        SELECT
          COUNT(*) FILTER (WHERE m.role = 'user')::int AS messages,
          COUNT(DISTINCT c."userId")::int AS users,
          COUNT(DISTINCT m."conversationId")::int AS conversations
        FROM "AssistantMessage" m
        JOIN "AssistantConversation" c ON c.id = m."conversationId"
        JOIN "UserProfile" up ON up.id = c."userId"
        WHERE m."createdAt" BETWEEN $1 AND $2 AND up."isTest" = false
        `,
        from,
        to,
      );

      const messages = Number(totals?.messages ?? 0);
      const conversations = Number(totals?.conversations ?? 0);

      return {
        kpi: {
          messages,
          users: Number(totals?.users ?? 0),
          conversations,
          avgPerConversation: conversations === 0 ? 0 : messages / conversations,
        },
        messagesByDay: fillDaySeries(messagesByDayRows, dayKeys),
        usersByDay: fillDaySeries(usersByDayRows, dayKeys),
      };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      handleDatabaseError(error);
    }
  }),

  /** Section 2a — answer quality: off-domain / complaint / fallback rates. */
  getQuality: adminProcedure.input(rangeInput).query(async ({ ctx, input }) => {
    try {
      const { from, to } = input;
      assertRange(from, to);
      const [row] = await ctx.prisma.$queryRawUnsafe<
        Array<{ total: number; off_domain: number; complaint: number; fallback: number }>
      >(
        `
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE m.category = 'off_domain')::int AS off_domain,
          COUNT(*) FILTER (WHERE m.category = 'complaint')::int AS complaint,
          COUNT(*) FILTER (WHERE m."navLinks"::text LIKE '%/support%')::int AS fallback
        FROM "AssistantMessage" m
        JOIN "AssistantConversation" c ON c.id = m."conversationId"
        JOIN "UserProfile" up ON up.id = c."userId"
        WHERE m.role = 'assistant' AND m."createdAt" BETWEEN $1 AND $2 AND up."isTest" = false
        `,
        from,
        to,
      );
      return computeQuality({
        total: row?.total ?? 0,
        offDomain: row?.off_domain ?? 0,
        complaint: row?.complaint ?? 0,
        fallback: row?.fallback ?? 0,
      });
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      handleDatabaseError(error);
    }
  }),

  /** Section 2b — last N problem turns (off-domain / complaint / fallback) with the user query. */
  getProblemMessages: adminProcedure
    .input(rangeInput.extend({ limit: z.number().int().min(1).max(200).default(50) }))
    .query(async ({ ctx, input }) => {
      try {
        const { from, to, limit } = input;
        assertRange(from, to);
        const rows = await ctx.prisma.$queryRawUnsafe<RawProblemRow[]>(
          `
          SELECT
            m."createdAt" AS "createdAt",
            m.category AS category,
            (m."navLinks"::text LIKE '%/support%') AS "isFallback",
            q.content AS query
          FROM "AssistantMessage" m
          JOIN "AssistantConversation" c ON c.id = m."conversationId"
          JOIN "UserProfile" up ON up.id = c."userId"
          LEFT JOIN LATERAL (
            SELECT u.content FROM "AssistantMessage" u
            WHERE u."conversationId" = m."conversationId"
              AND u.role = 'user'
              AND u."createdAt" <= m."createdAt"
            ORDER BY u."createdAt" DESC
            LIMIT 1
          ) q ON true
          WHERE m.role = 'assistant'
            AND m."createdAt" BETWEEN $1 AND $2
            AND up."isTest" = false
            AND (m.category IN ('off_domain','complaint') OR m."navLinks"::text LIKE '%/support%')
          ORDER BY m."createdAt" DESC
          LIMIT $3
          `,
          from,
          to,
          limit,
        );
        return { items: rows.map(labelProblem) };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        handleDatabaseError(error);
      }
    }),

  /** Section 3 — demand: category breakdown + top surfaced materials/lessons/jobs. */
  getDemand: adminProcedure.input(rangeInput).query(async ({ ctx, input }) => {
    try {
      const { from, to } = input;
      assertRange(from, to);

      const categoryRows = await ctx.prisma.$queryRawUnsafe<Array<{ category: string; count: number }>>(
        `
        SELECT m.category AS category, COUNT(*)::int AS count
        FROM "AssistantMessage" m
        JOIN "AssistantConversation" c ON c.id = m."conversationId"
        JOIN "UserProfile" up ON up.id = c."userId"
        WHERE m.role = 'assistant' AND m.category IS NOT NULL
          AND m."createdAt" BETWEEN $1 AND $2 AND up."isTest" = false
        GROUP BY 1 ORDER BY count DESC
        `,
        from,
        to,
      );

      const topMaterials = await ctx.prisma.$queryRawUnsafe<Array<{ id: string; title: string; count: number }>>(
        `
        SELECT mat.id AS id, mat.title AS title, COUNT(*)::int AS count
        FROM "AssistantMessage" m
        JOIN "AssistantConversation" c ON c.id = m."conversationId"
        JOIN "UserProfile" up ON up.id = c."userId"
        CROSS JOIN LATERAL unnest(m."materialIds") AS mid(id)
        JOIN "Material" mat ON mat.id = mid.id
        WHERE m.role = 'assistant' AND m."createdAt" BETWEEN $1 AND $2 AND up."isTest" = false
        GROUP BY mat.id, mat.title ORDER BY count DESC LIMIT 10
        `,
        from,
        to,
      );

      const topLessons = await ctx.prisma.$queryRawUnsafe<Array<{ id: string; title: string; count: number }>>(
        `
        SELECT l.id AS id, l.title AS title, COUNT(*)::int AS count
        FROM "AssistantMessage" m
        JOIN "AssistantConversation" c ON c.id = m."conversationId"
        JOIN "UserProfile" up ON up.id = c."userId"
        CROSS JOIN LATERAL unnest(m."lessonIds") AS lid(id)
        JOIN "Lesson" l ON l.id = lid.id
        WHERE m.role = 'assistant' AND m."createdAt" BETWEEN $1 AND $2 AND up."isTest" = false
        GROUP BY l.id, l.title ORDER BY count DESC LIMIT 10
        `,
        from,
        to,
      );

      const topJobs = await ctx.prisma.$queryRawUnsafe<Array<{ id: string; title: string; count: number }>>(
        `
        SELECT j.id AS id, j.title AS title, COUNT(*)::int AS count
        FROM "AssistantMessage" m
        JOIN "AssistantConversation" c ON c.id = m."conversationId"
        JOIN "UserProfile" up ON up.id = c."userId"
        CROSS JOIN LATERAL unnest(m."jobIds") AS jid(id)
        JOIN "Job" j ON j.id = jid.id
        WHERE m.role = 'assistant' AND m."createdAt" BETWEEN $1 AND $2 AND up."isTest" = false
        GROUP BY j.id, j.title ORDER BY count DESC LIMIT 10
        `,
        from,
        to,
      );

      return {
        categories: categoryRows.map((r) => ({ category: r.category, count: Number(r.count) })),
        topMaterials: topMaterials.map((r) => ({ id: r.id, title: r.title, count: Number(r.count) })),
        topLessons: topLessons.map((r) => ({ id: r.id, title: r.title, count: Number(r.count) })),
        topJobs: topJobs.map((r) => ({ id: r.id, title: r.title, count: Number(r.count) })),
      };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      handleDatabaseError(error);
    }
  }),

  /** Section 4 — quota pressure: free users hitting the daily cap + upsell candidates. */
  getUpsell: adminProcedure.input(rangeInput).query(async ({ ctx, input }) => {
    try {
      const { from, to } = input;
      assertRange(from, to);

      // Shared CTE fragment: free = not admin-role and no currently-active subscription.
      const freeDayCountsCte = `
        WITH full_users AS (
          SELECT up.id FROM "UserProfile" up
          WHERE up.role IN ('ADMIN','SUPERADMIN','SALES')
          UNION
          SELECT s."userId" FROM "Subscription" s
          WHERE s.status IN ('ACTIVE','TRIAL','CANCELLED') AND s."currentPeriodEnd" > now()
        ),
        day_counts AS (
          SELECT c."userId" AS "userId",
                 to_char((m."createdAt" + interval '3 hours'), 'YYYY-MM-DD') AS day,
                 COUNT(*)::int AS "dayCount"
          FROM "AssistantMessage" m
          JOIN "AssistantConversation" c ON c.id = m."conversationId"
          JOIN "UserProfile" up ON up.id = c."userId"
          WHERE m.role = 'assistant' AND m."inDomain" = true
            AND m."createdAt" BETWEEN $1 AND $2
            AND up."isTest" = false
            AND c."userId" NOT IN (SELECT id FROM full_users)
          GROUP BY c."userId", 2
        )
      `;

      const dayCountRows = await ctx.prisma.$queryRawUnsafe<Array<{ userId: string; dayCount: number }>>(
        `${freeDayCountsCte}
         SELECT dc."userId" AS "userId", dc."dayCount" AS "dayCount" FROM day_counts dc`,
        from,
        to,
      );

      const candidateRows = await ctx.prisma.$queryRawUnsafe<
        Array<{ userId: string; email: string | null; total: number; daysCapped: number }>
      >(
        `${freeDayCountsCte}
         SELECT dc."userId" AS "userId",
                au.email AS email,
                SUM(dc."dayCount")::int AS total,
                COUNT(*) FILTER (WHERE dc."dayCount" >= $3)::int AS "daysCapped"
         FROM day_counts dc
         LEFT JOIN auth.users au ON au.id::text = dc."userId"
         GROUP BY dc."userId", au.email
         ORDER BY total DESC
         LIMIT 20`,
        from,
        to,
        FREE_DAILY,
      );

      const summary = computeUpsell(dayCountRows, { cap: FREE_DAILY, repeatThreshold: 2 });

      return {
        cap: FREE_DAILY,
        ...summary,
        candidates: candidateRows.map((r) => ({
          userId: r.userId,
          email: r.email,
          total: Number(r.total),
          daysCapped: Number(r.daysCapped),
        })),
      };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      handleDatabaseError(error);
    }
  }),

  /** In-lesson chat pulse: KPI + daily queries + top lessons asked about. */
  getLessonChatPulse: adminProcedure.input(rangeInput).query(async ({ ctx, input }) => {
    try {
      const { from, to } = input;
      assertRange(from, to);
      const dayKeys = enumerateMskDays(from, to);

      const byDay = await ctx.prisma.$queryRawUnsafe<Array<{ date: string; count: number }>>(
        `
        SELECT to_char((m."createdAt" + interval '3 hours'), 'YYYY-MM-DD') AS date,
               COUNT(*)::int AS count
        FROM "ChatMessage" m
        JOIN "UserProfile" up ON up.id = m."userId"
        WHERE m.role = 'USER' AND m."createdAt" BETWEEN $1 AND $2 AND up."isTest" = false
        GROUP BY 1 ORDER BY 1
        `,
        from,
        to,
      );

      const [totals] = await ctx.prisma.$queryRawUnsafe<
        Array<{ queries: number; users: number; lessons: number }>
      >(
        `
        SELECT
          COUNT(*) FILTER (WHERE m.role = 'USER')::int AS queries,
          COUNT(DISTINCT m."userId")::int AS users,
          COUNT(DISTINCT m."lessonId")::int AS lessons
        FROM "ChatMessage" m
        JOIN "UserProfile" up ON up.id = m."userId"
        WHERE m."createdAt" BETWEEN $1 AND $2 AND up."isTest" = false
        `,
        from,
        to,
      );

      const topLessons = await ctx.prisma.$queryRawUnsafe<Array<{ id: string; title: string; count: number }>>(
        `
        SELECT l.id AS id, l.title AS title, COUNT(*)::int AS count
        FROM "ChatMessage" m
        JOIN "UserProfile" up ON up.id = m."userId"
        JOIN "Lesson" l ON l.id = m."lessonId"
        WHERE m.role = 'USER' AND m."createdAt" BETWEEN $1 AND $2 AND up."isTest" = false
        GROUP BY l.id, l.title ORDER BY count DESC LIMIT 10
        `,
        from,
        to,
      );

      const queries = Number(totals?.queries ?? 0);
      const users = Number(totals?.users ?? 0);
      return {
        kpi: {
          queries,
          users,
          lessons: Number(totals?.lessons ?? 0),
          avgPerUser: users === 0 ? 0 : queries / users,
        },
        byDay: fillDaySeries(byDay, dayKeys),
        topLessons: topLessons.map((r) => ({ id: r.id, title: r.title, count: Number(r.count) })),
      };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      handleDatabaseError(error);
    }
  }),

  /** In-lesson chat quality: no-answer rate + no-grounding (sourceCount=0) rate. */
  getLessonChatQuality: adminProcedure.input(rangeInput).query(async ({ ctx, input }) => {
    try {
      const { from, to } = input;
      assertRange(from, to);
      const [row] = await ctx.prisma.$queryRawUnsafe<
        Array<{ total: number; no_answer: number; no_grounding: number }>
      >(
        `
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE m."noAnswer" = true)::int AS no_answer,
          COUNT(*) FILTER (WHERE m."sourceCount" = 0)::int AS no_grounding
        FROM "ChatMessage" m
        JOIN "UserProfile" up ON up.id = m."userId"
        WHERE m.role = 'ASSISTANT' AND m."createdAt" BETWEEN $1 AND $2 AND up."isTest" = false
        `,
        from,
        to,
      );
      return computeLessonChatQuality({
        total: row?.total ?? 0,
        noAnswer: row?.no_answer ?? 0,
        noGrounding: row?.no_grounding ?? 0,
      });
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      handleDatabaseError(error);
    }
  }),

  /** Last N unanswered lesson-chat questions (noAnswer) with the user query + lesson title. */
  getLessonChatUnanswered: adminProcedure
    .input(rangeInput.extend({ limit: z.number().int().min(1).max(200).default(50) }))
    .query(async ({ ctx, input }) => {
      try {
        const { from, to, limit } = input;
        assertRange(from, to);
        const rows = await ctx.prisma.$queryRawUnsafe<
          Array<{ createdAt: Date; query: string | null; lessonTitle: string | null }>
        >(
          `
          SELECT
            m."createdAt" AS "createdAt",
            q.content AS query,
            l.title AS "lessonTitle"
          FROM "ChatMessage" m
          JOIN "UserProfile" up ON up.id = m."userId"
          LEFT JOIN "Lesson" l ON l.id = m."lessonId"
          LEFT JOIN LATERAL (
            SELECT u.content FROM "ChatMessage" u
            WHERE u."userId" = m."userId" AND u."lessonId" = m."lessonId"
              AND u.role = 'USER' AND u."createdAt" <= m."createdAt"
            ORDER BY u."createdAt" DESC
            LIMIT 1
          ) q ON true
          WHERE m.role = 'ASSISTANT' AND m."noAnswer" = true
            AND m."createdAt" BETWEEN $1 AND $2 AND up."isTest" = false
          ORDER BY m."createdAt" DESC
          LIMIT $3
          `,
          from,
          to,
          limit,
        );
        return {
          items: rows.map((r) => ({
            date: mskDayKey(r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt)),
            query: r.query ?? '',
            lessonTitle: r.lessonTitle ?? '—',
          })),
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        handleDatabaseError(error);
      }
    }),

  /** Cross-cutting AI usage: daily user-queries split by surface (assistant vs lesson chat). */
  getCrossCutting: adminProcedure.input(rangeInput).query(async ({ ctx, input }) => {
    try {
      const { from, to } = input;
      assertRange(from, to);
      const dayKeys = enumerateMskDays(from, to);

      // Assistant drawer: AssistantMessage.role is lowercase 'user'.
      const assistantByDay = await ctx.prisma.$queryRawUnsafe<Array<{ date: string; count: number }>>(
        `
        SELECT to_char((m."createdAt" + interval '3 hours'), 'YYYY-MM-DD') AS date, COUNT(*)::int AS count
        FROM "AssistantMessage" m
        JOIN "AssistantConversation" c ON c.id = m."conversationId"
        JOIN "UserProfile" up ON up.id = c."userId"
        WHERE m.role = 'user' AND m."createdAt" BETWEEN $1 AND $2 AND up."isTest" = false
        GROUP BY 1 ORDER BY 1
        `,
        from,
        to,
      );

      // In-lesson chat: ChatMessage.role is UPPERCASE 'USER'.
      const chatByDay = await ctx.prisma.$queryRawUnsafe<Array<{ date: string; count: number }>>(
        `
        SELECT to_char((m."createdAt" + interval '3 hours'), 'YYYY-MM-DD') AS date, COUNT(*)::int AS count
        FROM "ChatMessage" m
        JOIN "UserProfile" up ON up.id = m."userId"
        WHERE m.role = 'USER' AND m."createdAt" BETWEEN $1 AND $2 AND up."isTest" = false
        GROUP BY 1 ORDER BY 1
        `,
        from,
        to,
      );

      const a = fillDaySeries(assistantByDay, dayKeys);
      const ch = fillDaySeries(chatByDay, dayKeys);
      const byDay = dayKeys.map((date, i) => ({ date, assistant: a[i].count, lessonChat: ch[i].count }));
      const assistantTotal = a.reduce((s, d) => s + d.count, 0);
      const lessonChatTotal = ch.reduce((s, d) => s + d.count, 0);

      return {
        totals: { assistant: assistantTotal, lessonChat: lessonChatTotal, all: assistantTotal + lessonChatTotal },
        byDay,
      };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      handleDatabaseError(error);
    }
  }),
});
