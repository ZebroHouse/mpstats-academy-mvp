import { describe, it, expect, afterEach, vi } from 'vitest';
import { contentViewRouter } from '../content-view';

const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';

function makeCtx(overrides: Record<string, any> = {}, userAgent: string | null = DESKTOP_UA) {
  const prisma = {
    userProfile: { findUnique: vi.fn().mockResolvedValue({ lastActiveAt: new Date() }), update: vi.fn() },
    userActivityDay: { upsert: vi.fn().mockResolvedValue({}) },
    userDeviceDay: { upsert: vi.fn().mockResolvedValue({}) },
    lesson: {
      findUnique: vi.fn().mockResolvedValue({ courseId: '01_analytics', contentType: 'VIDEO' }),
    },
    contentView: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'view-1' }),
      update: vi.fn().mockResolvedValue({}),
    },
    ...overrides,
  };
  return {
    caller: contentViewRouter.createCaller({ prisma, user: { id: 'u1' }, ip: null, userAgent } as any),
    prisma,
  };
}

describe('contentView.startView', () => {
  const OLD = process.env.CONTENT_JOURNAL_ENABLED;
  afterEach(() => { process.env.CONTENT_JOURNAL_ENABLED = OLD; });

  it('флаг off → no-op, строка не создаётся', async () => {
    process.env.CONTENT_JOURNAL_ENABLED = 'false';
    const { caller, prisma } = makeCtx();
    expect(await caller.startView({ lessonId: 'L1' })).toEqual({ viewId: null });
    expect(prisma.contentView.create).not.toHaveBeenCalled();
  });

  it('флаг on → создаёт строку с курсом, типом и устройством', async () => {
    process.env.CONTENT_JOURNAL_ENABLED = 'true';
    const { caller, prisma } = makeCtx();
    expect(await caller.startView({ lessonId: 'L1' })).toEqual({ viewId: 'view-1' });
    expect(prisma.contentView.create.mock.calls[0][0].data).toMatchObject({
      userId: 'u1', lessonId: 'L1', courseId: '01_analytics',
      contentType: 'VIDEO', device: 'DESKTOP',
    });
  });

  it('свежая строка в окне дедупликации → возвращает её, новую не создаёт', async () => {
    process.env.CONTENT_JOURNAL_ENABLED = 'true';
    const { caller, prisma } = makeCtx({
      contentView: {
        findFirst: vi.fn().mockResolvedValue({ id: 'existing' }),
        findUnique: vi.fn(), create: vi.fn(), update: vi.fn(),
      },
    });
    expect(await caller.startView({ lessonId: 'L1' })).toEqual({ viewId: 'existing' });
    expect(prisma.contentView.create).not.toHaveBeenCalled();
  });

  it('окно дедупликации — ровно 2 минуты назад', async () => {
    process.env.CONTENT_JOURNAL_ENABLED = 'true';
    const { caller, prisma } = makeCtx();
    const before = Date.now();
    await caller.startView({ lessonId: 'L1' });
    const gte = prisma.contentView.findFirst.mock.calls[0][0].where.updatedAt.gte as Date;
    expect(before - gte.getTime()).toBeGreaterThanOrEqual(120_000);
    expect(before - gte.getTime()).toBeLessThan(125_000);
  });

  it('несуществующий урок → viewId null', async () => {
    process.env.CONTENT_JOURNAL_ENABLED = 'true';
    const { caller, prisma } = makeCtx({ lesson: { findUnique: vi.fn().mockResolvedValue(null) } });
    expect(await caller.startView({ lessonId: 'nope' })).toEqual({ viewId: null });
    expect(prisma.contentView.create).not.toHaveBeenCalled();
  });

  it('падение БД не пробрасывается наружу', async () => {
    process.env.CONTENT_JOURNAL_ENABLED = 'true';
    const { caller } = makeCtx({
      contentView: {
        findFirst: vi.fn().mockRejectedValue(new Error('db down')),
        findUnique: vi.fn(), create: vi.fn(), update: vi.fn(),
      },
    });
    expect(await caller.startView({ lessonId: 'L1' })).toEqual({ viewId: null });
  });
});

