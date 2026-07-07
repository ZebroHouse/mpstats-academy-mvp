import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { handleDatabaseError } from '../utils/db-errors';
import {
  getUserActiveSubscriptions, isLessonAccessible, getFirstJobLessonIds,
} from '../utils/access';
import { isFeatureEnabled } from '../utils/feature-flags';
import { filterByMarketplace } from './job';
import {
  GOAL_TO_AXES, GOAL_LABELS, MARKETPLACE_LABELS, goalShelfKey, newShelfKey, resolveShelfKey,
} from '../utils/storefront-shelves';
import { resolveFirstLesson, FIRST_LESSON_FALLBACK_ID } from '../utils/first-lesson';
import type { JobSummary, LessonWithProgress, StorefrontShelf, StorefrontItem } from '@mpstats/shared';

const SHELF_CAP = 12;
const START_CAP = 3;

function lessonMarketplace(courseId: string): 'WB' | 'OZON' {
  return courseId === '05_ozon' ? 'OZON' : 'WB';
}

// Access context shared by every lesson-lock check within one request.
type ActiveSubscriptions = Awaited<ReturnType<typeof getUserActiveSubscriptions>>;
interface AccessCtx {
  subs: ActiveSubscriptions;
  billingEnabled: boolean;
  isAdminBypass: boolean;
  firstJobLessonIds: Set<string>;
}

export interface HeroLesson {
  id: string;
  title: string;
  duration: number;
  courseId: string;
}

function lessonLocked(l: { id: string; order: number; courseId: string }, a: AccessCtx): boolean {
  return !isLessonAccessible(
    { order: l.order, courseId: l.courseId }, a.subs, a.billingEnabled, a.isAdminBypass, a.firstJobLessonIds.has(l.id),
  );
}

function enrichJob(j: any): JobSummary {
  const lessons = j.lessons;
  return {
    id: j.id, slug: j.slug, title: j.title, description: j.description,
    marketplace: j.marketplace, axes: (j.axes as string[]) ?? [],
    lessonCount: lessons.length,
    totalDurationMin: lessons.reduce((s: number, jl: any) => s + (jl.lesson.duration ?? 0), 0),
    completedLessons: lessons.filter((jl: any) => jl.lesson.progress.some((p: any) => p.status === 'COMPLETED')).length,
    isRecommended: false, isInTrack: false, badges: (j.badges as string[]) ?? [],
  };
}

function enrichLesson(l: any, a: AccessCtx): LessonWithProgress {
  return {
    id: l.id, courseId: l.courseId, title: l.title, description: l.description,
    videoUrl: l.videoUrl || '', videoId: l.videoId, duration: l.duration || 0, order: l.order,
    skillCategory: l.skillCategory, skillLevel: l.skillLevel,
    status: l.progress?.[0]?.status || 'NOT_STARTED',
    watchedPercent: l.progress?.[0]?.watchedPercent || 0,
    locked: lessonLocked(l, a), badges: (l.badges as string[]) ?? [],
  };
}

// Single data-load both procedures share — same queries, one Promise.all.
async function loadStorefrontData(ctx: any, userId: string) {
  const [profile, jobsRaw, badgedLessons, inProgressRaw, progressCount, subs, billingEnabled, firstJobLessonIds] = await Promise.all([
    ctx.prisma.userProfile.findUnique({ where: { id: userId }, select: { goals: true, marketplaces: true, role: true } }),
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
    ctx.prisma.lessonProgress.count({ where: { path: { userId }, status: { in: ['IN_PROGRESS', 'COMPLETED'] } } }),
    getUserActiveSubscriptions(userId, ctx.prisma),
    isFeatureEnabled('billing_enabled'),
    getFirstJobLessonIds(ctx.prisma),
  ]);

  const isAdminBypass = profile?.role === 'ADMIN' || profile?.role === 'SUPERADMIN';
  const accessCtx: AccessCtx = { subs, billingEnabled, isAdminBypass, firstJobLessonIds };
  return { profile, jobsRaw, badgedLessons, inProgressRaw, progressCount, accessCtx };
}

// Map an IN_PROGRESS progress row onto its lesson, carrying status/percent for enrichLesson.
function progressRowToLesson(p: any): any {
  return { ...p.lesson, progress: [{ status: p.status, watchedPercent: p.watchedPercent }] };
}

