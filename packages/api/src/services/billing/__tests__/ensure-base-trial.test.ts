import { describe, it, expect, vi, beforeEach } from 'vitest';

// trial-subscription.ts imports `prisma` from @mpstats/db at module load.
// We never exercise the default client in these tests (we inject a mock tx),
// but the import must resolve.
vi.mock('@mpstats/db', () => ({ prisma: {} }));

import { ensureBaseTrial, BASE_TRIAL_DAYS } from '../trial-subscription';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Mock prisma client shaped for findFirst + (PLATFORM plan) create path. */
function makePrisma(opts: {
  existingSub?: unknown;
  platformPlan?: { id: string } | null;
}) {
  const findFirstSub = vi.fn().mockResolvedValue(opts.existingSub ?? null);
  const findFirstPlan = vi
    .fn()
    .mockResolvedValue(opts.platformPlan === undefined ? { id: 'plan1' } : opts.platformPlan);
  const createSub = vi.fn().mockResolvedValue({ id: 'sub1' });
  return {
    subscription: { findFirst: findFirstSub, create: createSub },
    subscriptionPlan: { findFirst: findFirstPlan },
  };
}

describe('ensureBaseTrial', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a PLATFORM trial for BASE_TRIAL_DAYS when user has no subscription', async () => {
    const prisma = makePrisma({ existingSub: null });

    await ensureBaseTrial('u1', prisma as never);

    expect(prisma.subscription.create).toHaveBeenCalledTimes(1);
    const arg = prisma.subscription.create.mock.calls[0][0].data;
    expect(arg.userId).toBe('u1');
    expect(arg.status).toBe('TRIAL');
    const days = Math.round(
      (arg.currentPeriodEnd.getTime() - arg.currentPeriodStart.getTime()) / DAY_MS,
    );
    expect(days).toBe(BASE_TRIAL_DAYS);
    expect(BASE_TRIAL_DAYS).toBe(3);
  });

  it('does nothing when the user already has a subscription', async () => {
    const prisma = makePrisma({ existingSub: { id: 'existing' } });

    await ensureBaseTrial('u1', prisma as never);

    expect(prisma.subscription.create).not.toHaveBeenCalled();
  });

  it('swallows errors (createTrialSubscription failure must not break sign-in)', async () => {
    // No active PLATFORM plan → createTrialSubscription throws internally.
    const prisma = makePrisma({ existingSub: null, platformPlan: null });

    await expect(ensureBaseTrial('u1', prisma as never)).resolves.toBeUndefined();
    expect(prisma.subscription.create).not.toHaveBeenCalled();
  });
});
