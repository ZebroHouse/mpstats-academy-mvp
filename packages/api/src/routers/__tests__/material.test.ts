import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';

// Мокаем Supabase client — не делаем реальные сетевые вызовы в unit-тестах.
// createSignedUrl/createSignedUploadUrl/remove заменяются on stubs.
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: vi.fn().mockResolvedValue({
          data: { signedUrl: 'https://signed.example/abc' },
          error: null,
        }),
        createSignedUploadUrl: vi.fn().mockResolvedValue({
          data: { signedUrl: 'https://upload.example/xyz', token: 'tok' },
          error: null,
        }),
        remove: vi.fn().mockResolvedValue({ error: null }),
      })),
    },
  })),
}));

vi.mock('../../utils/access', () => ({
  checkLessonAccess: vi.fn(),
}));

// Нужны env vars иначе getSupabaseAdmin throws
process.env.NEXT_PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY || 'test-service-role-key';

import { materialRouter } from '../material';
import { checkLessonAccess } from '../../utils/access';

function makeCtx(overrides: any = {}) {
  return {
    user: { id: 'user-1' },
    prisma: {
      material: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
      },
      lessonMaterial: {
        upsert: vi.fn(),
        delete: vi.fn(),
      },
      // adminProcedure middleware смотрит userProfile.findUnique → role
      userProfile: {
        findUnique: vi.fn().mockResolvedValue({ role: 'ADMIN' }),
        update: vi.fn(),
      },
      ...overrides.prisma,
    },
    ...overrides,
  } as any;
}

// Note: lessons теперь приходят УЖЕ отфильтрованными (DB-level isHidden=false),
// поэтому в моках возвращаем массив без hidden — мокаем как Prisma вернёт после
// where-фильтра.
const VISIBLE_LESSON = { id: 'l-1', order: 5, courseId: 'c-1' };

