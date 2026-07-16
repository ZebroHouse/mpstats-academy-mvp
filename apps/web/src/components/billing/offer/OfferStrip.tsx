'use client';

import { useState, useEffect } from 'react';
import { formatCountdown } from './formatCountdown';

type StripState = 'trial_active' | 'grace' | 'expired' | 'none';

/**
 * Dark pricing-page offer strip with a live countdown. Only renders for the
 * two live offer states; `none`/`expired` render nothing. Server owns the
 * state (trpc.offer.getState); this ticks the timer client-side.
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
    <div className="w-full bg-[#0F172A] px-4 py-2.5 text-center text-[14px] text-white">
      {state === 'grace' ? '⏳ ' : '🎁 '}
      <b>{state === 'grace' ? 'Предложение действует ещё' : '2 месяца по цене одного'}</b>
      {state === 'trial_active' && <span className="text-white/70"> — до конца вашего бесплатного доступа</span>}
      <span
        data-testid="offer-strip-timer"
        className="ml-2 inline-block rounded-md bg-[#FF7700] px-2 py-0.5 font-bold tabular-nums text-white"
      >
        {formatCountdown(remainingMs)}
      </span>
    </div>
  );
}
