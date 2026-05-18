import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { handleDatabaseError } from '../utils/db-errors';
import { getUserActiveSubscriptions, getUserAdminBypass, isLessonAccessible } from '../utils/access';
import { isFeatureEnabled } from '../utils/feature-flags';
import type { JobCatalogAxis, JobDetail, JobMarketplace } from '@mpstats/shared';

const AXIS_TITLES: Record<string, string> = {
  ANALYTICS: 'Аналитика', MARKETING: 'Маркетинг', CONTENT: 'Контент',
  OPERATIONS: 'Операции', FINANCE: 'Финансы',
};
const AXIS_ORDER = ['ANALYTICS', 'MARKETING', 'CONTENT', 'OPERATIONS', 'FINANCE'];

export function axisTitle(axis: string): string {
  return AXIS_TITLES[axis] ?? axis;
}

export function filterByMarketplace<T extends { marketplace: string }>(
  jobs: T[], mp: 'WB' | 'OZON',
): T[] {
  return jobs.filter((j) => j.marketplace === mp || j.marketplace === 'BOTH');
}

export const jobRouter = router({
  // Каталог джоб, сгруппированный по осям, отфильтрованный по маркетплейсу
  getCatalog: protectedProcedure
    .input(z.object({ marketplace: z.enum(['WB', 'OZON']).default('WB') }))
    .query(async ({ ctx, input }): Promise<JobCatalogAxis[]> => {
      try {
        const [jobs, track] = await Promise.all([
          ctx.prisma.job.findMany({
            where: { isPublished: true },
            include: {
              lessons: {
                include: {
                  lesson: {
                    select: {
                      duration: true, courseId: true, order: true,
                      progress: { where: { path: { userId: ctx.user.id } } },
                    },
                  },
                },
              },
            },
            orderBy: { displayOrder: 'asc' },
          }),
          ctx.prisma.learningPath.findUnique({
            where: { userId: ctx.user.id }, select: { lessons: true },
          }),
        ]);

        const trackLessonIds = new Set<string>(
          track?.lessons ? extractLessonIds(track.lessons) : [],
        );

        const summaries = jobs.map((job) => {
          const lessons = job.lessons;
          const completed = lessons.filter(
            (jl) => jl.lesson.progress.some((p) => p.status === 'COMPLETED'),
          ).length;
          const isRecommended = lessons.some((jl) => trackLessonIds.has(jl.lessonId));
          const primaryAxis = (job.axes as string[])[0] ?? 'ANALYTICS';
          if ((job.axes as string[]).length === 0) {
            console.warn(`[job.getCatalog] job "${job.slug}" has empty axes — placed in ANALYTICS`);
          }
          return {
            id: job.id, slug: job.slug, title: job.title, description: job.description,
            marketplace: job.marketplace as JobMarketplace,
            axes: job.axes as string[],
            lessonCount: lessons.length,
            totalDurationMin: lessons.reduce((s, jl) => s + (jl.lesson.duration ?? 0), 0),
            completedLessons: completed,
            isRecommended,
            _primaryAxis: primaryAxis,
          };
        });

        const visible = filterByMarketplace(summaries, input.marketplace);

        return AXIS_ORDER
          .map((axis) => ({
            axis, title: axisTitle(axis),
            jobs: visible.filter((j) => j._primaryAxis === axis)
              .map(({ _primaryAxis: _pa, ...j }) => ({ ...j })),
          }))
          .filter((a) => a.jobs.length > 0);
      } catch (error) {
        handleDatabaseError(error);
      }
    }),

  // Одна джоба по slug — с упорядоченными уроками и прогрессом
  getJob: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }): Promise<JobDetail | null> => {
      try {
        const [job, subs, billingEnabled, isAdminBypass] = await Promise.all([
          ctx.prisma.job.findUnique({
            where: { slug: input.slug },
            include: {
              lessons: {
                orderBy: { order: 'asc' },
                include: {
                  lesson: {
                    include: { progress: { where: { path: { userId: ctx.user.id } } } },
                  },
                },
              },
            },
          }),
          getUserActiveSubscriptions(ctx.user.id, ctx.prisma),
          isFeatureEnabled('billing_enabled'),
          getUserAdminBypass(ctx.user.id, ctx.prisma),
        ]);
        if (!job || !job.isPublished) return null;

        const lessons = job.lessons.map((jl) => {
          const l = jl.lesson;
          return {
            id: l.id, title: l.title, durationMin: l.duration ?? 0, order: jl.order,
            status: (l.progress[0]?.status ?? 'NOT_STARTED') as JobDetail['lessons'][number]['status'],
            watchedPercent: l.progress[0]?.watchedPercent ?? 0,
            locked: !isLessonAccessible(
              { order: l.order, courseId: l.courseId }, subs, billingEnabled, isAdminBypass,
            ),
          };
        });

        return {
          id: job.id, slug: job.slug, title: job.title, description: job.description,
          marketplace: job.marketplace as JobMarketplace,
          axes: job.axes as string[], skillBlocks: job.skillBlocks as string[],
          outcomes: job.outcomes as string[],
          lessonCount: lessons.length,
          totalDurationMin: lessons.reduce((s, l) => s + l.durationMin, 0),
          completedLessons: lessons.filter((l) => l.status === 'COMPLETED').length,
          isRecommended: false,
          lessons,
        };
      } catch (error) {
        handleDatabaseError(error);
      }
    }),
});

/** Извлекает плоский список lessonId из JSON learningPath (старый и sectioned формат). */
function extractLessonIds(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  if (raw && typeof raw === 'object' && 'sections' in raw) {
    const sections = (raw as { sections?: { lessonIds?: string[] }[] }).sections ?? [];
    return sections.flatMap((s) => s.lessonIds ?? []);
  }
  return [];
}
