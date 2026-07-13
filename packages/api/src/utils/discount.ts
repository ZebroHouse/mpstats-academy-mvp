/** Discount kind stored on codes. Mirrors the Prisma `DiscountType` enum. */
export type DiscountType = 'PERCENT' | 'FIXED';

/**
 * Floor for any charged amount. CloudPayments cannot charge 0 ₽, and a
 * discount must never drive the price to or below zero. Kept as a named
 * constant so the floor is one source of truth across compute + UI preview.
 */
export const MIN_CHARGE_RUB = 1;

export interface DiscountInput {
  type: DiscountType;
  value: number;
}

export interface DiscountCandidate extends DiscountInput {
  source: 'promo' | 'ambassador';
  label: string;
  /** Present only for promo-code discounts — used to record PromoActivation. */
  promoCodeId?: string;
}

/**
 * Reduce `basePrice` by a discount, clamped to MIN_CHARGE_RUB.
 * PERCENT rounds to the nearest whole ruble. Returns basePrice unchanged
 * when discount is null.
 */
export function computeDiscountedAmount(
  basePrice: number,
  discount: DiscountInput | null,
): number {
  if (!discount) return basePrice;
  // Defensive: a negative discount value must never increase the price.
  // Upstream code creation validates positivity (z.positive()); this is
  // belt-and-suspenders for the money path — clamp, never throw.
  const value = Math.max(0, discount.value);
  const reduced =
    discount.type === 'PERCENT'
      ? basePrice - Math.round((basePrice * value) / 100)
      : basePrice - value;
  return Math.max(MIN_CHARGE_RUB, reduced);
}

/**
 * Precedence: an explicitly entered promo discount wins over a pending
 * ambassador discount. No stacking — exactly one discount applies.
 */
export function pickDiscount(
  entered: DiscountCandidate | null,
  ambassador: DiscountCandidate | null,
): DiscountCandidate | null {
  return entered ?? ambassador ?? null;
}
