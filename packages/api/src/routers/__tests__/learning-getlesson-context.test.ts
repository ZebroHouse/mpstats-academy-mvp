import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@mpstats/ai', () => ({}));
vi.mock('../../utils/access', () => ({
  checkLessonAccess: vi.fn().mockResolvedValue({ hasAccess: true, hasPlatformSubscription: true }),
}));
import { learningRouter } from '../learning';

const courseLessons = [
  { id: 'l1', title: 'Урок 1', order: 1 },
  { id: 'l2', title: 'Урок 2', order: 2 },
  { id: 'l3', title: 'Урок 3', order: 3 },
];

function makeLesson(lessonId: string) {
  return {
    id: lessonId,
    courseId: 'c1',
    title: courseLessons.find((l) => l.id === lessonId)?.title ?? 'X',
    order: courseLessons.find((l) => l.id === lessonId)?.order ?? 1,
    isHidden: false,
    videoId: null,
    videoUrl: null,
    duration: null,
    description: null,
    skillCategory: 'ANALYTICS',
    skillLevel: 'MEDIUM',
    contentType: 'VIDEO',
    contentStatus: 'PUBLISHED',
    body: null,
    course: { id: 'c1', title: 'Реклама', slug: 'ads', lessons: courseLessons },
    progress: [],
    materials: [],
  };
}

interface CtxMocks {
  jobFindUnique?: ReturnType<typeof vi.fn>;
  learningPathFindUnique?: ReturnType<typeof vi.fn>;
  lessonFindMany?: ReturnType<typeof vi.fn>;
}

function makeCtx(lesson: unknown, mocks: CtxMocks = {}) {
  return {
    user: { id: 'u1' },
    prisma: {
      userProfile: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() },
      userActivityDay: { upsert: vi.fn().mockResolvedValue({}) },
      lesson: {
        findUnique: vi.fn().mockResolvedValue(lesson),
        findMany: mocks.lessonFindMany ?? vi.fn().mockResolvedValue([]),
      },
      job: { findUnique: mocks.jobFindUnique ?? vi.fn().mockResolvedValue(null) },
      learningPath: { findUnique: mocks.learningPathFindUnique ?? vi.fn().mockResolvedValue(null) },
    },
  } as never;
}

describe('learning.getLesson — context nav', () => {
  beforeEach(() => vi.clearAllMocks());

  it('from отсутствует → kind course, next по курсу, не последний, returnHref library', async () => {
    const caller = learningRouter.createCaller(makeCtx(makeLesson('l2')));
    const res = await caller.getLesson({ lessonId: 'l2' });
    expect(res?.context.kind).toBe('course');
    expect(res?.context.fromParam).toBe('course');
    expect(res?.context.isLastInContext).toBe(false);
    expect(res?.context.nextInContext).toEqual({ id: 'l3', title: 'Урок 3' });
    expect(res?.context.prevInContext).toEqual({ id: 'l1', title: 'Урок 1' });
    expect(res?.context.returnHref.startsWith('/learn/library#')).toBe(true);
  });

  it('последний урок курса, from нет → isLastInContext true, next null', async () => {
    const caller = learningRouter.createCaller(makeCtx(makeLesson('l3')));
    const res = await caller.getLesson({ lessonId: 'l3' });
    expect(res?.context.kind).toBe('course');
    expect(res?.context.isLastInContext).toBe(true);
    expect(res?.context.nextInContext).toBeNull();
  });

  it('from job:<slug> → kind job, порядок из jobLesson (не курсовой)', async () => {
    const jobFindUnique = vi.fn().mockResolvedValue({
      title: 'Автобидер',
      isPublished: true,
      lessons: [{ lessonId: 'l2' }, { lessonId: 'l9' }],
    });
    const lessonFindMany = vi.fn().mockResolvedValue([{ id: 'l9', title: 'Урок джобы 9' }]);
    const caller = learningRouter.createCaller(
      makeCtx(makeLesson('l2'), { jobFindUnique, lessonFindMany }),
    );
    const res = await caller.getLesson({ lessonId: 'l2', from: 'job:autobidder' });
    expect(res?.context.kind).toBe('job');
    expect(res?.context.fromParam).toBe('job:autobidder');
    expect(res?.context.returnHref).toBe('/learn/job/autobidder');
    // next из джобы (l9), НЕ курсовой l3
    expect(res?.context.nextInContext).toEqual({ id: 'l9', title: 'Урок джобы 9' });
    expect(res?.context.prevInContext).toBeNull();
    expect(res?.context.isLastInContext).toBe(false);
  });

  it('from favorites → kind favorites, единственный урок, isLast, returnHref /learn/favorites', async () => {
    const caller = learningRouter.createCaller(makeCtx(makeLesson('l2')));
    const res = await caller.getLesson({ lessonId: 'l2', from: 'favorites' });
    expect(res?.context.kind).toBe('favorites');
    expect(res?.context.returnHref).toBe('/learn/favorites');
    expect(res?.context.isLastInContext).toBe(true);
    expect(res?.context.nextInContext).toBeNull();
  });

  it('существующие nextLesson/prevLesson (курсовые) по-прежнему в ответе', async () => {
    const caller = learningRouter.createCaller(makeCtx(makeLesson('l2')));
    const res = await caller.getLesson({ lessonId: 'l2', from: 'job:autobidder' });
    // job branch fell back (job.findUnique → null), но nextLesson/prevLesson всегда курсовые
    expect(res?.nextLesson).toEqual({ id: 'l3', title: 'Урок 3' });
    expect(res?.prevLesson).toEqual({ id: 'l1', title: 'Урок 1' });
  });
});
