'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { X } from 'lucide-react';
import { isValidRefCodeShape } from '@/lib/referral/attribution';
import { trpc } from '@/lib/trpc/client';
import { pluralizeDays } from '@/lib/plural';

/**
 * Marketing top ribbon shown on the landing page when a visitor arrives via a
 * referral link (`/?ref=CODE`). Mirrors the gift banner on /register but as a
 * full-width sticky strip, and routes the visitor to registration with the code
 * preserved. Dismissal is remembered for the session.
 *
 * Visibility is reported via `onVisibilityChange` so the host page can offset the
 * fixed header (the ribbon sits above it).
 */

const DISMISS_KEY = 'ref_ribbon_dismissed';

export function ReferralTopRibbon({
  onVisibilityChange,
}: {
  onVisibilityChange?: (visible: boolean) => void;
}) {
  const searchParams = useSearchParams();
  const rawCode = searchParams.get('ref');
  // Shape regex requires UPPERCASE — upper-case before validating and before use.
  const code = rawCode ? rawCode.toUpperCase() : null;
  const isValidShape = !!code && isValidRefCodeShape(code);

  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // sessionStorage is unavailable during SSR — read it after mount to avoid a
  // hydration mismatch and a flash of a ribbon that should stay hidden.
  useEffect(() => {
    setMounted(true);
    if (sessionStorage.getItem(DISMISS_KEY) === '1') {
      setDismissed(true);
    }
  }, []);

  const validation = trpc.referral.validateCode.useQuery(
    { code: code! },
    { enabled: isValidShape },
  );

  const visible = mounted && !dismissed && isValidShape && validation.data?.valid === true;

  useEffect(() => {
    onVisibilityChange?.(visible);
  }, [visible, onVisibilityChange]);

  if (!visible) return null;

  // Peer (user-to-user) codes return trialDays=null; the friend's trial length is
  // decided by the i1/i2 flag (14d viral vs 7d pay-gated) — mirror register-form.
  // Ambassador codes carry their own trialDays and are unaffected by the flag.
  const i2Mode = process.env.NEXT_PUBLIC_REFERRAL_PAY_GATED === 'true';
  const days = validation.data?.trialDays ?? (i2Mode ? 7 : 14);
  const label = validation.data?.referrerName;

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  };

  return (
    <div
      role="region"
      aria-label="Реферальное приглашение"
      className="fixed top-0 left-0 right-0 z-[60] h-11 bg-gradient-to-r from-[#2C4FF8] to-[#0F172A] text-white"
    >
      <div className="mx-auto flex h-full max-w-[1160px] items-center gap-3 px-4 sm:px-6 md:px-10 lg:px-0">
        <p className="min-w-0 flex-1 truncate text-[13px] font-medium sm:text-[14px]">
          🎁 Вам подарили {days} {pluralizeDays(days)} полного доступа
          {label ? ` · по приглашению: ${label}` : ''}
        </p>
        <Link
          href={`/register?ref=${code}`}
          className="shrink-0 rounded-full bg-white px-4 py-1.5 text-[13px] font-semibold text-[#2C4FF8] transition-colors hover:bg-white/90"
        >
          Забрать {days} {pluralizeDays(days)} →
        </Link>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Закрыть"
          className="shrink-0 rounded-md p-1 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
