import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks must be created via vi.hoisted so the (hoisted) vi.mock factories can reference them.
const { update, findUnique, findFirst } = vi.hoisted(() => ({
  update: vi.fn(),
  findUnique: vi.fn(),
  findFirst: vi.fn(),
}));

vi.mock('@mpstats/db/client', () => ({
  prisma: { subscription: { update, findUnique, findFirst } },
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
    findFirst.mockReset();
    findFirst.mockResolvedValue(null); // default: no active trial
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

  it('stacks the paid period after an active trial (paid starts at trial end)', async () => {
    findUnique.mockResolvedValue({
      id: 'paid_1', userId: 'user_1', cpSubscriptionId: null,
      plan: { intervalDays: 30, name: 'Полный доступ' },
    });
    // Trial still running: ends 2 days from now.
    const trialEnd = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    findFirst.mockResolvedValue({ currentPeriodEnd: trialEnd });

    await handlePaymentSuccess('paid_1', { id: 'pay_1', amount: 2990, cpSubscriptionId: 'sc_1' });

    const data = update.mock.calls[0][0].data;
    // Paid period must begin exactly at the trial end, not at "now".
    expect((data.currentPeriodStart as Date).getTime()).toBe(trialEnd.getTime());
    // ...and run a full interval from there.
    const expectedEnd = new Date(trialEnd);
    expectedEnd.setDate(expectedEnd.getDate() + 30);
    expect((data.currentPeriodEnd as Date).getTime()).toBe(expectedEnd.getTime());
    // The trial row is only READ (findFirst), never updated.
    const trialUpdated = update.mock.calls.some((c) => c[0].where?.id !== 'paid_1');
    expect(trialUpdated).toBe(false);
  });

  it('starts the paid period at "now" when there is no active trial', async () => {
    findUnique.mockResolvedValue({
      id: 'paid_1', userId: 'user_1', cpSubscriptionId: null,
      plan: { intervalDays: 30, name: 'Полный доступ' },
    });
    findFirst.mockResolvedValue(null);

    const before = Date.now();
    await handlePaymentSuccess('paid_1', { id: 'pay_1', amount: 2990, cpSubscriptionId: 'sc_1' });
    const after = Date.now();

    const data = update.mock.calls[0][0].data;
    const start = (data.currentPeriodStart as Date).getTime();
    expect(start).toBeGreaterThanOrEqual(before);
    expect(start).toBeLessThanOrEqual(after);
  });
});
