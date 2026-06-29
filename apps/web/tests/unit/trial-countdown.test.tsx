import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

// next/link renders a plain <a> in test env, forwarding all props (data-*, aria-*).
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

// trpc.billing.getSubscription.useQuery returns whatever the test stages in mockSub.
type SubData = { status: string; currentPeriodEnd: string; cpSubscriptionId?: string | null } | null;
let mockSub: { data?: SubData } = {};
vi.mock('@/lib/trpc/client', () => ({
  trpc: {
    billing: {
      getSubscription: { useQuery: () => mockSub },
    },
  },
}));

import { TrialCountdown, trialDaysPhrase } from '@/components/billing/TrialCountdown';

/** Date N days into the future, minus 1h so Math.ceil lands on exactly N. */
function daysFromNow(n: number): string {
  return new Date(Date.now() + n * 86_400_000 - 3_600_000).toISOString();
}

beforeEach(() => {
  mockSub = {};
});

afterEach(() => {
  cleanup();
});

describe('trialDaysPhrase', () => {
  it('uses singular "остался 1 день" for 1', () => {
    expect(trialDaysPhrase(1)).toBe('остался 1 день');
  });
  it('uses "осталось N дня" for 2', () => {
    expect(trialDaysPhrase(2)).toBe('осталось 2 дня');
  });
  it('uses "осталось N дня" for 3', () => {
    expect(trialDaysPhrase(3)).toBe('осталось 3 дня');
  });
  it('uses "осталось N дней" for 5', () => {
    expect(trialDaysPhrase(5)).toBe('осталось 5 дней');
  });
  it('uses "дней" for the 11..14 exception (11)', () => {
    expect(trialDaysPhrase(11)).toBe('осталось 11 дней');
  });
  it('uses singular "день" for 21', () => {
    expect(trialDaysPhrase(21)).toBe('остался 21 день');
  });
});

describe('TrialCountdown', () => {
  it('renders the trial phrase and a "Продлить" link to /pricing for a 3-day TRIAL', () => {
    mockSub = { data: { status: 'TRIAL', currentPeriodEnd: daysFromNow(3) } };
    const { getByText, getByRole } = render(<TrialCountdown />);

    expect(getByText(/Триал: осталось 3 дня/)).toBeDefined();
    const cta = getByRole('link', { name: /Продлить/ });
    expect(cta.getAttribute('href')).toBe('/pricing');
  });

  it('makes the whole pill a link to /pricing (mobile payment path)', () => {
    mockSub = { data: { status: 'TRIAL', currentPeriodEnd: daysFromNow(3) } };
    const { getByTestId } = render(<TrialCountdown />);

    const pill = getByTestId('trial-countdown');
    expect(pill.tagName).toBe('A');
    expect(pill.getAttribute('href')).toBe('/pricing');
    expect(pill.getAttribute('aria-label')).toBe('Продлить подписку');
  });

  it('uses the urgent style and singular copy for a 1-day TRIAL', () => {
    mockSub = { data: { status: 'TRIAL', currentPeriodEnd: daysFromNow(1) } };
    const { getByText, getByTestId } = render(<TrialCountdown />);

    expect(getByText(/Триал: остался 1 день/)).toBeDefined();
    expect(getByTestId('trial-countdown').getAttribute('data-urgent')).toBe('true');
  });

  it('shows «Доступ: …» for promo ACTIVE access (no cpSubscriptionId)', () => {
    mockSub = { data: { status: 'ACTIVE', currentPeriodEnd: daysFromNow(5), cpSubscriptionId: null } };
    const { getByText, getByRole } = render(<TrialCountdown />);

    expect(getByText(/Доступ: осталось 5 дней/)).toBeDefined();
    const cta = getByRole('link', { name: /Продлить/ });
    expect(cta.getAttribute('href')).toBe('/pricing');
  });

  it('renders nothing for a recurrent ACTIVE subscription (cpSubscriptionId set)', () => {
    mockSub = { data: { status: 'ACTIVE', currentPeriodEnd: daysFromNow(30), cpSubscriptionId: 'sc_x' } };
    const { container } = render(<TrialCountdown />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when there is no subscription', () => {
    mockSub = { data: null };
    const { container } = render(<TrialCountdown />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing while loading (data undefined)', () => {
    mockSub = {};
    const { container } = render(<TrialCountdown />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing for PAST_DUE', () => {
    mockSub = { data: { status: 'PAST_DUE', currentPeriodEnd: daysFromNow(5) } };
    const { container } = render(<TrialCountdown />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing for CANCELLED', () => {
    mockSub = { data: { status: 'CANCELLED', currentPeriodEnd: daysFromNow(5) } };
    const { container } = render(<TrialCountdown />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing for an expired TRIAL (currentPeriodEnd in the past)', () => {
    mockSub = { data: { status: 'TRIAL', currentPeriodEnd: daysFromNow(-2) } };
    const { container } = render(<TrialCountdown />);
    expect(container.innerHTML).toBe('');
  });
});
