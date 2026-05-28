import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the dependencies before importing the module under test.
const generateSectionedPathMock = vi.fn();
const getRecommendedJobsFromGapsMock = vi.fn();

vi.mock('../routers/diagnostic', () => ({
  generateSectionedPath: (...args: any[]) => generateSectionedPathMock(...args),
}));

vi.mock('./job-matcher', () => ({
  getRecommendedJobsFromGaps: (...args: any[]) => getRecommendedJobsFromGapsMock(...args),
  computeEffectiveMarketplaces: (m: string[]) =>
    m.filter((x) => x === 'WB' || x === 'OZON'),
}));

import { rebuildLegacyLearningPath } from './legacy-path-rebuild';

type MockPrismaOptions = {
  learningPath?: any;
  session?: any;
  answers?: any[];
  profileMarketplaces?: string[];
};

function makeMockPrisma(opts: MockPrismaOptions = {}) {
  const transactionFn = vi.fn().mockImplementation(async (cb: any) => {
    return await cb(prisma);
  });
  const learningPathUpdate = vi.fn().mockResolvedValue({});
  const lessonProgressDelete = vi.fn();
  const lessonProgressDeleteMany = vi.fn();
  const lessonProgressUpdate = vi.fn();
  const lessonProgressUpdateMany = vi.fn();

  const prisma: any = {
    $transaction: transactionFn,
    learningPath: {
      findUnique: vi.fn().mockResolvedValue(opts.learningPath ?? null),
      update: learningPathUpdate,
    },
    diagnosticSession: {
      findFirst: vi.fn().mockResolvedValue(opts.session ?? null),
    },
    diagnosticAnswer: {
      findMany: vi.fn().mockResolvedValue(opts.answers ?? []),
    },
    userProfile: {
      findUnique: vi.fn().mockResolvedValue({ marketplaces: opts.profileMarketplaces ?? [] }),
    },
    lessonProgress: {
      delete: lessonProgressDelete,
      deleteMany: lessonProgressDeleteMany,
      update: lessonProgressUpdate,
      updateMany: lessonProgressUpdateMany,
    },
  };
  return {
    prisma,
    transactionFn,
    learningPathUpdate,
    lessonProgress: {
      delete: lessonProgressDelete,
      deleteMany: lessonProgressDeleteMany,
      update: lessonProgressUpdate,
      updateMany: lessonProgressUpdateMany,
    },
  };
}

const flatLessonIds = Array.from({ length: 50 }, (_, i) => `lesson-${i + 1}`);