describe('contentView.pingView', () => {
  const OLD = process.env.CONTENT_JOURNAL_ENABLED;
  afterEach(() => { process.env.CONTENT_JOURNAL_ENABLED = OLD; });

  function ctxWithView(view: any) {
    return makeCtx({
      contentView: {
        findFirst: vi.fn(),
        findUnique: vi.fn().mockResolvedValue(view),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
    });
  }

  it('флаг off → no-op', async () => {
    process.env.CONTENT_JOURNAL_ENABLED = 'false';
    const { caller, prisma } = ctxWithView({ userId: 'u1', activeSeconds: 0, maxPercent: 0, completed: false });
    expect(await caller.pingView({ viewId: 'v1', activeSeconds: 30, percent: 10 })).toEqual({ ok: false });
    expect(prisma.contentView.update).not.toHaveBeenCalled();
  });

  it('пишет накопленные секунды и процент', async () => {
    process.env.CONTENT_JOURNAL_ENABLED = 'true';
    const { caller, prisma } = ctxWithView({ userId: 'u1', activeSeconds: 10, maxPercent: 5, completed: false });
    expect(await caller.pingView({ viewId: 'v1', activeSeconds: 30, percent: 40 })).toEqual({ ok: true });
    expect(prisma.contentView.update.mock.calls[0][0].data).toMatchObject({
      activeSeconds: 30, maxPercent: 40, completed: false,
    });
  });

  it('пинг с меньшим значением не уменьшает накопленное', async () => {
    process.env.CONTENT_JOURNAL_ENABLED = 'true';
    const { caller, prisma } = ctxWithView({ userId: 'u1', activeSeconds: 50, maxPercent: 60, completed: false });
    await caller.pingView({ viewId: 'v1', activeSeconds: 20, percent: 30 });
    expect(prisma.contentView.update.mock.calls[0][0].data).toMatchObject({
      activeSeconds: 50, maxPercent: 60,
    });
  });

  it('завершённость не откатывается', async () => {
    process.env.CONTENT_JOURNAL_ENABLED = 'true';
    const { caller, prisma } = ctxWithView({ userId: 'u1', activeSeconds: 50, maxPercent: 95, completed: true });
    await caller.pingView({ viewId: 'v1', activeSeconds: 60, percent: 95, completed: false });
    expect(prisma.contentView.update.mock.calls[0][0].data).toMatchObject({ completed: true });
  });

  it('чужой viewId → отказ без записи', async () => {
    process.env.CONTENT_JOURNAL_ENABLED = 'true';
    const { caller, prisma } = ctxWithView({ userId: 'someone-else', activeSeconds: 0, maxPercent: 0, completed: false });
    expect(await caller.pingView({ viewId: 'v1', activeSeconds: 30, percent: 10 })).toEqual({ ok: false });
    expect(prisma.contentView.update).not.toHaveBeenCalled();
  });

  it('несуществующий viewId → отказ', async () => {
    process.env.CONTENT_JOURNAL_ENABLED = 'true';
    const { caller, prisma } = ctxWithView(null);
    expect(await caller.pingView({ viewId: 'ghost', activeSeconds: 30, percent: 10 })).toEqual({ ok: false });
    expect(prisma.contentView.update).not.toHaveBeenCalled();
  });

  it('процент вне 0..100 → zod reject', async () => {
    process.env.CONTENT_JOURNAL_ENABLED = 'true';
    const { caller } = ctxWithView({ userId: 'u1', activeSeconds: 0, maxPercent: 0, completed: false });
    await expect(caller.pingView({ viewId: 'v1', activeSeconds: 10, percent: 101 })).rejects.toThrow();
  });
});
