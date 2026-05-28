import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DiagnosticQuestion } from '@mpstats/shared';

// Mock CQ helpers.
vi.mock('../../utils/carrotquest', () => ({
  cqSetUserProps: vi.fn().mockResolvedValue(undefined),
  cqTrackEvent: vi.fn().mockResolvedValue(undefined),
}));

// Mock the question bank helper so startSession does not hit getQuestionsFromBank's
// real bank logic (which we tested separately).
vi.mock('../../utils/question-bank', () => ({
  getQuestionsFromBank: vi.fn(),
}));

// Mock ensureUserProfile so it does not run a real upsert path.
vi.mock('../../utils/ensure-user-profile', () => ({
  ensureUserProfile: vi.fn().mockResolvedValue(undefined),
}));

// Mock job-matcher recommended jobs (submitAnswer completion path).
vi.mock('../../utils/job-matcher', () => ({
  getRecommendedJobsFromGaps: vi.fn().mockResolvedValue([]),
  computeEffectiveMarketplaces: (m: string[]) =>
    m.filter((x) => x === 'WB' || x === 'OZON'),
}));

// Heavy AI import called only when bank returns mock-only — keep it a no-op.
vi.mock('@mpstats/ai', () => ({
  generateDiagnosticQuestions: vi.fn().mockResolvedValue([]),
}));

// db-errors is a simple re-throw helper.
import { diagnosticRouter } from '../diagnostic';
import { cqSetUserProps, cqTrackEvent } from '../../utils/carrotquest';
import { getQuestionsFromBank } from '../../utils/question-bank';

function mkQuestion(id: string, mp: 'WB' | 'OZON' | 'BOTH' = 'BOTH'): DiagnosticQuestion {
  return {
    id,
    skillCategory: 'ANALYTICS',
    difficulty: 'MEDIUM',
    question: 'Q ' + id,
    options: ['a', 'b', 'c', 'd'],
    correctIndex: 0,
    explanation: '',
    sourceChunkIds: ['c1'],
    marketplace: mp,
  } as DiagnosticQuestion;
}

function makeCtx(profileMarketplaces: string[] | null) {
  // Two findUnique call sites in submitAnswer's completion branch:
  // (a) UserProfile (where: { id: ctx.user.id }, select: { marketplaces })
  // (b) DiagnosticSession (for questions / answers reads)
  // (c) LearningPath (existingPathForCustom)
  // Discriminate by the args.
  const findUniqueProfile = vi.fn().mockImplementation((args: any) => {
    if (args?.select?.lastActiveAt) return Promise.resolve({ lastActiveAt: new Date() });
    if (args?.select?.marketplaces) {
      return Promise.resolve(
        profileMarketplaces === null ? null : { marketplaces: profileMarketplaces },
      );
    }
    return Promise.resolve(null);
  });

  const prisma: any = {
    userProfile: {
      findUnique: findUniqueProfile,
      update: vi.fn().mockResolvedValue({}),
      upsert: vi.fn().mockResolvedValue({}),
    },
    diagnosticSession: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn(),
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
    },
    learningPath: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
    },
    lesson: {
      findMany: vi.fn().mockResolvedValue([]),
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

  return {
    user: { id: 'user-1' },
    prisma,
  };
}

function caller(ctx: any) {
  return diagnosticRouter.createCaller(ctx as any);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getQuestionsFromBank).mockResolvedValue([
    mkQuestion('q1'),
    mkQuestion('q2'),
  ]);
});

describe('diagnostic.startSession — marketplace wiring', () => {
  it('Test 1: passes UserProfile.marketplaces as 3rd arg to getQuestionsFromBank', async () => {
    const ctx = makeCtx(['WB']);
    await caller(ctx).startSession();
    expect(getQuestionsFromBank).toHaveBeenCalled();
    const args = vi.mocked(getQuestionsFromBank).mock.calls[0];
    // args: [prisma, count, userMarketplaces]
    expect(args[2]).toEqual(['WB']);
  });

  it('Test 2: passes [] when UserProfile has no marketplaces row', async () => {
    const ctx = makeCtx(null);
    await caller(ctx).startSession();
    const args = vi.mocked(getQuestionsFromBank).mock.calls[0];
    expect(args[2]).toEqual([]);
  });
});

