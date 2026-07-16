import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { resolveApplicableOffer, OFFER_FIRST_PERIOD_DAYS } from './resolve';

const DAY = 24 * 60 * 60 * 1000;

// The offer is env-gated. Enable it for every eligibility test; one test below
// flips it off to prove the kill-switch.
const ORIGINAL_OFFER_ENABLED = process.env.OFFER_ENABLED;
beforeEach(() => {
  process.env.OFFER_ENABLED = 'true';
});
afterAll(() => {
  if (ORIGINAL_OFFER_ENABLED === undefined) delete process.env.OFFER_ENABLED;
  else process.env.OFFER_ENABLED = ORIGINAL_OFFER_ENABLED;
});

// Minimal fake prisma: only the methods resolveApplicableOffer calls.
function fakePrisma(opts: {
  trialEnd?: Date | null;         // latest TRIAL sub's currentPeriodEnd, null = no trial
  paidActive?: boolean;           // shorthand: an ACTIVE PLATFORM sub with periodEnd > now
  paidStatus?: 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | null; // status of the existing paid PLATFORM sub
  paidPeriodEnd?: Date;           // periodEnd of that paid sub (defaults to +30d)
  redeemed?: boolean;             // OfferRedemption exists for user
}) {
  // Model the existing paid PLATFORM sub, if any.
  const paidStatus = opts.paidStatus ?? (opts.paidActive ? 'ACTIVE' : null);
  const paidPeriodEnd = opts.paidPeriodEnd ?? new Date(Date.now() + 30 * DAY);
  return {
    subscription: {
      findFirst: async ({ where }: any) => {
        if (where.status === 'TRIAL') {
          return opts.trialEnd ? { currentPeriodEnd: opts.trialEnd } : null;
        }
        // paid-sub lookup: faithfully apply the status + periodEnd filters so
        // the test truly exercises the gate (which statuses count as paid).
        if (!paidStatus) return null;
        const statusMatches = where.status?.in?.includes(paidStatus) ?? false;
        const periodMatches = paidPeriodEnd.getTime() > where.currentPeriodEnd.gt.getTime();
        return statusMatches && periodMatches ? { id: 'paid1' } : null;
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

  it('returns null when the user has a cancelled-but-still-valid paid PLATFORM sub', async () => {
    // Auto-renew off, but paid access still valid → not an offer target.
    const offer = await resolveApplicableOffer({
      prisma: fakePrisma({
        trialEnd: new Date(Date.now() + DAY),
        paidStatus: 'CANCELLED',
        paidPeriodEnd: new Date(Date.now() + 15 * DAY),
      }),
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

  it('returns null when OFFER_ENABLED is off (kill-switch), even for an eligible user', async () => {
    process.env.OFFER_ENABLED = 'false';
    const offer = await resolveApplicableOffer({
      prisma: fakePrisma({ trialEnd: new Date(Date.now() + 2 * DAY) }),
      userId: 'u1', planType: 'PLATFORM', suppressForDiscount: false,
    });
    expect(offer).toBeNull();
  });
});
