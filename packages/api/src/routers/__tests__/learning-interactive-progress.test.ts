import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@mpstats/ai', () => ({}));
import { learningRouter } from '../learning';

function makeCtx() {
  const upsertProgress = vi.fn().mockResolvedValue({ id: 'p1', status: 'IN_PROGRESS' });
  return {
    ctx: {
      user: { id: 'u1' },
      prisma: {
        userProfile: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn().mockResolvedValue({ id: 'u1' }), update: vi.fn() },
        userActivityDay: { upsert: vi.fn().mockResolvedValue({}) },
        learningPath: { upsert: vi.fn().mockResolvedValue({ id: 'path1' }) },
        lessonProgress: {
          findUnique: vi.fn().mockResolvedValue(null),
          upsert: upsertProgress,
        },
      },
    } as never,
    upsertProgress,
  };
}

const validState = { version: 1 as const, revealedGateIds: ['g1'], checkpointChoices: { cp1: 'o2' } };

describe('learning.saveInteractiveProgress', () => {
  beforeEach(() => vi.clearAllMocks());

  it('upserts LessonProgress with the given progressState (status IN_PROGRESS)', async () => {
    const { ctx, upsertProgress } = makeCtx();
    const caller = learningRouter.createCaller(ctx);
    const res = await caller.saveInteractiveProgress({ lessonId: 'l1', progressState: validState });
    expect(res).toEqual({ ok: true });
    expect(upsertProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { pathId_lessonId: { pathId: 'path1', lessonId: 'l1' } },
        update: expect.objectContaining({ progressState: validState, status: 'IN_PROGRESS' }),
        create: expect.objectContaining({ pathId: 'path1', lessonId: 'l1', progressState: validState, status: 'IN_PROGRESS' }),
      }),
    );
  });

  it('does not downgrade a COMPLETED lesson back to IN_PROGRESS', async () => {
    const { ctx, upsertProgress } = makeCtx();
    (ctx as never as { prisma: { lessonProgress: { findUnique: ReturnType<typeof vi.fn> } } }).prisma.lessonProgress.findUnique.mockResolvedValue({ status: 'COMPLETED' });
    const caller = learningRouter.createCaller(ctx);
    await caller.saveInteractiveProgress({ lessonId: 'l1', progressState: validState });
    expect(upsertProgress).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ status: 'COMPLETED' }) }),
    );
  });

  it('rejects malformed progressState (wrong version)', async () => {
    const { ctx } = makeCtx();
    const caller = learningRouter.createCaller(ctx);
    await expect(
      caller.saveInteractiveProgress({ lessonId: 'l1', progressState: { version: 2, revealedGateIds: [], checkpointChoices: {} } as never }),
    ).rejects.toBeTruthy();
  });
});
