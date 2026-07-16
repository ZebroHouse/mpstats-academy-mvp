import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { OfferStrip } from './OfferStrip';

describe('OfferStrip', () => {
  it('trial_active: shows the offer line + a ticking timer', async () => {
    render(<OfferStrip state="trial_active" endsAt={new Date(Date.now() + 2 * 86400000).toISOString()} />);
    await waitFor(() => expect(screen.getByText(/2 месяца по цене одного/i)).toBeInTheDocument());
    expect(screen.getByTestId('offer-strip-timer').textContent).toMatch(/\d/);
  });

  it('grace: shows the "ещё" phrasing', async () => {
    render(<OfferStrip state="grace" endsAt={new Date(Date.now() + 3 * 3600000).toISOString()} />);
    await waitFor(() => expect(screen.getByText(/предложение действует ещё/i)).toBeInTheDocument());
  });

  it('none/expired: renders nothing', () => {
    const { container } = render(<OfferStrip state="none" endsAt={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
