import { describe, it, expect, vi, beforeEach } from 'vitest';
import { partnerRouter } from '../partner';

/**
 * GREEN (Phase 62) — partner course tRPC router behavioral suite.
 *
 * Verifies: getCatalog grouping order, resolveModule key lookup,
 * getLesson access control (partner-only, never locked).
 */

function makeCtx(prismaOverride: any = {}) {
  return {
    user: { id: 'user-1' },
    prisma: {
      lesson: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn().mockResolvedValue(null),
      },
      ...prismaOverride,
      // protectedProcedure fire-and-forgets lastActiveAt — must be AFTER override spread
      userProfile: {
        findUnique: vi.fn().mockResolvedValue({ lastActiveAt: new Date() }),
        update: vi.fn().mockResolvedValue({}),
      },
    },
  } as any;
}

beforeEach(() => vi.clearAllMocks());

// ---------------------------------------------------------------------------
// resolveModule
// ---------------------------------------------------------------------------

describe('resolveModule', () => {
  it('известный moduleKey → { lessonId: <id> }', async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: 'lesson-abc' });
    const caller = partnerRouter.createCaller(
      makeCtx({ lesson: { findFirst, findMany: vi.fn(), findUnique: vi.fn() } }),
    );

    const res = await caller.resolveModule({ moduleKey: 'wb-campaigns' });

    expect(res).toEqual({ lessonId: 'lesson-abc' });
    // запрос должен фильтровать по partnerModuleKey и партнёрскому курсу
    const where = findFirst.mock.calls[0][0].where;
    expect(where.course).toMatchObject({ partnerKey: 'mpstats', isHidden: false });
    expect(where.metadata).toMatchObject({ path: ['partnerModuleKey'], equals: 'wb-campaigns' });
  });

  it('неизвестный moduleKey (findFirst → null) → { lessonId: null }', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const caller = partnerRouter.createCaller(
      makeCtx({ lesson: { findFirst, findMany: vi.fn(), findUnique: vi.fn() } }),
    );

    const res = await caller.resolveModule({ moduleKey: 'does-not-exist' });

    expect(res).toEqual({ lessonId: null });
  });
});

// ---------------------------------------------------------------------------
// getLesson
// ---------------------------------------------------------------------------

