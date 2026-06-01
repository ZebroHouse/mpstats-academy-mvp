import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DiagnosticQuestion } from '@mpstats/shared';

// Mock CQ helpers.
vi.mock('../../utils/carrotquest', () => ({
  cqSetUserProps: vi.fn().mockResolvedValue(undefined),
  cqTrackEvent: vi.fn().mockResolvedValue(undefined),
}));

// Mock the static-deck utilities so startSession does not depend on the
// 30-question deck content during routing tests (deck shape is covered
// separately in src/diagnostic/*.test.ts).
vi.mock('../../diagnostic/deck-picker', () => ({
  pickDeckForUser: vi.fn(),
}));
vi.mock('../../diagnostic/option-shuffler', () => ({
  // Default: identity shuffle so options stay as-is; tests can override per-case.
  shuffleOptions: vi.fn((q: any) => ({ options: q.options, correctIndex: 0 })),
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
import { pickDeckForUser } from '../../diagnostic/deck-picker';

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
  // Default static-deck pick used by startSession: shape matches StaticQuestion
  // (axis/level/marketplace) so the router can map it to DiagnosticQuestion.
  vi.mocked(pickDeckForUser).mockReturnValue([
    {
      id: 'q-wb-01',
      axis: 'ANALYTICS',
      level: 1,
      prompt: 'Q1',
      options: ['a', 'b', 'c', 'd'],
      explanation: 'e',
      marketplace: 'WB',
    },
    {
      id: 'q-wb-02',
      axis: 'MARKETING',
      level: 2,
      prompt: 'Q2',
      options: ['a', 'b', 'c', 'd'],
      explanation: 'e',
      marketplace: 'WB',
    },
  ] as any);
});

describe('diagnostic.startSession — static-deck wiring (Phase 59 v2)', () => {
  it('Test 1: passes UserProfile.marketplaces as 1st arg to pickDeckForUser', async () => {
    const ctx = makeCtx(['WB']);
    await caller(ctx).startSession();
    expect(pickDeckForUser).toHaveBeenCalled();
    const args = vi.mocked(pickDeckForUser).mock.calls[0];
    // args: [userMarketplaces, sessionSeed]
    expect(args[0]).toEqual(['WB']);
  });

  it('Test 2: passes [] when UserProfile has no marketplaces row', async () => {
    const ctx = makeCtx(null);
    await caller(ctx).startSession();
    const args = vi.mocked(pickDeckForUser).mock.calls[0];
    expect(args[0]).toEqual([]);
  });

  it('Test 3: uses created session.id as sessionSeed (2nd arg)', async () => {
    const ctx = makeCtx(['WB', 'OZON']);
    // makeCtx default: diagnosticSession.create resolves with { id: 'sess-1' }
    await caller(ctx).startSession();
    const args = vi.mocked(pickDeckForUser).mock.calls[0];
    expect(args[1]).toBe('sess-1');
  });

  it('Test 4: persists assembled DiagnosticQuestion[] via session.update', async () => {
    const ctx = makeCtx(['WB']);
    await caller(ctx).startSession();
    expect(ctx.prisma.diagnosticSession.update).toHaveBeenCalled();
    const updateArgs = ctx.prisma.diagnosticSession.update.mock.calls[0][0];
    expect(updateArgs.where.id).toBe('sess-1');
    const persisted = updateArgs.data.questions;
    expect(persisted).toHaveLength(2);
    // Shape must be DiagnosticQuestion (question/options/correctIndex/etc.),
    // not StaticQuestion (prompt/axis/level).
    expect(persisted[0]).toMatchObject({
      id: 'q-wb-01',
      question: 'Q1',
      options: ['a', 'b', 'c', 'd'],
      correctIndex: 0,
      explanation: 'e',
      difficulty: 'EASY',
      skillCategory: 'ANALYTICS',
      marketplace: 'WB',
    });
    expect(persisted[1]).toMatchObject({
      id: 'q-wb-02',
      difficulty: 'MEDIUM',
      skillCategory: 'MARKETING',
    });
  });
});

describe('diagnostic.submitAnswer — CQ event on completion', () => {
  function setupCompletion(profileMarketplaces: string[] = ['WB']) {
    const ctx = makeCtx(profileMarketplaces);
    // Session with exactly 1 question so the very first submit completes it.
    const sessionQuestions = [mkQuestion('q1', 'WB')];
    ctx.prisma.diagnosticSession.findUnique.mockImplementation(() => {
      // Used in submitAnswer (with select: questions, currentQuestion, userId)
      // and later in completion path (with select: questions).
      return Promise.resolve({
        id: 'sess-1',
        userId: 'user-1',
        questions: sessionQuestions,
        currentQuestion: 0,
      });
    });
    ctx.prisma.diagnosticSession.update.mockImplementation(() => {
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
