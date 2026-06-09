import { describe, it, expect } from 'vitest';
import { deriveTrialConversion, type TrialRow, type ConversionPayment } from './trial-conversion';

const NOW = new Date('2026-06-08T00:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

function trial(p: Partial<TrialRow>): TrialRow {
  return {
    userId: 'u', trialStart: new Date(NOW.getTime() - 20 * DAY), trialEnd: new Date(NOW.getTime() - 6 * DAY),
    user: { isTest: false }, plan: { hidden: false }, ...p,
  };
}
function pay(p: Partial<ConversionPayment>): ConversionPayment {
  return { userId: 'u', paidAt: new Date(NOW.getTime() - 3 * DAY), subscription: { user: { isTest: false }, plan: { hidden: false } }, ...p };
}

describe('deriveTrialConversion', () => {
  it('counts a matured trial with a payment as converted', () => {
    const r = deriveTrialConversion([trial({ userId: 'a' })], [pay({ userId: 'a' })], NOW);
    expect(r.trialsStarted).toBe(1);
    expect(r.converted).toBe(1);
    expect(r.conversionRate).toBe(100);
    expect(r.churnedTrials).toBe(0);
    expect(r.activeTrials).toBe(0);
    expect(r.avgDaysToConvert).toBe(3); // paidAt = trialEnd + 3d
  });

  it('counts a matured trial without payment as churned', () => {
    const r = deriveTrialConversion([trial({ userId: 'a' })], [], NOW);
    expect(r.converted).toBe(0);
    expect(r.churnedTrials).toBe(1);
    expect(r.conversionRate).toBe(0);
  });

  it('counts an active trial (not yet ended) separately, excluded from rate denominator', () => {
    const active = trial({ userId: 'a', trialEnd: new Date(NOW.getTime() + 5 * DAY) });
    const r = deriveTrialConversion([active], [], NOW);
    expect(r.activeTrials).toBe(1);
    expect(r.churnedTrials).toBe(0);
    expect(r.conversionRate).toBe(0); // no matured trials → 0, not NaN
  });

  it('derives conversion even though the paid subscription is a separate ACTIVE row (invariant)', () => {
    // The trial row is still status=TRIAL; conversion is read from the payment, not a status flip.
    const r = deriveTrialConversion([trial({ userId: 'a' })], [pay({ userId: 'a' })], NOW);
    expect(r.converted).toBe(1);
  });

  it('excludes test users and hidden-plan rows from both trials and payments', () => {
    const r = deriveTrialConversion(
      [trial({ userId: 'a', user: { isTest: true } }), trial({ userId: 'b' })],
      [pay({ userId: 'b', subscription: { user: { isTest: false }, plan: { hidden: true } } })],
      NOW,
    );
    expect(r.trialsStarted).toBe(1); // only b
    expect(r.converted).toBe(0);     // b's payment was on a hidden plan → not a real conversion
    expect(r.churnedTrials).toBe(1);
  });

  it('dedupes multiple trial rows per user to the earliest', () => {
    const r = deriveTrialConversion(
      [trial({ userId: 'a', trialStart: new Date(NOW.getTime() - 40 * DAY), trialEnd: new Date(NOW.getTime() - 26 * DAY) }),
       trial({ userId: 'a' })],
      [], NOW,
    );
    expect(r.trialsStarted).toBe(1);
  });
});
