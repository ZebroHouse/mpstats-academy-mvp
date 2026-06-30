import { describe, it, expect } from 'vitest';
import { getMarketingCta } from '@/lib/marketing-cta';

describe('getMarketingCta', () => {
  it('guest: primary = «Попробовать бесплатно» → /register', () => {
    const { primary } = getMarketingCta(false);
    expect(primary).toEqual({ label: 'Попробовать бесплатно', href: '/register' });
  });

  it('guest: diagnostic = «Пройти диагностику» → /skill-test', () => {
    const { diagnostic } = getMarketingCta(false);
    expect(diagnostic).toEqual({ label: 'Пройти диагностику', href: '/skill-test' });
  });

  it('authed: primary = «Перейти в обучение» → /dashboard', () => {
    const { primary } = getMarketingCta(true);
    expect(primary).toEqual({ label: 'Перейти в обучение', href: '/dashboard' });
  });

  it('authed: diagnostic = «Пройти диагностику» → /diagnostic', () => {
    const { diagnostic } = getMarketingCta(true);
    expect(diagnostic).toEqual({ label: 'Пройти диагностику', href: '/diagnostic' });
  });
});
