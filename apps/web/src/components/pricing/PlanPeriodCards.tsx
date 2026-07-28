'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { DiscountedPrice, type ResolvedDiscount } from './DiscountedPrice';

/** The three PLATFORM period variants Pricing 2.0 sells. */
export type PlanIntervalDays = 30 | 90 | 180;

/**
 * Minimal shape this component needs from a `trpc.billing.getPlans` row.
 * Kept structural (not importing the Prisma type) so the component has no
 * server-only dependency.
 */
export interface PricingPlanData {
  id: string;
  type: string;
  price: number;
  intervalDays: number;
}

interface PeriodConfig {
  intervalDays: PlanIntervalDays;
  months: number;
  /** «Кому подойдёт» marker shown under the plan title. */
  audience: string;
  /** Benefit badge copy, e.g. "Выгоднее на 11%". Absent for the base 1-month card. */
  benefitBadge?: string;
  /** 6-month card gets the accent (blue) treatment — the other two stay light. */
  accent?: boolean;
}

const PERIOD_CONFIG: PeriodConfig[] = [
  { intervalDays: 30, months: 1, audience: 'Попробовать, платить гибко' },
  {
    intervalDays: 90,
    months: 3,
    audience: 'Для тех, кто решил учиться серьёзно',
    benefitBadge: 'Выгоднее на 11%',
  },
  {
    intervalDays: 180,
    months: 6,
    audience: 'Максимум экономии, длинный заход',
    benefitBadge: 'Месяц в подарок',
    accent: true,
  },
];

function formatRub(n: number): string {
  return `${n.toLocaleString('ru-RU')} ₽`;
}

function monthlyEquivalent(price: number, months: number): number {
  return Math.round(price / months);
}

export interface PlanPeriodCardsProps {
  /** `trpc.billing.getPlans` result — filtered to PLATFORM rows internally. */
  plans: PricingPlanData[] | undefined;
  /** Called with the chosen period when a card's CTA is clicked. */
  onSelect: (intervalDays: PlanIntervalDays) => void;
  /** Disables all CTAs while a purchase is in flight. */
  loading?: boolean;
  /** The period the user is already subscribed to (its CTA reads "Текущий план" and disables). */
  activeIntervalDays?: PlanIntervalDays;
  /**
   * Discount preview for the 1-month plan only (discounts and the offer never
   * apply to 3/6-month plans — spec §3.5/3.6). When present it takes priority
   * over `showOfferMode`.
   */
  discount?: ResolvedDiscount;
  /**
   * Trial "2 months for the price of one" offer — only ever shown on the
   * 1-month card. Pass the already-built offer markup; this component just
   * decides which card it renders in and skips the plain price there.
   */
  showOfferMode?: boolean;
  offerContent?: ReactNode;
  className?: string;
}

const cardBase =
  'rounded-3xl p-6 sm:p-8 flex flex-col relative overflow-hidden transition-all duration-300 hover:-translate-y-1';

/**
 * Three PLATFORM period cards (1/3/6 months), sourced from `getPlans` —
 * prices, monthly-equivalent and benefit copy are all derived from the DB
 * rows, nothing is hardcoded. Shared between `/pricing` and `/billing` so
 * both pages render an identical shelf.
 */
export function PlanPeriodCards({
  plans,
  onSelect,
  loading = false,
  activeIntervalDays,
  discount,
  showOfferMode = false,
  offerContent,
  className,
}: PlanPeriodCardsProps) {
  const platformPlans = (plans ?? []).filter((p) => p.type === 'PLATFORM');

  return (
    <div className={cn('grid grid-cols-1 md:grid-cols-3 gap-5', className)}>
      {PERIOD_CONFIG.map((config) => {
        const plan = platformPlans.find((p) => p.intervalDays === config.intervalDays);
        const isActive = activeIntervalDays === config.intervalDays;
        const isOfferCard = config.intervalDays === 30 && showOfferMode;
        const isDiscountCard = config.intervalDays === 30 && Boolean(discount);
        const monthly = plan ? monthlyEquivalent(plan.price, config.months) : undefined;

        return (
          <div
            key={config.intervalDays}
            className={cn(
              cardBase,
              config.accent
                ? 'bg-mp-blue-500 text-white shadow-mp-card-hover'
                : 'bg-white border border-mp-gray-200 shadow-mp-card text-mp-gray-900',
            )}
          >
            {config.benefitBadge && (
              <span
                className={cn(
                  'absolute top-5 right-5 sm:top-6 sm:right-6 px-3.5 py-1 rounded-full text-[12px] font-medium',
                  config.accent ? 'bg-mp-pink-500 text-white' : 'bg-mp-blue-50 text-mp-blue-600',
                )}
              >
                {config.benefitBadge}
              </span>
            )}

            <div>
              <h3 className={cn('text-[20px] sm:text-[22px] font-bold', config.accent && 'text-white')}>
                {config.months === 1 ? '1 месяц' : `${config.months} месяцев`}
              </h3>
              <p
                className={cn(
                  'mt-1 text-[13px] sm:text-[14px]',
                  config.accent ? 'text-white/70' : 'text-mp-gray-500',
                )}
              >
                {config.audience}
              </p>

              <div className="mt-5">
                {!plan ? (
                  <div className="h-[44px] flex items-center">
                    <span className={cn('text-[15px]', config.accent ? 'text-white/60' : 'text-mp-gray-400')}>
                      Загрузка...
                    </span>
                  </div>
                ) : isDiscountCard && discount ? (
                  <DiscountedPrice discount={discount} onDark={Boolean(config.accent)} />
                ) : isOfferCard && offerContent ? (
                  offerContent
                ) : (
                  <>
                    <div className="flex items-baseline gap-1">
                      <span className={cn('text-[32px] sm:text-[36px] font-bold leading-none', config.accent && 'text-white')}>
                        {formatRub(plan.price)}
                      </span>
                    </div>
                    {monthly !== undefined && (
                      <p
                        className={cn(
                          'mt-1.5 text-[13px] sm:text-[14px]',
                          config.accent ? 'text-white/70' : 'text-mp-gray-500',
                        )}
                      >
                        {config.months === 1 ? '' : `≈ ${formatRub(monthly)} в месяц`}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>

            <button
              onClick={() => onSelect(config.intervalDays)}
              disabled={loading || !plan || isActive}
              className={cn(
                'mt-8 inline-flex items-center justify-center h-[52px] rounded-full text-[15px] font-medium transition-opacity hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed',
                config.accent ? 'bg-white text-mp-blue-600' : 'bg-mp-blue-500 text-white',
              )}
            >
              {isActive ? 'Текущий план' : loading ? 'Обработка...' : 'Оформить подписку'}
            </button>
          </div>
        );
      })}
    </div>
  );
}
