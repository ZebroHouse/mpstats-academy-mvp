import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { getBalancedQuestions } from '../mocks/questions';
import { ensureUserProfile } from '../utils/ensure-user-profile';
import { handleDatabaseError } from '../utils/db-errors';
// Phase 59 v2 (2026-06-01): runtime questions now come from a hand-curated static
// deck (see ../diagnostic/static-deck.ts). The legacy LLM bank in ../utils/question-bank.ts
// is kept dormant for potential future admin-driven generation but is not called here.
import { pickDeckForUser } from '../diagnostic/deck-picker';
import { shuffleOptions } from '../diagnostic/option-shuffler';
import { toDiagnosticQuestionSource, buildAnswerSourceData } from '../diagnostic/question-source';
import { getRecommendedJobsFromGaps } from '../utils/job-matcher';
import { cqSetUserProps, cqTrackEvent } from '../utils/carrotquest';
import type { PrismaClient } from '@mpstats/db';
import {
  SKILL_LABELS,
} from '@mpstats/shared';
import type {
  DiagnosticResult,
  DiagnosticSessionState,
  SkillProfile,
  SkillGap,
  SkillCategory,
  DiagnosticQuestion,
  SectionedLearningPath,
  LearningPathSection,
  AxisLearningPath,
  AxisLearningPathSection,
} from '@mpstats/shared';
import {
  scoreToTier,
  selectAxisLessons,
  collectErrorLessonsByAxis,
  applyPlanCaps,
  PER_AXIS_LESSON_CAP,
  PLAN_ACTIVE_LESSON_CAP,
} from '../utils/axis-path';
import type { JobMatch } from '../utils/job-matcher';

// ============== CONSTANTS ==============

const TARGET_SCORE = 70;
const QUESTIONS_PER_SESSION = 15;

// ============== RATE LIMITER ==============
// Simple sliding window rate limiter for question generation (50 req/hour per user)

const generationRateLimits =
  ((globalThis as any).__generationRateLimits as Map<string, number[]>) ||
  new Map<string, number[]>();
(globalThis as any).__generationRateLimits = generationRateLimits;

function checkRateLimit(userId: string, maxRequests: number = 50, windowMs: number = 3600000): boolean {
  const now = Date.now();
  const timestamps = generationRateLimits.get(userId) || [];
  const recent = timestamps.filter(t => now - t < windowMs);
  if (recent.length >= maxRequests) return false;
  recent.push(now);
  generationRateLimits.set(userId, recent);
  return true;
}

// ============== HELPER FUNCTIONS ==============

/**
 * Get lesson IDs by skill category from DB.
 */
async function getLessonsByCategory(
  prisma: PrismaClient,
  category: SkillCategory,
): Promise<string[]> {
  const lessons = await prisma.lesson.findMany({
    where: {
      skillCategory: category,
      isHidden: false,
      course: { isHidden: false, partnerKey: null },
    },
    orderBy: { order: 'asc' },
    select: { id: true },
  });
  return lessons.map((l) => l.id);
}

/**
 * Calculate skill gaps from a skill profile.
 * Async because getLessonsByCategory queries DB.
 */
async function calculateSkillGaps(
  prisma: PrismaClient,
  skillProfile: SkillProfile,
): Promise<SkillGap[]> {
  const categories: Array<{ key: keyof SkillProfile; category: SkillCategory; label: string }> = [
    { key: 'analytics', category: 'ANALYTICS', label: 'Аналитика' },
    { key: 'marketing', category: 'MARKETING', label: 'Маркетинг' },
    { key: 'content', category: 'CONTENT', label: 'Контент' },
    { key: 'operations', category: 'OPERATIONS', label: 'Операции' },
    { key: 'finance', category: 'FINANCE', label: 'Финансы' },
  ];

  const gaps: SkillGap[] = await Promise.all(
    categories.map(async ({ key, category, label }) => {
      const currentScore = skillProfile[key];
      const gap = Math.max(0, TARGET_SCORE - currentScore);
      const priority: 'HIGH' | 'MEDIUM' | 'LOW' =
        gap >= 20 ? 'HIGH' : gap >= 10 ? 'MEDIUM' : 'LOW';

      return {
        category,
        label,
        currentScore,
        targetScore: TARGET_SCORE,
        gap,
        priority,
        recommendedLessons: await getLessonsByCategory(prisma, category),
      };
    }),
  );

  // Sort by gap descending (highest priority first)
  return gaps.sort((a, b) => b.gap - a.gap);
}

