import { describe, it, expect, afterEach, vi } from 'vitest';
import { jobRouter } from '../job';

// protectedProcedure дёргает userProfile (lastActiveAt) — мокаем, как в job.test.ts
function makeCtx() {
  const prisma = {
    userProfile: { findUnique: vi.fn().mockResolvedValue({ id: 'u1' }), update: vi.fn().mockResolvedValue({}) },
    emergencyBlockEventDay: { upsert: vi.fn().mockResolvedValue({}) },
  };
  return { caller: jobRouter.createCaller({ prisma, user: { id: 'u1' } } as any), prisma };
}

describe('job.recordEmergencyEvent', () => {
  const OLD = process.env.EMERGENCY_TRACK_ENABLED;
  afterEach(() => { process.env.EMERGENCY_TRACK_ENABLED = OLD; });

  it('флаг off → no-op, upsert не вызван', async () => {
    process.env.EMERGENCY_TRACK_ENABLED = 'false';
    const { caller, prisma } = makeCtx();
    const r = await caller.recordEmergencyEvent({ surface: 'BANNER', kind: 'IMPRESSION' });
    expect(r).toEqual({ recorded: false });
    expect(prisma.emergencyBlockEventDay.upsert).not.toHaveBeenCalled();
  });

  it('флаг on → upsert инкрементит нужный ключ', async () => {
    process.env.EMERGENCY_TRACK_ENABLED = 'true';
    const { caller, prisma } = makeCtx();
    const r = await caller.recordEmergencyEvent({ surface: 'PIN', kind: 'CLICK' });
    expect(r).toEqual({ recorded: true });
    expect(prisma.emergencyBlockEventDay.upsert).toHaveBeenCalledTimes(1);
    const arg = prisma.emergencyBlockEventDay.upsert.mock.calls[0][0];
    expect(arg.where.surface_kind_day).toMatchObject({ surface: 'PIN', kind: 'CLICK' });
    expect(arg.create).toMatchObject({ surface: 'PIN', kind: 'CLICK', count: 1 });
    expect(arg.update).toEqual({ count: { increment: 1 } });
  });

  it('невалидный surface → zod reject', async () => {
    process.env.EMERGENCY_TRACK_ENABLED = 'true';
    const { caller } = makeCtx();
    await expect(caller.recordEmergencyEvent({ surface: 'X' as any, kind: 'CLICK' })).rejects.toThrow();
  });
});
