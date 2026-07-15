import { describe, it, expect } from 'vitest';
import { resolveApplicableOffer, OFFER_FIRST_PERIOD_DAYS } from './resolve';

const DAY = 24 * 60 * 60 * 1000;

// Minimal fake prisma: only the methods resolveApplicableOffer calls.
function fakePrisma(opts: {
  trialEnd?: Date | null;         // latest TRIAL sub's currentPeriodEnd, null = no trial
  paidActive?: boolean;           // an ACTIVE/PAST_DUE PLATFORM sub with periodEnd > now
  redeemed?: boolean;             // OfferRedemption exists for user
}) {
  return {
    subscription: {
      findFirst: async ({ where }: any) => {
        if (where.status === 'TRIAL') {
          return opts.trialEnd ? { currentPeriodEnd: opts.trialEnd } : null;
        }
        // paid-active lookup: status in [ACTIVE, PAST_DUE]
        return opts.paidActive ? { id: 'paid1' } : null;
      },
    },
    offerRedemption: {
      findUnique: async () => (opts.redeemed ? { id: 'r1' } : null),
    },
  } as any;
}

describe('resolveApplicableOffer', () => {
  it('returns 60-day offer for an active-trial PLATFORM user', async () => {
    const trialEnd = new Date(Date.now() + 2 * DAY);
    const offer = await resolveApplicableOffer({
      prisma: fakePrisma({ trialEnd }),
      userId: 'u1',
      planType: 'PLATFORM',
      suppressForDiscount: false,
    });
    expect(offer).not.toBeNull();
    expect(offer!.firstPeriodDays).toBe(OFFER_FIRST_PERIOD_DAYS);
    expect(offer!.trialEnd.getTime()).toBe(trialEnd.getTime());
    expect(offer!.inGrace).toBe(false);
  });

  it('returns offer in the 24h grace window after trial end', async () => {
    const trialEnd = new Date(Date.now() - 3 * 60 * 60 * 1000); // ended 3h ago
    const offer = await resolveApplicableOffer({
      prisma: fakePrisma({ trialEnd }),
      userId: 'u1', planType: 'PLATFORM', suppressForDiscount: false,
    });
    expect(offer).not.toBeNull();
    expect(offer!.inGrace).toBe(true);
  });

  it('returns null once the 24h grace has passed', async () => {
    const trialEnd = new Date(Date.now() - 25 * 60 * 60 * 1000); // ended 25h ago
    const offer = await resolveApplicableOffer({
      prisma: fakePrisma({ trialEnd }),
      userId: 'u1', planType: 'PLATFORM', suppressForDiscount: false,
    });
    expect(offer).toBeNull();
  });

  it('returns null for COURSE plan', async () => {
    const offer = await resolveApplicableOffer({
      prisma: fakePrisma({ trialEnd: new Date(Date.now() + DAY) }),
      userId: 'u1', planType: 'COURSE', suppressForDiscount: false,
    });
    expect(offer).toBeNull();
  });

  it('returns null when a discount is being applied', async () => {
    const offer = await resolveApplicableOffer({
      prisma: fakePrisma({ trialEnd: new Date(Date.now() + DAY) }),
      userId: 'u1', planType: 'PLATFORM', suppressForDiscount: true,
    });
    expect(offer).toBeNull();
  });

  it('returns null when the offer was already redeemed', async () => {
    const offer = await resolveApplicableOffer({
      prisma: fakePrisma({ trialEnd: new Date(Date.now() + DAY), redeemed: true }),
      userId: 'u1', planType: 'PLATFORM', suppressForDiscount: false,
    });
    expect(offer).toBeNull();
  });

  it('returns null when the user already has an active paid PLATFORM sub', async () => {
    const offer = await resolveApplicableOffer({
      prisma: fakePrisma({ trialEnd: new Date(Date.now() + DAY), paidActive: true }),
      userId: 'u1', planType: 'PLATFORM', suppressForDiscount: false,
    });
    expect(offer).toBeNull();
  });

  it('returns null when the user has no trial at all', async () => {
    const offer = await resolveApplicableOffer({
      prisma: fakePrisma({ trialEnd: null }),
      userId: 'u1', planType: 'PLATFORM', suppressForDiscount: false,
    });
    expect(offer).toBeNull();
  });
});
