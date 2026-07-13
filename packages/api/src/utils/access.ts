import type { PrismaClient } from '@mpstats/db';
import { isOzonCourse } from '@mpstats/shared';
import { isFeatureEnabled } from './feature-flags';

/**
 * Does a COURSE subscription unlock `courseId`?
 *
 * A COURSE plan normally grants only its own `courseId`. Exception: the two
 * Ozon courses («Работа с Ozon» + «Ozon PROдвижение») are sold as one bundle —
 * buying the «Ozon» course tariff unlocks both. See [[isOzonCourse]].
 */
function courseSubscriptionUnlocks(sub: SubscriptionWithPlan, courseId: string): boolean {
  if (sub.plan.type !== 'COURSE' || !sub.courseId) return false;
  if (sub.courseId === courseId) return true;
  return isOzonCourse(sub.courseId) && isOzonCourse(courseId);
}

export interface AccessResult {
  hasAccess: boolean;
  reason: 'free_lesson' | 'platform_subscription' | 'course_subscription' | 'billing_disabled' | 'subscription_required' | 'admin_bypass';
  hasPlatformSubscription: boolean;
}

type SubscriptionWithPlan = {
  id: string;
  courseId: string | null;
  plan: { type: string };
};

/**
 * Fetch all active subscriptions for a user.
 * Includes ACTIVE and CANCELLED (still within billing period).
 */
export async function getUserActiveSubscriptions(
  userId: string,
  prisma: PrismaClient,
): Promise<SubscriptionWithPlan[]> {
  const now = new Date();
  return prisma.subscription.findMany({
    where: {
      userId,
      status: { in: ['ACTIVE', 'TRIAL', 'CANCELLED'] },
      currentPeriodEnd: { gt: now },
    },
    select: {
      id: true,
      courseId: true,
      plan: { select: { type: true } },
    },
  });
}

/**
 * Lessons that are the first (minimum `JobLesson.order`) lesson of at least one
 * published job. Such a lesson is free everywhere it appears — in a job card,
 * in its course, and in the player — because being-first is a property of the
 * lesson, not of the screen it's shown on. On ties at the minimum order, every
 * lesson at that minimum is included.
 *
 * `lessonIds` (optional) narrows the scan to published jobs that contain at
 * least one of those lessons (perf), then returns only the requested first
 * lessons. We still load every JobLesson row of each matching job — a single
 * requested lesson alone can't tell us whether it's the job's minimum.
 */
export async function getFirstJobLessonIds(
  prisma: PrismaClient,
  lessonIds?: string[],
): Promise<Set<string>> {
  if (lessonIds && lessonIds.length === 0) return new Set();

  const jobWhere = lessonIds
    ? { isPublished: true, lessons: { some: { lessonId: { in: lessonIds } } } }
    : { isPublished: true };

  const rows = await prisma.jobLesson.findMany({
    where: { job: jobWhere },
    select: { jobId: true, lessonId: true, order: true },
  });

  const minOrderByJob = new Map<string, number>();
  for (const r of rows) {
    const cur = minOrderByJob.get(r.jobId);
    if (cur === undefined || r.order < cur) minOrderByJob.set(r.jobId, r.order);
  }

  const restrict = lessonIds ? new Set(lessonIds) : null;
  const firstSet = new Set<string>();
  for (const r of rows) {
    if (r.order !== minOrderByJob.get(r.jobId)) continue;
    if (restrict && !restrict.has(r.lessonId)) continue;
    firstSet.add(r.lessonId);
  }
  return firstSet;
}

/**
 * Pure synchronous check: can user access this lesson?
 *
 * `isAdminBypass` — pass `true` for users with role ADMIN/SUPERADMIN so they
 * get the same full access as `checkLessonAccess` grants asynchronously.
 * Without this flag, staff-only users would see paywall locks on all non-free
 * lessons from courses they don't personally have subs for.
 *
 * `isFirstJobLesson` — pass `true` if the lesson is the first lesson of at least
 * one published job (see `getFirstJobLessonIds`); such lessons are free.
 */
export function isLessonAccessible(
  lesson: { order: number; courseId: string; isPartnerFree?: boolean },
  subscriptions: SubscriptionWithPlan[],
  billingEnabled: boolean,
  isAdminBypass = false,
  isFirstJobLesson = false,
): boolean {
  if (!billingEnabled) return true;
  if (isAdminBypass) return true;
  if (lesson.isPartnerFree) return true; // партнёрский курс — полностью бесплатный
  if (isFirstJobLesson) return true; // первый урок опубликованной джобы — бесплатный
  if (subscriptions.some((s) => s.plan.type === 'PLATFORM')) return true;
  if (subscriptions.some((s) => courseSubscriptionUnlocks(s, lesson.courseId))) return true;
  return false;
}

/**
 * Fetch role-based admin bypass flag for a user.
 * ADMIN, SUPERADMIN and SALES get full access regardless of subscription.
 */
export async function getUserAdminBypass(
  userId: string,
  prisma: PrismaClient,
): Promise<boolean> {
  const profile = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return profile?.role === 'ADMIN' || profile?.role === 'SUPERADMIN' || profile?.role === 'SALES';
}

/**
 * Full async access check for a single lesson.
 */
export async function checkLessonAccess(
  userId: string,
  lesson: { id: string; order: number; courseId: string; isPartnerFree?: boolean },
  prisma: PrismaClient,
): Promise<AccessResult> {
  const billingEnabled = await isFeatureEnabled('billing_enabled');

  if (!billingEnabled) {
    return { hasAccess: true, reason: 'billing_disabled', hasPlatformSubscription: false };
  }

  // Admin/Superadmin/Sales bypass — full access regardless of subscription
  const userProfile = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (userProfile?.role === 'ADMIN' || userProfile?.role === 'SUPERADMIN' || userProfile?.role === 'SALES') {
    return { hasAccess: true, reason: 'admin_bypass', hasPlatformSubscription: false };
  }

  if (lesson.isPartnerFree) {
    return { hasAccess: true, reason: 'free_lesson', hasPlatformSubscription: false };
  }

  const subscriptions = await getUserActiveSubscriptions(userId, prisma);
  const hasPlatformSub = subscriptions.some((s) => s.plan.type === 'PLATFORM');

  const firstSet = await getFirstJobLessonIds(prisma, [lesson.id]);
  if (firstSet.has(lesson.id)) {
    return { hasAccess: true, reason: 'free_lesson', hasPlatformSubscription: hasPlatformSub };
  }

  if (hasPlatformSub) {
    return { hasAccess: true, reason: 'platform_subscription', hasPlatformSubscription: true };
  }

  if (subscriptions.some((s) => courseSubscriptionUnlocks(s, lesson.courseId))) {
    return { hasAccess: true, reason: 'course_subscription', hasPlatformSubscription: false };
  }

  return { hasAccess: false, reason: 'subscription_required', hasPlatformSubscription: false };
}
