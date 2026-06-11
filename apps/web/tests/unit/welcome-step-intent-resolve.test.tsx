import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';

/**
 * Smoke test: after submitting StepIntent with non-empty goalText,
 * intent.resolve.useMutation().mutate is called with
 * { query: <text>, surface: 'welcome' } — Task 10, Track B.
 */

const completeMutateMock = vi.fn();
const intentResolveMutateMock = vi.fn();
const assignMock = vi.fn();

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (_key: string) => null }),
}));

vi.mock('@/lib/trpc/client', () => ({
  trpc: {
    profile: {
      get: { useQuery: () => ({ data: { name: 'Тест Тестов' } }) },
    },
    onboarding: {
      complete: {
        useMutation: () => ({ mutate: completeMutateMock, isPending: false }),
      },
    },
    intent: {
      resolve: {
        useMutation: () => ({ mutate: intentResolveMutateMock, isPending: false }),
      },
    },
  },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

import WelcomePage from '@/app/welcome/page';

beforeEach(() => {
  completeMutateMock.mockReset();
  intentResolveMutateMock.mockReset();
  assignMock.mockReset();
  vi.stubGlobal('location', { assign: assignMock, href: 'http://localhost/welcome' });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('WelcomePage — intent.resolve wiring on step 1 exit', () => {
  it('fires intent.resolve with the typed goalText and surface:welcome when advancing from step 1', () => {
    const { getByRole, getByPlaceholderText } = render(<WelcomePage />);

    // Type an intent in the textarea on step 1.
    const textarea = getByPlaceholderText('Напишите, и мы поможем подобрать материалы…');
    fireEvent.change(textarea, { target: { value: 'хочу снизить ДРР на WB' } });

    // Click "Продолжить" to advance from step 1 → 2.
    fireEvent.click(getByRole('button', { name: 'Продолжить' }));

    // intent.resolve must have been fired with the correct payload.
    expect(intentResolveMutateMock).toHaveBeenCalledTimes(1);
    expect(intentResolveMutateMock).toHaveBeenCalledWith(
      { query: 'хочу снизить ДРР на WB', surface: 'welcome' },
    );
  });

  it('does NOT fire intent.resolve when goalText is empty', () => {
    const { getByRole } = render(<WelcomePage />);

    // No text entered — advance from step 1 with empty goalText.
    fireEvent.click(getByRole('button', { name: 'Продолжить' }));

    expect(intentResolveMutateMock).not.toHaveBeenCalled();
  });

  it('still advances to step 2 and does not break the existing onboarding.complete flow', () => {
    const { getByRole } = render(<WelcomePage />);

    // Advance through all steps to the fork. Each step requires an answer before
    // advancing (onboarding hotfix dc645c7 — "require an answer on each step"),
    // so select one per step, mirroring welcome-page.test.tsx.
    fireEvent.click(getByRole('button', { name: 'Увеличить продажи' }));
    fireEvent.click(getByRole('button', { name: 'Продолжить' }));
    fireEvent.click(getByRole('button', { name: 'Wildberries' }));
    fireEvent.click(getByRole('button', { name: 'Далее →' }));
    fireEvent.click(getByRole('button', { name: /Только присматриваюсь/ }));
    fireEvent.click(getByRole('button', { name: 'Далее →' }));

    // On the fork, choose the diagnostic path.
    fireEvent.click(getByRole('button', { name: 'Пройти диагностику' }));

    // onboarding.complete must still be called (existing flow intact).
    expect(completeMutateMock).toHaveBeenCalledTimes(1);
  });
});
