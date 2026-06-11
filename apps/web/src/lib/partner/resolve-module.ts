// apps/web/src/lib/partner/resolve-module.ts
import type { PrismaClient } from '@mpstats/db';

export const MPSTATS_PARTNER_KEY = 'mpstats';

export async function resolvePartnerLessonId(
  prisma: Pick<PrismaClient, 'lesson'>,
  moduleCode: string,
): Promise<string | null> {
  if (!moduleCode) return null;
  const lesson = await prisma.lesson.findFirst({
    where: {
      isHidden: false,
      course: { partnerKey: MPSTATS_PARTNER_KEY, isHidden: false },
      metadata: { path: ['partnerModuleKey'], equals: moduleCode },
    },
    select: { id: true },
  });
  return lesson?.id ?? null;
}