describe('material.getSignedUrl ACL', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws FORBIDDEN when no attached lesson is accessible', async () => {
    const ctx = makeCtx();
    ctx.prisma.material.findUnique.mockResolvedValue({
      id: 'm-1',
      isHidden: false,
      storagePath: 'pdf/m-1/file.pdf',
      lessons: [{ lesson: VISIBLE_LESSON }],
    });
    (checkLessonAccess as any).mockResolvedValue({
      hasAccess: false,
      hasPlatformSubscription: false,
    });

    const caller = materialRouter.createCaller(ctx);
    await expect(
      caller.getSignedUrl({ materialId: 'm-1' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('returns signed URL when at least one attached lesson is accessible', async () => {
    const ctx = makeCtx();
    ctx.prisma.material.findUnique.mockResolvedValue({
      id: 'm-1',
      isHidden: false,
      storagePath: 'pdf/m-1/file.pdf',
      lessons: [{ lesson: VISIBLE_LESSON }],
    });
    (checkLessonAccess as any).mockResolvedValue({
      hasAccess: true,
      hasPlatformSubscription: true,
    });

    const caller = materialRouter.createCaller(ctx);
    const result = await caller.getSignedUrl({ materialId: 'm-1' });
    expect(result.signedUrl).toBe('https://signed.example/abc');
    expect(result.expiresIn).toBe(3600);
  });

  it('throws BAD_REQUEST for material without storagePath', async () => {
    const ctx = makeCtx();
    ctx.prisma.material.findUnique.mockResolvedValue({
      id: 'm-1',
      isHidden: false,
      storagePath: null,
      externalUrl: 'https://drive.google.com/foo',
      lessons: [{ lesson: VISIBLE_LESSON }],
    });
    const caller = materialRouter.createCaller(ctx);
    await expect(
      caller.getSignedUrl({ materialId: 'm-1' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('throws NOT_FOUND for hidden material', async () => {
    const ctx = makeCtx();
    ctx.prisma.material.findUnique.mockResolvedValue({
      id: 'm-1',
      isHidden: true,
      lessons: [],
    });
    const caller = materialRouter.createCaller(ctx);
    await expect(
      caller.getSignedUrl({ materialId: 'm-1' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('material.create XOR validation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects when both externalUrl and storagePath are set', async () => {
    const ctx = makeCtx();
    const caller = materialRouter.createCaller(ctx);
    await expect(
      caller.create({
        type: 'PRESENTATION',
        title: 'X',
        ctaText: 'Скачать',
        externalUrl: 'https://drive.example/a',
        storagePath: 'pdf/x/y.pdf',
      } as any),
    ).rejects.toThrow();
  });

  it('rejects when neither externalUrl nor storagePath are set', async () => {
    const ctx = makeCtx();
    const caller = materialRouter.createCaller(ctx);
    await expect(
      caller.create({
        type: 'PRESENTATION',
        title: 'X',
        ctaText: 'Скачать',
      } as any),
    ).rejects.toThrow();
  });

  it('accepts externalUrl-only material', async () => {
    const ctx = makeCtx();
    ctx.prisma.material.create.mockResolvedValue({ id: 'm-new' });
    const caller = materialRouter.createCaller(ctx);
    const r = await caller.create({
      type: 'EXTERNAL_SERVICE',
      title: 'Plugin MPSTATS',
      ctaText: 'Установить',
      externalUrl: 'https://mpstats.io/plugin',
    } as any);
    expect((r as any).id).toBe('m-new');
  });
});
/**
 * Wave 0 RED stub — Phase 61 (Обучение 2.0).
 *
 * `material.listForUser` (protectedProcedure) does NOT exist yet; it lands in
 * 61-04. It mirrors the admin `list` read shape but:
 *   - is `protectedProcedure` (any signed-in user), NOT `adminProcedure`;
 *   - FORCES `where.isHidden = false` with NO `includeHidden` escape (T-info-hidden);
 *   - honors optional `type` filter and `title contains` search (insensitive);
 *   - includes standalone (`isStandalone:true`) rows alongside lesson-attached ones;
 *   - DOES NOT touch / weaken the `getSignedUrl` download ACL (frozen, D-05).
 *
 * Behavioral bodies are `it.skip(... 'pending 61-04')`; flipping them to `it`
 * (and calling `caller.listForUser(...)`) is the GREEN step in 61-04.
 */
describe('material.listForUser', () => {
  beforeEach(() => vi.clearAllMocks());

  // Note: makeCtx() defaults userProfile.role='ADMIN', но listForUser —
  // protectedProcedure: достаточно ctx.user. Любой залогиненный юзер проходит.

  it('forces where.isHidden = false with no includeHidden escape', async () => {
    const ctx = makeCtx();
    const caller = materialRouter.createCaller(ctx);
    await caller.listForUser({});
    const arg = ctx.prisma.material.findMany.mock.calls[0][0];
    expect(arg.where.isHidden).toBe(false);
    // even if a caller smuggles includeHidden, it must be ignored:
    await caller.listForUser({ includeHidden: true } as any);
    expect(
      ctx.prisma.material.findMany.mock.calls[1][0].where.isHidden,
    ).toBe(false);
  });

  it('honors optional type filter and title contains search (insensitive)', async () => {
    const ctx = makeCtx();
    const caller = materialRouter.createCaller(ctx);
    await caller.listForUser({ type: 'CHECKLIST', search: 'Ozon' });
    const arg = ctx.prisma.material.findMany.mock.calls[0][0];
    expect(arg.where.type).toBe('CHECKLIST');
    expect(arg.where.title).toEqual({ contains: 'Ozon', mode: 'insensitive' });
  });

  it('includes standalone (isStandalone:true) materials, not only lesson-attached', async () => {
    const ctx = makeCtx();
    const caller = materialRouter.createCaller(ctx);
    await caller.listForUser({});
    const arg = ctx.prisma.material.findMany.mock.calls[0][0];
    // no `lessons: { some: {} }` constraint that would hide standalone rows
    expect(arg.where.lessons).toBeUndefined();
  });

  it('never returns storagePath to the client — exposes hasFile boolean only', async () => {
    const ctx = makeCtx();
    ctx.prisma.material.findMany.mockResolvedValue([
      {
        id: 'm-1',
        type: 'CHECKLIST',
        title: 'Чек-лист',
        description: null,
        ctaText: 'Скачать',
        externalUrl: null,
        storagePath: 'checklist/m-1/file.pdf',
        isStandalone: true,
        isHidden: false,
      },
    ]);
    const caller = materialRouter.createCaller(ctx);
    const res = await caller.listForUser({});
    const item = res.items[0] as any;
    // storagePath НИКОГДА не уходит клиенту — payload экспонирует hasFile boolean.
    expect(item.storagePath).toBeUndefined();
    expect(item.hasFile).toBe(true);
  });

  it('does NOT reference or weaken getSignedUrl ACL (download ACL frozen, D-05)', async () => {
    // getSignedUrl остаётся FORBIDDEN для standalone (no attached lesson) —
    // listForUser его не трогает. Регресс-проверка ACL.
    const ctx = makeCtx();
    ctx.prisma.material.findUnique.mockResolvedValue({
      id: 'm-1',
      isHidden: false,
      storagePath: 'pdf/m-1/file.pdf',
      lessons: [], // standalone — нет видимых уроков
    });
    const caller = materialRouter.createCaller(ctx);
    await expect(
      caller.getSignedUrl({ materialId: 'm-1' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

// Reference unused import to avoid TS noUnusedLocals if strict
void TRPCError;
