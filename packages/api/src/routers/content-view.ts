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
 * перестаёт пинговать. Это касается и входа: схема pingView ничего не
 * отклоняет с throw — плохой ввод превращается в 0/false внутри хендлера
 * (см. finiteOrZero ниже), а не в BAD_REQUEST наружу.
 */

/** Гасит двойной монтаж React и случайный рефетч. Реальный повторный заход
 *  в тот же урок за две минуты — не осмысленное действие. */
const DEDUP_WINDOW_MS = 2 * 60 * 1000;

/** Клиент считает activeSeconds/percent на лету (position / duration * 100) —
 *  дробные значения и временный NaN, пока плеер ещё инициализируется, это
 *  норма, а не ошибка ввода. Схема принимает любое конечное число и подменяет
 *  всё остальное нулём; обрезка в осмысленный диапазон (0..86400 / 0..100) —
 *  уже в хендлере после округления. Раньше здесь стояли .int().min().max(),
 *  и дробный процент от реального плеера ронял мутацию с BAD_REQUEST —
 *  нарушая ровно то обещание про «никогда не throw», которое даёт докстринг. */
const finiteOrZero = z.number().finite().catch(0);

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
            // startedAt, не updatedAt: updatedAt = @updatedAt и двигается
            // каждым pingView, поэтому окно на нём никогда не закрывалось бы —
            // 40 минут просмотра с релоадом посередине склеились бы в один
            // визит, и более честные (меньшие) цифры второго захода потерялись
            // бы под Math.max в pingView. startedAt неизменен и уже
            // проиндексирован (@@index([userId, startedAt])); updatedAt — нет.
            startedAt: { gte: new Date(Date.now() - DEDUP_WINDOW_MS) },
          },
          orderBy: { startedAt: 'desc' },
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
      viewId: z.string().catch(''),
      // Потолок в сутки — защита от испорченного клиентского счётчика.
      activeSeconds: finiteOrZero,
      percent: finiteOrZero,
      completed: z.any().optional().transform((v) => v === true),
    }))
    .mutation(async ({ ctx, input }): Promise<{ ok: boolean }> => {
      if (process.env.CONTENT_JOURNAL_ENABLED !== 'true') return { ok: false };
      // Пустой viewId после catch('') — тот же отказ, что раньше давал zod
      // .min(1) через throw. БД трогать незачем.
      if (!input.viewId) return { ok: false };
      try {
        const activeSeconds = Math.min(86_400, Math.max(0, Math.round(input.activeSeconds)));
        const percent = Math.min(100, Math.max(0, Math.round(input.percent)));

        // Один атомарный UPDATE вместо read-then-write. Две вкладки на одном
        // уроке делят viewId (дедуп в startView возвращает ту же строку), и
        // при read-then-write обе читают одно и то же значение до того, как
        // другая успевает записать — более поздний, но меньший write отменяет
        // более ранний больший. GREATEST в самой БД делает эту гонку
        // невозможной. WHERE несёт и проверку владельца — чужой или
        // несуществующий viewId просто не находит строк (affected = 0), без
        // отдельного окна между проверкой и записью.
        const affected = await ctx.prisma.$executeRaw`
          UPDATE "ContentView"
          SET "activeSeconds" = GREATEST("activeSeconds", ${activeSeconds}),
              "maxPercent" = GREATEST("maxPercent", ${percent}),
              "completed" = "completed" OR ${input.completed},
              "updatedAt" = NOW()
          WHERE "id" = ${input.viewId} AND "userId" = ${ctx.user.id}
        `;
        // Raw SQL обходит @updatedAt Prisma, поэтому updatedAt = NOW() выше
        // выставлен вручную.
        return { ok: affected === 1 };
      } catch (err) {
        console.error('[contentView.pingView] failed:', err);
        return { ok: false };
      }
    }),
});
