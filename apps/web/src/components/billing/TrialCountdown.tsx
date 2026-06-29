'use client';

import Link from 'next/link';
import { Clock } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';

const MS_PER_DAY = 86_400_000;

/**
 * Russian pluralization for "осталось N дней" + correct verb agreement.
 * 1 → «остался 1 день», 2-4 (кроме 12-14) → «осталось N дня», иначе → «осталось N дней».
 */
export function trialDaysPhrase(daysLeft: number): string {
  const mod10 = daysLeft % 10;
  const mod100 = daysLeft % 100;

  if (mod10 === 1 && mod100 !== 11) return `остался ${daysLeft} день`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `осталось ${daysLeft} дня`;
  }
  return `осталось ${daysLeft} дней`;
}

/**
 * Inline trial counter for the app header (T4).
 * Renders only for an active TRIAL subscription whose period hasn't ended;
 * everything else (no sub / ACTIVE / PAST_DUE / CANCELLED / PENDING / loading) → null.
 *
 * The whole element is a single link to /pricing, so the pill itself is the
 * payment path on mobile. The «Продлить» button is a visual cue shown only on
 * desktop — it's part of the same link, not a separate anchor, to avoid dup CTAs.
 */
export function TrialCountdown() {
  const { data } = trpc.billing.getSubscription.useQuery();

  if (!data || data.status !== 'TRIAL') return null;

  const endMs = new Date(data.currentPeriodEnd).getTime();
  const remainingMs = endMs - Date.now();
  if (remainingMs <= 0) return null;

  const daysLeft = Math.max(1, Math.ceil(remainingMs / MS_PER_DAY));
  const isUrgent = daysLeft === 1;

  return (
    <Link
      href="/pricing"
      aria-label="Продлить подписку"
      data-testid="trial-countdown"
      data-urgent={isUrgent}
      className="flex items-center gap-2"
    >
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
          isUrgent
            ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
            : 'bg-mp-blue-50 text-mp-blue-700 hover:bg-mp-blue-100',
        )}
      >
        <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="whitespace-nowrap">Триал: {trialDaysPhrase(daysLeft)}</span>
      </span>
      <span
        className={cn(
          'hidden sm:inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors',
          isUrgent
            ? 'bg-amber-500 text-white hover:bg-amber-600'
            : 'bg-mp-blue-500 text-white hover:bg-mp-blue-600',
        )}
      >
        Продлить
      </span>
    </Link>
  );
}
