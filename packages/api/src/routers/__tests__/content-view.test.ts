import { describe, it, expect, afterEach, vi } from 'vitest';
import { contentViewRouter } from '../content-view';

const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';

// Совпадает с DEDUP_WINDOW_MS внутри content-view.ts. Не импортируем его,
// потому что модуль его не экспортирует (он приватный) — дублирование
// константы здесь честнее, чем расширять публичный API роутера ради теста.
const DEDUP_WINDOW_MS = 2 * 60 * 1000;

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
    // pingView writes via a single tagged-template $executeRaw call now
    // (Finding 2) — default to "1 row affected" so happy-path tests don't
    // need to restate it.
    $executeRaw: vi.fn().mockResolvedValue(1),
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

  it('дедуп-запрос ограничен вызывающим пользователем', async () => {
    // Minor finding: без userId в where startView мог бы отдать чужой
    // viewId — просто самый свежий заход в урок кем угодно.
    process.env.CONTENT_JOURNAL_ENABLED = 'true';
    const { caller, prisma } = makeCtx();
    await caller.startView({ lessonId: 'L1' });
    expect(prisma.contentView.findFirst.mock.calls[0][0].where.userId).toBe('u1');
  });

  it('окно дедупликации — ключ startedAt, около 2 минут назад', async () => {
    // Finding 1: было updatedAt (двигается каждым pingView → окно никогда не
    // закрывалось бы). Finding 5: было `toBeGreaterThanOrEqual(120_000)` на
    // разнице с before, что гонится с реальной задержкой между Date.now()
    // в тесте и Date.now() внутри хендлера — ловили ~1/5 падений на 1мс.
    // Берём clock и до, и после вызова: gte вычисляется где-то между ними,
    // значит gte лежит строго в [before - WINDOW, after - WINDOW]. Без
    // фейковых таймеров, без гонки, без допуска "плюс несколько мс".
    process.env.CONTENT_JOURNAL_ENABLED = 'true';
    const { caller, prisma } = makeCtx();
    const before = Date.now();
    await caller.startView({ lessonId: 'L1' });
    const after = Date.now();
    const where = prisma.contentView.findFirst.mock.calls[0][0].where;
    const gte = where.startedAt.gte as Date;
    expect(where.updatedAt).toBeUndefined();
    expect(gte.getTime()).toBeGreaterThanOrEqual(before - DEDUP_WINDOW_MS);
    expect(gte.getTime()).toBeLessThanOrEqual(after - DEDUP_WINDOW_MS);
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

  // pingView не читает строку перед записью больше (Finding 2) — сравнение
  // "накоплено vs пришло" теперь делает GREATEST внутри одного UPDATE.
  // Реальная параллельность (две вкладки бьющие в один viewId одновременно)
  // проверяется базой данных, а не юнит-тестом — это правильный трейдофф:
  // такой тест либо ничего не гонял бы по-настоящему (мок синхронный), либо
  // тестировал бы сам Postgres. Мы фиксируем контракт вокруг него: что запрос
  // атомарный, один, параметризованный и содержит GREATEST/OR.
  function ctxWithExecuteRaw(affectedRows: number) {
    return makeCtx({ $executeRaw: vi.fn().mockResolvedValue(affectedRows) });
  }

  it('флаг off → no-op', async () => {
    process.env.CONTENT_JOURNAL_ENABLED = 'false';
    const { caller, prisma } = ctxWithExecuteRaw(1);
    expect(await caller.pingView({ viewId: 'v1', activeSeconds: 30, percent: 10 })).toEqual({ ok: false });
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('пишет через атомарный UPDATE с GREATEST по обеим числовым колонкам и OR по completed', async () => {
    process.env.CONTENT_JOURNAL_ENABLED = 'true';
    const { caller, prisma } = ctxWithExecuteRaw(1);
    expect(await caller.pingView({ viewId: 'v1', activeSeconds: 30, percent: 40, completed: true })).toEqual({ ok: true });

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    const [strings, ...values] = prisma.$executeRaw.mock.calls[0];
    const sql = strings.join('');
    expect(sql).toContain('GREATEST("activeSeconds"');
    expect(sql).toContain('GREATEST("maxPercent"');
    expect(sql).toContain('"completed" OR');
    expect(sql).toContain('WHERE "id" =');
    expect(sql).toContain('AND "userId" =');
    // Параметры идут по месту подстановки: activeSeconds, percent, completed, viewId, userId.
    expect(values).toEqual([30, 40, true, 'v1', 'u1']);
  });

  it('completed не передан → в запрос уходит false, не undefined', async () => {
    process.env.CONTENT_JOURNAL_ENABLED = 'true';
    const { caller, prisma } = ctxWithExecuteRaw(1);
    await caller.pingView({ viewId: 'v1', activeSeconds: 30, percent: 40 });
    const [, , , completedParam] = prisma.$executeRaw.mock.calls[0];
    expect(completedParam).toBe(false);
  });

  it('0 затронутых строк (чужой или несуществующий viewId) → отказ', async () => {
    // Проверка владельца теперь живёт в самом WHERE — TOCTOU-окна между
    // "прочитали и проверили" и "записали" больше нет.
    process.env.CONTENT_JOURNAL_ENABLED = 'true';
    const { caller, prisma } = ctxWithExecuteRaw(0);
    expect(await caller.pingView({ viewId: 'v1', activeSeconds: 30, percent: 10 })).toEqual({ ok: false });
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('пустой viewId → отказ без обращения к БД', async () => {
    process.env.CONTENT_JOURNAL_ENABLED = 'true';
    const { caller, prisma } = ctxWithExecuteRaw(1);
    expect(await caller.pingView({ viewId: '', activeSeconds: 30, percent: 10 })).toEqual({ ok: false });
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('дробный/NaN percent не роняет мутацию — округляется и подменяется нулём', async () => {
    // Finding 3: раньше percent был z.number().int().min(0).max(100), и
    // реальный клиент (position / duration * 100) регулярно присылает
    // дробные или временно NaN значения → zod бросал BAD_REQUEST наружу.
    process.env.CONTENT_JOURNAL_ENABLED = 'true';
    const { caller: c1, prisma: p1 } = ctxWithExecuteRaw(1);
    await expect(c1.pingView({ viewId: 'v1', activeSeconds: 10.4, percent: 42.6 })).resolves.toEqual({ ok: true });
    expect(p1.$executeRaw.mock.calls[0].slice(1, 3)).toEqual([10, 43]);

    const { caller: c2, prisma: p2 } = ctxWithExecuteRaw(1);
    await expect(c2.pingView({ viewId: 'v1', activeSeconds: 10, percent: NaN })).resolves.toEqual({ ok: true });
    expect(p2.$executeRaw.mock.calls[0].slice(1, 3)).toEqual([10, 0]);
  });

  it('percent/activeSeconds вне диапазона зажимаются, а не отклоняются', async () => {
    process.env.CONTENT_JOURNAL_ENABLED = 'true';
    const { caller, prisma } = ctxWithExecuteRaw(1);
    await caller.pingView({ viewId: 'v1', activeSeconds: 999_999, percent: 101 });
    expect(prisma.$executeRaw.mock.calls[0].slice(1, 3)).toEqual([86_400, 100]);
  });

  it('падение БД (Finding 4) не пробрасывается наружу', async () => {
    process.env.CONTENT_JOURNAL_ENABLED = 'true';
    const { caller } = makeCtx({ $executeRaw: vi.fn().mockRejectedValue(new Error('db down')) });
    await expect(caller.pingView({ viewId: 'v1', activeSeconds: 30, percent: 10 })).resolves.toEqual({ ok: false });
  });
});
