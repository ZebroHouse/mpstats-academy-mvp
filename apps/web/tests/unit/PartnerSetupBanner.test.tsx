import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';

// next/link renders a plain <a> in test env — no special mock needed
vi.mock('next/link', () => ({
  default: ({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

import { PartnerSetupBanner } from '@/components/partner/PartnerSetupBanner';

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe('PartnerSetupBanner', () => {
  it('renders nothing when neither flag is set', () => {
    const { container } = render(
      <PartnerSetupBanner email="user@example.com" needsVerify={false} needsPassword={false} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders verify CTA with resend button when needsVerify only', () => {
    const { getByText } = render(
      <PartnerSetupBanner email="user@example.com" needsVerify={true} needsPassword={false} />
    );
    expect(getByText(/Подтвердите почту/)).toBeDefined();
    expect(getByText('Отправить ссылку')).toBeDefined();
    // no password CTA
    expect(() => getByText(/Задайте пароль/)).toThrow();
  });

  it('renders password CTA with profile link when needsPassword only', () => {
    const { getByText, getByRole } = render(
      <PartnerSetupBanner email="user@example.com" needsVerify={false} needsPassword={true} />
    );
    expect(getByText(/Задайте пароль/)).toBeDefined();
    const link = getByRole('link', { name: 'Задать пароль' });
    expect(link.getAttribute('href')).toBe('/profile');
    // no verify CTA
    expect(() => getByText(/Подтвердите почту/)).toThrow();
  });

  it('renders both CTAs when both flags are set', () => {
    const { getByText, getByRole } = render(
      <PartnerSetupBanner email="user@example.com" needsVerify={true} needsPassword={true} />
    );
    expect(getByText(/Подтвердите почту/)).toBeDefined();
    expect(getByText('Отправить ссылку')).toBeDefined();
    expect(getByText(/Задайте пароль/)).toBeDefined();
    expect(getByRole('link', { name: 'Задать пароль' }).getAttribute('href')).toBe('/profile');
  });
});
