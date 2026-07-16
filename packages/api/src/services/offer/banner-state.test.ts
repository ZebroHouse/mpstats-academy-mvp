import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { resolveOfferBannerState } from './banner-state';

const DAY = 24 * 60 * 60 * 1000;

const ORIGINAL = process.env.OFFER_ENABLED;
beforeEach(() => { process.env.OFFER_ENABLED = 'true'; });
afterAll(() => {
  if (ORIGINAL === undefined) delete process.env.OFFER_ENABLED;
  else process.env.OFFER_ENABLED = ORIGINAL;
});

// Fake prisma covering every read resolveOfferBannerState performs:
//  - subscriptionPlan.findFirst  (public PLATFORM price → discount suppression)
//  - referral.findFirst          (resolveApplicableDiscount ambassador candidate;
//                                 null ⇒ no discount ⇒ no suppression)
//  - subscription.findFirst      (TRIAL lookup + paid lookup)
//  - offerRedemption.findUnique
function fakePrisma(opts: {
  trialEnd?: Date | null;
  redeemed?: boolean;
  paidAnyPlan?: boolean; // active paid sub of ANY plan (periodEnd > now)
}) {
  return {
    subscriptionPlan: {
      findFirst: async () => ({ price: 2990 }),
    },
    referral: {
      findFirst: async () => null, // no ambassador discount
    },
    subscription: {
      findFirst: async ({ where }: any) => {
        if (where.status === 'TRIAL') {
          return opts.trialEnd ? { currentPeriodEnd: opts.trialEnd } : null;
        }
        // paid lookup (resolver: PLATFORM only; expired helper: any plan) —
        // both share this fake and simply ask "is there a paid row?".
        return opts.paidAnyPlan ? { id: 'paid1' } : null;
      },
    },
    offerRedemption: {
      findUnique: async () => (opts.redeemed ? { id: 'r1' } : null),
    },
  } as any;
}

describe('resolveOfferBannerState', () => {
  it('trial_active for an eligible user with a live trial', async () => {
    const r = await resolveOfferBannerState({
      prisma: fakePrisma({ trialEnd: new Date(Date.now() + 2 * DAY) }),
      userId: 'u1',
    });
    expect(r.state).toBe('trial_active');
    expect(r.offerEndsAt).not.toBeNull();
  });

  it('grace within 24h after trial end', async () => {
    const r = await resolveOfferBannerState({
      prisma: fakePrisma({ trialEnd: new Date(Date.now() - 3 * 60 * 60 * 1000) }),
      userId: 'u1',
    });
    expect(r.state).toBe('grace');
  });

  it('expired for a lapsed trial (>24h), not redeemed, not paying', async () => {
    const r = await resolveOfferBannerState({
      prisma: fakePrisma({ trialEnd: new Date(Date.now() - 25 * 60 * 60 * 1000) }),
      userId: 'u1',
    });
    expect(r.state).toBe('expired');
    expect(r.offerEndsAt).toBeNull();
  });

  it('none for a lapsed trial user who already has active paid access', async () => {
    const r = await resolveOfferBannerState({
      prisma: fakePrisma({ trialEnd: new Date(Date.now() - 25 * 60 * 60 * 1000), paidAnyPlan: true }),
      userId: 'u1',
    });
    expect(r.state).toBe('none');
  });

  it('none for a lapsed trial user who already redeemed the offer', async () => {
    const r = await resolveOfferBannerState({
      prisma: fakePrisma({ trialEnd: new Date(Date.now() - 25 * 60 * 60 * 1000), redeemed: true }),
      userId: 'u1',
    });
    expect(r.state).toBe('none');
  });

  it('none when the user never had a trial', async () => {
    const r = await resolveOfferBannerState({
      prisma: fakePrisma({ trialEnd: null }),
      userId: 'u1',
    });
    expect(r.state).toBe('none');
  });

  it('none when OFFER_ENABLED is off (kill-switch), even mid-trial', async () => {
    process.env.OFFER_ENABLED = 'false';
    const r = await resolveOfferBannerState({
      prisma: fakePrisma({ trialEnd: new Date(Date.now() + 2 * DAY) }),
      userId: 'u1',
    });
    expect(r.state).toBe('none');
  });
});
