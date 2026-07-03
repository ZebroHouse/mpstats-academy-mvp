import type { PrismaClient } from '@mpstats/db';
import type { AxisLearningPath, SkillCategory, SkillProfile } from '@mpstats/shared';
import { parseLearningPath } from '@mpstats/shared';
import { generateAxisPath } from '../routers/diagnostic';
import { getRecommendedJobsFromGaps } from './job-matcher';

export type RebuildResult = {
  rebuilt: boolean;
  reason?: string;
};

function calculateSkillProfileFromAnswers(
  answers: Array<{ skillCategory: SkillCategory; isCorrect: boolean }>,
): SkillProfile {
  const buckets: Record<string, { correct: number; total: number }> = {};
  for (const a of answers) {
    if (!buckets[a.skillCategory]) buckets[a.skillCategory] = { correct: 0, total: 0 };
    buckets[a.skillCategory].total++;
    if (a.isCorrect) buckets[a.skillCategory].correct++;
  }
  const pct = (cat: string) =>
    buckets[cat] && buckets[cat].total > 0
      ? Math.round((buckets[cat].correct / buckets[cat].total) * 100)
      : 0;
  return {
    analytics: pct('ANALYTICS'),
    marketing: pct('MARKETING'),
    content: pct('CONTENT'),
    operations: pct('OPERATIONS'),
    finance: pct('FINANCE'),
  };
}

/**
 * Rebuild a legacy flat-format (string[]) or v2 SectionedLearningPath into the
 * axis-centric AxisLearningPath (v3) on read. Never touches LessonProgress (D-07).
 *
 * Contract:
 * - Already v3 → no-op { rebuilt: false, reason: 'already-v3' }.
 * - No completed diagnostic / no answers → { rebuilt: false, reason: 'no-diagnostic' }.
 * - Computes SkillProfile from answers, recommends jobs (marketplace-aware, D-16),
 *   then delegates to generateAxisPath for the v3 shape.
 * - Persists lessons (v3) + addedJobs inside a single $transaction.
 * - Errors are swallowed → { rebuilt: false, reason: ... }; caller falls back.
 */
export async function rebuildLegacyLearningPath(
  prisma: PrismaClient,
  userId: string,
): Promise<RebuildResult> {
  try {
    const path = await prisma.learningPath.findUnique({
      where: { userId },
      select: { lessons: true },
    });

    if (!path || !path.lessons) {
      return { rebuilt: false, reason: 'not-found' };
    }

    const parsed = parseLearningPath(path.lessons);
    if (!Array.isArray(parsed) && (parsed as any).version === 3) {
      // already axis v3 — idempotent no-op
      return { rebuilt: false, reason: 'already-v3' };
    }

    const session = await prisma.diagnosticSession.findFirst({
      where: { userId, status: 'COMPLETED' },
      orderBy: { completedAt: 'desc' },
      select: { id: true },
    });

    if (!session) {
      return { rebuilt: false, reason: 'no-diagnostic' };
    }

    const answers = await prisma.diagnosticAnswer.findMany({
      where: { sessionId: session.id },
      select: { isCorrect: true, sourceData: true, skillCategory: true },
    });

    if (answers.length === 0) {
      return { rebuilt: false, reason: 'no-diagnostic' };
    }

    const skillProfile = calculateSkillProfileFromAnswers(
      answers.map((a) => ({
        skillCategory: a.skillCategory as SkillCategory,
        isCorrect: a.isCorrect,
      })),
    );

    // Marketplace-aware job recommendations (D-16).
    const profile = await prisma.userProfile.findUnique({
      where: { id: userId },
      select: { marketplaces: true },
    });
    const recommendedJobs = await getRecommendedJobsFromGaps(prisma, {
      skillProfile,
      userMarketplaces: profile?.marketplaces ?? [],
      limit: 3,
    });

    let axisPath: AxisLearningPath;
    try {
      axisPath = await generateAxisPath(
        prisma,
        skillProfile,
        session.id,
        answers.map((a) => ({ isCorrect: a.isCorrect, sourceData: a.sourceData as any })),
        recommendedJobs.map((j) => ({ id: j.id, matchedAxes: j.matchedAxes })),
      );
    } catch (err) {
      console.error('[legacy-path-rebuild] generateAxisPath failed:', err);
      return { rebuilt: false, reason: 'generation-failed' };
    }

    const addedJobIds = recommendedJobs.map((j) => j.id);

    // Single $transaction wraps the LearningPath write. LessonProgress strictly untouched.
    await prisma.$transaction(async (tx) => {
      await tx.learningPath.update({
        where: { userId },
        data: {
          lessons: axisPath as any,
          addedJobs: addedJobIds as any,
          generatedAt: new Date(),
        },
      });
    });

    return { rebuilt: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[legacy-path-rebuild] error:', err);
    return { rebuilt: false, reason: `error: ${msg}` };
  }
}
