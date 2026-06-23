import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@mpstats/ai', () => ({ indexLessonText: vi.fn() }));
import { adminRouter } from '../admin';

function makeCtx() {
  const create = vi.fn().mockResolvedValue({ id: 'c1_text_uuid' });
  const aggregate = vi.fn().mockResolvedValue({ _max: { order: 7 } });
  const findUnique = vi
    .fn()
    .mockResolvedValueOnce(null) // protectedProcedure lastActiveAt debounce
    .mockResolvedValueOnce({ role: 'ADMIN' }); // adminProcedure role check
  return {
    ctx: {
      user: { id: 'admin1' },
      prisma: {
        userProfile: { findUnique },
        userActivityDay: { upsert: vi.fn().mockResolvedValue({}) },
        lesson: { create, aggregate },
      },
    },
    create, aggregate,
  };
}

describe('admin.createLesson', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a DRAFT TEXT lesson at end of course order', async () => {
    const { ctx, create, aggregate } = makeCtx();
    const caller = adminRouter.createCaller(ctx as never);
    const res = await caller.createLesson({ courseId: 'c1', title: 'Новый урок', contentType: 'TEXT' });

    expect(aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: { courseId: 'c1' } }));
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          courseId: 'c1', title: 'Новый урок', contentType: 'TEXT',
          contentStatus: 'DRAFT', order: 8, isHidden: true,
        }),
      }),
    );
    expect(res.id).toMatch(/^c1_text_/);
  });

  it('rejects VIDEO contentType', async () => {
    const { ctx } = makeCtx();
    const caller = adminRouter.createCaller(ctx as never);
    await expect(
      caller.createLesson({ courseId: 'c1', title: 'x', contentType: 'VIDEO' as never }),
    ).rejects.toBeTruthy();
  });
});
