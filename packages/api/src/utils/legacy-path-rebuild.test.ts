import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the dependencies before importing the module under test.
const generateAxisPathMock = vi.fn();
const getRecommendedJobsFromGapsMock = vi.fn();

vi.mock('../routers/diagnostic', () => ({
  generateAxisPath: (...args: any[]) => generateAxisPathMock(...args),
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
  }));
}

// Minimal AxisLearningPath (v3) that generateAxisPath is stubbed to return.
function makeAxisPath(sessionId = 'sess-1') {
  return {
    version: 3,
    sections: [
      {
        axis: 'ANALYTICS',
        label: 'Аналитика',
        score: 33,
        tier: 'weak',
        collapsed: false,
        jobIds: [],
        lessonIds: ['lesson-1', 'lesson-2'],
        errorLessonIds: [],
      },
    ],
    generatedFromSessionId: sessionId,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  generateAxisPathMock.mockReset();
  getRecommendedJobsFromGapsMock.mockReset();
});

describe('rebuildLegacyLearningPath', () => {
  it('Test 1: happy path — rebuilds legacy flat to AxisLearningPath v3, writes addedJobs, returns rebuilt:true; persisted lessons has v3 axis shape', async () => {
    const { prisma, learningPathUpdate, transactionFn } = makeMockPrisma({
      learningPath: { lessons: flatLessonIds },
      session: { id: 'sess-1' },
      answers: makeAnswers(),
    });

    generateAxisPathMock.mockResolvedValue(makeAxisPath('sess-1'));
    getRecommendedJobsFromGapsMock.mockResolvedValue([
      { id: 'job-1', matchedAxes: ['ANALYTICS'] },
      { id: 'job-2', matchedAxes: ['MARKETING'] },
      { id: 'job-3', matchedAxes: ['CONTENT'] },
    ]);

    const result = await rebuildLegacyLearningPath(prisma, 'user-1');

    expect(result).toEqual({ rebuilt: true });
    expect(transactionFn).toHaveBeenCalledTimes(1);
    expect(learningPathUpdate).toHaveBeenCalledTimes(1);

    const updateArg = learningPathUpdate.mock.calls[0][0];
    expect(updateArg.where).toEqual({ userId: 'user-1' });
    expect(updateArg.data.addedJobs).toEqual(['job-1', 'job-2', 'job-3']);

    // The value persisted to lessons IS the AxisLearningPath v3 shape from generateAxisPath.
    const persisted = updateArg.data.lessons;
    expect(persisted.version).toBe(3);
    expect(Array.isArray(persisted.sections)).toBe(true);
    expect(persisted.sections.length).toBeGreaterThan(0);
    expect(persisted.sections[0].axis).toBe('ANALYTICS');
  });

  it('Test 2: delegates to generateAxisPath with computed SkillProfile + answers + jobs', async () => {
    const { prisma } = makeMockPrisma({
      learningPath: { lessons: flatLessonIds },
      session: { id: 'sess-2' },
      answers: makeAnswers(),
    });

    generateAxisPathMock.mockResolvedValue(makeAxisPath('sess-2'));
    getRecommendedJobsFromGapsMock.mockResolvedValue([
      { id: 'job-9', matchedAxes: ['ANALYTICS'] },
    ]);

    await rebuildLegacyLearningPath(prisma, 'user-2');

    expect(generateAxisPathMock).toHaveBeenCalledTimes(1);
    const [, skillProfile, sessionId, answersArg, jobsArg] = generateAxisPathMock.mock.calls[0];
    // 5 correct of 10 ANALYTICS answers → 50%.
    expect(skillProfile).toEqual({ analytics: 50, marketing: 0, content: 0, operations: 0, finance: 0 });
    expect(sessionId).toBe('sess-2');
    expect(answersArg).toHaveLength(10);
    expect(answersArg[0]).toEqual({ isCorrect: true, sourceData: { lessonIds: [] } });
    expect(jobsArg).toEqual([{ id: 'job-9', matchedAxes: ['ANALYTICS'] }]);
  });

  it('Test 3: generateAxisPath throws → no rewrite, returns generation-failed', async () => {
    const { prisma, learningPathUpdate, transactionFn } = makeMockPrisma({
      learningPath: { lessons: flatLessonIds },
      session: { id: 'sess-3' },
      answers: makeAnswers(),
    });
    generateAxisPathMock.mockRejectedValue(new Error('boom'));
    getRecommendedJobsFromGapsMock.mockResolvedValue([]);

    const result = await rebuildLegacyLearningPath(prisma, 'user-3');
    expect(result).toEqual({ rebuilt: false, reason: 'generation-failed' });
    expect(transactionFn).not.toHaveBeenCalled();
    expect(learningPathUpdate).not.toHaveBeenCalled();
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
      session: { id: 'sess-5' },
      answers: makeAnswers(),
    });
    generateAxisPathMock.mockResolvedValue(makeAxisPath('sess-5'));
    getRecommendedJobsFromGapsMock.mockResolvedValue([]);

    await rebuildLegacyLearningPath(prisma, 'user-5');
    expect(transactionFn).toHaveBeenCalledTimes(1);
    // update happens inside the tx callback
    expect(learningPathUpdate).toHaveBeenCalledTimes(1);
  });

  it('Test 6: marketplace filter (D-16) — user.marketplaces is passed into matcher', async () => {
    const { prisma } = makeMockPrisma({
      learningPath: { lessons: flatLessonIds },
      session: { id: 'sess-6' },
      answers: makeAnswers(),
      profileMarketplaces: ['WB'],
    });
    generateAxisPathMock.mockResolvedValue(makeAxisPath('sess-6'));
    getRecommendedJobsFromGapsMock.mockResolvedValue([]);

    await rebuildLegacyLearningPath(prisma, 'user-6');
    expect(getRecommendedJobsFromGapsMock).toHaveBeenCalledTimes(1);
    const callArg = getRecommendedJobsFromGapsMock.mock.calls[0][1];
    expect(callArg.userMarketplaces).toEqual(['WB']);
    expect(callArg.limit).toBe(3);
  });

  it('Test 7: idempotent — already-v3 path is no-op', async () => {
    const { prisma, transactionFn, learningPathUpdate } = makeMockPrisma({
      learningPath: { lessons: makeAxisPath('old') },
    });

    const result = await rebuildLegacyLearningPath(prisma, 'user-7');
    expect(result).toEqual({ rebuilt: false, reason: 'already-v3' });
    expect(transactionFn).not.toHaveBeenCalled();
    expect(learningPathUpdate).not.toHaveBeenCalled();
  });

  it('Test 7b: legacy v2 sectioned path IS rebuilt into v3 (migrate-on-read)', async () => {
    const v2 = {
      version: 2,
      sections: [{ id: 'errors', title: 'E', description: '', lessonIds: ['a'] }],
      generatedFromSessionId: 'old',
    };
    const { prisma, learningPathUpdate } = makeMockPrisma({
      learningPath: { lessons: v2 },
      session: { id: 'sess-7b' },
      answers: makeAnswers(),
    });
    generateAxisPathMock.mockResolvedValue(makeAxisPath('sess-7b'));
    getRecommendedJobsFromGapsMock.mockResolvedValue([]);

    const result = await rebuildLegacyLearningPath(prisma, 'user-7b');
    expect(result).toEqual({ rebuilt: true });
    expect(learningPathUpdate.mock.calls[0][0].data.lessons.version).toBe(3);
  });

  it('Test 8: LessonProgress is NEVER touched (D-07 hard rule)', async () => {
    const { prisma, lessonProgress } = makeMockPrisma({
      learningPath: { lessons: flatLessonIds },
      session: { id: 'sess-8' },
      answers: makeAnswers(),
    });
    generateAxisPathMock.mockResolvedValue(makeAxisPath('sess-8'));
    getRecommendedJobsFromGapsMock.mockResolvedValue([]);

    await rebuildLegacyLearningPath(prisma, 'user-8');

    expect(lessonProgress.delete).not.toHaveBeenCalled();
    expect(lessonProgress.deleteMany).not.toHaveBeenCalled();
    expect(lessonProgress.update).not.toHaveBeenCalled();
    expect(lessonProgress.updateMany).not.toHaveBeenCalled();
  });
});
