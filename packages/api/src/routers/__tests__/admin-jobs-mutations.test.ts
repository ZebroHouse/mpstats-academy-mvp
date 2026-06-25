import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@mpstats/ai', () => ({
  embedQuery: vi.fn().mockResolvedValue(Array(1536).fill(0.1)),
}));
import { embedQuery } from '@mpstats/ai';
import { Prisma } from '@mpstats/db';
import { adminRouter } from '../admin';

const embedQueryMock = vi.mocked(embedQuery);

/**
 * Builds a ctx whose userProfile.findUnique passes the protected debounce
 * (null) then the adminProcedure role check ({ role: 'ADMIN' }). Extra prisma
 * mocks are spread in per test. `$transaction` runs its callback against the
 * SAME prisma mock (tx-shaped), so jobLesson.delete/findMany/update assertions
 * work the same inside and outside the transaction.
 */
function makeCtx(prismaMocks: Record<string, unknown>) {
  const findUnique = vi
    .fn()
    .mockResolvedValueOnce(null) // protectedProcedure lastActiveAt debounce
    .mockResolvedValueOnce({ role: 'ADMIN' }); // adminProcedure role check
  const prisma: Record<string, unknown> = {
    userProfile: { findUnique },
    userActivityDay: { upsert: vi.fn().mockResolvedValue({}) },
    ...prismaMocks,
  };
  prisma.$transaction = vi.fn(async (cb: (tx: unknown) => unknown) => cb(prisma));
  return { user: { id: 'admin1' }, prisma };
}

