import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks must be created via vi.hoisted so the (hoisted) vi.mock factories can reference them.
const { update, findUnique, findFirst, offerCreate } = vi.hoisted(() => ({
  update: vi.fn(),
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  offerCreate: vi.fn(),
}));

vi.mock('@mpstats/db/client', () => ({
  prisma: {
    subscription: { update, findUnique, findFirst },
    offerRedemption: { create: offerCreate },
  },
}));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('@/lib/carrotquest/emails', () => ({
  sendPaymentSuccessEmail: vi.fn().mockResolvedValue(undefined),
  sendPaymentFailedEmail: vi.fn().mockResolvedValue(undefined),
  sendCancellationEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/referral/conversion', () => ({ processReferralConversion: vi.fn().mockResolvedValue(undefined) }));

import { handlePaymentSuccess } from '../subscription-service';

describe('trial 2-for-1 offer: OfferRedemption burn on successful pay', () => {
  beforeEach(() => {
    update.mockReset();
    update.mockResolvedValue({});
    findUnique.mockReset();
    findFirst.mockReset();
    findFirst.mockResolvedValue(null); // no active trial (grace-path)
    offerCreate.mockReset();
    offerCreate.mockResolvedValue({});
  });

  it('burns the redemption exactly once with the offer identity when offerFirstPeriodDays is set', async () => {
    findUnique.mockResolvedValue({
      id: 'paid_1', userId: 'user_1', cpSubscriptionId: null,
      offerFirstPeriodDays: 60, promoCodeId: null,
      plan: { intervalDays: 30, name: 'Полный доступ', price: 2990 },
    });

    await handlePaymentSuccess('paid_1', { id: 'pay_1', amount: 2990, cpSubscriptionId: 'sc_1' });

    expect(offerCreate).toHaveBeenCalledTimes(1);
    expect(offerCreate).toHaveBeenCalledWith({
      data: { userId: 'user_1', subscriptionId: 'paid_1', offerKey: 'trial_2for1' },
    });
  });

  it('stays non-throwing when the redemption insert rejects (unique violation on webhook replay)', async () => {
    findUnique.mockResolvedValue({
      id: 'paid_1', userId: 'user_1', cpSubscriptionId: null,
      offerFirstPeriodDays: 60, promoCodeId: null,
      plan: { intervalDays: 30, name: 'Полный доступ', price: 2990 },
    });
    // Simulate Prisma P2002 unique-constraint violation on OfferRedemption(userId).
    offerCreate.mockRejectedValue(new Error('Unique constraint failed on the fields: (`userId`)'));

    // The webhook contract: never throw, so the handler always returns {code:0} to CP.
    await expect(
      handlePaymentSuccess('paid_1', { id: 'pay_1', amount: 2990, cpSubscriptionId: 'sc_1' }),
    ).resolves.toBeUndefined();

    // The subscription was still activated despite the redemption race.
    expect(update).toHaveBeenCalled();
  });

  it('does not burn a redemption when there is no offer (offerFirstPeriodDays is null)', async () => {
    findUnique.mockResolvedValue({
      id: 'paid_1', userId: 'user_1', cpSubscriptionId: null,
      offerFirstPeriodDays: null, promoCodeId: null,
      plan: { intervalDays: 30, name: 'Полный доступ', price: 2990 },
    });

    await handlePaymentSuccess('paid_1', { id: 'pay_1', amount: 2990, cpSubscriptionId: 'sc_1' });

    expect(offerCreate).not.toHaveBeenCalled();
  });
});
