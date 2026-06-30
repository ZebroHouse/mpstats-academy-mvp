/**
 * Marketing-surface CTA targets, derived from auth state.
 *
 * Two CTA types on the landing / marketing header:
 *  - primary: trust-first «Попробовать бесплатно» for guests (→ register/trial),
 *    «Перейти в обучение» for authed users (→ the product home /dashboard).
 *  - diagnostic: «Пройти диагностику» → /skill-test (guest explainer) or
 *    /diagnostic (authed, straight in).
 *
 * One tested place for the guest/authed branch so the landing page and V8Header
 * stay consistent.
 */

export interface CtaTarget {
  label: string;
  href: string;
}

export interface MarketingCta {
  primary: CtaTarget;
  diagnostic: CtaTarget;
}

export function getMarketingCta(isAuthed: boolean): MarketingCta {
  return {
    primary: isAuthed
      ? { label: 'Перейти в обучение', href: '/dashboard' }
      : { label: 'Попробовать бесплатно', href: '/register' },
    diagnostic: isAuthed
      ? { label: 'Пройти диагностику', href: '/diagnostic' }
      : { label: 'Пройти диагностику', href: '/skill-test' },
  };
}
