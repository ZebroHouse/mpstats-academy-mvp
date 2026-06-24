import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@mpstats/ai', () => ({ indexLessonText: vi.fn() }));
const removeMock = vi.fn().mockResolvedValue({ error: null });
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ storage: { from: vi.fn(() => ({ remove: removeMock, createSignedUploadUrl: vi.fn() })) } })),
}));
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'test-secret';

import { adminRouter, extractLessonImagePaths } from '../admin';

function makeCtx(lesson: any) {
  const findUnique = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ role: 'ADMIN' });
  return {
    ctx: {
      user: { id: 'a1' },
      prisma: {
        userProfile: { findUnique },
        userActivityDay: { upsert: vi.fn().mockResolvedValue({}) },
        lesson: { findUnique: vi.fn().mockResolvedValue(lesson), delete: vi.fn().mockResolvedValue({ id: lesson?.id }) },
        contentChunk: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
      },
    },
  };
}

describe('extractLessonImagePaths', () => {
  it('pulls lesson-images object paths from a TipTap doc', () => {
    const body = { type: 'doc', content: [
      { type: 'image', attrs: { src: 'https://x.supabase.co/storage/v1/object/public/lesson-images/uuid/pic.png' } },
      { type: 'paragraph', content: [{ type: 'text', text: 'hi' }] },
    ] };
    expect(extractLessonImagePaths(body)).toEqual(['uuid/pic.png']);
  });
  it('returns [] for body with no images', () => {
    expect(extractLessonImagePaths({ type: 'doc', content: [] })).toEqual([]);
  });
});

describe('admin.deleteLesson', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes a TEXT lesson: chunks + lesson row, returns id', async () => {
    const lesson = { id: 'l1', contentType: 'TEXT', body: { type: 'doc', content: [] } };
    const { ctx } = makeCtx(lesson);
    const caller = adminRouter.createCaller(ctx as never);
    const res = await caller.deleteLesson({ lessonId: 'l1' });
    expect(ctx.prisma.contentChunk.deleteMany).toHaveBeenCalledWith({ where: { lessonId: 'l1' } });
    expect(ctx.prisma.lesson.delete).toHaveBeenCalledWith({ where: { id: 'l1' } });
    expect(res).toEqual({ id: 'l1' });
  });

  it('refuses to delete a VIDEO lesson', async () => {
    const lesson = { id: 'v1', contentType: 'VIDEO', body: null };
    const { ctx } = makeCtx(lesson);
    const caller = adminRouter.createCaller(ctx as never);
    await expect(caller.deleteLesson({ lessonId: 'v1' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(ctx.prisma.lesson.delete).not.toHaveBeenCalled();
  });
});
