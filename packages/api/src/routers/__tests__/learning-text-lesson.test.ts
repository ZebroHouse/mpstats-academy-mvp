import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@mpstats/ai', () => ({}));
vi.mock('../../utils/access', () => ({ checkLessonAccess: vi.fn().mockResolvedValue({ hasAccess: true, hasPlatformSubscription: true }) }));
import { learningRouter } from '../learning';

function makeCtx(lesson: any) {
  return {
    user: { id: 'u1' },
    prisma: {
      userProfile: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() },
      userActivityDay: { upsert: vi.fn().mockResolvedValue({}) },
      lesson: { findUnique: vi.fn().mockResolvedValue(lesson) },
    },
  } as any;
}

const base = {
  id: 'l1', courseId: 'c1', title: 'T', order: 1, isHidden: false,
  videoId: null, duration: null, description: null,
  course: { id: 'c1', title: 'C', slug: 'c', lessons: [{ id: 'l1', title: 'T', order: 1 }] },
  progress: [], materials: [],
};

describe('learning.getLesson — text lessons', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns body + contentType for a PUBLISHED text lesson', async () => {
    const lesson = { ...base, contentType: 'TEXT', contentStatus: 'PUBLISHED', body: { type: 'doc', content: [] } };
    const caller = learningRouter.createCaller(makeCtx(lesson));
    const res = await caller.getLesson({ lessonId: 'l1' });
    expect(res?.lesson.contentType).toBe('TEXT');
    expect(res?.lesson.body).toEqual({ type: 'doc', content: [] });
  });

  it('returns null for a DRAFT lesson (not visible to students)', async () => {
    const lesson = { ...base, contentType: 'TEXT', contentStatus: 'DRAFT', body: { type: 'doc', content: [] } };
    const caller = learningRouter.createCaller(makeCtx(lesson));
    const res = await caller.getLesson({ lessonId: 'l1' });
    expect(res).toBeNull();
  });
});
