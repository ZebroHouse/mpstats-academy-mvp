import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@mpstats/ai', () => ({ embedQuery: vi.fn() }));
import { adminRouter } from '../admin';

/**
 * Builds a ctx whose userProfile.findUnique passes the protected debounce
 * (null) then the adminProcedure role check ({ role: 'ADMIN' }). Extra prisma
 * mocks are spread in per test.
 */
function makeCtx(prismaMocks: Record<string, unknown>) {
  const findUnique = vi
    .fn()
    .mockResolvedValueOnce(null) // protectedProcedure lastActiveAt debounce
    .mockResolvedValueOnce({ role: 'ADMIN' }); // adminProcedure role check
  return {
    user: { id: 'admin1' },
    prisma: {
      userProfile: { findUnique },
      userActivityDay: { upsert: vi.fn().mockResolvedValue({}) },
      ...prismaMocks,
    },
  };
}

describe('admin.job.getJobs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('merges hasEmbedding (raw query) + lessonCount (_count) into sorted shape', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: 'job1', slug: 'a', title: 'Aaa', marketplace: 'WB',
        displayOrder: 0, isPublished: true, _count: { lessons: 3 },
      },
      {
        id: 'job2', slug: 'b', title: 'Bbb', marketplace: 'OZON',
        displayOrder: 1, isPublished: false, _count: { lessons: 0 },
      },
    ]);
    const $queryRaw = vi.fn().mockResolvedValue([
      { id: 'job1', has_embedding: true },
      { id: 'job2', has_embedding: false },
    ]);
    const ctx = makeCtx({ job: { findMany }, $queryRaw });

    const res = await adminRouter.createCaller(ctx as never).job.getJobs();

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ displayOrder: 'asc' }, { title: 'asc' }] }),
    );
    expect(res).toEqual([
      {
        id: 'job1', slug: 'a', title: 'Aaa', marketplace: 'WB',
        displayOrder: 0, isPublished: true, lessonCount: 3, hasEmbedding: true,
      },
      {
        id: 'job2', slug: 'b', title: 'Bbb', marketplace: 'OZON',
        displayOrder: 1, isPublished: false, lessonCount: 0, hasEmbedding: false,
      },
    ]);
  });

  it('defaults hasEmbedding to false when raw query omits the job', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: 'job1', slug: 'a', title: 'Aaa', marketplace: 'BOTH',
        displayOrder: 0, isPublished: true, _count: { lessons: 1 },
      },
    ]);
    const $queryRaw = vi.fn().mockResolvedValue([]); // no rows
    const ctx = makeCtx({ job: { findMany }, $queryRaw });

    const res = await adminRouter.createCaller(ctx as never).job.getJobs();

    expect(res[0].hasEmbedding).toBe(false);
  });
});

describe('admin.job.getJobLessons', () => {
  beforeEach(() => vi.clearAllMocks());

  it('flattens lesson rows and orders by order asc', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        lessonId: 'l1', order: 0,
        lesson: { title: 'Урок 1', isHidden: false, contentType: 'VIDEO', course: { title: 'Курс A' } },
      },
      {
        lessonId: 'l2', order: 1,
        lesson: { title: 'Урок 2', isHidden: true, contentType: 'TEXT', course: null },
      },
    ]);
    const ctx = makeCtx({ jobLesson: { findMany } });

    const res = await adminRouter.createCaller(ctx as never).job.getJobLessons({ jobId: 'job1' });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { jobId: 'job1' }, orderBy: { order: 'asc' } }),
    );
    expect(res).toEqual([
      { lessonId: 'l1', title: 'Урок 1', order: 0, courseTitle: 'Курс A', isHidden: false, contentType: 'VIDEO' },
      { lessonId: 'l2', title: 'Урок 2', order: 1, courseTitle: '', isHidden: true, contentType: 'TEXT' },
    ]);
  });
});

describe('admin.job.searchLessons', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns hidden lessons too and filters by case-insensitive title contains', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: 'l1', title: 'Реклама на WB', isHidden: false, contentType: 'VIDEO', course: { title: 'Курс A' } },
      { id: 'l2', title: 'Реклама скрытая', isHidden: true, contentType: 'TEXT', course: null },
    ]);
    const ctx = makeCtx({ lesson: { findMany } });

    const res = await adminRouter.createCaller(ctx as never).job.searchLessons({ query: 'реклама' });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { title: { contains: 'реклама', mode: 'insensitive' } },
        take: 30,
        orderBy: [{ courseId: 'asc' }, { order: 'asc' }],
      }),
    );
    expect(res).toEqual([
      { lessonId: 'l1', title: 'Реклама на WB', courseTitle: 'Курс A', isHidden: false, contentType: 'VIDEO' },
      { lessonId: 'l2', title: 'Реклама скрытая', courseTitle: '', isHidden: true, contentType: 'TEXT' },
    ]);
  });
});
