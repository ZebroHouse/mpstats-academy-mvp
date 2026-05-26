import type { PrismaClient } from '@mpstats/db';
import type { JobMarketplace, SkillProfile } from '@mpstats/shared';

// Mirror of diagnostic.ts CATEGORY_KEY_MAP — canonical-5 axis enum → SkillProfile key.
// Duplicated intentionally to avoid a cycle with diagnostic.ts (which imports utils elsewhere).
const AXIS_TO_PROFILE_KEY: Record<string, keyof SkillProfile> = {
  ANALYTICS: 'analytics',
  MARKETING: 'marketing',
  CONTENT: 'content',
  OPERATIONS: 'operations',
  FINANCE: 'finance',
};

export interface JobMatch {
  id: string;
  slug: string;
  title: string;
  description: string;
  marketplace: JobMarketplace;
  axes: string[];
  lessonCount: number;
  totalDurationMin: number;
  completedLessons: number;
  isRecommended: boolean;
  isInTrack: boolean;
  rank: 1 | 2 | 3;
  score: number;
  matchedAxes: string[];
}

export interface GetRecommendedJobsParams {
  skillProfile: SkillProfile;
  userMarketplaces: string[];
  addedJobIds?: string[];
  limit?: number;
}

export function computeEffectiveMarketplaces(userMarketplaces: string[]): Array<'WB' | 'OZON'> {
  const filtered = (userMarketplaces || []).filter(
    (m): m is 'WB' | 'OZON' => m === 'WB' || m === 'OZON',
  );
  return filtered.length > 0 ? filtered : ['WB', 'OZON'];
}

function pickWeakestAxes(skillProfile: SkillProfile, count: number): string[] {
  const entries: Array<{ axis: string; value: number }> = [];
  for (const [axis, key] of Object.entries(AXIS_TO_PROFILE_KEY)) {
    entries.push({ axis, value: skillProfile[key] ?? 0 });
  }
  entries.sort((a, b) => a.value - b.value || a.axis.localeCompare(b.axis));
  return entries.slice(0, count).map((e) => e.axis);
}

export async function getRecommendedJobsFromGaps(
  prisma: PrismaClient,
  params: GetRecommendedJobsParams,
): Promise<JobMatch[]> {
  const { skillProfile, userMarketplaces, addedJobIds = [], limit = 3 } = params;

  const weakAxes = pickWeakestAxes(skillProfile, 2);
  const weakAxesSet = new Set(weakAxes);
  const effective = computeEffectiveMarketplaces(userMarketplaces);
  const allowed = [...effective, 'BOTH'];

  const jobs = await prisma.job.findMany({
    where: {
      isPublished: true,
      marketplace: { in: allowed as any },
    },
    include: {
      lessons: {
        where: { lesson: { isHidden: false, course: { isHidden: false } } },
        include: {
          lesson: { select: { duration: true } },
        },
      },
    },
  });

  const addedSet = new Set(addedJobIds);

  const scored = jobs
    .map((job) => {
      const axes = Array.isArray(job.axes) ? (job.axes as string[]) : [];
      const matchedAxes = axes.filter((a) => weakAxesSet.has(a));
      if (matchedAxes.length === 0) return null;

      const score = matchedAxes.reduce((sum, axis) => {
        const key = AXIS_TO_PROFILE_KEY[axis];
        const correctRate = key ? (skillProfile[key] ?? 0) / 100 : 0;
        return sum + (1 - correctRate);
      }, 0);

      const totalDurationMin = job.lessons.reduce(
        (s, jl) => s + (jl.lesson.duration ?? 0),
        0,
      );

      return {
        id: job.id,
        slug: job.slug,
        title: job.title,
        description: job.description,
        marketplace: job.marketplace as JobMarketplace,
        axes,
        lessonCount: job.lessons.length,
        totalDurationMin,
        completedLessons: 0,
        isRecommended: true,
        isInTrack: addedSet.has(job.id),
        score,
        matchedAxes,
      };
    })
    .filter((j): j is NonNullable<typeof j> => j !== null);

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.id.localeCompare(b.id);
  });

  return scored.slice(0, limit).map((j, idx) => ({
    ...j,
    rank: (idx + 1) as 1 | 2 | 3,
  }));
}
