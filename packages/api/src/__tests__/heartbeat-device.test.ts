import { describe, it, expect, vi } from 'vitest';
import { router, protectedProcedure } from '../trpc';

/**
 * Хартбит — fire-and-forget внутри middleware, поэтому проверяем его через
 * реальную процедуру и микрозадачную паузу, а не напрямую.
 */
function makeHarness(userAgent: string | null, opts: { failDeviceUpsert?: boolean } = {}) {
  const userDeviceDay = {
    upsert: vi.fn().mockImplementation(() =>
      opts.failDeviceUpsert ? Promise.reject(new Error('boom')) : Promise.resolve({})
    ),
  };
  const prisma = {
    userProfile: {
      findUnique: vi.fn().mockResolvedValue({ lastActiveAt: null }),
      update: vi.fn().mockResolvedValue({}),
    },
    userActivityDay: { upsert: vi.fn().mockResolvedValue({}) },
    userDeviceDay,
  };
  const testRouter = router({
    ping: protectedProcedure.query(() => 'pong'),
  });
  const caller = testRouter.createCaller({
    prisma, user: { id: 'u1' }, ip: null, userAgent,
  } as any);
  return { caller, prisma };
}

const flush = () => new Promise((r) => setTimeout(r, 10));

describe('heartbeat: запись устройства', () => {
  it('десктопный UA → upsert с device DESKTOP', async () => {
    const { caller, prisma } = makeHarness(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
    );
    expect(await caller.ping()).toBe('pong');
    await flush();
    expect(prisma.userDeviceDay.upsert).toHaveBeenCalledTimes(1);
    const arg = prisma.userDeviceDay.upsert.mock.calls[0][0];
    expect(arg.create).toMatchObject({ userId: 'u1', device: 'DESKTOP' });
    expect(arg.update).toEqual({});
  });

  it('мобильный UA → device MOBILE', async () => {
    const { caller, prisma } = makeHarness(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    );
    await caller.ping();
    await flush();
    expect(prisma.userDeviceDay.upsert.mock.calls[0][0].create).toMatchObject({ device: 'MOBILE' });
  });

  it('без UA → device UNKNOWN', async () => {
    const { caller, prisma } = makeHarness(null);
    await caller.ping();
    await flush();
    expect(prisma.userDeviceDay.upsert.mock.calls[0][0].create).toMatchObject({ device: 'UNKNOWN' });
  });

  it('упавшая запись устройства не роняет запрос и не мешает lastActiveAt', async () => {
    const { caller, prisma } = makeHarness('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', { failDeviceUpsert: true });
    expect(await caller.ping()).toBe('pong');
    await flush();
    expect(prisma.userProfile.update).toHaveBeenCalled();
  });
});
