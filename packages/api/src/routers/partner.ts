import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';

const MPSTATS_PARTNER_KEY = 'mpstats';

export const partnerRouter = router({
  /**
   * Returns visible lessons of the partner course grouped by metadata.toolGroup.
   * No paywall — partner course is always free.
   */
  getCatalog: protectedProcedure.query(async ({ ctx }) => {
    const lessons = await ctx.prisma.lesson.findMany({
      where: { isHidden: false, course: { partnerKey: MPSTATS_PARTNER_KEY, isHidden: false } },
      orderBy: { order: 'asc' },
      select: { id: true, title: true, description: true, order: true, duration: true, metadata: true },
    });

    const groupOrder: string[] = [];
    const map = new Map<string, Array<{ id: string; title: string; order: number; duration: number | null }>>();

    for (const l of lessons) {
      const group = (l.metadata as any)?.toolGroup ?? l.title;
      if (!map.has(group)) {
        map.set(group, []);
        groupOrder.push(group);
      }
      map.get(group)!.push({ id: l.id, title: l.title, order: l.order, duration: l.duration });
    }

    return {
      groups: groupOrder.map((title) => ({
        title,
        lessons: map.get(title)!,
        single: map.get(title)!.length === 1,
      })),
      totalLessons: lessons.length,
    };
  }),

  /**
   * Maps a stable partnerModuleKey → lessonId for deep-linking.
   * Returns { lessonId: null } when the key is unknown.
   */
  resolveModule: protectedProcedure
    .input(z.object({ moduleKey: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const lesson = await ctx.prisma.lesson.findFirst({
        where: {
          isHidden: false,
          course: { partnerKey: MPSTATS_PARTNER_KEY, isHidden: false },
          metadata: { path: ['partnerModuleKey'], equals: input.moduleKey },
        },
        select: { id: true },
      });
      return { lessonId: lesson?.id ?? null };
    }),

  /**
   * Returns a single partner lesson — always unlocked (locked: false).
   * Throws NOT_FOUND if the lesson is missing, hidden, or not from the partner course.
   */
  getLesson: protectedProcedure
    .input(z.object({ lessonId: z.string() }))
    .query(async ({ ctx, input }) => {
      const lesson = await ctx.prisma.lesson.findUnique({
        where: { id: input.lessonId },
        include: { course: { select: { partnerKey: true, title: true, isHidden: true } } },
      });

      if (
        !lesson ||
        lesson.course.partnerKey !== MPSTATS_PARTNER_KEY ||
        lesson.isHidden ||
        lesson.course.isHidden
      ) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Урок партнёрского курса не найден' });
      }

      return {
        id: lesson.id,
        courseId: lesson.courseId,
        title: lesson.title,
        description: lesson.description,
        videoId: lesson.videoId,
        videoUrl: lesson.videoUrl ?? '',
        duration: lesson.duration ?? 0,
        order: lesson.order,
        courseTitle: lesson.course.title,
        locked: false,
      };
    }),
});
