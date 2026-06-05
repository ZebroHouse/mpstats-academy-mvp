import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react';

const mockResolve = vi.fn();
const mockInvalidate = vi.fn();
const mockSearchLessons = vi.fn();
const mockListForUser = vi.fn();
const mockAddFavorite = vi.fn();
const mockRemoveFavorite = vi.fn();
// `favorited` entries use the "JOB:<jobId>" key format returned by favorite.isFavorited.
let mockFavData: { favorited: string[] } = { favorited: [] };
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/trpc/client', () => ({
  trpc: {
    useUtils: () => ({
      favorite: {
        isFavorited: { invalidate: mockInvalidate },
        list: { invalidate: mockInvalidate },
      },
      ai: { searchLessons: { fetch: mockSearchLessons } },
      material: { listForUser: { fetch: mockListForUser } },
    }),
    intent: {
      resolve: { useMutation: () => ({ mutateAsync: mockResolve, isPending: false }) },
    },
    favorite: {
      isFavorited: { useQuery: () => ({ data: mockFavData }) },
      add: {
        useMutation: (opts: { onMutate?: () => void; onSuccess?: () => void; onSettled?: () => void }) => ({
          mutate: (vars: { itemType: string; itemId: string }) => {
            mockAddFavorite(vars);
            opts.onMutate?.();
            opts.onSuccess?.();
            opts.onSettled?.();
          },
          isPending: false,
        }),
      },
      remove: {
        useMutation: (opts: { onMutate?: () => void; onSuccess?: () => void; onSettled?: () => void }) => ({
          mutate: (vars: { itemType: string; itemId: string }) => {
            mockRemoveFavorite(vars);
            opts.onMutate?.();
            opts.onSuccess?.();
            opts.onSettled?.();
          },
          isPending: false,
        }),
      },
    },
  },
}));

import { AgentSearch } from '@/components/learning/AgentSearch';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mockFavData = { favorited: [] };
});

describe('AgentSearch (solutions)', () => {
  it('renders recommended jobs with title, reason, lesson count and a favorite heart', async () => {
    mockResolve.mockResolvedValue({
      mode: 'recommend',
      answer: 'Подобрал 1 набор',
      jobs: [{
        jobId: 'j1',
        title: 'Снизить ДРР',
        slug: 'snizit-drr-wb',
        lessonCount: 5,
        reason: 'покрывает рекламу WB',
        actions: [],
      }],
    });
    const { getByPlaceholderText, getByText, getByLabelText } = render(<AgentSearch scope="solutions" />);
    fireEvent.change(getByPlaceholderText(/задачу/i), { target: { value: 'снизить ДРР' } });
    fireEvent.submit(getByPlaceholderText(/задачу/i).closest('form')!);
    await waitFor(() => expect(getByText('Снизить ДРР')).toBeDefined());
    expect(getByText('покрывает рекламу WB')).toBeDefined();
    expect(getByText('5 уроков')).toBeDefined();
    // Track button is gone — replaced by the favorite heart.
    expect(getByLabelText('Добавить в избранное')).toBeDefined();
  });

  it('renders clarify options as clickable chips', async () => {
    mockResolve.mockResolvedValue({
      mode: 'clarify',
      question: 'Что именно?',
      options: [{ label: 'Запустить', intent: 'запустить рекламу' }, { label: 'Снизить ДРР', intent: 'снизить ДРР' }],
      conversationState: 'cs1',
    });
    const { getByPlaceholderText, getByText } = render(<AgentSearch scope="solutions" />);
    fireEvent.change(getByPlaceholderText(/задачу/i), { target: { value: 'реклама' } });
    fireEvent.submit(getByPlaceholderText(/задачу/i).closest('form')!);
    await waitFor(() => expect(getByText('Что именно?')).toBeDefined());
    expect(getByText('Запустить')).toBeDefined();
    expect(getByText('Снизить ДРР')).toBeDefined();
  });

  it('adds a recommended job to favorites on heart click', async () => {
    mockResolve.mockResolvedValue({
      mode: 'recommend',
      answer: '',
      jobs: [{
        jobId: 'j1',
        title: 'X',
        slug: 'x-wb',
        lessonCount: 5,
        reason: 'r',
        actions: [],
      }],
    });
    const { getByPlaceholderText, getByLabelText } = render(<AgentSearch scope="solutions" />);
    fireEvent.change(getByPlaceholderText(/задачу/i), { target: { value: 'q' } });
    fireEvent.submit(getByPlaceholderText(/задачу/i).closest('form')!);
    await waitFor(() => expect(getByLabelText('Добавить в избранное')).toBeDefined());
    fireEvent.click(getByLabelText('Добавить в избранное'));
    expect(mockAddFavorite).toHaveBeenCalledWith({ itemType: 'JOB', itemId: 'j1' });
  });

  it('shows a filled heart for jobs already in favorites (server state)', async () => {
    mockFavData = { favorited: ['JOB:j1'] };
    mockResolve.mockResolvedValue({
      mode: 'recommend',
      answer: '',
      jobs: [{
        jobId: 'j1',
        title: 'X',
        slug: 'x-wb',
        lessonCount: 5,
        reason: 'r',
        actions: [],
      }],
    });
    const { getByPlaceholderText, getByLabelText, queryByLabelText } = render(<AgentSearch scope="solutions" />);
    fireEvent.change(getByPlaceholderText(/задачу/i), { target: { value: 'q' } });
    fireEvent.submit(getByPlaceholderText(/задачу/i).closest('form')!);
    await waitFor(() => expect(getByLabelText('Убрать из избранного')).toBeDefined());
    expect(queryByLabelText('Добавить в избранное')).toBeNull();
  });
});