function makeAnswers(n = 10) {
  return Array.from({ length: n }, (_, i) => ({
    isCorrect: i % 2 === 0,
    sourceData: { lessonIds: [] },
    skillCategory: 'ANALYTICS',
    questionId: `q-${i}`,
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  generateSectionedPathMock.mockReset();
  getRecommendedJobsFromGapsMock.mockReset();
});

describe('rebuildLegacyLearningPath', () => {
  it('Test 1: happy path — rebuilds flat to sectioned, writes addedJobs, returns rebuilt:true; LearningPath persisted has sectioned shape (version: 2, sections[])', async () => {
    const { prisma, learningPathUpdate, transactionFn } = makeMockPrisma({
      learningPath: { lessons: flatLessonIds },
      session: { id: 'sess-1', questions: [] },
      answers: makeAnswers(),
    });

    generateSectionedPathMock.mockResolvedValue({
      version: 2,
      sections: [
        { id: 'errors', title: 'E', description: '', lessonIds: flatLessonIds.slice(0, 10) },
        { id: 'deepening', title: 'D', description: '', lessonIds: flatLessonIds.slice(10, 30) },
        { id: 'growth', title: 'G', description: '', lessonIds: flatLessonIds.slice(30, 40) },
        { id: 'advanced', title: 'A', description: '', lessonIds: [] },
      ],
      generatedFromSessionId: 'sess-1',
    });
    getRecommendedJobsFromGapsMock.mockResolvedValue([
      { id: 'job-1' },
      { id: 'job-2' },
      { id: 'job-3' },
    ]);

    const result = await rebuildLegacyLearningPath(prisma, 'user-1');

    expect(result).toEqual({ rebuilt: true });
    expect(transactionFn).toHaveBeenCalledTimes(1);
    expect(learningPathUpdate).toHaveBeenCalledTimes(1);

    const updateArg = learningPathUpdate.mock.calls[0][0];
    expect(updateArg.where).toEqual({ userId: 'user-1' });
    expect(updateArg.data.addedJobs).toEqual(['job-1', 'job-2', 'job-3']);

    // D-06 return-shape verification: the value persisted to lessons IS the sectioned shape.
    // Next call to learning.getRecommendedPath will parse this as { version: 2, sections } and
    // route into the sectioned branch, returning { isSectioned: true, sections, totalLessons }.
    const persisted = updateArg.data.lessons;
    expect(persisted.version).toBe(2);
    expect(Array.isArray(persisted.sections)).toBe(true);
    expect(persisted.sections.length).toBeGreaterThan(0);
    expect(persisted.sections.some((s: any) => s.id === 'custom')).toBe(true);
  });

  it('Test 2: custom-section preserves manually-added lessons (D-08)', async () => {
    const { prisma, learningPathUpdate } = makeMockPrisma({
      learningPath: { lessons: flatLessonIds },
      session: { id: 'sess-2', questions: [] },
      answers: makeAnswers(),
    });

    const covered = flatLessonIds.slice(0, 40);
    const manual = flatLessonIds.slice(40); // 10 ids never produced by matcher
    generateSectionedPathMock.mockResolvedValue({
      version: 2,
      sections: [
        { id: 'deepening', title: 'D', description: '', lessonIds: covered },
      ],
      generatedFromSessionId: 'sess-2',
    });
    getRecommendedJobsFromGapsMock.mockResolvedValue([]);

    await rebuildLegacyLearningPath(prisma, 'user-2');
    const persisted = learningPathUpdate.mock.calls[0][0].data.lessons;
    const customSection = persisted.sections.find((s: any) => s.id === 'custom');
    expect(customSection).toBeDefined();
    expect(customSection.lessonIds).toEqual(manual);
  });

  it('Test 3: fallback — generateSectionedPath throws → ALL flat ids land in custom (D-08 safe)', async () => {
    const { prisma, learningPathUpdate } = makeMockPrisma({
      learningPath: { lessons: flatLessonIds },
      session: { id: 'sess-3', questions: [] },
      answers: makeAnswers(),
    });
    generateSectionedPathMock.mockRejectedValue(new Error('boom'));
    getRecommendedJobsFromGapsMock.mockResolvedValue([]);

    const result = await rebuildLegacyLearningPath(prisma, 'user-3');
    expect(result.rebuilt).toBe(true);

    const persisted = learningPathUpdate.mock.calls[0][0].data.lessons;
    const customSection = persisted.sections.find((s: any) => s.id === 'custom');
    expect(customSection.lessonIds).toEqual(flatLessonIds);
    // No other sections — only custom on fallback.
    expect(persisted.sections.length).toBe(1);
  });

  it('Test 4: no completed DiagnosticSession → no rewrite (D-09)', async () => {
    const { prisma, learningPathUpdate, transactionFn } = makeMockPrisma({
      learningPath: { lessons: flatLessonIds },
      session: null,
    });

    const result = await rebuildLegacyLearningPath(prisma, 'user-4');
    expect(result).toEqual({ rebuilt: false, reason: 'no-diagnostic' });
    expect(transactionFn).not.toHaveBeenCalled();
    expect(learningPathUpdate).not.toHaveBeenCalled();
  });

  it('Test 5: rebuild write is wrapped in prisma.$transaction', async () => {
    const { prisma, transactionFn, learningPathUpdate } = makeMockPrisma({
      learningPath: { lessons: flatLessonIds },
      session: { id: 'sess-5', questions: [] },
      answers: makeAnswers(),
    });
    generateSectionedPathMock.mockResolvedValue({
      version: 2,
      sections: [
        { id: 'errors', title: 'E', description: '', lessonIds: flatLessonIds.slice(0, 10) },
      ],
      generatedFromSessionId: 'sess-5',
    });
    getRecommendedJobsFromGapsMock.mockResolvedValue([]);

    await rebuildLegacyLearningPath(prisma, 'user-5');
    expect(transactionFn).toHaveBeenCalledTimes(1);
    // update happens inside the tx callback
    expect(learningPathUpdate).toHaveBeenCalledTimes(1);
  });

  it('Test 6: marketplace filter (D-16) — user.marketplaces is passed into matcher', async () => {
    const { prisma } = makeMockPrisma({
      learningPath: { lessons: flatLessonIds },
      session: { id: 'sess-6', questions: [] },
      answers: makeAnswers(),
      profileMarketplaces: ['WB'],
    });
    generateSectionedPathMock.mockResolvedValue({
      version: 2,
      sections: [],
      generatedFromSessionId: 'sess-6',
    });
    getRecommendedJobsFromGapsMock.mockResolvedValue([]);

    await rebuildLegacyLearningPath(prisma, 'user-6');
    expect(getRecommendedJobsFromGapsMock).toHaveBeenCalledTimes(1);
    const callArg = getRecommendedJobsFromGapsMock.mock.calls[0][1];
    expect(callArg.userMarketplaces).toEqual(['WB']);
    expect(callArg.limit).toBe(3);
  });

  it('Test 7: idempotent — already-sectioned path is no-op', async () => {
    const sectioned = {
      version: 2,
      sections: [{ id: 'errors', title: 'E', description: '', lessonIds: ['a'] }],
      generatedFromSessionId: 'old',
    };
    const { prisma, transactionFn, learningPathUpdate } = makeMockPrisma({
      learningPath: { lessons: sectioned },
    });

    const result = await rebuildLegacyLearningPath(prisma, 'user-7');
    expect(result).toEqual({ rebuilt: false, reason: 'not-flat-or-not-found' });
    expect(transactionFn).not.toHaveBeenCalled();
    expect(learningPathUpdate).not.toHaveBeenCalled();
  });

  it('Test 8: LessonProgress is NEVER touched (D-07 hard rule)', async () => {
    const { prisma, lessonProgress } = makeMockPrisma({
      learningPath: { lessons: flatLessonIds },
      session: { id: 'sess-8', questions: [] },
      answers: makeAnswers(),
    });
    generateSectionedPathMock.mockResolvedValue({
      version: 2,
      sections: [
        { id: 'errors', title: 'E', description: '', lessonIds: flatLessonIds.slice(0, 10) },
      ],
      generatedFromSessionId: 'sess-8',
    });
    getRecommendedJobsFromGapsMock.mockResolvedValue([]);

    await rebuildLegacyLearningPath(prisma, 'user-8');

    expect(lessonProgress.delete).not.toHaveBeenCalled();
    expect(lessonProgress.deleteMany).not.toHaveBeenCalled();
    expect(lessonProgress.update).not.toHaveBeenCalled();
    expect(lessonProgress.updateMany).not.toHaveBeenCalled();
  });
});
