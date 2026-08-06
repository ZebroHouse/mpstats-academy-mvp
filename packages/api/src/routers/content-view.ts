import { z } from 'zod';
import { parseDeviceType } from '@mpstats/shared';
import { router, protectedProcedure } from '../trpc';

/**
 * Журнал заходов в урок. Намеренно отдельно от learning.saveWatchProgress:
 * у того логика «без регрессий» (держит максимум, не откатывает COMPLETED),
 * что верно для состояния и неверно для журнала — журналу нужен честный факт
 * каждого захода, включая тот, где посмотрели меньше, чем в прошлый раз.
 *
 * Весь роутер — побочный эффект: он не имеет права уронить страницу урока.
 * Любая ошибка проглатывается, наружу уходит null/false, клиент просто
 * перестаёт пинговать.
 */

/** Гасит двойной монтаж React и случайный рефетч. Реальный повторный заход
 *  в тот же урок за две минуты — не осмысленное действие. */
const DEDUP_WINDOW_MS = 2 * 60 * 1000;

export const contentViewRouter = router({
  startView: protectedProcedure
    .input(z.object({ lessonId: z.string().min(1) }))
    .mutation(async ({ ctx, input }): Promise<{ viewId: string | null }> => {
      if (process.env.CONTENT_JOURNAL_ENABLED !== 'true') return { viewId: null };
      try {
        const recent = await ctx.prisma.contentView.findFirst({
          where: {
            userId: ctx.user.id,
            lessonId: input.lessonId,
            updatedAt: { gte: new Date(Date.now() - DEDUP_WINDOW_MS) },
          },
          orderBy: { updatedAt: 'desc' },
          select: { id: true },
        });
        if (recent) return { viewId: recent.id };

        const lesson = await ctx.prisma.lesson.findUnique({
          where: { id: input.lessonId },
          select: { courseId: true, contentType: true },
        });
        if (!lesson) return { viewId: null };

        const view = await ctx.prisma.contentView.create({
          data: {
            userId: ctx.user.id,
            lessonId: input.lessonId,
            courseId: lesson.courseId,
            contentType: lesson.contentType,
            device: parseDeviceType(ctx.userAgent),
          },
          select: { id: true },
        });
        return { viewId: view.id };
      } catch (err) {
        console.error('[contentView.startView] failed:', err);
        return { viewId: null };
      }
    }),

  pingView: protectedProcedure
    .input(z.object({
      viewId: z.string().min(1),
      // Потолок в сутки — защита от испорченного клиентского счётчика.
      activeSeconds: z.number().int().min(0).max(86_400),
      percent: z.number().int().min(0).max(100),
      completed: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }): Promise<{ ok: boolean }> => {
      if (process.env.CONTENT_JOURNAL_ENABLED !== 'true') return { ok: false };
      try {
        const current = await ctx.prisma.contentView.findUnique({
          where: { id: input.viewId },
          select: { userId: true, activeSeconds: true, maxPercent: true, completed: true },
        });
        // Проверка владельца обязательна: viewId приходит с клиента.
        if (!current || current.userId !== ctx.user.id) return { ok: false };

        // Максимум, а не присланное значение: пинги могут прийти не по порядку.
        await ctx.prisma.contentView.update({
          where: { id: input.viewId },
          data: {
            activeSeconds: Math.max(current.activeSeconds, input.activeSeconds),
            maxPercent: Math.max(current.maxPercent, input.percent),
            completed: current.completed || input.completed === true,
          },
        });
        return { ok: true };
      } catch (err) {
        console.error('[contentView.pingView] failed:', err);
        return { ok: false };
      }
    }),
});
