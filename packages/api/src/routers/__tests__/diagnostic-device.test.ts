import { describe, it, expect, vi } from 'vitest';
import { diagnosticRouter } from '../diagnostic';

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

function makeCtx(userId: string, userAgent: string | null) {
  const create = vi.fn().mockResolvedValue({ id: 'session-1', userId, currentQuestion: 0 });
  const prisma = {
    userProfile: {
      upsert: vi.fn().mockResolvedValue({ id: userId }),
      findUnique: vi.fn().mockResolvedValue({ marketplaces: ['WB'], lastActiveAt: new Date() }),
      update: vi.fn().mockResolvedValue({}),
    },
    userActivityDay: { upsert: vi.fn().mockResolvedValue({}) },
    userDeviceDay: { upsert: vi.fn().mockResolvedValue({}) },
    diagnosticSession: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      create,
      update: vi.fn().mockResolvedValue({ id: 'session-1' }),
    },
  };
  return {
    caller: diagnosticRouter.createCaller({ prisma, user: { id: userId }, ip: null, userAgent } as any),
    create,
  };
}

describe('diagnostic.startSession: устройство', () => {
  it('мобильный UA → device MOBILE в создаваемой сессии', async () => {
    const { caller, create } = makeCtx('u-mobile', IPHONE_UA);
    const result = await caller.startSession();
    expect(result.status).toBe('IN_PROGRESS');
    expect(create.mock.calls[0][0].data).toMatchObject({ userId: 'u-mobile', device: 'MOBILE' });
  });

  it('без UA → device UNKNOWN', async () => {
    const { caller, create } = makeCtx('u-nodevice', null);
    await caller.startSession();
    expect(create.mock.calls[0][0].data).toMatchObject({ device: 'UNKNOWN' });
  });
});