/**
 * Get recommended lessons from skill gaps (top lessons from weak categories).
 */
function getRecommendedLessonsFromGaps(gaps: SkillGap[], maxLessons: number = 5): string[] {
  return gaps
    .filter((g) => g.gap > 0)
    .flatMap((g) => g.recommendedLessons.slice(0, 2))
    .slice(0, maxLessons);
}

/**
 * Calculate skill profile scores from diagnostic answers.
 */
function calculateSkillProfileFromAnswers(
  answers: Array<{ skillCategory: SkillCategory; isCorrect: boolean }>,
): SkillProfile {
  const categoryScores: Record<string, { correct: number; total: number }> = {};

  for (const answer of answers) {
    if (!categoryScores[answer.skillCategory]) {
      categoryScores[answer.skillCategory] = { correct: 0, total: 0 };
    }
    categoryScores[answer.skillCategory].total++;
    if (answer.isCorrect) {
      categoryScores[answer.skillCategory].correct++;
    }
  }

  return {
    analytics: categoryScores['ANALYTICS']
      ? Math.round((categoryScores['ANALYTICS'].correct / categoryScores['ANALYTICS'].total) * 100)
      : 0,
    marketing: categoryScores['MARKETING']
      ? Math.round((categoryScores['MARKETING'].correct / categoryScores['MARKETING'].total) * 100)
      : 0,
    content: categoryScores['CONTENT']
      ? Math.round((categoryScores['CONTENT'].correct / categoryScores['CONTENT'].total) * 100)
      : 0,
    operations: categoryScores['OPERATIONS']
      ? Math.round(
          (categoryScores['OPERATIONS'].correct / categoryScores['OPERATIONS'].total) * 100,
        )
      : 0,
    finance: categoryScores['FINANCE']
      ? Math.round((categoryScores['FINANCE'].correct / categoryScores['FINANCE'].total) * 100)
      : 0,
  };
}

// ============== EXPORTED FUNCTIONS (used by profile router) ==============

/**
 * Get the latest skill profile for a user from DB.
 */
export async function getLatestSkillProfile(
  prisma: PrismaClient,
  userId: string,
): Promise<SkillProfile | null> {
  const profile = await prisma.skillProfile.findUnique({ where: { userId } });
  if (!profile) return null;
  return {
    analytics: profile.analytics,
    marketing: profile.marketing,
    content: profile.content,
    operations: profile.operations,
    finance: profile.finance,
  };
}

/**
 * Get all completed diagnostic sessions for a user from DB.
 */
export async function getCompletedSessions(prisma: PrismaClient, userId: string) {
  return prisma.diagnosticSession.findMany({
    where: { userId, status: 'COMPLETED' },
    orderBy: { completedAt: 'desc' },
  });
}

// ============== PATH GENERATION ==============

/**
 * Generate full recommended learning path from categories below TARGET_SCORE.
 * Returns lesson IDs ordered by weakness priority (lowest score first).
 */
async function generateFullRecommendedPath(
  prisma: PrismaClient,
  skillProfile: SkillProfile,
): Promise<string[]> {
  const categories: Array<{ key: keyof SkillProfile; category: SkillCategory }> = [
    { key: 'analytics', category: 'ANALYTICS' },
    { key: 'marketing', category: 'MARKETING' },
    { key: 'content', category: 'CONTENT' },
    { key: 'operations', category: 'OPERATIONS' },
    { key: 'finance', category: 'FINANCE' },
  ];

  // Sort by weakness (lowest score first), include all below TARGET_SCORE
  const weakCategories = categories
    .map((c) => ({ ...c, score: skillProfile[c.key] }))
    .filter((c) => c.score < TARGET_SCORE)
    .sort((a, b) => a.score - b.score);

  const lessonIds: string[] = [];
  for (const cat of weakCategories) {
    const lessons = await prisma.lesson.findMany({
      where: {
        skillCategory: cat.category,
        isHidden: false,
        course: { isHidden: false, partnerKey: null },
      },
      orderBy: { order: 'asc' },
      select: { id: true },
    });
    lessonIds.push(...lessons.map((l) => l.id));
  }

  return lessonIds;
}

// ============== SECTIONED PATH GENERATION (Phase 23) ==============

/**
 * Category key mapping for SkillProfile lookup.
 */
const CATEGORY_KEY_MAP: Record<string, keyof SkillProfile> = {
  ANALYTICS: 'analytics',
  MARKETING: 'marketing',
  CONTENT: 'content',
  OPERATIONS: 'operations',
  FINANCE: 'finance',
};

