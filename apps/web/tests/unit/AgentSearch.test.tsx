import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react';

const mockResolve = vi.fn();
const mockAddJob = vi.fn();
const mockInvalidate = vi.fn();
const mockSearchLessons = vi.fn();
const mockListForUser = vi.fn();
let mockTrackData: { addedJobs?: Array<{ id: string }> } = { addedJobs: [] };
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/trpc/client', () => ({
  trpc: {
    useUtils: () => ({
      learning: { getRecommendedPath: { invalidate: mockInvalidate } },
      job: { getCatalog: { invalidate: mockInvalidate } },
      ai: { searchLessons: { fetch: mockSearchLessons } },
      material: { listForUser: { fetch: mockListForUser } },
    }),
    intent: {
      resolve: { useMutation: () => ({ mutateAsync: mockResolve, isPending: false }) },
    },
    learning: {
      getRecommendedPath: { useQuery: () => ({ data: mockTrackData }) },
      addJobToTrack: {
        useMutation: (opts: { onSuccess?: (data: unknown, vars: { jobId: string }) => void; onError?: (e: Error) => void }) => ({
          mutate: (vars: { jobId: string }) => {
            mockAddJob(vars);
            // Simulate cache update: backend adds the job → next render sees it as tracked
            mockTrackData = { addedJobs: [...(mockTrackData.addedJobs ?? []), { id: vars.jobId }] };
            opts.onSuccess?.({ added: 1 }, vars);
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
  mockTrackData = { addedJobs: [] };
});

describe('AgentSearch (solutions)', () => {
  it('renders recommended jobs with title, reason, lesson count and add-to-track button', async () => {
    mockResolve.mockResolvedValue({
      mode: 'recommend',
      answer: 'Подобрал 1 набор',
      jobs: [{
        jobId: 'j1',
        title: 'Снизить ДРР',
        slug: 'snizit-drr-wb',
        lessonCount: 5,
        reason: 'покрывает рекламу WB',
        actions: [{ type: 'add_to_track', jobId: 'j1', label: 'Положить в трек' }],
      }],
    });
    const { getByPlaceholderText, getByText } = render(<AgentSearch scope="solutions" />);
    fireEvent.change(getByPlaceholderText(/задачу/i), { target: { value: 'снизить ДРР' } });
    fireEvent.submit(getByPlaceholderText(/задачу/i).closest('form')!);
    await waitFor(() => expect(getByText('Снизить ДРР')).toBeDefined());
    expect(getByText('покрывает рекламу WB')).toBeDefined();
    expect(getByText('5 уроков')).toBeDefined();
    expect(getByText('Положить в трек')).toBeDefined();
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

  it('calls addJobToTrack on button click', async () => {
    mockResolve.mockResolvedValue({
      mode: 'recommend',
      answer: '',
      jobs: [{
        jobId: 'j1',
        title: 'X',
        slug: 'x-wb',
        lessonCount: 5,
        reason: 'r',
        actions: [{ type: 'add_to_track', jobId: 'j1', label: 'Положить в трек' }],
      }],
    });
    const { getByPlaceholderText, getByText } = render(<AgentSearch scope="solutions" />);
    fireEvent.change(getByPlaceholderText(/задачу/i), { target: { value: 'q' } });
    fireEvent.submit(getByPlaceholderText(/задачу/i).closest('form')!);
    await waitFor(() => expect(getByText('Положить в трек')).toBeDefined());
    fireEvent.click(getByText('Положить в трек'));
    expect(mockAddJob).toHaveBeenCalledWith({ jobId: 'j1' });
  });

  it('shows В плане ✓ for jobs already in the user plan (server state)', async () => {
    mockTrackData = { addedJobs: [{ id: 'j1' }] };
    mockResolve.mockResolvedValue({
      mode: 'recommend',
      answer: '',
      jobs: [{
        jobId: 'j1',
        title: 'X',
        slug: 'x-wb',
        lessonCount: 5,
        reason: 'r',
        actions: [{ type: 'add_to_track', jobId: 'j1', label: 'Положить в трек' }],
      }],
    });
    const { getByPlaceholderText, getByText, queryByText } = render(<AgentSearch scope="solutions" />);
    fireEvent.change(getByPlaceholderText(/задачу/i), { target: { value: 'q' } });
    fireEvent.submit(getByPlaceholderText(/задачу/i).closest('form')!);
    await waitFor(() => expect(getByText('В плане ✓')).toBeDefined());
    expect(queryByText('Положить в трек')).toBeNull();
  });
});
