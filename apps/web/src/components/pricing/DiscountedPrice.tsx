'use client';

import { cn } from '@/lib/utils';

/**
 * Resolved discount shape, structurally compatible with
 * `trpc.billing.getApplicableDiscount` output (which carries an extra `source`).
 */
export interface ResolvedDiscount {
  type: 'PERCENT' | 'FIXED';
  value: number;
  label: string;
  originalPrice: number;
  discountedPrice: number;
}

const RUBLE = '₽'; // ₽
const MINUS = '−'; // − (typographic minus)

function formatRub(price: number): string {
  // toLocale('ru-RU') groups with a thin space, matching the pricing pages.
  return `${price.toLocaleString('ru-RU')} ${RUBLE}`;
}

/**
 * Presentational price block for a discounted plan: the discounted price
 * shown prominently with the original struck-through beside it, plus a
 * caption naming the discount and code. No data fetching.
 *
 * `onDark` = rendered on the blue PLATFORM card (light text); otherwise
 * styled for white cards.
 */
export function DiscountedPrice({
  discount,
  onDark,
}: {
  discount: ResolvedDiscount;
  onDark: boolean;
}) {
  const caption =
    discount.type === 'PERCENT'
      ? `${MINUS}${discount.value}%`
      : `${MINUS}${formatRub(discount.value)}`;

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span
          className={cn(
            'text-[36px] sm:text-[44px] font-bold leading-none',
            onDark ? 'text-white' : 'text-mp-gray-900',
          )}
        >
          {formatRub(discount.discountedPrice)}
        </span>
        <span
          className={cn(
            'text-[20px] sm:text-[24px] font-medium leading-none line-through opacity-60',
            onDark ? 'text-white' : 'text-mp-gray-900',
          )}
        >
          {formatRub(discount.originalPrice)}
        </span>
        <span className={cn('text-[17px]', onDark ? 'text-white/50' : 'text-mp-gray-400')}>
          /мес
        </span>
      </div>
      <p
        className={cn(
          'mt-2 text-[13px] sm:text-[14px] font-medium',
          onDark ? 'text-white/90' : 'text-mp-blue-600',
        )}
      >
        {caption} по коду {discount.label}
      </p>
    </div>
  );
}