describe('getLesson', () => {
  const partnerLesson = {
    id: 'lesson-1',
    courseId: 'course-p',
    title: 'Инструмент: Кампании',
    description: 'Описание урока',
    videoId: 'vid-123',
    videoUrl: 'https://video.example.com/1',
    duration: 15,
    order: 3,
    isHidden: false,
    course: { partnerKey: 'mpstats', title: 'MPSTATS Инструменты', isHidden: false },
  };

  it('партнёрский урок → locked: false, правильный videoId', async () => {
    const findUnique = vi.fn().mockResolvedValue(partnerLesson);
    const caller = partnerRouter.createCaller(
      makeCtx({ lesson: { findUnique, findMany: vi.fn(), findFirst: vi.fn() } }),
    );

    const res = await caller.getLesson({ lessonId: 'lesson-1' });

    expect(res.locked).toBe(false);
    expect(res.videoId).toBe('vid-123');
    expect(res.courseTitle).toBe('MPSTATS Инструменты');
    expect(res.duration).toBe(15);
  });

  it('не-партнёрский урок (course.partnerKey=null) → throws NOT_FOUND', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      ...partnerLesson,
      course: { partnerKey: null, title: 'Другой курс', isHidden: false },
    });
    const caller = partnerRouter.createCaller(
      makeCtx({ lesson: { findUnique, findMany: vi.fn(), findFirst: vi.fn() } }),
    );

    await expect(caller.getLesson({ lessonId: 'lesson-1' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('скрытый урок (isHidden=true) → throws NOT_FOUND', async () => {
    const findUnique = vi.fn().mockResolvedValue({ ...partnerLesson, isHidden: true });
    const caller = partnerRouter.createCaller(
      makeCtx({ lesson: { findUnique, findMany: vi.fn(), findFirst: vi.fn() } }),
    );

    await expect(caller.getLesson({ lessonId: 'lesson-1' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('урок не найден (findUnique → null) → throws NOT_FOUND', async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const caller = partnerRouter.createCaller(
      makeCtx({ lesson: { findUnique, findMany: vi.fn(), findFirst: vi.fn() } }),
    );

    await expect(caller.getLesson({ lessonId: 'ghost' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('videoUrl отсутствует → возвращает пустую строку', async () => {
    const findUnique = vi.fn().mockResolvedValue({ ...partnerLesson, videoUrl: null });
    const caller = partnerRouter.createCaller(
      makeCtx({ lesson: { findUnique, findMany: vi.fn(), findFirst: vi.fn() } }),
    );

    const res = await caller.getLesson({ lessonId: 'lesson-1' });
    expect(res.videoUrl).toBe('');
  });
});

// ---------------------------------------------------------------------------
// getCatalog
// ---------------------------------------------------------------------------

describe('getCatalog', () => {
  it('группирует уроки по metadata.toolGroup, сохраняя порядок первого появления', async () => {
    const lessons = [
      { id: 'l1', title: 'Кампании 1', order: 1, duration: 10, description: null, metadata: { toolGroup: 'Кампании' } },
      { id: 'l2', title: 'Кампании 2', order: 2, duration: 12, description: null, metadata: { toolGroup: 'Кампании' } },
      { id: 'l3', title: 'Аналитика 1', order: 3, duration: 8, description: null, metadata: { toolGroup: 'Аналитика' } },
    ];
    const findMany = vi.fn().mockResolvedValue(lessons);
    const caller = partnerRouter.createCaller(
      makeCtx({ lesson: { findMany, findFirst: vi.fn(), findUnique: vi.fn() } }),
    );

    const res = await caller.getCatalog();

    expect(res.totalLessons).toBe(3);
    expect(res.groups).toHaveLength(2);

    const [group1, group2] = res.groups;
    // первая группа появляется первой
    expect(group1.title).toBe('Кампании');
    expect(group1.lessons).toHaveLength(2);
    expect(group1.single).toBe(false);

    // вторая группа с одним уроком → single: true
    expect(group2.title).toBe('Аналитика');
    expect(group2.lessons).toHaveLength(1);
    expect(group2.single).toBe(true);
  });

  it('урок без metadata.toolGroup → использует title как группу', async () => {
    const lessons = [
      { id: 'l1', title: 'Одиночный урок', order: 1, duration: 5, description: null, metadata: null },
    ];
    const findMany = vi.fn().mockResolvedValue(lessons);
    const caller = partnerRouter.createCaller(
      makeCtx({ lesson: { findMany, findFirst: vi.fn(), findUnique: vi.fn() } }),
    );

    const res = await caller.getCatalog();

    expect(res.groups[0].title).toBe('Одиночный урок');
    expect(res.groups[0].single).toBe(true);
  });

  it('пустой курс → groups: [], totalLessons: 0', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const caller = partnerRouter.createCaller(
      makeCtx({ lesson: { findMany, findFirst: vi.fn(), findUnique: vi.fn() } }),
    );

    const res = await caller.getCatalog();

    expect(res.groups).toEqual([]);
    expect(res.totalLessons).toBe(0);
  });

  it('запрос к findMany содержит правильный where-фильтр', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const caller = partnerRouter.createCaller(
      makeCtx({ lesson: { findMany, findFirst: vi.fn(), findUnique: vi.fn() } }),
    );

    await caller.getCatalog();

    const where = findMany.mock.calls[0][0].where;
    expect(where.isHidden).toBe(false);
    expect(where.course).toMatchObject({ partnerKey: 'mpstats', isHidden: false });
  });
});
