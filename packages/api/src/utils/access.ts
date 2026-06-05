import type { PrismaClient } from '@mpstats/db';
import { isFeatureEnabled } from './feature-flags';

const FREE_LESSON_THRESHOLD = 2; // lessons with order <= 2 are free

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
 * Pure synchronous check: can user access this lesson?
 *
 * `isAdminBypass` — pass `true` for users with role ADMIN/SUPERADMIN so they
 * get the same full access as `checkLessonAccess` grants asynchronously.
 * Without this flag, staff-only users would see paywall locks on all non-free
 * lessons from courses they don't personally have subs for.
 */
export function isLessonAccessible(
  lesson: { order: number; courseId: string; isPartnerFree?: boolean },
  subscriptions: SubscriptionWithPlan[],
  billingEnabled: boolean,
  isAdminBypass = false,
): boolean {
  if (!billingEnabled) return true;
  if (isAdminBypass) return true;
  if (lesson.isPartnerFree) return true; // партнёрский курс — полностью бесплатный
  if (lesson.order <= FREE_LESSON_THRESHOLD) return true;
  if (subscriptions.some((s) => s.plan.type === 'PLATFORM')) return true;
  if (subscriptions.some((s) => s.plan.type === 'COURSE' && s.courseId === lesson.courseId)) return true;
  return false;
}

/**
 * Fetch role-based admin bypass flag for a user.
 * ADMIN and SUPERADMIN get full access regardless of subscription.
 */
export async function getUserAdminBypass(
  userId: string,
  prisma: PrismaClient,
): Promise<boolean> {
  const profile = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return profile?.role === 'ADMIN' || profile?.role === 'SUPERADMIN';
}

/**
 * Full async access check for a single lesson.
 */
export async function checkLessonAccess(
  userId: string,
  lesson: { order: number; courseId: string; isPartnerFree?: boolean },
  prisma: PrismaClient,
): Promise<AccessResult> {
  const billingEnabled = await isFeatureEnabled('billing_enabled');

  if (!billingEnabled) {
    return { hasAccess: true, reason: 'billing_disabled', hasPlatformSubscription: false };
  }

  // Admin/Superadmin bypass — full access regardless of subscription
  const userProfile = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (userProfile?.role === 'ADMIN' || userProfile?.role === 'SUPERADMIN') {
    return { hasAccess: true, reason: 'admin_bypass', hasPlatformSubscription: false };
  }

  if (lesson.isPartnerFree) {
    return { hasAccess: true, reason: 'free_lesson', hasPlatformSubscription: false };
  }

  const subscriptions = await getUserActiveSubscriptions(userId, prisma);
  const hasPlatformSub = subscriptions.some((s) => s.plan.type === 'PLATFORM');

  if (lesson.order <= FREE_LESSON_THRESHOLD) {
    return { hasAccess: true, reason: 'free_lesson', hasPlatformSubscription: hasPlatformSub };
  }

  if (hasPlatformSub) {
    return { hasAccess: true, reason: 'platform_subscription', hasPlatformSubscription: true };
  }

  if (subscriptions.some((s) => s.plan.type === 'COURSE' && s.courseId === lesson.courseId)) {
    return { hasAccess: true, reason: 'course_subscription', hasPlatformSubscription: false };
  }

  return { hasAccess: false, reason: 'subscription_required', hasPlatformSubscription: false };
}
