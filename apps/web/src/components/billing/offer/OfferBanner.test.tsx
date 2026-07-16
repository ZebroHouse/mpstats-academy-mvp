import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { OfferBanner } from './OfferBanner';

beforeEach(() => {
  sessionStorage.clear();
});

describe('OfferBanner', () => {
  it('trial_active: shows the offer headline, a live timer, and a /pricing CTA', async () => {
    render(<OfferBanner state="trial_active" endsAt={new Date(Date.now() + 2 * 86400000).toISOString()} />);
    await waitFor(() => expect(screen.getByText(/2 месяца по цене одного/i)).toBeInTheDocument());
    const cta = screen.getByRole('link', { name: /забрать предложение/i });
    expect(cta).toHaveAttribute('href', '/pricing');
    expect(screen.getByTestId('offer-countdown').textContent).toMatch(/\d/);
  });

  it('grace: still shows a timer and the claim CTA', async () => {
    render(<OfferBanner state="grace" endsAt={new Date(Date.now() + 3 * 3600000).toISOString()} />);
    await waitFor(() => expect(screen.getByRole('link', { name: /забрать предложение/i })).toBeInTheDocument());
    expect(screen.getByTestId('offer-countdown')).toBeInTheDocument();
  });

  it('expired: generic upsell, no timer, "Смотреть тарифы" → /pricing', async () => {
    render(<OfferBanner state="expired" endsAt={null} />);
    await waitFor(() => expect(screen.getByText(/откройте все уроки платформы/i)).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /смотреть тарифы/i })).toHaveAttribute('href', '/pricing');
    expect(screen.queryByTestId('offer-countdown')).not.toBeInTheDocument();
  });

  it('stays hidden when already dismissed this session', async () => {
    sessionStorage.setItem('offerBannerDismissed', '1');
    const { container } = render(<OfferBanner state="trial_active" endsAt={new Date(Date.now() + 86400000).toISOString()} />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
