import type { PrismaClient } from '@mpstats/db';
import type {
  DiagnosticQuestion,
  LearningPathSection,
  SectionedLearningPath,
  SkillCategory,
  SkillProfile,
} from '@mpstats/shared';
import { parseLearningPath } from '@mpstats/shared';
import { generateSectionedPath } from '../routers/diagnostic';
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
 * Rebuild a legacy flat-format LearningPath (string[]) into the sectioned-format
 * (Phase 23+ shape) on first read after Phase 58 ships.
 *
 * Contract:
 * - NEVER touches LessonProgress rows (D-07).
 * - Wrapped in $transaction so partial failure → no half-migrated state.
 * - Preserves manually-added lessons via 'custom' section (D-08, over-inclusive fallback).
 * - Returns { rebuilt: false } for: missing path, already sectioned, no completed diagnostic, error.
 *   Caller falls back to existing flat branch (D-09).
 * - Auto-seeds addedJobs from getRecommendedJobsFromGaps with marketplace filter (D-16).
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
      return { rebuilt: false, reason: 'not-flat-or-not-found' };
    }

    const parsed = parseLearningPath(path.lessons);
    if (!Array.isArray(parsed)) {
      // already sectioned — idempotent no-op
      return { rebuilt: false, reason: 'not-flat-or-not-found' };
    }

    const flatLessonIds: string[] = parsed;

    const session = await prisma.diagnosticSession.findFirst({
      where: { userId, status: 'COMPLETED' },
      orderBy: { completedAt: 'desc' },
      select: { id: true, questions: true },
    });

    if (!session) {
      return { rebuilt: false, reason: 'no-diagnostic' };
    }

    const answers = await prisma.diagnosticAnswer.findMany({
      where: { sessionId: session.id },
      select: { isCorrect: true, sourceData: true, skillCategory: true, questionId: true },
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

    const sessionQuestions = (session.questions as DiagnosticQuestion[] | null) ?? [];

    // Build sectioned shape (errors / deepening / growth / advanced).
    // On failure → fallback path puts ALL old flat ids into custom (D-08 safe).
    let sectioned: SectionedLearningPath | null = null;
    let generatedAllIds = new Set<string>();
    try {
      const generated = await generateSectionedPath(
        prisma,
        skillProfile,
        session.id,
        answers.map((a) => ({
          isCorrect: a.isCorrect,
          sourceData: a.sourceData as any,
          skillCategory: a.skillCategory,
          questionId: a.questionId,
        })),
        sessionQuestions,
      );
      sectioned = generated;
      for (const s of generated.sections) {
        for (const id of s.lessonIds) generatedAllIds.add(id);
      }
    } catch (err) {
      console.error('[legacy-path-rebuild] generateSectionedPath failed, using fallback:', err);
      sectioned = null;
    }

    // Detect manual additions: ids in old flat[] not covered by AI sections.
    // If generation failed OR yielded < 5 lessons total → fallback: ALL flat ids → custom (D-08).
    const fallback = sectioned === null || generatedAllIds.size < 5;
    const customLessonIds = fallback
      ? [...flatLessonIds]
      : flatLessonIds.filter((id) => !generatedAllIds.has(id));

    const customSection: LearningPathSection = {
      id: 'custom',
      title: 'Мои уроки',
      description: 'Уроки, добавленные вручную',
      lessonIds: customLessonIds,
    };

    const baseSections: LearningPathSection[] = sectioned
      ? sectioned.sections.filter((s) => s.id !== 'custom')
      : [];

    const finalSectioned: SectionedLearningPath = {
      version: 2,
      sections: [...baseSections, customSection],
      generatedFromSessionId: session.id,
    };

    // Marketplace-aware job recommendations (D-16).
    const profile = await prisma.userProfile.findUnique({
      where: { id: userId },
      select: { marketplaces: true },
    });
    const userMarketplaces = profile?.marketplaces ?? [];

    const recommendedJobs = await getRecommendedJobsFromGaps(prisma, {
      skillProfile,
      userMarketplaces,
      limit: 3,
    });
    const addedJobIds = recommendedJobs.map((j) => j.id);

    // Single $transaction wraps the LearningPath write. LessonProgress strictly untouched.
    await prisma.$transaction(async (tx) => {
      await tx.learningPath.update({
        where: { userId },
        data: {
          lessons: finalSectioned as any,
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
