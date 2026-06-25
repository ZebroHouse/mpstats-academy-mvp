import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@mpstats/ai', () => ({}));
import { learningRouter } from '../learning';

function makeCtx(path: { id: string } | null) {
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  return {
    ctx: {
      user: { id: 'u1' },
      prisma: {
        userProfile: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() },
        userActivityDay: { upsert: vi.fn().mockResolvedValue({}) },
        learningPath: { findUnique: vi.fn().mockResolvedValue(path) },
        lessonProgress: { updateMany },
      },
    } as never,
    updateMany,
  };
}

describe('learning.resetInteractiveProgress', () => {
  beforeEach(() => vi.clearAllMocks());

  it('clears progressState (DB null) for the user+lesson, keeps status', async () => {
    const { ctx, updateMany } = makeCtx({ id: 'path1' });
    const caller = learningRouter.createCaller(ctx);
    const res = await caller.resetInteractiveProgress({ lessonId: 'l1' });
    expect(res).toEqual({ ok: true });
    expect(updateMany).toHaveBeenCalledTimes(1);
    const arg = updateMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({ pathId: 'path1', lessonId: 'l1' });
    // status must NOT be touched
    expect(arg.data).not.toHaveProperty('status');
    expect('progressState' in arg.data).toBe(true);
  });

  it('is a no-op when the user has no learning path', async () => {
    const { ctx, updateMany } = makeCtx(null);
    const caller = learningRouter.createCaller(ctx);
    const res = await caller.resetInteractiveProgress({ lessonId: 'l1' });
    expect(res).toEqual({ ok: true });
    expect(updateMany).not.toHaveBeenCalled();
  });
});
