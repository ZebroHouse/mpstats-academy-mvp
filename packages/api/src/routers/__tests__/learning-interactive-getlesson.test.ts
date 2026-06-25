import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@mpstats/ai', () => ({}));
vi.mock('../../utils/access', () => ({
  checkLessonAccess: vi.fn().mockResolvedValue({ hasAccess: true, hasPlatformSubscription: true }),
}));
import { learningRouter } from '../learning';

const state = { version: 1, revealedGateIds: ['g1'], checkpointChoices: { cp1: 'o2' } };
const base = {
  id: 'l1', courseId: 'c1', title: 'T', order: 1, isHidden: false,
  videoId: null, videoUrl: null, duration: null, description: null,
  skillCategory: 'ANALYTICS', skillLevel: 'MEDIUM',
  course: { id: 'c1', title: 'C', slug: 'c', lessons: [{ id: 'l1', title: 'T', order: 1 }] },
  materials: [],
};

function makeCtx(lesson: unknown) {
  return {
    user: { id: 'u1' },
    prisma: {
      userProfile: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() },
      userActivityDay: { upsert: vi.fn().mockResolvedValue({}) },
      lesson: { findUnique: vi.fn().mockResolvedValue(lesson) },
    },
  } as never;
}

describe('learning.getLesson — interactive progressState', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns progressState from the student progress row', async () => {
    const lesson = { ...base, contentType: 'INTERACTIVE', contentStatus: 'PUBLISHED', body: { type: 'doc', content: [] },
      progress: [{ status: 'IN_PROGRESS', watchedPercent: 0, progressState: state }] };
    const caller = learningRouter.createCaller(makeCtx(lesson));
    const res = await caller.getLesson({ lessonId: 'l1' });
    expect(res?.lesson.contentType).toBe('INTERACTIVE');
    expect(res?.lesson.progressState).toEqual(state);
  });

  it('returns null progressState when there is no progress row', async () => {
    const lesson = { ...base, contentType: 'INTERACTIVE', contentStatus: 'PUBLISHED', body: { type: 'doc', content: [] }, progress: [] };
    const caller = learningRouter.createCaller(makeCtx(lesson));
    const res = await caller.getLesson({ lessonId: 'l1' });
    expect(res?.lesson.progressState).toBeNull();
  });
});
