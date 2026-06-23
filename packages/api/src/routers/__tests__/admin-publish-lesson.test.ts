import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('server-only', () => ({}));
const { indexLessonText } = vi.hoisted(() => ({
  indexLessonText: vi.fn().mockResolvedValue({ chunks: 3 }),
}));
vi.mock('@mpstats/ai', () => ({ indexLessonText }));
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
          update: vi.fn().mockResolvedValue({ id: lesson.id, contentStatus: 'PUBLISHED' }),
        },
      },
    },
  };
}

describe('admin.publishLesson', () => {
  beforeEach(() => vi.clearAllMocks());

  it('indexes body then sets PUBLISHED + isHidden=false', async () => {
    const lesson = { id: 'l1', courseId: 'c1', contentType: 'TEXT', skillCategory: 'ANALYTICS', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }] } };
    const { ctx } = makeCtx(lesson);
    const caller = adminRouter.createCaller(ctx as never);
    const res = await caller.publishLesson({ lessonId: 'l1' });

    expect(indexLessonText).toHaveBeenCalledWith(
      expect.objectContaining({ lessonId: 'l1', skillCategory: 'ANALYTICS' }),
    );
    expect(ctx.prisma.lesson.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'l1' },
        data: expect.objectContaining({ contentStatus: 'PUBLISHED', isHidden: false }),
      }),
    );
    expect(res).toMatchObject({ contentStatus: 'PUBLISHED', chunks: 3 });
  });

  it('does not publish if indexing throws', async () => {
    indexLessonText.mockRejectedValueOnce(new Error('embed down'));
    const lesson = { id: 'l1', courseId: 'c1', contentType: 'TEXT', skillCategory: 'ANALYTICS', body: { type: 'doc', content: [] } };
    const { ctx } = makeCtx(lesson);
    const caller = adminRouter.createCaller(ctx as never);
    await expect(caller.publishLesson({ lessonId: 'l1' })).rejects.toBeTruthy();
    expect(ctx.prisma.lesson.update).not.toHaveBeenCalled();
  });
});