describe('diagnostic.submitAnswer — CQ event on completion', () => {
  function setupCompletion(profileMarketplaces: string[] = ['WB']) {
    const ctx = makeCtx(profileMarketplaces);
    // Session with exactly 1 question so the very first submit completes it.
    const sessionQuestions = [mkQuestion('q1', 'WB')];
    ctx.prisma.diagnosticSession.findUnique.mockImplementation((args: any) => {
      // Used in submitAnswer (with select: questions, currentQuestion, userId)
      // and later in completion path (with select: questions).
      return Promise.resolve({
        id: 'sess-1',
        userId: 'user-1',
        questions: sessionQuestions,
        currentQuestion: 0,
      });
    });
    ctx.prisma.diagnosticSession.update.mockImplementation((args: any) => {
      // First call increments currentQuestion to 1 (== questions.length → complete).
      return Promise.resolve({ id: 'sess-1', currentQuestion: 1 });
    });
    ctx.prisma.diagnosticAnswer.findMany.mockResolvedValue([
      { isCorrect: true, sourceData: null, skillCategory: 'ANALYTICS', questionId: 'q1' },
    ]);
    return { ctx, sessionQuestions };
  }

  it('Test 3: fires cqSetUserProps with pa_diagnostic_marketplaces and pa_diagnostic_pool_size', async () => {
    const { ctx } = setupCompletion(['WB', 'OZON']);
    await caller(ctx).submitAnswer({
      sessionId: 'sess-1',
      questionId: 'q1',
      selectedIndex: 0,
    });
    expect(cqSetUserProps).toHaveBeenCalledTimes(1);
    const call = vi.mocked(cqSetUserProps).mock.calls[0];
    expect(call[0]).toBe('user-1');
    expect(call[1]).toMatchObject({
      pa_diagnostic_marketplaces: 'WB, OZON',
      pa_diagnostic_pool_size: '1',
    });
  });

  it('Test 4: fires cqTrackEvent("pa_diagnostic_completed") AFTER cqSetUserProps', async () => {
    const { ctx } = setupCompletion(['WB']);
    const order: string[] = [];
    vi.mocked(cqSetUserProps).mockImplementation(async () => {
      order.push('setProps');
    });
    vi.mocked(cqTrackEvent).mockImplementation(async () => {
      order.push('trackEvent');
    });
    await caller(ctx).submitAnswer({
      sessionId: 'sess-1',
      questionId: 'q1',
      selectedIndex: 0,
    });
    expect(cqTrackEvent).toHaveBeenCalledWith('user-1', 'pa_diagnostic_completed');
    expect(order).toEqual(['setProps', 'trackEvent']);
  });

  it('Test 5: submitAnswer still resolves when cqSetUserProps throws (fire-and-forget)', async () => {
    const { ctx } = setupCompletion(['WB']);
    vi.mocked(cqSetUserProps).mockRejectedValueOnce(new Error('CQ down'));
    const result = caller(ctx).submitAnswer({
      sessionId: 'sess-1',
      questionId: 'q1',
      selectedIndex: 0,
    });
    await expect(result).resolves.toMatchObject({ isComplete: true });
  });

  it('Test 6: CQ call fires AFTER the $transaction commits', async () => {
    const { ctx } = setupCompletion(['WB']);
    const log: string[] = [];
    ctx.prisma.$transaction.mockImplementation(async (cb: any) => {
      log.push('tx:start');
      const tx = {
        learningPath: {
          findUnique: vi.fn().mockResolvedValue(null),
          upsert: vi.fn().mockImplementation(async () => {
            log.push('tx:upsert');
            return {};
          }),
        },
      };
      const result = await cb(tx);
      log.push('tx:commit');
      return result;
    });
    vi.mocked(cqSetUserProps).mockImplementation(async () => {
      log.push('cq:setProps');
    });
    await caller(ctx).submitAnswer({
      sessionId: 'sess-1',
      questionId: 'q1',
      selectedIndex: 0,
    });
    const txCommitIdx = log.indexOf('tx:commit');
    const cqIdx = log.indexOf('cq:setProps');
    expect(txCommitIdx).toBeGreaterThanOrEqual(0);
    expect(cqIdx).toBeGreaterThan(txCommitIdx);
  });
});
