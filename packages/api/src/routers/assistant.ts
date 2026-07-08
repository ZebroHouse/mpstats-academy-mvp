import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { runAssistantPipeline } from '@mpstats/ai';
import { router, protectedProcedure } from '../trpc';
import type { Context } from '../trpc';
import { createRateLimitMiddleware } from '../middleware/rate-limit';
import { getAssistantQuota, BURST_PER_MIN } from '../utils/assistant-quota';

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
});
