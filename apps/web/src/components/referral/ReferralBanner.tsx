'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Gift, X } from 'lucide-react';

/**
 * In-product promo banner for the referral program (CPO plan ПРОТОТИП 02).
 * Shown to every authenticated (main) user, hidden on /profile/referral,
 * and re-shown 14 days after the user dismisses it.
 */
const DISMISS_KEY = 'referralBannerDismissedAt';
const DISMISS_DURATION_MS = 14 * 24 * 60 * 60 * 1000;

export function ReferralBanner() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // localStorage is unavailable during SSR — read it after mount to avoid a
  // hydration mismatch and a flash of a banner that should be hidden.
  useEffect(() => {
    setMounted(true);
    const raw = localStorage.getItem(DISMISS_KEY);
    if (raw) {
      const ts = Number(raw);
      if (Number.isFinite(ts) && Date.now() - ts < DISMISS_DURATION_MS) {
        setDismissed(true);
      }
    }
  }, []);

  if (!mounted) return null;
  if (pathname === '/profile/referral') return null;
  if (dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
  };

  return (
    <div
      role="region"
      aria-label="Реферальная программа"
      className="flex items-center gap-3 bg-gradient-to-r from-mp-blue-600 to-indigo-600 px-4 py-3 text-white"
    >
      <Gift className="hidden size-8 shrink-0 sm:block" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-tight">
          Приведи друга — получи 14 дней доступа к платформе бесплатно!
        </p>
        <p className="hidden text-xs text-white/80 sm:block">
          Больше друзей — больше пользы для бизнеса и команды.
        </p>
      </div>
      <Link
        href="/profile/referral"
        className="shrink-0 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-mp-blue-700 transition-colors hover:bg-mp-blue-50"
      >
        Пригласить друга
      </Link>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Закрыть"
        className="shrink-0 rounded-md p-1 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
      >
        <X className="size-5" />
      </button>
    </div>
  );
}