export const dashboardRouter = router({
  getStorefront: protectedProcedure.query(async ({ ctx }): Promise<StorefrontShelf[]> => {
    try {
      const userId = ctx.user.id;
      const { profile, jobsRaw, badgedLessons, inProgressRaw, progressCount, accessCtx } = await loadStorefrontData(ctx, userId);

      const isReturning = progressCount > 0;
      const goals = (profile?.goals ?? []) as string[];
      const marketplaces = ((profile?.marketplaces ?? []) as string[]).filter((m) => m === 'WB' || m === 'OZON');

      const toJobItem = (j: any): StorefrontItem => ({ kind: 'job', job: enrichJob(j) });
      const toLessonItem = (l: any): StorefrontItem => ({ kind: 'lesson', lesson: enrichLesson(l, accessCtx) });

      const cap = (items: StorefrontItem[], n: number, shelfKey: string, title: string, marketplace?: 'WB' | 'OZON'): StorefrontShelf | null => {
        if (items.length === 0) return null;
        return { shelfKey, title, marketplace, items: items.slice(0, n), totalCount: items.length };
      };

      const lessonsWithBadge = (b: string) => badgedLessons.filter((l: any) => (l.badges as string[]).includes(b));
      const jobsWithBadge = (b: string) => jobsRaw.filter((j: any) => (j.badges as string[]).includes(b));

      // Build each shelf independently, then assemble in a user-state-aware order below.

      // Начни отсюда (START, mix, ≤3) — shown to NEW (cold) users only.
      const startShelf = cap(
        [...jobsWithBadge('START').map(toJobItem), ...lessonsWithBadge('START').map(toLessonItem)],
        START_CAP, 'start', 'Начни отсюда',
      );

      // Продолжить (IN_PROGRESS lessons) — top shelf for returning users.
      const continueShelf = cap(
        inProgressRaw.map((p: any) => toLessonItem(progressRowToLesson(p))),
        SHELF_CAP, 'continue', 'Продолжить',
      );

      // Под твою задачу: {goal} (one per goal)
      const goalShelves: (StorefrontShelf | null)[] = [];
      for (const goal of goals) {
        const axes = GOAL_TO_AXES[goal] ?? [];
        let items: StorefrontItem[];
        if (axes.length === 0) {
          // NEW_MARKETPLACE → START-tagged beginner content
          items = [...jobsWithBadge('START').map(toJobItem), ...lessonsWithBadge('START').map(toLessonItem)];
        } else {
          const axisJobs = jobsRaw.filter((j: any) => ((j.axes as string[]) ?? []).some((a) => axes.includes(a)));
          const axisLessons = badgedLessons.filter((l: any) => axes.includes(l.skillCategory));
          items = [...axisJobs.map(toJobItem), ...axisLessons.map(toLessonItem)];
        }
        goalShelves.push(cap(items, SHELF_CAP, goalShelfKey(goal), `Под твою задачу: ${GOAL_LABELS[goal] ?? goal}`));
      }

      // Хит платформы (HOT)
      const hotShelf = cap([...jobsWithBadge('HOT').map(toJobItem), ...lessonsWithBadge('HOT').map(toLessonItem)], SHELF_CAP, 'hot', 'Хит платформы');

      // Новое на {marketplace} (NEW + marketplace split)
      const newLessons = lessonsWithBadge('NEW');
      const newJobs = jobsWithBadge('NEW');
      const newShelves: (StorefrontShelf | null)[] = [];
      if (marketplaces.length === 0) {
        newShelves.push(cap([...newJobs.map(toJobItem), ...newLessons.map(toLessonItem)], SHELF_CAP, 'new', 'Новое на платформе'));
      } else {
        for (const mp of marketplaces) {
          const items = [
            ...filterByMarketplace(newJobs as any[], mp).map(toJobItem),
            ...newLessons.filter((l: any) => lessonMarketplace(l.courseId) === mp).map(toLessonItem),
          ];
          newShelves.push(cap(items, SHELF_CAP, newShelfKey(mp), `Новое на ${MARKETPLACE_LABELS[mp] ?? mp}`, mp));
        }
      }

      // Быстрые победы (QUICK)
      const quickShelf = cap([...jobsWithBadge('QUICK').map(toJobItem), ...lessonsWithBadge('QUICK').map(toLessonItem)], SHELF_CAP, 'quick', 'Быстрые победы');

      // State-aware assembly: returning → continue first (start hidden); new → start first.
      const shelves: (StorefrontShelf | null)[] = [
        isReturning ? continueShelf : startShelf,
        ...goalShelves,
        hotShelf,
        ...newShelves,
        quickShelf,
      ];

      return shelves.filter((s): s is StorefrontShelf => s !== null);
    } catch (e) {
      throw handleDatabaseError(e);
    }
  }),

  // Cold-user hero: the single "first lesson" to land on right after onboarding.
  // Returns null for returning users (they see «Продолжить» instead) and when the
  // mapped + fallback lessons are both unavailable.
  getFirstLesson: protectedProcedure.query(async ({ ctx }): Promise<HeroLesson | null> => {
    try {
      const userId = ctx.user.id;
      const [profile, progressCount] = await Promise.all([
        ctx.prisma.userProfile.findUnique({ where: { id: userId }, select: { goals: true, marketplaces: true } }),
        ctx.prisma.lessonProgress.count({ where: { path: { userId }, status: { in: ['IN_PROGRESS', 'COMPLETED'] } } }),
      ]);
      if (progressCount > 0) return null;

      const goals = (profile?.goals ?? []) as string[];
      const marketplaces = (profile?.marketplaces ?? []) as string[];
      const lessonId = resolveFirstLesson(goals, marketplaces);

      const load = (id: string) =>
        ctx.prisma.lesson.findFirst({
          where: { id, isHidden: false, course: { isHidden: false } },
          select: { id: true, title: true, duration: true, courseId: true },
        });

      let lesson = await load(lessonId);
      if (!lesson && lessonId !== FIRST_LESSON_FALLBACK_ID) lesson = await load(FIRST_LESSON_FALLBACK_ID);
      if (!lesson) return null;

      return { id: lesson.id, title: lesson.title, duration: lesson.duration ?? 0, courseId: lesson.courseId };
    } catch (e) {
      throw handleDatabaseError(e);
    }
  }),

  getCollection: protectedProcedure
    .input(z.object({
      shelfKey: z.string(),
      type: z.enum(['all', 'jobs', 'lessons']).default('all'),
      marketplace: z.enum(['WB', 'OZON']).optional(),
      badge: z.enum(['START', 'NEW', 'HOT', 'QUICK']).optional(),
    }))
    .query(async ({ ctx, input }): Promise<{ jobs: JobSummary[]; lessons: LessonWithProgress[] }> => {
      try {
        const spec = resolveShelfKey(input.shelfKey);
        if (!spec) return { jobs: [], lessons: [] };

        const userId = ctx.user.id;
        const { jobsRaw, badgedLessons, inProgressRaw, accessCtx } = await loadStorefrontData(ctx, userId);

        let jobs: any[] = [];
        let lessons: any[] = [];
        if (spec.type === 'badge') {
          jobs = jobsRaw.filter((j: any) => (j.badges as string[]).includes(spec.badge));
          lessons = badgedLessons.filter((l: any) => (l.badges as string[]).includes(spec.badge));
        } else if (spec.type === 'continue') {
          lessons = inProgressRaw.map(progressRowToLesson);
        } else if (spec.type === 'goal') {
          const axes = GOAL_TO_AXES[spec.goal] ?? [];
          if (axes.length === 0) {
            jobs = jobsRaw.filter((j: any) => (j.badges as string[]).includes('START'));
            lessons = badgedLessons.filter((l: any) => (l.badges as string[]).includes('START'));
          } else {
            jobs = jobsRaw.filter((j: any) => ((j.axes as string[]) ?? []).some((a) => axes.includes(a)));
            lessons = badgedLessons.filter((l: any) => axes.includes(l.skillCategory));
          }
        } else if (spec.type === 'new') {
          jobs = jobsRaw.filter((j: any) => (j.badges as string[]).includes('NEW'));
          lessons = badgedLessons.filter((l: any) => (l.badges as string[]).includes('NEW'));
          const mpRaw = input.marketplace ?? spec.marketplace;
          const mp = mpRaw === 'WB' || mpRaw === 'OZON' ? mpRaw : undefined;
          if (mp) {
            jobs = filterByMarketplace(jobs, mp);
            lessons = lessons.filter((l: any) => lessonMarketplace(l.courseId) === mp);
          }
        }

        // sub-filter chips
        if (input.badge) {
          jobs = jobs.filter((j: any) => (j.badges as string[]).includes(input.badge!));
          lessons = lessons.filter((l: any) => (l.badges as string[]).includes(input.badge!));
        }
        if (input.marketplace && spec.type !== 'new') {
          jobs = filterByMarketplace(jobs, input.marketplace);
          lessons = lessons.filter((l: any) => lessonMarketplace(l.courseId) === input.marketplace);
        }

        return {
          jobs: input.type === 'lessons' ? [] : jobs.map(enrichJob),
          lessons: input.type === 'jobs' ? [] : lessons.map((l) => enrichLesson(l, accessCtx)),
        };
      } catch (e) {
        throw handleDatabaseError(e);
      }
    }),
});
