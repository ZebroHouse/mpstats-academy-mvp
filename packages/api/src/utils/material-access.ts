import type { PrismaClient } from '@mpstats/db';
import type { AssistantMaterialRef } from '@mpstats/ai';
import {
  getUserActiveSubscriptions,
  getUserAdminBypass,
  getFirstJobLessonIds,
  isLessonAccessible,
} from './access';
import { isFeatureEnabled } from './feature-flags';

/**
 * Батч: множество materialId → Set доступных.
 *
 * Материал доступен ⟺ у него ≥1 видимый прикреплённый урок, доступный юзеру.
 * Зеркалит D-23 ACL из `material.getSignedUrl`, но без N+1: subs / billing-flag /
 * admin-bypass / first-job-lessons резолвятся один раз для всей пачки, а не на
 * каждый урок каждого материала.
 */
export async function resolveAccessibleMaterialIds(
  prisma: PrismaClient,
  userId: string,
  materialIds: string[],
): Promise<Set<string>> {
  if (materialIds.length === 0) return new Set();

  const materials = await prisma.material.findMany({
    where: { id: { in: materialIds }, isHidden: false },
    select: {
      id: true,
      lessons: {
        where: { lesson: { isHidden: false } },
        select: { lesson: { select: { id: true, order: true, courseId: true } } },
      },
    },
  });

  const allLessonIds = materials.flatMap((m) => m.lessons.map((lm) => lm.lesson.id));

  const [subs, billingEnabled, isAdminBypass, firstJobLessonIds] = await Promise.all([
    getUserActiveSubscriptions(userId, prisma),
    isFeatureEnabled('billing_enabled'),
    getUserAdminBypass(userId, prisma),
    getFirstJobLessonIds(prisma, allLessonIds),
  ]);

  const accessible = new Set<string>();
  for (const m of materials) {
    const ok = m.lessons.some((lm) =>
      isLessonAccessible(
        { order: lm.lesson.order, courseId: lm.lesson.courseId },
        subs,
        billingEnabled,
        isAdminBypass,
        firstJobLessonIds.has(lm.lesson.id),
      ),
    );
    if (ok) accessible.add(m.id);
  }
  return accessible;
}

/**
 * Pure: проставить isAccessible + занулить externalUrl у залоченных материалов,
 * чтобы ссылка на платный ресурс не утекала на фронт.
 */
export function applyMaterialAccess(
  materials: AssistantMaterialRef[],
  accessibleIds: Set<string>,
): AssistantMaterialRef[] {
  return materials.map((m) => {
    const isAccessible = accessibleIds.has(m.materialId);
    return { ...m, isAccessible, externalUrl: isAccessible ? m.externalUrl : null };
  });
}
