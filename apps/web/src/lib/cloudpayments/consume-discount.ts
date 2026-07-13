/**
 * Whether a successful payment should burn the user's pending ambassador
 * discount. Ambassador discounts leave no marker on the subscription (unlike
 * promo codes, which set `promoCodeId`), so we re-derive: the charge came in
 * below full plan price AND no promo code was attached → the reduction can
 * only have come from the ambassador discount.
 */
export function shouldConsumeAmbassadorDiscount(args: {
  paidAmount: number;
  planPrice: number;
  promoCodeId: string | null;
}): boolean {
  return args.promoCodeId == null && args.paidAmount < args.planPrice;
}
