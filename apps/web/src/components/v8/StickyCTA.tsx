'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

const BLUE = '#2C4FF8';
const BLUE_HOVER = '#1D39C1';

interface StickyCTAProps {
  href: string;
  buttonLabel?: string;
  title: string;
  subtitle?: string;
  /** Scroll Y threshold (px) before bar appears. */
  showAfter?: number;
  /**
   * Id of a section whose visibility hides the bar. The landing passes the final
   * CTA section's id so the bar disappears exactly when that same-message block is
   * on screen — no overlap with the footer, no duplicate.
   */
  hideWhenId?: string;
}

/** Pure visibility rule: shown once scrolled past, hidden when the final section shows. */
export function computeStickyVisible(scrolledPast: boolean, finalVisible: boolean): boolean {
  return scrolledPast && !finalVisible;
}

export function StickyCTA({
  href,
  buttonLabel = 'Пройти диагностику',
  title,
  subtitle,
  showAfter = 700,
  hideWhenId,
}: StickyCTAProps) {
  const [scrolledPast, setScrolledPast] = useState(false);
  const [finalVisible, setFinalVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolledPast(window.scrollY > showAfter);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [showAfter]);

  // Hide the bar while the final CTA section (same message) is in view.
  useEffect(() => {
    if (!hideWhenId) return;
    const el = document.getElementById(hideWhenId);
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      ([entry]) => setFinalVisible(entry.isIntersecting),
      { threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hideWhenId]);

  const visible = computeStickyVisible(scrolledPast, finalVisible);

  return (
    <div
      aria-hidden={!visible}
      className="fixed bottom-3 sm:bottom-4 left-0 right-0 z-40 px-3 sm:px-4 pointer-events-none"
      style={{
        transform: visible ? 'translateY(0)' : 'translateY(140%)',
        transition: 'transform 500ms cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      <div
        className="max-w-[880px] mx-auto pointer-events-auto flex items-center justify-between gap-3 rounded-full pl-5 sm:pl-6 pr-2 sm:pr-2.5 py-2 sm:py-2.5"
        style={{
          backgroundColor: 'rgba(15,23,42,0.95)',
          boxShadow: '0 10px 30px rgba(15,23,42,0.25)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <div className="flex-1 min-w-0">
          <p className="text-[13px] sm:text-[14px] font-medium text-white truncate leading-tight">
            {title}
          </p>
          {subtitle && (
            <p className="text-[11px] sm:text-[12px] text-white/60 truncate leading-tight mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
        <Link
          href={href}
          className="flex-shrink-0 inline-flex items-center justify-center rounded-full h-[40px] sm:h-[44px] px-4 sm:px-6 text-[13px] sm:text-[14px] font-medium text-white transition-colors whitespace-nowrap"
          style={{ backgroundColor: BLUE }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = BLUE_HOVER)}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = BLUE)}
        >
          {buttonLabel}
        </Link>
      </div>
    </div>
  );
}
