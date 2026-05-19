import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';

/**
 * Regression test for the 2026-05-19 prod incident: completing the wizard and
 * choosing a fork path bounced the user back to the wizard in a loop.
 *
 * Root cause — the fork navigated with a soft `router.push`. The (main) layout
 * guard redirects to /welcome while onboardingCompletedAt is null, and Next's
 * client Router Cache replayed a stale pre-onboarding render of that guard.
 *
 * Fix — the fork must navigate with a hard load (window.location.assign) so the
 * Router Cache is discarded and the guard re-renders server-side. This test
 * fails if anyone reverts the fork to router.push.
 */

const mutateMock = vi.fn();
const assignMock = vi.fn();

vi.mock('@/lib/trpc/client', () => ({
  trpc: {
    profile: {
      get: { useQuery: () => ({ data: { name: 'Тест Тестов' } }) },
    },
    onboarding: {
      complete: {
        useMutation: () => ({ mutate: mutateMock, isPending: false }),
      },
    },
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

describe('WelcomePage — fork navigation', () => {
  it('leaves the wizard with a hard navigation, not a soft router.push', () => {
    const { getByRole } = render(<WelcomePage />);

    // Step 1 → 2 → 3 → fork (the next button never blocks).
    fireEvent.click(getByRole('button', { name: 'Продолжить' }));
    fireEvent.click(getByRole('button', { name: 'Далее →' }));
    fireEvent.click(getByRole('button', { name: 'Далее →' }));

    // On the fork, choose the diagnostic path.
    fireEvent.click(getByRole('button', { name: 'Пройти диагностику' }));

    // onboarding.complete ran; navigation is deferred to its onSuccess.
    expect(mutateMock).toHaveBeenCalledTimes(1);
    const onSuccess = mutateMock.mock.calls[0][1].onSuccess as () => void;
    expect(assignMock).not.toHaveBeenCalled(); // not before the write succeeds
    onSuccess();

    // Must be a full-page load to bust Next's Router Cache.
    expect(assignMock).toHaveBeenCalledWith('/diagnostic');
  });
});
