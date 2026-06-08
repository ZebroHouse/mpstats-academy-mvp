import { describe, it, expect, vi } from 'vitest';

// server-only guard throws in non-server environments — mock it out
vi.mock('server-only', () => ({}));

// question-bank.ts imports generateDiagnosticQuestions from @mpstats/ai which
// transitively pulls in server-only. Mock the whole @mpstats/ai package to
// prevent that import chain from reaching the server-only guard.
vi.mock('@mpstats/ai', () => ({
  generateDiagnosticQuestions: vi.fn().mockResolvedValue([]),
}));

import { adminRouter } from '../admin';

function makeCtx(profile: Record<string, unknown> | null) {
  const update = vi.fn().mockResolvedValue({ id: 'u1', isTest: true });
  // superadminProcedure middleware calls findUnique({ select: { role: true } }) for the
  // caller's role check. The toggleUserField handler calls findUnique({ select: { [field]: true } })
  // for the target user. We return { role: 'SUPERADMIN' } on the first call and the provided
  // profile on subsequent calls.
  const findUnique = vi.fn()
    .mockResolvedValueOnce(null)                   // protectedProcedure lastActiveAt debounce (fire-and-forget)
    .mockResolvedValueOnce({ role: 'SUPERADMIN' }) // superadminProcedure role check
    .mockResolvedValue(profile);                   // toggleUserField target user lookup
  return {
    ctx: {
      user: { id: 'admin1' },
      prisma: {
        userProfile: {
          findUnique,
          update,
        },
        userActivityDay: {
          upsert: vi.fn().mockResolvedValue({}),
        },
      },
    },
    update,
  };
}

describe('admin.toggleUserField isTest', () => {
  it('flips isTest from false to true', async () => {
    const { ctx, update } = makeCtx({ isTest: false });
    const caller = adminRouter.createCaller(ctx as never);
    await caller.toggleUserField({ userId: 'u1', field: 'isTest' });
    expect(update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { isTest: true } });
  });
});
