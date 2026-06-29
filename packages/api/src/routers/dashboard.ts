import { router, protectedProcedure } from '../trpc';
import { handleDatabaseError } from '../utils/db-errors';
import {
  getUserActiveSubscriptions, getUserAdminBypass, isLessonAccessible, getFirstJobLessonIds,
} from '../utils/access';
import { isFeatureEnabled } from '../utils/feature-flags';
import { filterByMarketplace } from './job';
import { GOAL_TO_AXES, GOAL_LABELS, MARKETPLACE_LABELS, goalShelfKey, newShelfKey } from '../utils/storefront-shelves';
import type { JobSummary, LessonWithProgress, StorefrontShelf, StorefrontItem } from '@mpstats/shared';

const SHELF_CAP = 12;
const START_CAP = 3;

function lessonMarketplace(courseId: string): 'WB' | 'OZON' {
  return courseId === '05_ozon' ? 'OZON' : 'WB';
}

export const dashboardRouter = router({
  getStorefront: protectedProcedure.query(async ({ ctx }): Promise<StorefrontShelf[]> => {
    try {
      const userId = ctx.user.id;
      const [profile, jobsRaw, badgedLessons, inProgressRaw, subs, isAdminBypass, billingEnabled] = await Promise.all([
        ctx.prisma.userProfile.findUnique({ where: { id: userId }, select: { goals: true, marketplaces: true } }),
        ctx.prisma.job.findMany({
          where: { isPublished: true },
          include: { lessons: { where: { lesson: { isHidden: false, course: { isHidden: false } } }, include: { lesson: { include: { progress: { where: { path: { userId } } } } } } } },
        }),
        ctx.prisma.lesson.findMany({
          where: { isHidden: false, course: { isHidden: false, partnerKey: null }, NOT: { badges: { isEmpty: true } } },
          include: { progress: { where: { path: { userId } } }, course: { select: { title: true } } },
        }),
        ctx.prisma.lessonProgress.findMany({
          where: { path: { userId }, status: 'IN_PROGRESS', lesson: { isHidden: false, course: { isHidden: false, partnerKey: null } } },
          include: { lesson: { include: { course: { select: { title: true } } } } },
          orderBy: { lesson: { order: 'asc' } },
        }),
        getUserActiveSubscriptions(userId, ctx.prisma),
        getUserAdminBypass(userId, ctx.prisma),
        isFeatureEnabled('billing_enabled'),
      ]);

      const firstJobLessonIds = await getFirstJobLessonIds(ctx.prisma);
      const goals = (profile?.goals ?? []) as string[];
      const marketplaces = ((profile?.marketplaces ?? []) as string[]).filter((m) => m === 'WB' || m === 'OZON');

      const lockedOf = (l: { id: string; order: number; courseId: string }) =>
        !isLessonAccessible({ order: l.order, courseId: l.courseId }, subs, billingEnabled, isAdminBypass, firstJobLessonIds.has(l.id));

      const toJobItem = (j: any): StorefrontItem => {
        const lessons = j.lessons;
        const summary: JobSummary = {
          id: j.id, slug: j.slug, title: j.title, description: j.description,
          marketplace: j.marketplace, axes: (j.axes as string[]) ?? [],
          lessonCount: lessons.length,
          totalDurationMin: lessons.reduce((s: number, jl: any) => s + (jl.lesson.duration ?? 0), 0),
          completedLessons: lessons.filter((jl: any) => jl.lesson.progress.some((p: any) => p.status === 'COMPLETED')).length,
          isRecommended: false, isInTrack: false, badges: (j.badges as string[]) ?? [],
        };
        return { kind: 'job', job: summary };
      };
      const toLessonItem = (l: any): StorefrontItem => {
        const ld: LessonWithProgress = {
          id: l.id, courseId: l.courseId, title: l.title, description: l.description,
          videoUrl: l.videoUrl || '', videoId: l.videoId, duration: l.duration || 0, order: l.order,
          skillCategory: l.skillCategory, skillLevel: l.skillLevel, isHidden: false,
          status: (l.progress?.[0]?.status || 'NOT_STARTED'),
          watchedPercent: l.progress?.[0]?.watchedPercent || 0,
          locked: lockedOf(l), badges: (l.badges as string[]) ?? [],
        } as unknown as LessonWithProgress;
        return { kind: 'lesson', lesson: ld };
      };

      const cap = (items: StorefrontItem[], n: number, shelfKey: string, title: string, marketplace?: 'WB' | 'OZON'): StorefrontShelf | null => {
        if (items.length === 0) return null;
        return { shelfKey, title, marketplace, items: items.slice(0, n), totalCount: items.length };
      };

      const lessonsWithBadge = (b: string) => badgedLessons.filter((l) => (l.badges as string[]).includes(b));
      const jobsWithBadge = (b: string) => jobsRaw.filter((j) => (j.badges as string[]).includes(b));

      const shelves: (StorefrontShelf | null)[] = [];

      // 1. Начни отсюда (START, mix, ≤3)
      shelves.push(cap(
        [...jobsWithBadge('START').map(toJobItem), ...lessonsWithBadge('START').map(toLessonItem)],
        START_CAP, 'start', 'Начни отсюда',
      ));

      // 2. Продолжить (IN_PROGRESS lessons)
      shelves.push(cap(
        inProgressRaw.map((p: any) => toLessonItem({ ...p.lesson, progress: [{ status: p.status, watchedPercent: p.watchedPercent }] })),
        SHELF_CAP, 'continue', 'Продолжить',
      ));

      // 3. Под твою задачу: {goal} (one per goal)
      for (const goal of goals) {
        const axes = GOAL_TO_AXES[goal] ?? [];
        let items: StorefrontItem[];
        if (axes.length === 0) {
          // NEW_MARKETPLACE → START-tagged beginner content
          items = [...jobsWithBadge('START').map(toJobItem), ...lessonsWithBadge('START').map(toLessonItem)];
        } else {
          const axisJobs = jobsRaw.filter((j) => ((j.axes as string[]) ?? []).some((a) => axes.includes(a)));
          const axisLessons = badgedLessons.filter((l) => axes.includes(l.skillCategory));
          items = [...axisJobs.map(toJobItem), ...axisLessons.map(toLessonItem)];
        }
        shelves.push(cap(items, SHELF_CAP, goalShelfKey(goal), `Под твою задачу: ${GOAL_LABELS[goal] ?? goal}`));
      }

      // 4. Новое на {marketplace} (NEW + marketplace split)
      const newLessons = lessonsWithBadge('NEW');
      const newJobs = jobsWithBadge('NEW');
      if (marketplaces.length === 0) {
        shelves.push(cap([...newJobs.map(toJobItem), ...newLessons.map(toLessonItem)], SHELF_CAP, 'new', 'Новое на платформе'));
      } else {
        for (const mp of marketplaces) {
          const items = [
            ...filterByMarketplace(newJobs as any[], mp).map(toJobItem),
            ...newLessons.filter((l) => lessonMarketplace(l.courseId) === mp).map(toLessonItem),
          ];
          shelves.push(cap(items, SHELF_CAP, newShelfKey(mp), `Новое на ${MARKETPLACE_LABELS[mp] ?? mp}`, mp));
        }
      }

      // 5. Быстрые победы (QUICK)
      shelves.push(cap([...jobsWithBadge('QUICK').map(toJobItem), ...lessonsWithBadge('QUICK').map(toLessonItem)], SHELF_CAP, 'quick', 'Быстрые победы'));

      // 6. Хит платформы (HOT)
      shelves.push(cap([...jobsWithBadge('HOT').map(toJobItem), ...lessonsWithBadge('HOT').map(toLessonItem)], SHELF_CAP, 'hot', 'Хит платформы'));

      return shelves.filter((s): s is StorefrontShelf => s !== null);
    } catch (e) {
      throw handleDatabaseError(e);
    }
  }),
});