/**
 * Generate a 4-section learning path based on skill profile and diagnostic errors.
 *
 * Sections:
 * 1. Errors (Проработка ошибок) — lessons linked to wrong answers via sourceData
 * 2. Deepening (Углубление) — lessons for weak categories (score < 70)
 * 3. Growth (Развитие) — lessons for mid categories (70-85)
 * 4. Advanced (Продвинутый) — HARD lessons for strong categories (> 85)
 */
export async function generateSectionedPath(
  prisma: PrismaClient,
  skillProfile: SkillProfile,
  sessionId: string,
  answers: Array<{ isCorrect: boolean; sourceData: any; skillCategory: string; questionId: string }>,
  sessionQuestions: DiagnosticQuestion[],
): Promise<SectionedLearningPath> {
  // Track used lesson IDs across sections to avoid duplicates
  const usedLessonIds = new Set<string>();

  // ── Section 1: Errors ──
  const wrongAnswers = answers.filter(
    a => !a.isCorrect && a.sourceData?.lessonIds?.length > 0
  );
  const errorLessonIds = [...new Set(wrongAnswers.flatMap(a => a.sourceData.lessonIds as string[]))];

  // Fetch error lessons and sort by category weakness
  // Skip hidden lessons (they shouldn't guide the learner even if historically referenced)
  const errorLessons = errorLessonIds.length > 0
    ? await prisma.lesson.findMany({
        where: {
          id: { in: errorLessonIds },
          isHidden: false,
          course: { isHidden: false, partnerKey: null },
        },
        select: { id: true, skillCategory: true, order: true },
      })
    : [];

  // Sort by weakness (lowest skill score first), then by lesson order
  errorLessons.sort((a, b) => {
    const aKey = CATEGORY_KEY_MAP[a.skillCategory] || 'analytics';
    const bKey = CATEGORY_KEY_MAP[b.skillCategory] || 'analytics';
    const scoreDiff = skillProfile[aKey] - skillProfile[bKey];
    return scoreDiff !== 0 ? scoreDiff : a.order - b.order;
  });

  const sortedErrorIds = errorLessons.map(l => l.id);
  sortedErrorIds.forEach(id => usedLessonIds.add(id));

  // Build hints: for each error lesson, find wrong answers referencing it
  const questionMap = new Map(sessionQuestions.map(q => [q.id, q]));
  const hints: LearningPathSection['hints'] = [];

  for (const lessonId of sortedErrorIds) {
    const relevantAnswers = wrongAnswers.filter(
      a => (a.sourceData.lessonIds as string[]).includes(lessonId)
    );
    for (const answer of relevantAnswers) {
      const question = questionMap.get(answer.questionId);
      if (!question) continue;
      const timecodes = (question.sourceTimecodes || [])
        .filter(t => t.lessonId === lessonId)
        .map(t => ({ start: t.start, end: t.end }));
      if (timecodes.length > 0) {
        hints.push({ lessonId, questionText: question.question, timecodes });
      }
    }
  }

  // ── Fetch all lessons for sections 2-4 ──
  const allLessons = await prisma.lesson.findMany({
    where: { isHidden: false, course: { isHidden: false, partnerKey: null } },
    select: { id: true, skillCategory: true, skillCategories: true, skillLevel: true, order: true },
    orderBy: { order: 'asc' },
  });

  // Helper: check if lesson's categories overlap with target categories
  function hasOverlap(lesson: { skillCategory: string; skillCategories: any }, categories: string[]): boolean {
    const cats = lesson.skillCategories as string[] | null;
    if (cats && cats.length > 0) {
      return cats.some(c => categories.includes(c));
    }
    // Fallback to single skillCategory
    return categories.includes(lesson.skillCategory);
  }

  // Section limits: keep track focused, not overwhelming
  const DEEPENING_LIMIT = 30;  // Top 30 lessons for weak skills
  const GROWTH_LIMIT = 20;     // Top 20 for mid-level skills
  const ADVANCED_LIMIT = 15;   // Top 15 for strong skills

  // ── Section 2: Deepening (score < 67%) ──
  // With 3 questions per category, possible scores: 0%, 33%, 67%, 100%
  // < 67 means 0% or 33% (0 or 1 correct out of 3)
  const weakCategories = Object.entries(CATEGORY_KEY_MAP)
    .filter(([, key]) => skillProfile[key] < 67)
    .map(([cat]) => cat);

  const deepeningLessons = allLessons.filter(
    l => !usedLessonIds.has(l.id) && hasOverlap(l, weakCategories)
  );
  // Sort by category weakness then order, take top N
  deepeningLessons.sort((a, b) => {
    const aKey = CATEGORY_KEY_MAP[a.skillCategory] || 'analytics';
    const bKey = CATEGORY_KEY_MAP[b.skillCategory] || 'analytics';
    const scoreDiff = skillProfile[aKey] - skillProfile[bKey];
    return scoreDiff !== 0 ? scoreDiff : a.order - b.order;
  });
  const deepeningIds = deepeningLessons.slice(0, DEEPENING_LIMIT).map(l => l.id);
  deepeningIds.forEach(id => usedLessonIds.add(id));

  // ── Section 3: Growth (score 67-99%) ──
  // 67% = 2 out of 3 correct — decent but room to grow
  const midCategories = Object.entries(CATEGORY_KEY_MAP)
    .filter(([, key]) => skillProfile[key] >= 67 && skillProfile[key] < 100)
    .map(([cat]) => cat);

  const growthLessons = allLessons.filter(
    l => !usedLessonIds.has(l.id) && hasOverlap(l, midCategories)
  );
  const growthIds = growthLessons.slice(0, GROWTH_LIMIT).map(l => l.id);
  growthIds.forEach(id => usedLessonIds.add(id));

  // ── Section 4: Advanced (score = 100%) ──
  // 100% = 3 out of 3 correct — mastered, only advanced content
  const strongCategories = Object.entries(CATEGORY_KEY_MAP)
    .filter(([, key]) => skillProfile[key] >= 100)
    .map(([cat]) => cat);

  const strongCategoryLessons = allLessons.filter(
    l => !usedLessonIds.has(l.id)
      && hasOverlap(l, strongCategories)
      && l.skillLevel !== 'EASY'  // Exclude introductory lessons
  );
  const hardOnly = strongCategoryLessons.filter(l => l.skillLevel === 'HARD');
  // Prefer HARD, fallback to MEDIUM+HARD (but never EASY)
  const advancedLessons = hardOnly.length >= 5 ? hardOnly : strongCategoryLessons;
  const advancedIds = advancedLessons.slice(0, ADVANCED_LIMIT).map(l => l.id);

  const allSections: LearningPathSection[] = [
    {
      id: 'errors' as const,
      title: 'Проработка ошибок',
      description: `${sortedErrorIds.length} уроков по темам, где были ошибки`,
      lessonIds: sortedErrorIds,
      hints: hints.length > 0 ? hints : undefined,
    },
    {
      id: 'deepening' as const,
      title: 'Углубление',
      description: `${deepeningIds.length} ${deepeningIds.length === 1 ? 'урок' : deepeningIds.length < 5 ? 'урока' : 'уроков'} для слабых навыков`,
      lessonIds: deepeningIds,
    },
    {
      id: 'growth' as const,
      title: 'Развитие',
      description: `${growthIds.length} уроков для средних навыков`,
      lessonIds: growthIds,
    },
    {
      id: 'advanced' as const,
      title: 'Продвинутый уровень',
      description: `${advancedIds.length} уроков повышенной сложности`,
      lessonIds: advancedIds,
    },
  ];
  const sections = allSections.filter(s => s.lessonIds.length > 0);

  return {
    version: 2,
    sections,
    generatedFromSessionId: sessionId,
  };
}

