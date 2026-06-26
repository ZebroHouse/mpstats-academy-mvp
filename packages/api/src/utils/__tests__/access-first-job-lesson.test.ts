import { describe, it, expect, vi } from 'vitest';
import { getFirstJobLessonIds, isLessonAccessible } from '../access';

// Mock prisma.jobLesson.findMany — getFirstJobLessonIds reads JobLesson rows of
// published jobs and derives the minimum-order lesson(s) per job.
function makePrisma(rows: { jobId: string; lessonId: string; order: number }[]) {
  return {
    jobLesson: {
      findMany: vi.fn().mockResolvedValue(rows),
    },
  } as any;
}

describe('getFirstJobLessonIds', () => {
  it('возвращает урок с минимальным order внутри джобы', async () => {
    const prisma = makePrisma([
      { jobId: 'job-1', lessonId: 'l-a', order: 0 },
      { jobId: 'job-1', lessonId: 'l-b', order: 1 },
      { jobId: 'job-1', lessonId: 'l-c', order: 2 },
    ]);
    const set = await getFirstJobLessonIds(prisma);
    expect(set.has('l-a')).toBe(true);
    expect(set.has('l-b')).toBe(false);
    expect(set.has('l-c')).toBe(false);
  });

  it('при равенстве минимального order включает все уроки на минимуме', async () => {
    const prisma = makePrisma([
      { jobId: 'job-1', lessonId: 'l-a', order: 0 },
      { jobId: 'job-1', lessonId: 'l-b', order: 0 },
      { jobId: 'job-1', lessonId: 'l-c', order: 5 },
    ]);
    const set = await getFirstJobLessonIds(prisma);
    expect(set.has('l-a')).toBe(true);
    expect(set.has('l-b')).toBe(true);
    expect(set.has('l-c')).toBe(false);
  });

  it('урок первый хотя бы в одной джобе → free, даже если не первый в другой', async () => {
    const prisma = makePrisma([
      { jobId: 'job-1', lessonId: 'l-a', order: 0 },
      { jobId: 'job-1', lessonId: 'l-x', order: 1 },
      { jobId: 'job-2', lessonId: 'l-y', order: 0 },
      { jobId: 'job-2', lessonId: 'l-a', order: 1 }, // l-a не первый тут
    ]);
    const set = await getFirstJobLessonIds(prisma);
    expect(set.has('l-a')).toBe(true); // первый в job-1
    expect(set.has('l-y')).toBe(true); // первый в job-2
    expect(set.has('l-x')).toBe(false);
  });

  it('order может быть не нулевым на минимуме (берётся минимум, не ноль)', async () => {
    const prisma = makePrisma([
      { jobId: 'job-1', lessonId: 'l-a', order: 3 },
      { jobId: 'job-1', lessonId: 'l-b', order: 7 },
    ]);
    const set = await getFirstJobLessonIds(prisma);
    expect(set.has('l-a')).toBe(true);
    expect(set.has('l-b')).toBe(false);
  });

  it('lessonIds=[] → пустой Set без запроса в БД', async () => {
    const prisma = makePrisma([]);
    const set = await getFirstJobLessonIds(prisma, []);
    expect(set.size).toBe(0);
    expect(prisma.jobLesson.findMany).not.toHaveBeenCalled();
  });

  it('lessonIds передан → результат ограничен этими уроками', async () => {
    const prisma = makePrisma([
      { jobId: 'job-1', lessonId: 'l-a', order: 0 },
      { jobId: 'job-1', lessonId: 'l-b', order: 1 },
      { jobId: 'job-2', lessonId: 'l-c', order: 0 },
    ]);
    const set = await getFirstJobLessonIds(prisma, ['l-a']);
    expect(set.has('l-a')).toBe(true);
    expect(set.has('l-c')).toBe(false); // первый, но не в запрошенном списке
    // фильтрация джоб ушла в БД-запрос
    expect(prisma.jobLesson.findMany).toHaveBeenCalledTimes(1);
  });
});

describe('isLessonAccessible — first-job-lesson bypass', () => {
  const noSubs: never[] = [];

  it('первый урок джобы (isFirstJobLesson=true) доступен без подписки', () => {
    expect(
      isLessonAccessible(
        { order: 9, courseId: '01_analytics' },
        noSubs,
        true,
        false,
        true,
      ),
    ).toBe(true);
  });

  it('не первый урок джобы без подписки → недоступен', () => {
    expect(
      isLessonAccessible(
        { order: 9, courseId: '01_analytics' },
        noSubs,
        true,
        false,
        false,
      ),
    ).toBe(false);
  });
});
