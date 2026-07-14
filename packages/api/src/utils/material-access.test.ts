import { describe, it, expect, vi, beforeEach } from 'vitest';

// Мокаем access-хелперы и feature-flags (зеркалим паттерн material.test.ts).
// isLessonAccessible мокается per-lesson: вердикт задаём по courseId, чтобы
// детерминированно рулить доступностью материала в тестах.
vi.mock('./access', () => ({
  getUserActiveSubscriptions: vi.fn().mockResolvedValue([]),
  getUserAdminBypass: vi.fn().mockResolvedValue(false),
  getFirstJobLessonIds: vi.fn().mockResolvedValue(new Set()),
  isLessonAccessible: vi.fn(),
}));

vi.mock('./feature-flags', () => ({
  isFeatureEnabled: vi.fn().mockResolvedValue(true),
}));

import { applyMaterialAccess, resolveAccessibleMaterialIds } from './material-access';
import {
  getUserActiveSubscriptions,
  getUserAdminBypass,
  getFirstJobLessonIds,
  isLessonAccessible,
} from './access';
import { isFeatureEnabled } from './feature-flags';
import type { AssistantMaterialRef } from '@mpstats/ai';

const mk = (id: string, ext: string | null): AssistantMaterialRef => ({
  materialId: id, type: 'CHECKLIST', title: id, ctaText: 'x', isAccessible: true, externalUrl: ext, hasFile: false,
});

// Урок с courseId 'c-ok' → доступен, любой другой → залочен.
const lesson = (id: string, courseId: string) => ({ lesson: { id, order: 1, courseId } });

function makePrisma(materials: any[]) {
  return {
    material: { findMany: vi.fn().mockResolvedValue(materials) },
  } as any;
}

describe('applyMaterialAccess', () => {
  it('залоченный → isAccessible=false, externalUrl=null', () => {
    const out = applyMaterialAccess([mk('m1', 'https://x'), mk('m2', 'https://y')], new Set(['m1']));
    expect(out.find((m) => m.materialId === 'm1')).toMatchObject({ isAccessible: true, externalUrl: 'https://x' });
    expect(out.find((m) => m.materialId === 'm2')).toMatchObject({ isAccessible: false, externalUrl: null });
  });
});

describe('resolveAccessibleMaterialIds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (isLessonAccessible as any).mockImplementation((l: { courseId: string }) => l.courseId === 'c-ok');
  });

  it('пустой materialIds → пустой Set БЕЗ запроса в БД (early return)', async () => {
    const prisma = makePrisma([]);
    const out = await resolveAccessibleMaterialIds(prisma, 'user-1', []);
    expect(out.size).toBe(0);
    expect(prisma.material.findMany).not.toHaveBeenCalled();
  });

  it('материал с доступным уроком → в Set, с недоступным → нет', async () => {
    const prisma = makePrisma([
      { id: 'A', lessons: [lesson('l-a', 'c-ok')] },
      { id: 'B', lessons: [lesson('l-b', 'c-no')] },
    ]);
    const out = await resolveAccessibleMaterialIds(prisma, 'user-1', ['A', 'B']);
    expect(out.has('A')).toBe(true);
    expect(out.has('B')).toBe(false);
  });

  it('материал без видимых уроков → залочен (не в Set)', async () => {
    const prisma = makePrisma([{ id: 'C', lessons: [] }]);
    const out = await resolveAccessibleMaterialIds(prisma, 'user-1', ['C']);
    expect(out.has('C')).toBe(false);
  });

  it('материал доступен, если ХОТЯ БЫ ОДИН из его уроков доступен', async () => {
    const prisma = makePrisma([
      { id: 'D', lessons: [lesson('l-locked', 'c-no'), lesson('l-free', 'c-ok')] },
    ]);
    const out = await resolveAccessibleMaterialIds(prisma, 'user-1', ['D']);
    expect(out.has('D')).toBe(true);
  });

  it('N+1 guard: батч-хелперы вызваны ровно один раз независимо от числа материалов', async () => {
    const prisma = makePrisma([
      { id: 'A', lessons: [lesson('l-a', 'c-ok')] },
      { id: 'B', lessons: [lesson('l-b', 'c-no')] },
      { id: 'C', lessons: [lesson('l-c', 'c-ok'), lesson('l-c2', 'c-no')] },
    ]);
    await resolveAccessibleMaterialIds(prisma, 'user-1', ['A', 'B', 'C']);
    expect(getUserActiveSubscriptions).toHaveBeenCalledTimes(1);
    expect(getUserAdminBypass).toHaveBeenCalledTimes(1);
    expect(getFirstJobLessonIds).toHaveBeenCalledTimes(1);
    expect(isFeatureEnabled).toHaveBeenCalledTimes(1);
    expect(prisma.material.findMany).toHaveBeenCalledTimes(1);
  });
});
