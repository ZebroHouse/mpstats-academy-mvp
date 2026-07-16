'use client';

import { useState, useEffect } from 'react';
import { formatCountdown } from './formatCountdown';

type StripState = 'trial_active' | 'grace' | 'expired' | 'none';

/** Fixed height of the strip in px — pricing page uses it to offset the header. */
export const OFFER_STRIP_HEIGHT = 48;

/**
 * Bright pricing-page offer strip with a live countdown. Meant to sit fixed at
 * the very top, above the (transparent) marketing header. Only renders for the
 * two live offer states; `none`/`expired` render nothing. Server owns the state
 * (trpc.offer.getState); this ticks the timer client-side.
 */
export function OfferStrip({ state, endsAt }: { state: StripState; endsAt: string | null }) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    if (!endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  if (state !== 'trial_active' && state !== 'grace') return null;
  const remainingMs = endsAt ? new Date(endsAt).getTime() - now : 0;

  return (
    <div
      style={{ height: OFFER_STRIP_HEIGHT }}
      className="flex w-full items-center justify-center gap-2 bg-gradient-to-r from-[#2C4FF8] via-[#5B2CF8] to-[#FF168A] px-4 text-center text-[13px] font-medium text-white shadow-[0_2px_12px_rgba(44,79,248,0.35)] sm:text-[15px]"
    >
      <span aria-hidden="true" className="text-[16px]">{state === 'grace' ? '⏳' : '🎁'}</span>
      <b className="font-bold">{state === 'grace' ? 'Предложение действует ещё' : '2 месяца по цене одного'}</b>
      {state === 'trial_active' && (
        <span className="hidden text-white/80 sm:inline">— до конца вашего бесплатного доступа</span>
      )}
      <span
        data-testid="offer-strip-timer"
        className="rounded-md bg-white/20 px-2 py-0.5 font-bold tabular-nums ring-1 ring-white/30"
      >
        {formatCountdown(remainingMs)}
      </span>
    </div>
  );
}
