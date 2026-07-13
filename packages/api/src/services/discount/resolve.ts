import type { PrismaClient, SubscriptionType } from '@mpstats/db';
import {
  computeDiscountedAmount,
  pickDiscount,
  type DiscountCandidate,
} from '../../utils/discount';

export interface ResolvedDiscount {
  source: 'promo' | 'ambassador';
  type: 'PERCENT' | 'FIXED';
  value: number;
  label: string;
  promoCodeId?: string;
  originalPrice: number;
  discountedPrice: number;
}

/**
 * Resolve the single discount that applies for `userId` buying `planType`.
 * Precedence: a valid entered promo-discount code > a pending ambassador
 * discount. Returns null when no discount applies.
 *
 * `basePrice` is the resolved public plan price (caller already has the plan).
 */
export async function resolveApplicableDiscount(args: {
  prisma: PrismaClient;
  userId: string;
  planType: SubscriptionType;
  basePrice: number;
  enteredCode?: string | null;
}): Promise<ResolvedDiscount | null> {
  const { prisma, userId, planType, basePrice, enteredCode } = args;
  const now = new Date();

  // --- Candidate A: entered promo-discount code ---
  let entered: DiscountCandidate | null = null;
  if (enteredCode) {
    const promo = await prisma.promoCode.findUnique({
      where: { code: enteredCode },
      select: {
        id: true,
        planType: true,
        discountType: true,
        discountValue: true,
        isActive: true,
        expiresAt: true,
        maxUses: true,
        currentUses: true,
      },
    });
    const alreadyUsed = promo
      ? await prisma.promoActivation.findUnique({
          where: { promoCodeId_userId: { promoCodeId: promo.id, userId } },
          select: { id: true },
        })
      : null;
    const promoValid =
      promo &&
      promo.isActive &&
      promo.discountType != null &&
      promo.discountValue != null &&
      (promo.planType === null || promo.planType === planType) &&
      (!promo.expiresAt || promo.expiresAt >= now) &&
      promo.currentUses < promo.maxUses &&
      !alreadyUsed;
    if (promoValid && promo) {
      entered = {
        source: 'promo',
        type: promo.discountType!,
        value: promo.discountValue!,
        label: enteredCode,
        promoCodeId: promo.id,
      };
    }
  }

  // --- Candidate B: pending ambassador discount ---
  let ambassador: DiscountCandidate | null = null;
  const referral = await prisma.referral.findFirst({
    where: {
      referredUserId: userId,
      discountConsumedAt: null,
      codeId: { not: null },
    },
    select: {
      referralCode: {
        select: {
          discountType: true,
          discountValue: true,
          isActive: true,
          expiresAt: true,
          label: true,
        },
      },
    },
  });
  const rc = referral?.referralCode;
  if (
    rc &&
    rc.isActive &&
    rc.discountType != null &&
    rc.discountValue != null &&
    (!rc.expiresAt || rc.expiresAt >= now)
  ) {
    ambassador = {
      source: 'ambassador',
      type: rc.discountType,
      value: rc.discountValue,
      label: rc.label,
    };
  }

  const chosen = pickDiscount(entered, ambassador);
  if (!chosen) return null;

  return {
    source: chosen.source,
    type: chosen.type,
    value: chosen.value,
    label: chosen.label,
    promoCodeId: chosen.promoCodeId,
    originalPrice: basePrice,
    discountedPrice: computeDiscountedAmount(basePrice, {
      type: chosen.type,
      value: chosen.value,
    }),
  };
}
