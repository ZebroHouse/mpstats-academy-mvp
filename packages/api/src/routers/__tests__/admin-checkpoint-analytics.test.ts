import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@mpstats/ai', () => ({ indexLessonText: vi.fn() }));
import { adminRouter } from '../admin';

/**
 * Interactive body with one checkpoint (cp1) holding two options:
 *   o1 → «A», o2 → «B».
 * Mirrors the TipTap shape consumed by extractCheckpoints/tallyCheckpoints.
 */
const interactiveBody = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Выбери путь' }] },
    {
      type: 'checkpoint',
      attrs: { id: 'cp1' },
      content: [
        { type: 'checkpointOption', attrs: { id: 'o1', label: 'A' } },
        { type: 'checkpointOption', attrs: { id: 'o2', label: 'B' } },
      ],
    },
  ],
};

function state(choices: Record<string, string>) {
  return { version: 1, revealedGateIds: [], checkpointChoices: choices };
}

function progressRow(isTest: boolean, progressState: unknown) {
  return { progressState, path: { user: { isTest } } };
}

/**
 * Builds a ctx with a mocked prisma. `userProfile.findUnique` is called twice
 * by the procedure stack: once by protectedProcedure's lastActiveAt debounce
 * (returns null → skip), once by adminProcedure's role check (returns ADMIN).
 */
function makeCtx(overrides: {
  lessonFindUnique?: ReturnType<typeof vi.fn>;
  lessonFindMany?: ReturnType<typeof vi.fn>;
  progressFindMany?: ReturnType<typeof vi.fn>;
}) {
  const findUnique = vi
    .fn()
    .mockResolvedValueOnce(null) // protectedProcedure lastActiveAt debounce
    .mockResolvedValueOnce({ role: 'ADMIN' }); // adminProcedure role check

  return {
    user: { id: 'admin1' },
    prisma: {
      userProfile: { findUnique },
      userActivityDay: { upsert: vi.fn().mockResolvedValue({}) },
      lesson: {
        findUnique: overrides.lessonFindUnique ?? vi.fn(),
        findMany: overrides.lessonFindMany ?? vi.fn(),
      },
      lessonProgress: {
        findMany: overrides.progressFindMany ?? vi.fn(),
      },
    },
  } as never;
}

