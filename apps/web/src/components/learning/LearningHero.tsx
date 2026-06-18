'use client';

import type { ReactNode } from 'react';

type HeroScope = 'solutions' | 'library';

interface LearningHeroProps {
  scope: HeroScope;
  headline: string;
  subline?: string;
  /** Scoped AgentSearch + (optionally) the filter-chip row. */
  children: ReactNode;
}

/**
 * Hero search block (UI-SPEC §2, D-09). Owns the visual chrome — brand gradient
 * background, display headline, optional sub-line — and renders the scoped
 * AgentSearch (passed as children) inside a large search slot. Does NOT fork
 * AgentSearch; the page wraps `<AgentSearch scope=… size="hero" />` as a child.
 *
 * `data-tour="learn-search"` is mounted on the search slot so the onboarding
 * tour anchors at the hero input (D-10).
 */
export function LearningHero({ scope, headline, subline, children }: LearningHeroProps) {
  return (
    <section
      className="rounded-3xl px-5 py-7 md:px-10 md:py-9 animate-slide-up text-white"
      style={{ backgroundColor: '#0F172A' }}
      aria-label={scope === 'solutions' ? 'Поиск решений' : 'Поиск по базе знаний'}
    >
      <h1 className="text-[26px] sm:text-[32px] font-bold leading-tight tracking-tight">{headline}</h1>
      {subline && <p className="text-white/60 text-[15px] sm:text-[16px] mt-2">{subline}</p>}
      <div data-tour="learn-search" className="mt-5">
        {children}
      </div>
    </section>
  );
}
