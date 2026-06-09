import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks must be created via vi.hoisted so the (hoisted) vi.mock factories can reference them.
const { update, findUnique } = vi.hoisted(() => ({
  update: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock('@mpstats/db/client', () => ({
  prisma: { subscription: { update, findUnique } },
}));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('@/lib/carrotquest/emails', () => ({
  sendPaymentSuccessEmail: vi.fn().mockResolvedValue(undefined),
  sendPaymentFailedEmail: vi.fn().mockResolvedValue(undefined),
  sendCancellationEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/referral/conversion', () => ({ processReferralConversion: vi.fn().mockResolvedValue(undefined) }));

import { handlePaymentSuccess } from '../subscription-service';

describe('trial→paid invariant: paid activation never mutates the trial row', () => {
  beforeEach(() => {
    update.mockReset();
    update.mockResolvedValue({});
    findUnique.mockReset();
  });

  it('handlePaymentSuccess updates only the paid subscription id, leaving TRIAL row untouched', async () => {
    // Scenario: user has TRIAL row "trial_1" and a separate PENDING paid row "paid_1".
    findUnique.mockResolvedValue({
      id: 'paid_1', userId: 'user_1', cpSubscriptionId: null,
      plan: { intervalDays: 30, name: 'Полный доступ' },
    });

    await handlePaymentSuccess('paid_1', { id: 'pay_1', amount: 2990, cpSubscriptionId: 'sc_1' });

    // Every update call must target the paid row, never the trial row.
    expect(update).toHaveBeenCalled();
    for (const call of update.mock.calls) {
      expect(call[0].where).toEqual({ id: 'paid_1' });
    }
    const trialTouched = update.mock.calls.some((c) => c[0].where?.id === 'trial_1');
    expect(trialTouched).toBe(false);
  });
});
