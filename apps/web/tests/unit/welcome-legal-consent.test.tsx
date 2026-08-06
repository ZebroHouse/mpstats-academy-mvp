import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';

/**
 * FIX-1 (2026-08): the onboarding legal-acceptance checkbox is shown/required
 * ONLY for users who did not consent at registration — OAuth (Yandex/Tochka)
 * and partner-entry. This suite mocks requiresLegalConsent → { required: true }
 * (the OAuth/partner path) and asserts the checkbox gates step 1.
 *
 * The email-registrant path (required:false → no checkbox, gated on goals only)
 * is covered by welcome-page.test.tsx.
 */

const mutateMock = vi.fn();
const assignMock = vi.fn();

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (_key: string): string | null => null }),
}));

vi.mock('@/lib/trpc/client', () => ({
  trpc: {
    profile: { get: { useQuery: () => ({ data: { name: 'Тест Тестов' } }) } },
    onboarding: {
      complete: { useMutation: () => ({ mutate: mutateMock, isPending: false }) },
      requiresLegalConsent: { useQuery: () => ({ data: { required: true } }) },
    },
    intent: { resolve: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) } },
  },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

import WelcomePage from '@/app/welcome/page';

beforeEach(() => {
  mutateMock.mockReset();
  assignMock.mockReset();
  vi.stubGlobal('location', { assign: assignMock, href: 'http://localhost/welcome' });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('WelcomePage — legal consent gate (OAuth/partner)', () => {
  it('shows the checkbox and blocks step 1 until it is accepted', () => {
    const { getByRole } = render(<WelcomePage />);

    // A goal alone is not enough — the legal checkbox must also be accepted.
    fireEvent.click(getByRole('button', { name: 'Увеличить продажи' }));
    expect(getByRole('button', { name: 'Продолжить' })).toBeDisabled();

    // The checkbox is present for this (OAuth/partner) user.
    const checkbox = getByRole('checkbox');
    fireEvent.click(checkbox);

    // Now that offer + PDN are accepted, step 1 can advance.
    expect(getByRole('button', { name: 'Продолжить' })).not.toBeDisabled();
  });
});