const AXIS_ORDER: SkillCategory[] = ['ANALYTICS', 'MARKETING', 'CONTENT', 'OPERATIONS', 'FINANCE'];

/** Build AxisLearningPath v3: one section per canonical axis, score asc. Never touches LessonProgress. */
export async function generateAxisPath(
  prisma: PrismaClient,
  skillProfile: SkillProfile,
  sessionId: string,
  answers: Array<{ isCorrect: boolean; sourceData: any }>,
  recommendedJobs: Array<Pick<JobMatch, 'id' | 'matchedAxes'>>,
): Promise<AxisLearningPath> {
  const allLessons = await prisma.lesson.findMany({
    where: { isHidden: false, course: { isHidden: false, partnerKey: null } },
    select: { id: true, skillCategory: true, skillCategories: true, skillLevel: true, order: true },
    orderBy: { order: 'asc' },
  });

  const lessonAxis = new Map<string, SkillCategory>(allLessons.map((l) => [l.id, l.skillCategory as SkillCategory]));
  const errorsByAxis = collectErrorLessonsByAxis(answers, lessonAxis);

  const jobsByAxis = new Map<SkillCategory, string[]>();
  for (const job of recommendedJobs) {
    const matched = ((job.matchedAxes ?? []) as SkillCategory[]);
    if (matched.length === 0) continue;
    const weakest = matched.reduce((best, ax) =>
      skillProfile[CATEGORY_KEY_MAP[ax]] < skillProfile[CATEGORY_KEY_MAP[best]] ? ax : best);
    const list = jobsByAxis.get(weakest) ?? [];
    list.push(job.id);
    jobsByAxis.set(weakest, list);
  }

  const usedLessonIds = new Set<string>();
  const axesByScore = [...AXIS_ORDER].sort((a, b) => skillProfile[CATEGORY_KEY_MAP[a]] - skillProfile[CATEGORY_KEY_MAP[b]]);

  const sections: AxisLearningPathSection[] = [];
  for (const axis of axesByScore) {
    const score = skillProfile[CATEGORY_KEY_MAP[axis]];
    const tier = scoreToTier(score);
    const errorLessonIds = errorsByAxis.get(axis) ?? [];

    const candidates = allLessons
      .filter((l) => {
        if (usedLessonIds.has(l.id)) return false;
        const cats = (l.skillCategories as string[] | null) ?? [];
        return l.skillCategory === axis || cats.includes(axis);
      })
      .map((l) => ({ id: l.id, isPrimary: l.skillCategory === axis, skillLevel: l.skillLevel as 'EASY'|'MEDIUM'|'HARD', order: l.order }));

    const rankedNonError = selectAxisLessons(tier, candidates, PER_AXIS_LESSON_CAP);
    const lessonIds = Array.from(new Set([...errorLessonIds, ...rankedNonError]));
    lessonIds.forEach((id) => usedLessonIds.add(id));

    const jobIds = jobsByAxis.get(axis) ?? [];
    const collapsed = tier === 'strong' && errorLessonIds.length === 0;

    if (lessonIds.length === 0 && jobIds.length === 0 && errorLessonIds.length === 0) continue;

    sections.push({ axis, label: SKILL_LABELS[axis], score, tier, collapsed, jobIds, lessonIds, errorLessonIds });
  }

  return { version: 3, sections: applyPlanCaps(sections, PER_AXIS_LESSON_CAP, PLAN_ACTIVE_LESSON_CAP), generatedFromSessionId: sessionId };
}

