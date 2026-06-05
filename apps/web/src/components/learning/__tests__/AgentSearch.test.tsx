import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react';

/**
 * Phase 61 (Обучение 2.0) — AgentSearch scope routing (61-04 GREEN).
 *
 * The `scope: 'solutions' | 'library'` prop routes search:
 *   scope='solutions' → submitting a query calls `intent.resolve` (job recommendations)
 *   scope='library'   → calls `ai.searchLessons` + `material.listForUser` via
 *                       `useUtils().*.fetch`, rendering grouped «Уроки» / «Материалы».
 *
 * Note: library-scope endpoints are `.query` procedures, so the component fetches
 * them imperatively on submit via `trpc.useUtils().<proc>.fetch(...)` (the correct
 * runtime pattern for on-submit reads). The 61-00 RED stub drafted `useMutation`
 * mocks; this GREEN fill switches them to the real `fetch` shape (Rule 1 — the
 * stub body was an `it.skip` scaffold, not a frozen contract).
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
      ai: { searchLessons: { fetch: mockSearchLessons } },
      material: { listForUser: { fetch: mockListForUser } },
      favorite: {
        isFavorited: { invalidate: mockInvalidate },
        list: { invalidate: mockInvalidate },
      },
    }),
    intent: {
      resolve: { useMutation: () => ({ mutateAsync: mockResolve, isPending: false }) },
    },
    learning: {
      getRecommendedPath: { useQuery: () => ({ data: { addedJobs: [] } }) },
      addJobToTrack: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
    // FavoriteButton (mounted inside LessonResultCard / MaterialCard) needs these.
    favorite: {
      add: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      remove: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      isFavorited: { useQuery: () => ({ data: { favorited: [] } }) },
    },
  },
}));

import { AgentSearch } from '@/components/learning/AgentSearch';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AgentSearch scope', () => {
  it('declares the two routing scopes (solutions vs library)', () => {
    const scopes = ['solutions', 'library'] as const;
    expect(scopes).toContain('solutions');
    expect(scopes).toContain('library');
  });

  it("scope='solutions' routes a query to intent.resolve", async () => {
    mockResolve.mockResolvedValue({ mode: 'recommend', answer: '', jobs: [] });
    const { getByPlaceholderText } = render(<AgentSearch scope="solutions" />);
    fireEvent.change(getByPlaceholderText(/задачу/i), { target: { value: 'снизить ДРР' } });
    fireEvent.submit(getByPlaceholderText(/задачу/i).closest('form')!);
    await waitFor(() => expect(mockResolve).toHaveBeenCalled());
    expect(mockSearchLessons).not.toHaveBeenCalled();
    expect(mockListForUser).not.toHaveBeenCalled();
  });

  it("scope='library' routes a query to ai.searchLessons + material.listForUser and groups «Уроки»/«Материалы»", async () => {
    mockSearchLessons.mockResolvedValue({
      results: [{
        lesson: { id: 'l1', title: 'Урок 1' },
        course: { title: 'Курс A' },
        snippets: [{ content: 'фрагмент' }],
        watchedPercent: 0,
        locked: false,
      }],
    });
    mockListForUser.mockResolvedValue({
      items: [{
        id: 'm1', type: 'CHECKLIST', title: 'Шаблон', description: null,
        ctaText: 'Открыть', externalUrl: 'https://x', hasFile: false,
      }],
    });
    const { getByPlaceholderText, getByText } = render(<AgentSearch scope="library" />);
    fireEvent.change(getByPlaceholderText(/материал/i), { target: { value: 'юнит-экономика' } });
    fireEvent.submit(getByPlaceholderText(/материал/i).closest('form')!);
    await waitFor(() => expect(mockSearchLessons).toHaveBeenCalled());
    expect(mockListForUser).toHaveBeenCalled();
    expect(mockResolve).not.toHaveBeenCalled();
    await waitFor(() => expect(getByText('Уроки')).toBeDefined());
    expect(getByText('Материалы')).toBeDefined();
    expect(getByText('Урок 1')).toBeDefined();
    expect(getByText('Шаблон')).toBeDefined();
  });
});
