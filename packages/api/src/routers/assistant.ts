import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { runAssistantPipeline } from '@mpstats/ai';
import { Prisma } from '@mpstats/db';
import { router, protectedProcedure } from '../trpc';
import type { Context } from '../trpc';
import { createRateLimitMiddleware } from '../middleware/rate-limit';
import { getAssistantQuota, BURST_PER_MIN } from '../utils/assistant-quota';
import { resolveAccessibleMaterialIds, applyMaterialAccess } from '../utils/material-access';
import type { AssistantLessonRef, AssistantJobRef, AssistantNavLink, AssistantMaterialRef } from '@mpstats/ai';

export interface EnrichedMessage {
  role: 'user' | 'assistant';
  content: string;
  inDomain: boolean;
  category: string | null;
  lessons: AssistantLessonRef[];
  jobs: AssistantJobRef[];
  navLinks: AssistantNavLink[];
  materials: AssistantMaterialRef[];
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
          inDomain: result.category !== 'off_domain',
          category: result.category,
          navLinks: result.navLinks as unknown as Prisma.InputJsonValue,
          materialIds: result.materials.map((m) => m.materialId),
        },
      });
      await ctx.prisma.assistantConversation.update({
        where: { id: convo.id },
        data: { updatedAt: new Date() },
      });

      const accessibleIds = await resolveAccessibleMaterialIds(
        ctx.prisma,
        userId,
        result.materials.map((m) => m.materialId),
      );
      const gatedMaterials = applyMaterialAccess(result.materials, accessibleIds);

      const quotaAfter = await getAssistantQuota(userId, ctx.prisma, new Date());
      return { ...result, materials: gatedMaterials, quota: quotaAfter };
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
    const allMaterialIds = Array.from(new Set(rows.flatMap((r) => r.materialIds ?? [])));
    const [lessons, jobs, materialRows] = await Promise.all([
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
      allMaterialIds.length
        ? ctx.prisma.material.findMany({
            where: { id: { in: allMaterialIds }, isHidden: false },
            select: { id: true, type: true, title: true, ctaText: true, externalUrl: true, storagePath: true },
          })
        : Promise.resolve([]),
    ]);
    const lessonMap = new Map(lessons.map((l) => [l.id, l]));
    const jobMap = new Map(jobs.map((j) => [j.id, j]));

    // Материалы: собрать pre-gate ref → пересчитать доступ на момент чтения (доступ мог измениться).
    const preGateMaterials: AssistantMaterialRef[] = materialRows.map((m) => ({
      materialId: m.id,
      type: m.type,
      title: m.title,
      ctaText: m.ctaText,
      isAccessible: true,
      externalUrl: m.externalUrl,
      hasFile: m.storagePath != null,
    }));
    const accessibleMaterialIds = await resolveAccessibleMaterialIds(ctx.prisma, ctx.user!.id, allMaterialIds);
    const gatedMaterials = applyMaterialAccess(preGateMaterials, accessibleMaterialIds);
    const materialMap = new Map(gatedMaterials.map((m) => [m.materialId, m]));

    const messages: EnrichedMessage[] = rows.map((r) => ({
      role: r.role as 'user' | 'assistant',
      content: r.content,
      inDomain: r.inDomain,
      category: r.category,
      navLinks: (r.navLinks as unknown as AssistantNavLink[]) ?? [],
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
      materials: (r.materialIds ?? [])
        .filter((id) => materialMap.has(id))
        .map((id) => materialMap.get(id)!),
    }));

    return { messages };
  }),
});
