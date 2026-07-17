import { describe, it, expect } from 'vitest';
import { deriveOfferState } from '../offer';

const DAY = 24 * 60 * 60 * 1000;

describe('deriveOfferState', () => {
  it('none when no offer resolves', () => {
    expect(deriveOfferState(null)).toEqual({ state: 'none', offerEndsAt: null });
  });

  it('trial_active → counts down to trialEnd', () => {
    const trialEnd = new Date(Date.now() + 2 * DAY);
    const windowEnd = new Date(trialEnd.getTime() + DAY);
    const r = deriveOfferState({ firstPeriodDays: 60, trialEnd, windowEnd, inGrace: false });
    expect(r.state).toBe('trial_active');
    expect(r.offerEndsAt).toBe(trialEnd.toISOString());
  });

  it('grace → counts down to windowEnd', () => {
    const trialEnd = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const windowEnd = new Date(trialEnd.getTime() + DAY);
    const r = deriveOfferState({ firstPeriodDays: 60, trialEnd, windowEnd, inGrace: true });
    expect(r.state).toBe('grace');
    expect(r.offerEndsAt).toBe(windowEnd.toISOString());
  });
});
