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
      className="bg-mp-hero-gradient rounded-xl px-4 py-6 md:px-6 md:py-8 animate-slide-up"
      aria-label={scope === 'solutions' ? 'Поиск решений' : 'Поиск по базе знаний'}
    >
      <h1 className="text-display-sm text-mp-gray-900">{headline}</h1>
      {subline && <p className="text-body text-mp-gray-700 mt-1">{subline}</p>}
      <div data-tour="learn-search" className="mt-5">
        {children}
      </div>
    </section>
  );
}
