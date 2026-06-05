/**
 * Task 3 (Phase 62): assert that diagnostic lesson queries exclude partner courses.
 *
 * Strategy: call `diagnostic.getResults` which triggers `calculateSkillGaps` →
 * `getLessonsByCategory` → `prisma.lesson.findMany` with a `course` filter.
 * We assert that every call to `findMany` passes `course: { partnerKey: null }`.
 *
 * The test WILL fail if `partnerKey: null` is removed from the course filter.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks required by diagnostic.ts top-level imports
vi.mock('../../utils/carrotquest', () => ({
  cqSetUserProps: vi.fn().mockResolvedValue(undefined),
  cqTrackEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../diagnostic/deck-picker', () => ({
  pickDeckForUser: vi.fn().mockReturnValue([]),
}));
vi.mock('../../diagnostic/option-shuffler', () => ({
  shuffleOptions: vi.fn((q: any) => ({ options: q.options, correctIndex: 0 })),
}));
vi.mock('../../utils/ensure-user-profile', () => ({
  ensureUserProfile: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../utils/job-matcher', () => ({
  getRecommendedJobsFromGaps: vi.fn().mockResolvedValue([]),
  computeEffectiveMarketplaces: (m: string[]) =>
    m.filter((x) => x === 'WB' || x === 'OZON'),
}));
vi.mock('@mpstats/ai', () => ({
  generateDiagnosticQuestions: vi.fn().mockResolvedValue([]),
}));

import { diagnosticRouter } from '../diagnostic';

function makeGetResultsCtx() {
  const findManyMock = vi.fn().mockResolvedValue([]);

  const prisma: any = {
    userProfile: {
      findUnique: vi.fn().mockResolvedValue({ marketplaces: ['WB'] }),
      upsert: vi.fn().mockResolvedValue({}),
    },
    diagnosticSession: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'sess-1',
        status: 'COMPLETED',
        completedAt: new Date(),
        answers: [
          {
            questionId: 'q1',
            answer: 'a',
            isCorrect: true,
            difficulty: 'MEDIUM',
            skillCategory: 'ANALYTICS',
          },
        ],
      }),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'sess-1' }),
      update: vi.fn().mockResolvedValue({ currentQuestion: 1 }),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      count: vi.fn().mockResolvedValue(0),
    },
    diagnosticAnswer: {
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
    },
    skillProfile: {
      upsert: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    learningPath: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
    },
    lesson: {
      findMany: findManyMock,
    },
    material: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    contentChunk: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn().mockImplementation(async (cb: any) => {
      const tx = {
        learningPath: {
          findUnique: vi.fn().mockResolvedValue(null),
          upsert: vi.fn().mockResolvedValue({}),
        },
      };
      return cb(tx);
    }),
  };

  return { prisma, findManyMock };
}

describe('diagnostic partner isolation (Task 3 — Phase 62)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getLessonsByCategory includes partnerKey: null in course filter', async () => {
    const { prisma, findManyMock } = makeGetResultsCtx();
    const ctx = { user: { id: 'user-1' }, prisma };

    await diagnosticRouter.createCaller(ctx as any).getResults({ sessionId: 'sess-1' });

    // calculateSkillGaps calls getLessonsByCategory which calls prisma.lesson.findMany.
    // Every call must include course: { partnerKey: null }.
    expect(findManyMock).toHaveBeenCalled();
    for (const [args] of findManyMock.mock.calls) {
      expect(args).toMatchObject({
        where: expect.objectContaining({
          course: expect.objectContaining({ partnerKey: null }),
        }),
      });
    }
  });

  it('sanity — assertion pattern does NOT match calls missing partnerKey: null', () => {
    // Prove the assertion in the first test is strict:
    // a course filter WITHOUT partnerKey:null should fail objectContaining({ partnerKey: null }).
    const callWithoutFilter = { where: { course: { isHidden: false } } };
    // objectContaining({ partnerKey: null }) requires key to be present
    expect(callWithoutFilter.where.course).not.toMatchObject({ partnerKey: null });
  });
});