// ============== ROUTER ==============

export const diagnosticRouter = router({
  // Get current in-progress session or null
  getCurrentSession: protectedProcedure.query(async ({ ctx }) => {
    try {
      const session = await ctx.prisma.diagnosticSession.findFirst({
        where: { userId: ctx.user.id, status: 'IN_PROGRESS' },
      });

      if (!session) return null;

      // Check if session has persisted questions
      if (!session.questions) {
        // Legacy session without persisted questions — mark as ABANDONED
        await ctx.prisma.diagnosticSession.update({
          where: { id: session.id },
          data: { status: 'ABANDONED' },
        });
        return null;
      }

      return {
        id: session.id,
        status: session.status,
        currentQuestion: session.currentQuestion,
        startedAt: session.startedAt,
      };
    } catch (error) {
      handleDatabaseError(error);
    }
  }),

  // Check if user has completed at least one diagnostic
  hasCompletedDiagnostic: protectedProcedure.query(async ({ ctx }) => {
    try {
      const count = await ctx.prisma.diagnosticSession.count({
        where: { userId: ctx.user.id, status: 'COMPLETED' },
      });
      return count > 0;
    } catch (error) {
      handleDatabaseError(error);
    }
  }),

  // Start new diagnostic session
  startSession: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      // Ensure user profile exists
      await ensureUserProfile(ctx.prisma, ctx.user);

      // Abandon any existing IN_PROGRESS sessions for this user
      await ctx.prisma.diagnosticSession.updateMany({
        where: { userId: ctx.user.id, status: 'IN_PROGRESS' },
        data: { status: 'ABANDONED' },
      });

      // Rate limit check before any LLM call
      if (!checkRateLimit(ctx.user.id)) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: 'Слишком много запросов на диагностику. Попробуйте через час.',
        });
      }

      // Phase 59 v2 — user marketplaces drive deck selection (WB-only / Ozon-only / BOTH).
      const profileForBank = await ctx.prisma.userProfile.findUnique({
        where: { id: ctx.user.id },
        select: { marketplaces: true },
      });
      const userMarketplaces = profileForBank?.marketplaces ?? [];

      // Create session first so its id can seed the deterministic deck pick and
      // per-question option shuffles. Persist a placeholder, then update with the
      // assembled (already-shuffled) questions — submitAnswer reads correctIndex
      // directly from session.questions and so needs no scoring change.
      const session = await ctx.prisma.diagnosticSession.create({
        data: {
          userId: ctx.user.id,
          status: 'IN_PROGRESS',
          currentQuestion: 0,
          questions: [] as any,
        },
      });

      const levelToDifficulty = (lvl: 1 | 2 | 3): 'EASY' | 'MEDIUM' | 'HARD' =>
        lvl === 1 ? 'EASY' : lvl === 2 ? 'MEDIUM' : 'HARD';

      let questions: DiagnosticQuestion[];
      try {
        const picked = pickDeckForUser(userMarketplaces, session.id);
        questions = picked.map((q) => {
          const { options, correctIndex } = shuffleOptions(q, session.id);
          return {
            id: q.id,
            question: q.prompt,
            options,
            correctIndex,
            explanation: q.explanation,
            difficulty: levelToDifficulty(q.level),
            skillCategory: q.axis,
            marketplace: q.marketplace,
            ...toDiagnosticQuestionSource(q),
          } as DiagnosticQuestion;
        });
      } catch (error) {
        // Defensive fallback: should never fire (pure functions over a static
        // const), but keep a mock pool so a single bad question can't 500 the
        // whole diagnostic. Log loudly so we notice.
        console.error('[diagnostic] Static deck assembly failed, using mock:', error instanceof Error ? error.message : error);
        questions = getBalancedQuestions(QUESTIONS_PER_SESSION);
      }

      await ctx.prisma.diagnosticSession.update({
        where: { id: session.id },
        data: { questions: questions as any },
      });

      return {
        id: session.id,
        status: 'IN_PROGRESS' as const,
        totalQuestions: questions.length,
        currentQuestion: 0,
      };
    } catch (error) {
      handleDatabaseError(error);
    }
  }),

  // Get current session state with question
  getSessionState: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }): Promise<DiagnosticSessionState> => {
      try {
        const session = await ctx.prisma.diagnosticSession.findUnique({
          where: { id: input.sessionId },
          include: { answers: true },
        });

        // Phase 59 — cheap single-field read to surface user marketplaces
        // alongside session state so Question.tsx can render WB/OZON badge.
        const profileForBadge = await ctx.prisma.userProfile.findUnique({
          where: { id: ctx.user.id },
          select: { marketplaces: true },
        });
        const userMarketplaces = profileForBadge?.marketplaces ?? [];

        if (!session) {
          return {
            sessionId: input.sessionId,
            currentQuestionIndex: 0,
            totalQuestions: 0,
            answeredQuestions: [],
            currentQuestion: null,
            isComplete: true,
            userMarketplaces,
          };
        }

        // If session is COMPLETED or ABANDONED, return final state
        if (session.status !== 'IN_PROGRESS') {
          return {
            sessionId: input.sessionId,
            currentQuestionIndex: session.currentQuestion,
            totalQuestions: session.answers.length,
            answeredQuestions: session.answers.map((a) => ({
              questionId: a.questionId,
              answer: a.answer,
              isCorrect: a.isCorrect,
              difficulty: a.difficulty as any,
              skillCategory: a.skillCategory as any,
            })),
            currentQuestion: null,
            isComplete: true,
            userMarketplaces,
          };
        }

        // In-progress session — read questions from DB
        const questions = session.questions as unknown as DiagnosticQuestion[] | null;
        if (!questions) {
          // Legacy session without persisted questions — mark as ABANDONED
          await ctx.prisma.diagnosticSession.update({
            where: { id: input.sessionId },
            data: { status: 'ABANDONED' },
          });
          return {
            sessionId: input.sessionId,
            currentQuestionIndex: 0,
            totalQuestions: 0,
            answeredQuestions: [],
            currentQuestion: null,
            isComplete: true,
            userMarketplaces,
          };
        }

        const isComplete = session.currentQuestion >= questions.length;
        const currentQuestion = isComplete
          ? null
          : questions[session.currentQuestion];

        // Don't expose correctIndex to client
        const safeQuestion = currentQuestion
          ? {
              ...currentQuestion,
              correctIndex: -1,
              explanation: '',
            }
          : null;

        return {
          sessionId: input.sessionId,
          currentQuestionIndex: session.currentQuestion,
          totalQuestions: questions.length,
          answeredQuestions: session.answers.map((a) => ({
            questionId: a.questionId,
            answer: a.answer,
            isCorrect: a.isCorrect,
            difficulty: a.difficulty as any,
            skillCategory: a.skillCategory as any,
          })),
          currentQuestion: safeQuestion,
          isComplete,
          userMarketplaces,
        };
      } catch (error) {
        handleDatabaseError(error);
      }
    }),

  // Submit answer
  submitAnswer: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
        questionId: z.string(),
        selectedIndex: z.number(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // Get questions from DB
        const session = await ctx.prisma.diagnosticSession.findUnique({
          where: { id: input.sessionId },
          select: { questions: true, currentQuestion: true, userId: true },
        });
        if (!session || !session.questions) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Session not found or expired. Please start a new diagnostic.',
          });
        }
        const questions = session.questions as unknown as DiagnosticQuestion[];

        // Find the question
        const question = questions.find((q) => q.id === input.questionId);
        if (!question) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Question not found in session.',
          });
        }

        const isCorrect = input.selectedIndex === question.correctIndex;
        const selectedAnswer = question.options[input.selectedIndex] || '';

        // Save answer to DB (with source tracing from Phase 23)
        await ctx.prisma.diagnosticAnswer.create({
          data: {
            sessionId: input.sessionId,
            questionId: input.questionId,
            answer: selectedAnswer,
            isCorrect,
            difficulty: question.difficulty,
            skillCategory: question.skillCategory,
            // Source tracing (Phase 23) — links wrong answers to specific lessons/timecodes
            sourceData: buildAnswerSourceData(question) ?? undefined,
          },
        });

        // Increment currentQuestion in DB
        const updatedSession = await ctx.prisma.diagnosticSession.update({
          where: { id: input.sessionId },
          data: { currentQuestion: { increment: 1 } },
        });

        // Check completion
        const isComplete = updatedSession.currentQuestion >= questions.length;

        if (isComplete) {
          // Fetch all answers for this session
          const allAnswers = await ctx.prisma.diagnosticAnswer.findMany({
            where: { sessionId: input.sessionId },
          });

          // Calculate skill profile
          const skillProfile = calculateSkillProfileFromAnswers(
            allAnswers.map((a) => ({
              skillCategory: a.skillCategory as SkillCategory,
              isCorrect: a.isCorrect,
            })),
          );

          // Upsert SkillProfile in DB
          await ctx.prisma.skillProfile.upsert({
            where: { userId: ctx.user.id },
            update: {
              analytics: skillProfile.analytics,
              marketing: skillProfile.marketing,
              content: skillProfile.content,
              operations: skillProfile.operations,
              finance: skillProfile.finance,
            },
            create: {
              userId: ctx.user.id,
              analytics: skillProfile.analytics,
              marketing: skillProfile.marketing,
              content: skillProfile.content,
              operations: skillProfile.operations,
              finance: skillProfile.finance,
            },
          });

          // Update session status to COMPLETED
          await ctx.prisma.diagnosticSession.update({
            where: { id: input.sessionId },
            data: { status: 'COMPLETED', completedAt: new Date() },
          });

          // Recommend jobs first — generateAxisPath attaches them to axes.
          // Phase 58 D-10: union-merge addedJobs with new diagnostic recommendations.
          // Marketplace filter (D-16) is applied inside getRecommendedJobsFromGaps.
          const profileForJobs = await ctx.prisma.userProfile.findUnique({
            where: { id: ctx.user.id },
            select: { marketplaces: true },
          });
          const newRecommendedJobs = await getRecommendedJobsFromGaps(ctx.prisma, {
            skillProfile,
            userMarketplaces: profileForJobs?.marketplaces ?? [],
            limit: 3,
          });
          const newRecommendedJobIds = newRecommendedJobs.map(j => j.id);

          // Generate and persist recommended learning path (axis-centric v3 with error tracing)
          let pathData: any;
          try {
            const allAnswersWithSource = await ctx.prisma.diagnosticAnswer.findMany({
              where: { sessionId: input.sessionId },
              select: { isCorrect: true, sourceData: true },
            });
            pathData = await generateAxisPath(
              ctx.prisma,
              skillProfile,
              input.sessionId,
              allAnswersWithSource.map((a) => ({ isCorrect: a.isCorrect, sourceData: a.sourceData as any })),
              newRecommendedJobs.map((j) => ({ id: j.id, matchedAxes: j.matchedAxes })),
            );
          } catch (err) {
            console.error('[diagnostic] Axis path generation failed, falling back to flat:', err);
            pathData = await generateFullRecommendedPath(ctx.prisma, skillProfile);
          }

          // Co-locate lessons + addedJobs writes inside a single $transaction so a
          // partial failure can never leave LearningPath half-updated (Wave 4 Case C).
          await ctx.prisma.$transaction(async (tx) => {
            const existing = await tx.learningPath.findUnique({
              where: { userId: ctx.user.id },
              select: { addedJobs: true },
            });
            const existingIds = Array.isArray(existing?.addedJobs)
              ? (existing!.addedJobs as string[])
              : [];
            const mergedAddedJobs = Array.from(new Set([...existingIds, ...newRecommendedJobIds]));

            await tx.learningPath.upsert({
              where: { userId: ctx.user.id },
              update: {
                lessons: pathData as any,
                addedJobs: mergedAddedJobs as any,
                generatedAt: new Date(),
              },
              create: {
                userId: ctx.user.id,
                lessons: pathData as any,
                addedJobs: mergedAddedJobs as any,
              },
            });
          });

          // Phase 59 — mirror diagnostic completion to CarrotQuest. Fire-and-
          // forget after the LearningPath $transaction commits (mirrors the
          // onboarding.ts pattern). pa_* props go on the LEAD via
          // setUserProps; the event itself carries no params (CQ Pitfall #5).
          try {
            await cqSetUserProps(ctx.user.id, {
              pa_diagnostic_marketplaces: (profileForJobs?.marketplaces ?? []).join(', '),
              pa_diagnostic_pool_size: String(questions.length),
            });
            await cqTrackEvent(ctx.user.id, 'pa_diagnostic_completed');
          } catch (err) {
            console.error('[diagnostic] CQ tracking failed (non-blocking):', err);
          }
        }

        return {
          isCorrect,
          correctIndex: question.correctIndex,
          explanation: question.explanation,
          isComplete,
          nextQuestionIndex: isComplete ? null : updatedSession.currentQuestion,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        handleDatabaseError(error);
      }
    }),

  // Get session results
  getResults: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }): Promise<DiagnosticResult | null> => {
      try {
        const session = await ctx.prisma.diagnosticSession.findUnique({
          where: { id: input.sessionId },
          include: { answers: true },
        });

        if (!session || session.status !== 'COMPLETED') {
          return null;
        }

        const correctAnswers = session.answers.filter((a) => a.isCorrect).length;
        const accuracy = Math.round((correctAnswers / session.answers.length) * 100);

        // Calculate skill profile from this session's own answers (not latest global profile)
        // This ensures historical sessions return their actual scores for dual radar comparison
        const skillProfile = calculateSkillProfileFromAnswers(
          session.answers.map((a) => ({
            skillCategory: a.skillCategory as SkillCategory,
            isCorrect: a.isCorrect,
          })),
        );

        const gaps = await calculateSkillGaps(ctx.prisma, skillProfile);

        const [profile, learningPath] = await Promise.all([
          ctx.prisma.userProfile.findUnique({
            where: { id: ctx.user.id },
            select: { marketplaces: true },
          }),
          ctx.prisma.learningPath.findUnique({
            where: { userId: ctx.user.id },
            select: { addedJobs: true },
          }),
        ]);
        const addedJobIds: string[] = Array.isArray(learningPath?.addedJobs)
          ? (learningPath!.addedJobs as string[])
          : [];
        const recommendedJobs = await getRecommendedJobsFromGaps(ctx.prisma, {
          skillProfile,
          userMarketplaces: profile?.marketplaces ?? [],
          addedJobIds,
          limit: 3,
        });

        return {
          sessionId: input.sessionId,
          completedAt: session.completedAt || new Date(),
          totalQuestions: session.answers.length,
          correctAnswers,
          accuracy,
          skillProfile,
          gaps,
          recommendedPath: getRecommendedLessonsFromGaps(gaps, 5),
          recommendedJobs,
        };
      } catch (error) {
        handleDatabaseError(error);
      }
    }),

  // Get diagnostic history for current user
  getHistory: protectedProcedure.query(async ({ ctx }) => {
    try {
      const sessions = await ctx.prisma.diagnosticSession.findMany({
        where: { userId: ctx.user.id, status: 'COMPLETED' },
        orderBy: { completedAt: 'desc' },
        include: { answers: true },
      });

      return sessions.map((s) => {
        const correctAnswers = s.answers.filter((a) => a.isCorrect).length;
        const score = s.answers.length > 0 ? Math.round((correctAnswers / s.answers.length) * 100) : 0;
        return {
          id: s.id,
          status: s.status,
          startedAt: s.startedAt,
          completedAt: s.completedAt,
          score,
        };
      });
    } catch (error) {
      handleDatabaseError(error);
    }
  }),
});
