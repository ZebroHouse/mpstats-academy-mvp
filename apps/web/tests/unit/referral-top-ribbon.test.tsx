import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';

// useSearchParams mock — controllable per test via getMock.
const getMock = vi.fn<(key: string) => string | null>(() => null);
vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: getMock }),
}));

// next/link renders a plain <a> in test env.
vi.mock('next/link', () => ({
  default: ({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

// trpc.referral.validateCode.useQuery returns whatever the test stages in mockValidation.
type ValidateData = {
  valid: boolean;
  referrerName: string | null;
  trialDays: number | null;
  type: 'user' | 'ambassador' | null;
};
let mockValidation: { data?: ValidateData } = {};
vi.mock('@/lib/trpc/client', () => ({
  trpc: {
    referral: {
      validateCode: { useQuery: () => mockValidation },
    },
  },
}));

import { ReferralTopRibbon } from '@/components/referral/ReferralTopRibbon';

beforeEach(() => {
  getMock.mockReturnValue(null);
  mockValidation = {};
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('ReferralTopRibbon', () => {
  it('renders nothing without a ?ref= code', () => {
    const { container } = render(<ReferralTopRibbon />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing for an invalid code shape', () => {
    getMock.mockReturnValue('abc');
    mockValidation = { data: { valid: true, referrerName: 'Андрей', trialDays: null, type: 'user' } };
    const { container } = render(<ReferralTopRibbon />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when validateCode reports valid:false', () => {
    getMock.mockReturnValue('REF-ABC123');
    mockValidation = { data: { valid: false, referrerName: null, trialDays: null, type: null } };
    const { container } = render(<ReferralTopRibbon />);
    expect(container.innerHTML).toBe('');
  });

  it('renders a user-code ribbon with the 14-day fallback, label and register CTA', () => {
    getMock.mockReturnValue('ref-abc123'); // lower-case → must be upper-cased before use
    mockValidation = { data: { valid: true, referrerName: 'Андрей', trialDays: null, type: 'user' } };
    const { getByText, getByRole } = render(<ReferralTopRibbon />);

    expect(getByText(/Вам подарили 14 дней полного доступа/)).toBeDefined();
    expect(getByText(/по приглашению: Андрей/)).toBeDefined();

    const cta = getByRole('link', { name: /Забрать 14 дней/ });
    expect(cta.getAttribute('href')).toBe('/register?ref=REF-ABC123');
  });

  it('renders the ambassador custom day count', () => {
    getMock.mockReturnValue('AMB-XYZ99');
    mockValidation = { data: { valid: true, referrerName: 'Блогер', trialDays: 21, type: 'ambassador' } };
    const { getByText } = render(<ReferralTopRibbon />);

    expect(getByText(/Вам подарили 21 дней полного доступа/)).toBeDefined();
    expect(getByText(/Забрать 21 дней/)).toBeDefined();
  });

  it('omits the "по приглашению" tail when referrerName is null', () => {
    getMock.mockReturnValue('REF-ABC123');
    mockValidation = { data: { valid: true, referrerName: null, trialDays: null, type: 'user' } };
    const { getByText, queryByText } = render(<ReferralTopRibbon />);

    expect(getByText(/Вам подарили 14 дней полного доступа/)).toBeDefined();
    expect(queryByText(/по приглашению/)).toBeNull();
  });

  it('hides the ribbon and remembers dismissal when × is clicked', () => {
    getMock.mockReturnValue('REF-ABC123');
    mockValidation = { data: { valid: true, referrerName: 'Андрей', trialDays: null, type: 'user' } };
    const { getByLabelText, container } = render(<ReferralTopRibbon />);

    fireEvent.click(getByLabelText('Закрыть'));
    expect(container.innerHTML).toBe('');
    expect(sessionStorage.getItem('ref_ribbon_dismissed')).toBe('1');
  });
});
