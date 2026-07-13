import { describe, it, expect } from 'vitest';
import {
  computeDiscountedAmount,
  pickDiscount,
  MIN_CHARGE_RUB,
  type DiscountCandidate,
} from './discount';

describe('computeDiscountedAmount', () => {
  it('returns base price when discount is null', () => {
    expect(computeDiscountedAmount(2990, null)).toBe(2990);
  });

  it('applies percent discount with rounding', () => {
    expect(computeDiscountedAmount(2990, { type: 'PERCENT', value: 20 })).toBe(2392);
  });

  it('rounds percent to nearest ruble', () => {
    expect(computeDiscountedAmount(1990, { type: 'PERCENT', value: 33 })).toBe(1333);
  });

  it('applies fixed discount in rubles', () => {
    expect(computeDiscountedAmount(2990, { type: 'FIXED', value: 500 })).toBe(2490);
  });

  it('clamps to MIN_CHARGE_RUB when fixed exceeds price', () => {
    expect(computeDiscountedAmount(2990, { type: 'FIXED', value: 5000 })).toBe(MIN_CHARGE_RUB);
  });

  it('clamps to MIN_CHARGE_RUB when percent >= 100', () => {
    expect(computeDiscountedAmount(2990, { type: 'PERCENT', value: 100 })).toBe(MIN_CHARGE_RUB);
  });
});

describe('pickDiscount', () => {
  const promo: DiscountCandidate = { source: 'promo', type: 'PERCENT', value: 10, label: 'PROMO-X', promoCodeId: 'p1' };
  const amb: DiscountCandidate = { source: 'ambassador', type: 'FIXED', value: 500, label: 'Blogger' };

  it('prefers the entered promo over ambassador', () => {
    expect(pickDiscount(promo, amb)).toBe(promo);
  });

  it('falls back to ambassador when no promo', () => {
    expect(pickDiscount(null, amb)).toBe(amb);
  });

  it('returns null when neither applies', () => {
    expect(pickDiscount(null, null)).toBeNull();
  });
});
