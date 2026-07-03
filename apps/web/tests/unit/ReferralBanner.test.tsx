import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';

const mockPathname = vi.fn(() => '/learn');
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
}));

import { ReferralBanner } from '@/components/referral/ReferralBanner';

const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  mockPathname.mockReturnValue('/learn');
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe('ReferralBanner', () => {
  it('renders the banner on a normal (main) page with empty localStorage', () => {
    const { getByText } = render(<ReferralBanner />);
    expect(getByText(/Приглашайте друзей/)).toBeDefined();
    expect(getByText('Пригласить друга')).toBeDefined();
  });

  it('renders nothing on /profile/referral', () => {
    mockPathname.mockReturnValue('/profile/referral');
    const { container } = render(<ReferralBanner />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when dismissed less than 14 days ago', () => {
    localStorage.setItem('referralBannerDismissedAt', String(Date.now() - 5 * DAY));
    const { container } = render(<ReferralBanner />);
    expect(container.innerHTML).toBe('');
  });

  it('renders the banner again when the dismissal is older than 14 days', () => {
    localStorage.setItem('referralBannerDismissedAt', String(Date.now() - 15 * DAY));
    const { getByText } = render(<ReferralBanner />);
    expect(getByText(/Приглашайте друзей/)).toBeDefined();
  });

  it('hides the banner and stores a timestamp when × is clicked', () => {
    const { getByLabelText, container } = render(<ReferralBanner />);
    fireEvent.click(getByLabelText('Закрыть'));
    expect(container.innerHTML).toBe('');
    const stored = localStorage.getItem('referralBannerDismissedAt');
    expect(stored).not.toBeNull();
    expect(Number(stored)).toBeGreaterThan(0);
  });
});
