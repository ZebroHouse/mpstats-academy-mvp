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
  computeQuality,
  labelProblem,
  computeUpsell,
  type RawProblemRow,
} from '../utils/assistant-analytics';

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
});
