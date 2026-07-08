import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { runAssistantPipeline } from '@mpstats/ai';
import { router, protectedProcedure } from '../trpc';
import type { Context } from '../trpc';
import { createRateLimitMiddleware } from '../middleware/rate-limit';
import { getAssistantQuota, BURST_PER_MIN } from '../utils/assistant-quota';
import type { AssistantLessonRef, AssistantJobRef } from '@mpstats/ai';

export interface EnrichedMessage {
  role: 'user' | 'assistant';
  content: string;
  inDomain: boolean;
  lessons: AssistantLessonRef[];
  jobs: AssistantJobRef[];
}

const assistantProcedure = protectedProcedure.use(
  createRateLimitMiddleware(BURST_PER_MIN, 60_000, 'assistant'),
);

const HISTORY_WINDOW = 10;

async function getOrCreateActiveConversation(userId: string, prisma: Context['prisma']) {
  const existing = await prisma.assistantConversation.findFirst({
    where: { userId, status: 'active' },
    orderBy: { updatedAt: 'desc' },
  });
  if (existing) return existing;
  return prisma.assistantConversation.create({ data: { userId, status: 'active' } });
}

export const assistantRouter = router({
  sendMessage: assistantProcedure
    .input(z.object({ message: z.string().min(1).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const message = input.message.trim();

      const quota = await getAssistantQuota(userId, ctx.prisma, new Date());
      if (quota.remaining <= 0) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: JSON.stringify({ reason: 'quota', resetsAt: quota.resetsAt.toISOString(), tier: quota.tier }),
        });
      }

      const convo = await getOrCreateActiveConversation(userId, ctx.prisma);
      const historyRows = await ctx.prisma.assistantMessage.findMany({
        where: { conversationId: convo.id },
        orderBy: { createdAt: 'desc' },
        take: HISTORY_WINDOW,
      });
      const history = historyRows
        .reverse()
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      await ctx.prisma.assistantMessage.create({
        data: { conversationId: convo.id, role: 'user', content: message },
      });

      const result = await runAssistantPipeline({ query: message, history });

      await ctx.prisma.assistantMessage.create({
        data: {
          conversationId: convo.id,
          role: 'assistant',
          content: result.answer,
          lessonIds: result.lessons.map((l) => l.lessonId),
          jobIds: result.jobs.map((j) => j.jobId),
          inDomain: result.inDomain,
        },
      });
      await ctx.prisma.assistantConversation.update({
        where: { id: convo.id },
        data: { updatedAt: new Date() },
      });

      const quotaAfter = await getAssistantQuota(userId, ctx.prisma, new Date());
      return { ...result, quota: quotaAfter };
    }),

  getQuota: protectedProcedure.query(async ({ ctx }) => {
    return getAssistantQuota(ctx.user!.id, ctx.prisma, new Date());
  }),

  resetConversation: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.prisma.assistantConversation.updateMany({
      where: { userId: ctx.user!.id, status: 'active' },
      data: { status: 'archived' },
    });
    return { ok: true };
  }),

  getConversation: protectedProcedure.query(async ({ ctx }) => {
    const convo = await ctx.prisma.assistantConversation.findFirst({
      where: { userId: ctx.user!.id, status: 'active' },
      orderBy: { updatedAt: 'desc' },
    });
    if (!convo) return { messages: [] as EnrichedMessage[] };

    const rows = await ctx.prisma.assistantMessage.findMany({
      where: { conversationId: convo.id },
      orderBy: { createdAt: 'asc' },
    });

    const allLessonIds = Array.from(new Set(rows.flatMap((r) => r.lessonIds)));
    const allJobIds = Array.from(new Set(rows.flatMap((r) => r.jobIds)));
    const [lessons, jobs] = await Promise.all([
      allLessonIds.length
        ? ctx.prisma.lesson.findMany({
            where: { id: { in: allLessonIds }, isHidden: false, course: { isHidden: false } },
            select: { id: true, title: true, duration: true, course: { select: { title: true } } },
          })
        : Promise.resolve([]),
      allJobIds.length
        ? ctx.prisma.job.findMany({
            where: { id: { in: allJobIds }, isPublished: true },
            select: { id: true, title: true, slug: true, _count: { select: { lessons: true } } },
          })
        : Promise.resolve([]),
    ]);
    const lessonMap = new Map(lessons.map((l) => [l.id, l]));
    const jobMap = new Map(jobs.map((j) => [j.id, j]));

    const messages: EnrichedMessage[] = rows.map((r) => ({
      role: r.role as 'user' | 'assistant',
      content: r.content,
      inDomain: r.inDomain,
      lessons: r.lessonIds
        .filter((id) => lessonMap.has(id))
        .map((id) => {
          const l = lessonMap.get(id)!;
          return { lessonId: l.id, title: l.title, durationMin: l.duration ?? null, courseTitle: l.course?.title ?? null, reason: '' };
        }),
      jobs: r.jobIds
        .filter((id) => jobMap.has(id))
        .map((id) => {
          const j = jobMap.get(id)!;
          return { jobId: j.id, title: j.title, slug: j.slug, lessonCount: j._count.lessons, reason: '' };
        }),
    }));

    return { messages };
  }),
});
