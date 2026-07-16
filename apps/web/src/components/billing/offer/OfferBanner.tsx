'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Gift, X } from 'lucide-react';
import { formatCountdown } from './formatCountdown';

export type OfferBannerState = 'trial_active' | 'grace' | 'expired';

const DISMISS_KEY = 'offerBannerDismissed';

/**
 * Variant 1 "Dark premium" sticky offer banner. Server decides `state` + `endsAt`
 * (via resolveOfferBannerState); this client component only ticks the countdown
 * and handles per-session dismiss. Never rendered when server state is 'none'.
 */
export function OfferBanner({
  state,
  endsAt,
}: {
  state: OfferBannerState;
  endsAt: string | null;
}) {
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [now, setNow] = useState(0);

  // sessionStorage + Date.now() are client-only — read after mount to avoid a
  // hydration mismatch (mirrors ReferralBanner's pattern).
  useEffect(() => {
    setMounted(true);
    setNow(Date.now());
    if (sessionStorage.getItem(DISMISS_KEY) === '1') setDismissed(true);
  }, []);

  // Tick once a second only while a timed offer is live.
  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  if (!mounted || dismissed) return null;

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  };

  const isExpired = state === 'expired';
  const remainingMs = endsAt ? new Date(endsAt).getTime() - now : 0;

  const title = isExpired
    ? 'Откройте все уроки платформы'
    : '🎁 2 месяца по цене одного';
  const subtitle = isExpired
    ? 'Полный доступ ко всем курсам и урокам MPSTATS Academy'
    : state === 'grace'
      ? 'Предложение действует ещё'
      : 'До конца бесплатного доступа · дальше 2 990 ₽/мес';
  const ctaLabel = isExpired ? 'Смотреть тарифы' : 'Забрать предложение';

  return (
    <div
      role="region"
      aria-label="Специальное предложение"
      className="flex items-center gap-3 bg-gradient-to-r from-mp-blue-900 to-mp-blue-800 px-4 py-3 text-white"
    >
      <Gift className="hidden size-7 shrink-0 text-mp-pink-500 sm:block" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-tight">{title}</p>
        <p className="hidden text-xs text-white/70 sm:flex sm:items-center sm:gap-2">
          <span>{subtitle}</span>
          {!isExpired && endsAt && (
            <span
              data-testid="offer-countdown"
              className="inline-flex items-center rounded-md bg-mp-pink-500 px-2 py-0.5 font-semibold tabular-nums text-white"
            >
              {formatCountdown(remainingMs)}
            </span>
          )}
        </p>
      </div>
      {/* Mobile countdown chip (subtitle row is hidden on mobile) */}
      {!isExpired && endsAt && (
        <span
          data-testid="offer-countdown-mobile"
          className="inline-flex shrink-0 items-center rounded-md bg-mp-pink-500 px-2 py-1 text-xs font-semibold tabular-nums text-white sm:hidden"
        >
          {formatCountdown(remainingMs)}
        </span>
      )}
      <Link
        href="/pricing"
        className="shrink-0 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-mp-blue-700 transition-colors hover:bg-mp-blue-50"
      >
        {ctaLabel}
      </Link>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Закрыть"
        className="shrink-0 rounded-md p-1 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
      >
        <X className="size-5" />
      </button>
    </div>
  );
}
