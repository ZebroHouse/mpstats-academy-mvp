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
// Reference unused import to avoid TS noUnusedLocals if strict
void TRPCError;
