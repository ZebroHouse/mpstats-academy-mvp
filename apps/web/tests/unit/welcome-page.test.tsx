import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';

/**
 * The wizard now completes on step 3 (no fork) and hard-navigates to /dashboard,
 * where a cold user gets the «Твой первый урок» hero. A partner ?next= path
 * overrides that default.
 *
 * Regression guard for the 2026-05-19 prod incident: completing the wizard with
 * a soft `router.push` bounced the user back into the wizard in a loop. The
 * (main) layout guard redirects to /welcome while onboardingCompletedAt is null,
 * and Next's client Router Cache replayed a stale pre-onboarding render of that
 * guard.
 *
 * Fix — completion must navigate with a hard load (window.location.assign) so the
 * Router Cache is discarded and the guard re-renders server-side. This test
 * fails if anyone reverts completion to router.push.
 */

const mutateMock = vi.fn();
const assignMock = vi.fn();

// useSearchParams mock — returns empty params by default; individual tests may
// override this mock to simulate ?next= being present.
const searchParamsGetMock = vi.fn((_key: string): string | null => null);

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: searchParamsGetMock }),
}));

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
    intent: {
      resolve: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
  },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

import WelcomePage from '@/app/welcome/page';

beforeEach(() => {
  mutateMock.mockReset();
  assignMock.mockReset();
  searchParamsGetMock.mockReset();
  searchParamsGetMock.mockReturnValue(null); // default: no ?next=
  vi.stubGlobal('location', { assign: assignMock, href: 'http://localhost/welcome' });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('WelcomePage — completion navigation', () => {
  it('leaves the wizard with a hard navigation, not a soft router.push', () => {
    const { getByRole } = render(<WelcomePage />);

    // Step 1 → 2 → 3 — each step needs an answer before advancing.
    fireEvent.click(getByRole('button', { name: 'Увеличить продажи' }));
    fireEvent.click(getByRole('button', { name: 'Продолжить' }));
    fireEvent.click(getByRole('button', { name: 'Wildberries' }));
    fireEvent.click(getByRole('button', { name: 'Далее →' }));
    fireEvent.click(getByRole('button', { name: /Только присматриваюсь/ }));

    // Step 3 primary button now finishes the wizard.
    fireEvent.click(getByRole('button', { name: 'Начать обучение' }));

    // onboarding.complete ran; navigation is deferred to its onSuccess.
    expect(mutateMock).toHaveBeenCalledTimes(1);
    const onSuccess = mutateMock.mock.calls[0][1].onSuccess as () => void;
    expect(assignMock).not.toHaveBeenCalled(); // not before the write succeeds
    onSuccess();

    // Must be a full-page load to bust Next's Router Cache.
    expect(assignMock).toHaveBeenCalledWith('/dashboard');
  });
});

describe('WelcomePage — ?next= partner destination', () => {
  it('navigates to ?next= path instead of fork default after wizard completion', () => {
    // Simulate arriving from the partner entry route with ?next=/mpstats-tools/lesson-42
    searchParamsGetMock.mockImplementation((key: string) =>
      key === 'next' ? '/mpstats-tools/lesson-42' : null,
    );

    const { getByRole } = render(<WelcomePage />);

    // Walk through all 3 steps (each requires an answer).
    fireEvent.click(getByRole('button', { name: 'Увеличить продажи' }));
    fireEvent.click(getByRole('button', { name: 'Продолжить' }));
    fireEvent.click(getByRole('button', { name: 'Wildberries' }));
    fireEvent.click(getByRole('button', { name: 'Далее →' }));
    fireEvent.click(getByRole('button', { name: /Только присматриваюсь/ }));

    // Complete on step 3 (the default /dashboard should be overridden by ?next=).
    fireEvent.click(getByRole('button', { name: 'Начать обучение' }));

    expect(mutateMock).toHaveBeenCalledTimes(1);
    const onSuccess = mutateMock.mock.calls[0][1].onSuccess as () => void;
    onSuccess();

    // Must navigate to the partner target, not the default (/dashboard).
    expect(assignMock).toHaveBeenCalledWith('/mpstats-tools/lesson-42');
  });

  it('ignores ?next= if it is an absolute URL (open-redirect guard)', () => {
    searchParamsGetMock.mockImplementation((key: string) =>
      key === 'next' ? 'https://evil.com/steal' : null,
    );

    const { getByRole } = render(<WelcomePage />);

    fireEvent.click(getByRole('button', { name: 'Увеличить продажи' }));
    fireEvent.click(getByRole('button', { name: 'Продолжить' }));
    fireEvent.click(getByRole('button', { name: 'Wildberries' }));
    fireEvent.click(getByRole('button', { name: 'Далее →' }));
    fireEvent.click(getByRole('button', { name: /Только присматриваюсь/ }));

    fireEvent.click(getByRole('button', { name: 'Начать обучение' }));

    expect(mutateMock).toHaveBeenCalledTimes(1);
    const onSuccess = mutateMock.mock.calls[0][1].onSuccess as () => void;
    onSuccess();

    // The absolute URL must be rejected; fall back to the default (/dashboard).
    expect(assignMock).toHaveBeenCalledWith('/dashboard');
  });
});

describe('WelcomePage — required answers per step', () => {
  it('blocks each step until an answer is chosen', () => {
    const { getByRole } = render(<WelcomePage />);

    // Step 1: no goal selected → "Продолжить" is disabled.
    expect(getByRole('button', { name: 'Продолжить' })).toBeDisabled();
    fireEvent.click(getByRole('button', { name: 'Увеличить продажи' }));
    expect(getByRole('button', { name: 'Продолжить' })).not.toBeDisabled();
    fireEvent.click(getByRole('button', { name: 'Продолжить' }));

    // Step 2: no marketplace selected → "Далее →" is disabled.
    expect(getByRole('button', { name: 'Далее →' })).toBeDisabled();
    fireEvent.click(getByRole('button', { name: 'Wildberries' }));
    expect(getByRole('button', { name: 'Далее →' })).not.toBeDisabled();
    fireEvent.click(getByRole('button', { name: 'Далее →' }));

    // Step 3: no experience selected → "Начать обучение" is disabled.
    expect(getByRole('button', { name: 'Начать обучение' })).toBeDisabled();
    fireEvent.click(getByRole('button', { name: /Только присматриваюсь/ }));
    expect(getByRole('button', { name: 'Начать обучение' })).not.toBeDisabled();
  });

  it('accepts free-text intent as a step 1 answer', () => {
    const { getByRole, getByPlaceholderText } = render(<WelcomePage />);

    expect(getByRole('button', { name: 'Продолжить' })).toBeDisabled();
    fireEvent.change(getByPlaceholderText('Напишите, и мы поможем подобрать материалы…'), {
      target: { value: 'хочу разобраться с рекламой' },
    });
    expect(getByRole('button', { name: 'Продолжить' })).not.toBeDisabled();
  });
});
