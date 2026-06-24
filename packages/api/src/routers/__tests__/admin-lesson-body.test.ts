import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@mpstats/ai', () => ({ indexLessonText: vi.fn() }));
import { adminRouter } from '../admin';

function makeCtx(lesson: any) {
  const findUniqueProfile = vi
    .fn()
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ role: 'ADMIN' });
  return {
    ctx: {
      user: { id: 'admin1' },
      prisma: {
        userProfile: { findUnique: findUniqueProfile },
        userActivityDay: { upsert: vi.fn().mockResolvedValue({}) },
        lesson: {
          findUnique: vi.fn().mockResolvedValue(lesson),
          update: vi.fn().mockResolvedValue({ id: lesson?.id }),
        },
      },
    },
  };
}

describe('admin.getLessonForEdit', () => {
  beforeEach(() => vi.clearAllMocks());
  it('returns editable fields', async () => {
    const lesson = { id: 'l1', title: 'T', courseId: 'c1', contentType: 'TEXT', contentStatus: 'DRAFT', body: { type: 'doc', content: [] } };
    const { ctx } = makeCtx(lesson);
    const caller = adminRouter.createCaller(ctx as never);
    const res = await caller.getLessonForEdit({ lessonId: 'l1' });
    expect(res).toMatchObject({ id: 'l1', contentType: 'TEXT', contentStatus: 'DRAFT' });
  });
});

describe('admin.updateLessonBody', () => {
  beforeEach(() => vi.clearAllMocks());
  it('saves title + body without touching contentStatus (stays DRAFT, no indexing)', async () => {
    const lesson = { id: 'l1', title: 'T', courseId: 'c1', contentType: 'TEXT', contentStatus: 'DRAFT' };
    const { ctx } = makeCtx(lesson);
    const caller = adminRouter.createCaller(ctx as never);
    await caller.updateLessonBody({ lessonId: 'l1', title: 'New', body: { type: 'doc', content: [] } });
    expect(ctx.prisma.lesson.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'l1' },
        data: expect.objectContaining({ title: 'New', body: { type: 'doc', content: [] } }),
      }),
    );
    const call = (ctx.prisma.lesson.update as any).mock.calls[0][0];
    expect(call.data.contentStatus).toBeUndefined();
  });
});
