import { describe, it, expect } from 'vitest';
import { shouldConsumeAmbassadorDiscount } from './consume-discount';

describe('shouldConsumeAmbassadorDiscount', () => {
  it('true when paid below full and no promo code on the subscription', () => {
    expect(shouldConsumeAmbassadorDiscount({ paidAmount: 2490, planPrice: 2990, promoCodeId: null })).toBe(true);
  });

  it('false when paid the full price', () => {
    expect(shouldConsumeAmbassadorDiscount({ paidAmount: 2990, planPrice: 2990, promoCodeId: null })).toBe(false);
  });

  it('false when a promo code was applied (that path consumes separately)', () => {
    expect(shouldConsumeAmbassadorDiscount({ paidAmount: 2490, planPrice: 2990, promoCodeId: 'p1' })).toBe(false);
  });
});