describe('admin.job.addJobLesson', () => {
  beforeEach(() => vi.clearAllMocks());

  it('appends at max+1 (empty job aggregate _max.order=null → order 0)', async () => {
    const create = vi.fn().mockResolvedValue({});
    const ctx = makeCtx({
      lesson: { findUnique: vi.fn().mockResolvedValue({ id: 'l1' }) },
      jobLesson: {
        aggregate: vi.fn().mockResolvedValue({ _max: { order: null } }),
        create,
      },
    });

    const res = await adminRouter
      .createCaller(ctx as never)
      .job.addJobLesson({ jobId: 'job1', lessonId: 'l1' });

    expect(create).toHaveBeenCalledWith({ data: { jobId: 'job1', lessonId: 'l1', order: 0 } });
    expect(res).toEqual({ ok: true, order: 0 });
  });

  it('appends after existing max order', async () => {
    const create = vi.fn().mockResolvedValue({});
    const ctx = makeCtx({
      lesson: { findUnique: vi.fn().mockResolvedValue({ id: 'l9' }) },
      jobLesson: {
        aggregate: vi.fn().mockResolvedValue({ _max: { order: 4 } }),
        create,
      },
    });

    const res = await adminRouter
      .createCaller(ctx as never)
      .job.addJobLesson({ jobId: 'job1', lessonId: 'l9' });

    expect(create).toHaveBeenCalledWith({ data: { jobId: 'job1', lessonId: 'l9', order: 5 } });
    expect(res).toEqual({ ok: true, order: 5 });
  });

  it('throws NOT_FOUND when the lesson does not exist', async () => {
    const ctx = makeCtx({
      lesson: { findUnique: vi.fn().mockResolvedValue(null) },
      jobLesson: { aggregate: vi.fn(), create: vi.fn() },
    });

    await expect(
      adminRouter.createCaller(ctx as never).job.addJobLesson({ jobId: 'job1', lessonId: 'nope' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('maps Prisma P2002 unique violation to CONFLICT', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'x',
    });
    const ctx = makeCtx({
      lesson: { findUnique: vi.fn().mockResolvedValue({ id: 'l1' }) },
      jobLesson: {
        aggregate: vi.fn().mockResolvedValue({ _max: { order: 0 } }),
        create: vi.fn().mockRejectedValue(p2002),
      },
    });

    await expect(
      adminRouter.createCaller(ctx as never).job.addJobLesson({ jobId: 'job1', lessonId: 'l1' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('admin.job.removeJobLesson', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes the row and renumbers the remaining lessons contiguously', async () => {
    const del = vi.fn().mockResolvedValue({});
    // After deleting l2 (order 1), remaining rows still carry old orders 0,2,3.
    const findMany = vi.fn().mockResolvedValue([
      { lessonId: 'l1', order: 0 },
      { lessonId: 'l3', order: 2 },
      { lessonId: 'l4', order: 3 },
    ]);
    const update = vi.fn().mockResolvedValue({});
    const ctx = makeCtx({ jobLesson: { delete: del, findMany, update } });

    const res = await adminRouter
      .createCaller(ctx as never)
      .job.removeJobLesson({ jobId: 'job1', lessonId: 'l2' });

    expect(del).toHaveBeenCalledWith({
      where: { jobId_lessonId: { jobId: 'job1', lessonId: 'l2' } },
    });
    // l1 already at 0 (unchanged); l3 2→1; l4 3→2.
    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledWith({
      where: { jobId_lessonId: { jobId: 'job1', lessonId: 'l3' } },
      data: { order: 1 },
    });
    expect(update).toHaveBeenCalledWith({
      where: { jobId_lessonId: { jobId: 'job1', lessonId: 'l4' } },
      data: { order: 2 },
    });
    expect(res).toEqual({ ok: true });
  });
});

describe('admin.job.reorderJobLesson', () => {
  beforeEach(() => vi.clearAllMocks());

  it('moves a lesson down to a later position', async () => {
    // Initial order: l1=0, l2=1, l3=2, l4=3. Move l1 → target 2.
    const findMany = vi.fn().mockResolvedValue([
      { lessonId: 'l1' },
      { lessonId: 'l2' },
      { lessonId: 'l3' },
      { lessonId: 'l4' },
    ]);
    const update = vi.fn().mockResolvedValue({});
    const ctx = makeCtx({ jobLesson: { findMany, update } });

    const res = await adminRouter
      .createCaller(ctx as never)
      .job.reorderJobLesson({ jobId: 'job1', lessonId: 'l1', targetOrder: 2 });

    // Final array: l2, l3, l1, l4. Only moved rows are written; l4 stays at 3.
    const finalOrder = new Map<string, number>();
    for (const call of update.mock.calls) {
      finalOrder.set(call[0].where.jobId_lessonId.lessonId, call[0].data.order);
    }
    expect(finalOrder.get('l2')).toBe(0);
    expect(finalOrder.get('l3')).toBe(1);
    expect(finalOrder.get('l1')).toBe(2);
    expect(finalOrder.has('l4')).toBe(false); // unchanged, not rewritten
    expect(res).toEqual({ ok: true });
  });

  it('moves a lesson up to an earlier position', async () => {
    // Initial: l1=0, l2=1, l3=2, l4=3. Move l4 → target 1.
    const findMany = vi.fn().mockResolvedValue([
      { lessonId: 'l1' },
      { lessonId: 'l2' },
      { lessonId: 'l3' },
      { lessonId: 'l4' },
    ]);
    const update = vi.fn().mockResolvedValue({});
    const ctx = makeCtx({ jobLesson: { findMany, update } });

    await adminRouter
      .createCaller(ctx as never)
      .job.reorderJobLesson({ jobId: 'job1', lessonId: 'l4', targetOrder: 1 });

    // Final array: l1, l4, l2, l3. l1 unchanged at 0; only moved rows written.
    const finalOrder = new Map<string, number>();
    for (const call of update.mock.calls) {
      finalOrder.set(call[0].where.jobId_lessonId.lessonId, call[0].data.order);
    }
    expect(finalOrder.has('l1')).toBe(false); // unchanged, not rewritten
    expect(finalOrder.get('l4')).toBe(1);
    expect(finalOrder.get('l2')).toBe(2);
    expect(finalOrder.get('l3')).toBe(3);
  });

  it('throws NOT_FOUND when the lesson is not in the job', async () => {
    const findMany = vi.fn().mockResolvedValue([{ lessonId: 'l1' }]);
    const ctx = makeCtx({ jobLesson: { findMany, update: vi.fn() } });

    await expect(
      adminRouter
        .createCaller(ctx as never)
        .job.reorderJobLesson({ jobId: 'job1', lessonId: 'nope', targetOrder: 0 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('no-ops when target equals current index', async () => {
    const findMany = vi.fn().mockResolvedValue([{ lessonId: 'l1' }, { lessonId: 'l2' }]);
    const update = vi.fn().mockResolvedValue({});
    const ctx = makeCtx({ jobLesson: { findMany, update } });

    const res = await adminRouter
      .createCaller(ctx as never)
      .job.reorderJobLesson({ jobId: 'job1', lessonId: 'l1', targetOrder: 0 });

    expect(update).not.toHaveBeenCalled();
    expect(res).toEqual({ ok: true });
  });
});

describe('admin.job.setJobPublished', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates the publish flag', async () => {
    const update = vi.fn().mockResolvedValue({});
    const ctx = makeCtx({ job: { update } });

    const res = await adminRouter
      .createCaller(ctx as never)
      .job.setJobPublished({ jobId: 'job1', isPublished: true });

    expect(update).toHaveBeenCalledWith({ where: { id: 'job1' }, data: { isPublished: true } });
    expect(res).toEqual({ ok: true, isPublished: true });
  });
});

describe('admin.job.createJob', () => {
  beforeEach(() => vi.clearAllMocks());

  const input = {
    slug: 'novaya-zadacha',
    title: 'Новая задача',
    description: 'Описание задачи',
    marketplace: 'WB' as const,
    axes: ['ANALYTICS' as const],
    outcomes: ['итог 1'],
    skillBlocks: ['block-1'],
    displayOrder: 3,
    isPublished: false,
  };

  it('throws CONFLICT when the slug is taken', async () => {
    const ctx = makeCtx({
      job: { findUnique: vi.fn().mockResolvedValue({ id: 'existing' }), create: vi.fn() },
    });

    await expect(
      adminRouter.createCaller(ctx as never).job.createJob(input),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('creates the job parameterized, embeds it, and writes the vector', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'newjob1' });
    const executeRawUnsafe = vi.fn().mockResolvedValue(undefined);
    const ctx = makeCtx({
      job: { findUnique: vi.fn().mockResolvedValue(null), create },
      $executeRawUnsafe: executeRawUnsafe,
    });

    const res = await adminRouter.createCaller(ctx as never).job.createJob(input);

    expect(create).toHaveBeenCalledWith({
      data: {
        slug: 'novaya-zadacha',
        title: 'Новая задача',
        description: 'Описание задачи',
        marketplace: 'WB',
        axes: ['ANALYTICS'],
        skillBlocks: ['block-1'],
        outcomes: ['итог 1'],
        displayOrder: 3,
        isPublished: false,
      },
    });
    expect(embedQueryMock).toHaveBeenCalledWith('Новая задача\nОписание задачи');
    expect(executeRawUnsafe).toHaveBeenCalledTimes(1);
    expect(executeRawUnsafe.mock.calls[0][0]).toContain('::vector');
    expect(executeRawUnsafe.mock.calls[0][0]).toContain("'newjob1'");
    expect(res).toEqual({ id: 'newjob1', embedded: true });
  });

  it('still creates the job (embedded:false) when embedding fails', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'newjob2' });
    embedQueryMock.mockRejectedValueOnce(new Error('openrouter down'));
    const ctx = makeCtx({
      job: { findUnique: vi.fn().mockResolvedValue(null), create },
      $executeRawUnsafe: vi.fn(),
    });

    const res = await adminRouter.createCaller(ctx as never).job.createJob(input);

    expect(create).toHaveBeenCalled();
    expect(res).toEqual({ id: 'newjob2', embedded: false });
  });
});

describe('admin.job.reembedJob', () => {
  beforeEach(() => vi.clearAllMocks());

  it('builds embed text from title + description + lesson titles and writes vector', async () => {
    const executeRawUnsafe = vi.fn().mockResolvedValue(undefined);
    const ctx = makeCtx({
      job: { findUnique: vi.fn().mockResolvedValue({ title: 'Задача', description: 'Описание' }) },
      jobLesson: {
        findMany: vi.fn().mockResolvedValue([
          { lesson: { title: 'Урок 1' } },
          { lesson: { title: 'Урок 2' } },
        ]),
      },
      $executeRawUnsafe: executeRawUnsafe,
    });

    const res = await adminRouter.createCaller(ctx as never).job.reembedJob({ jobId: 'job1' });

    expect(embedQueryMock).toHaveBeenCalledWith('Задача\nОписание\nУрок 1\nУрок 2');
    expect(executeRawUnsafe).toHaveBeenCalledTimes(1);
    expect(executeRawUnsafe.mock.calls[0][0]).toContain('::vector');
    expect(res).toEqual({ ok: true });
  });

  it('throws NOT_FOUND when the job is missing', async () => {
    const ctx = makeCtx({
      job: { findUnique: vi.fn().mockResolvedValue(null) },
      jobLesson: { findMany: vi.fn() },
      $executeRawUnsafe: vi.fn(),
    });

    await expect(
      adminRouter.createCaller(ctx as never).job.reembedJob({ jobId: 'nope' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('surfaces embedding failures as INTERNAL_SERVER_ERROR', async () => {
    embedQueryMock.mockRejectedValueOnce(new Error('openrouter down'));
    const ctx = makeCtx({
      job: { findUnique: vi.fn().mockResolvedValue({ title: 'Задача', description: 'Описание' }) },
      jobLesson: { findMany: vi.fn().mockResolvedValue([]) },
      $executeRawUnsafe: vi.fn(),
    });

    await expect(
      adminRouter.createCaller(ctx as never).job.reembedJob({ jobId: 'job1' }),
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
  });
});
