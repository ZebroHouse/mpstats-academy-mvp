// apps/web/src/lib/partner/__tests__/resolve-module.test.ts
import { describe, it, expect, vi } from 'vitest';
import { resolvePartnerLessonId } from '../resolve-module';

const mk = (rv: { id: string } | null) => ({ lesson: { findFirst: vi.fn().mockResolvedValue(rv) } } as any);

describe('resolvePartnerLessonId', () => {
  it('returns lessonId for a known module code', async () => {
    const prisma = mk({ id: 'lesson-123' });
    await expect(resolvePartnerLessonId(prisma, 'auto_bidder')).resolves.toBe('lesson-123');
    expect(prisma.lesson.findFirst).toHaveBeenCalledWith({
      where: { isHidden: false, course: { partnerKey: 'mpstats', isHidden: false }, metadata: { path: ['partnerModuleKey'], equals: 'auto_bidder' } },
      select: { id: true },
    });
  });
  it('returns null for unknown / contentless code', async () => {
    await expect(resolvePartnerLessonId(mk(null), 'uzum')).resolves.toBeNull();
  });
  it('returns null for empty input without querying', async () => {
    const prisma = mk(null);
    await expect(resolvePartnerLessonId(prisma, '')).resolves.toBeNull();
    expect(prisma.lesson.findFirst).not.toHaveBeenCalled();
  });
});