describe('admin.analytics.getCheckpointAnalytics', () => {
  beforeEach(() => vi.clearAllMocks());

  it('excludes test users from the checkpoint tally', async () => {
    const ctx = makeCtx({
      lessonFindUnique: vi.fn().mockResolvedValue({
        id: 'l1',
        title: 'Урок',
        body: interactiveBody,
        course: { title: 'Курс' },
      }),
      progressFindMany: vi.fn().mockResolvedValue([
        progressRow(false, state({ cp1: 'o1' })),
        progressRow(false, state({ cp1: 'o1' })),
        progressRow(false, state({ cp1: 'o2' })),
        progressRow(true, state({ cp1: 'o2' })), // test user → ignored
        progressRow(true, state({ cp1: 'o2' })), // test user → ignored
      ]),
    });

    const caller = adminRouter.createCaller(ctx);
    const res = await caller.analytics.getCheckpointAnalytics({ lessonId: 'l1' });

    expect(res.totalRespondents).toBe(3);
    expect(res.checkpoints).toHaveLength(1);
    const cp = res.checkpoints[0];
    expect(cp.totalAnswered).toBe(3);
    const o1 = cp.options.find((o) => o.optionId === 'o1');
    const o2 = cp.options.find((o) => o.optionId === 'o2');
    expect(o1?.count).toBe(2);
    expect(o2?.count).toBe(1);
  });

  it('throws NOT_FOUND when the lesson is missing', async () => {
    const ctx = makeCtx({
      lessonFindUnique: vi.fn().mockResolvedValue(null),
      progressFindMany: vi.fn().mockResolvedValue([]),
    });
    const caller = adminRouter.createCaller(ctx);
    await expect(
      caller.analytics.getCheckpointAnalytics({ lessonId: 'missing' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('skips malformed progressState rows without throwing', async () => {
    const ctx = makeCtx({
      lessonFindUnique: vi.fn().mockResolvedValue({
        id: 'l1',
        title: 'Урок',
        body: interactiveBody,
        course: { title: 'Курс' },
      }),
      progressFindMany: vi.fn().mockResolvedValue([
        progressRow(false, state({ cp1: 'o1' })),
        progressRow(false, null), // null
        progressRow(false, 'not-an-object'), // wrong type
        progressRow(false, { version: 2, checkpointChoices: { cp1: 'o2' } }), // wrong version
        progressRow(false, { version: 1 }), // missing checkpointChoices
        progressRow(false, { version: 1, checkpointChoices: 'nope' }), // wrong shape
      ]),
    });

    const caller = adminRouter.createCaller(ctx);
    const res = await caller.analytics.getCheckpointAnalytics({ lessonId: 'l1' });

    expect(res.totalRespondents).toBe(1);
    expect(res.checkpoints[0].options.find((o) => o.optionId === 'o1')?.count).toBe(1);
    expect(res.checkpoints[0].options.find((o) => o.optionId === 'o2')?.count).toBe(0);
  });

  it('returns checkpoints with zero counts when there are no non-test responses', async () => {
    const ctx = makeCtx({
      lessonFindUnique: vi.fn().mockResolvedValue({
        id: 'l1',
        title: 'Урок',
        body: interactiveBody,
        course: { title: 'Курс' },
      }),
      progressFindMany: vi.fn().mockResolvedValue([
        progressRow(true, state({ cp1: 'o1' })), // only a test user answered
      ]),
    });

    const caller = adminRouter.createCaller(ctx);
    const res = await caller.analytics.getCheckpointAnalytics({ lessonId: 'l1' });

    expect(res.totalRespondents).toBe(0);
    expect(res.checkpoints).toHaveLength(1);
    expect(res.checkpoints[0].totalAnswered).toBe(0);
    for (const opt of res.checkpoints[0].options) {
      expect(opt.count).toBe(0);
      expect(opt.percent).toBe(0);
    }
  });
});

describe('admin.analytics.listInteractiveLessons', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps only lessons with checkpoints, excludes test users, sorts by respondentCount desc', async () => {
    const lessonWithCheckpoints = {
      id: 'l1',
      title: 'Б урок',
      isHidden: false,
      body: interactiveBody,
      course: { title: 'Курс' },
    };
    const lessonNoCheckpoints = {
      id: 'l2',
      title: 'А плоский текст',
      isHidden: false,
      body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'нет чекпоинтов' }] }] },
      course: { title: 'Курс' },
    };
    const lessonFewResponses = {
      id: 'l3',
      title: 'В урок',
      isHidden: true,
      body: interactiveBody,
      course: { title: 'Курс' },
    };

    const ctx = makeCtx({
      lessonFindMany: vi.fn().mockResolvedValue([
        lessonWithCheckpoints,
        lessonNoCheckpoints,
        lessonFewResponses,
      ]),
      progressFindMany: vi.fn().mockResolvedValue([
        // l1 — 2 non-test respondents + 1 test (excluded)
        { lessonId: 'l1', progressState: state({ cp1: 'o1' }), path: { user: { isTest: false } } },
        { lessonId: 'l1', progressState: state({ cp1: 'o2' }), path: { user: { isTest: false } } },
        { lessonId: 'l1', progressState: state({ cp1: 'o2' }), path: { user: { isTest: true } } },
        // l3 — 1 non-test respondent
        { lessonId: 'l3', progressState: state({ cp1: 'o1' }), path: { user: { isTest: false } } },
      ]),
    });

    const caller = adminRouter.createCaller(ctx);
    const res = await caller.analytics.listInteractiveLessons();

    // l2 dropped (no checkpoints); l1 before l3 (2 > 1 respondents).
    expect(res.map((r) => r.lessonId)).toEqual(['l1', 'l3']);
    expect(res[0]).toMatchObject({ lessonId: 'l1', respondentCount: 2, isHidden: false, courseTitle: 'Курс' });
    expect(res[1]).toMatchObject({ lessonId: 'l3', respondentCount: 1, isHidden: true });

    // findMany query filters to TEXT/INTERACTIVE content types.
    const findManyArg = (ctx as never as { prisma: { lesson: { findMany: ReturnType<typeof vi.fn> } } })
      .prisma.lesson.findMany.mock.calls[0][0];
    expect(findManyArg.where.contentType).toEqual({ in: ['TEXT', 'INTERACTIVE'] });
  });
});
