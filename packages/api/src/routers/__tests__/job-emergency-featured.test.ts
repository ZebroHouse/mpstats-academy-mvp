import { describe, it, expect, afterEach, vi } from 'vitest';
import { jobRouter } from '../job';

function caller(prisma: any) {
  // protectedProcedure middleware fires a fire-and-forget lastActiveAt update
  // touching ctx.prisma.userProfile — must be mocked even though this test
  // doesn't assert on it (see job.test.ts makeCtx for the established pattern).
  prisma.userProfile = {
    findUnique: vi.fn().mockResolvedValue({ lastActiveAt: new Date() }),
    update: vi.fn().mockResolvedValue({}),
  };
  return jobRouter.createCaller({ prisma, user: { id: 'u1' } } as any);
}
const jobRow = {
  slug: 'wb-warehouse-crisis-2026', title: 'Склады WB под ударом',
  description: 'desc', marketplace: 'WB', lessons: [{}, {}, {}],
};

describe('job.getEmergencyFeatured', () => {
  const OLD = process.env.EMERGENCY_BANNER_ENABLED;
  afterEach(() => { process.env.EMERGENCY_BANNER_ENABLED = OLD; });

  it('флаг off → { enabled:false, job:null } и в БД не ходит', async () => {
    process.env.EMERGENCY_BANNER_ENABLED = 'false';
    const prisma = { job: { findFirst: vi.fn() } };
    const res = await caller(prisma).getEmergencyFeatured();
    expect(res).toEqual({ enabled: false, job: null });
    expect(prisma.job.findFirst).not.toHaveBeenCalled();
  });

  it('флаг on + джоба есть (даже unpublished) → job заполнен', async () => {
    process.env.EMERGENCY_BANNER_ENABLED = 'true';
    const prisma = { job: { findFirst: vi.fn().mockResolvedValue(jobRow) } };
    const res = await caller(prisma).getEmergencyFeatured();
    expect(res.enabled).toBe(true);
    expect(res.job).toEqual({
      slug: 'wb-warehouse-crisis-2026', title: 'Склады WB под ударом',
      description: 'desc', marketplace: 'WB', lessonCount: 3,
    });
  });

  it('флаг on, но джобы нет → job:null', async () => {
    process.env.EMERGENCY_BANNER_ENABLED = 'true';
    const prisma = { job: { findFirst: vi.fn().mockResolvedValue(null) } };
    const res = await caller(prisma).getEmergencyFeatured();
    expect(res).toEqual({ enabled: true, job: null });
  });
});
