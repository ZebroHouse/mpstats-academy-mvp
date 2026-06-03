import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * Wave 0 RED stub — Phase 61 (Обучение 2.0).
 *
 * The `scope: 'solutions' | 'library'` prop on <AgentSearch> does NOT exist yet;
 * it lands in 61-03. Today AgentSearch hardcodes `surface: 'learn'` and always
 * calls `intent.resolve`. These assertions are AUTHORED now so 61-03 has a
 * concrete `<automated>` target (Nyquist Dim 8).
 *
 * Target behavior (61-03):
 *   scope='solutions' → submitting a query calls `intent.resolve` (job recommendations)
 *   scope='library'   → calls `ai.searchLessons` + `material.listForUser`,
 *                       rendering grouped «Уроки» / «Материалы»
 *
 * Behavioral bodies are `it.skip(... 'pending 61-03')` so the suite COLLECTS
 * green. The trpc-mock harness mirrors apps/web/tests/unit/AgentSearch.test.tsx;
 * 61-03 wires the `library`-scope mocks (ai.searchLessons / material.listForUser)
 * and flips skip → it.
 */

const mockResolve = vi.fn();
const mockSearchLessons = vi.fn();
const mockListForUser = vi.fn();
const mockInvalidate = vi.fn();

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/trpc/client', () => ({
  trpc: {
    useUtils: () => ({
      learning: { getRecommendedPath: { invalidate: mockInvalidate } },
      job: { getCatalog: { invalidate: mockInvalidate } },
    }),
    intent: {
      resolve: { useMutation: () => ({ mutateAsync: mockResolve, isPending: false }) },
    },
    // library-scope dependencies (consumed once scope='library' lands in 61-03):
    ai: {
      searchLessons: { useMutation: () => ({ mutateAsync: mockSearchLessons, isPending: false }) },
    },
    material: {
      listForUser: { useMutation: () => ({ mutateAsync: mockListForUser, isPending: false }) },
    },
    learning: {
      getRecommendedPath: { useQuery: () => ({ data: { addedJobs: [] } }) },
      addJobToTrack: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AgentSearch scope', () => {
  it('declares the two routing scopes (solutions vs library)', () => {
    // The prop union the component will accept in 61-03.
    const scopes = ['solutions', 'library'] as const;
    expect(scopes).toContain('solutions');
    expect(scopes).toContain('library');
  });

  it.skip("scope='solutions' routes a query to intent.resolve — pending 61-03", async () => {
    // GREEN (61-03):
    //   const { AgentSearch } = await import('@/components/learning/AgentSearch');
    //   mockResolve.mockResolvedValue({ mode: 'recommend', answer: '', jobs: [] });
    //   const { getByPlaceholderText } = render(<AgentSearch scope="solutions" />);
    //   fireEvent.change(getByPlaceholderText(/тему/i), { target: { value: 'снизить ДРР' } });
    //   fireEvent.submit(getByPlaceholderText(/тему/i).closest('form')!);
    //   await waitFor(() => expect(mockResolve).toHaveBeenCalled());
    //   expect(mockSearchLessons).not.toHaveBeenCalled();
    expect(mockResolve).toBeDefined();
  });

  it.skip("scope='library' routes a query to ai.searchLessons + material.listForUser and groups «Уроки»/«Материалы» — pending 61-03", async () => {
    // GREEN (61-03):
    //   mockSearchLessons.mockResolvedValue([{ id: 'l1', title: 'Урок 1' }]);
    //   mockListForUser.mockResolvedValue({ items: [{ id: 'm1', title: 'Шаблон' }] });
    //   const { getByPlaceholderText, getByText } = render(<AgentSearch scope="library" />);
    //   fireEvent.change(getByPlaceholderText(/тему/i), { target: { value: 'юнит-экономика' } });
    //   fireEvent.submit(getByPlaceholderText(/тему/i).closest('form')!);
    //   await waitFor(() => expect(mockSearchLessons).toHaveBeenCalled());
    //   expect(mockListForUser).toHaveBeenCalled();
    //   expect(mockResolve).not.toHaveBeenCalled();
    //   expect(getByText('Уроки')).toBeDefined();
    //   expect(getByText('Материалы')).toBeDefined();
    expect(mockSearchLessons).toBeDefined();
    expect(mockListForUser).toBeDefined();
  });
});
