import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react';

const mockResolve = vi.fn();
const mockAddJob = vi.fn();
vi.mock('@/lib/trpc/client', () => ({
  trpc: {
    intent: { resolve: { useMutation: () => ({ mutateAsync: mockResolve, isPending: false }) } },
    learning: { addJobToTrack: { useMutation: () => ({ mutateAsync: mockAddJob, isPending: false }) } },
  },
}));

import { AgentSearch } from '@/components/learning/AgentSearch';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('AgentSearch', () => {
  it('renders recommended jobs with reasons and add-to-track buttons', async () => {
    mockResolve.mockResolvedValue({
      mode: 'recommend',
      answer: 'Подобрал 1 набор',
      jobs: [{ jobId: 'j1', reason: 'покрывает рекламу WB', actions: [{ type: 'add_to_track', jobId: 'j1', label: 'Положить в трек' }] }],
    });
    const { getByPlaceholderText, getByText } = render(<AgentSearch jobsById={{ j1: { title: 'Снизить ДРР', lessonCount: 5, slug: 'snizit-drr-wb' } }} />);
    fireEvent.change(getByPlaceholderText(/тему/i), { target: { value: 'снизить ДРР' } });
    fireEvent.submit(getByPlaceholderText(/тему/i).closest('form')!);
    await waitFor(() => expect(getByText('Снизить ДРР')).toBeDefined());
    expect(getByText('покрывает рекламу WB')).toBeDefined();
    expect(getByText('Положить в трек')).toBeDefined();
  });

  it('renders clarify options as clickable chips', async () => {
    mockResolve.mockResolvedValue({
      mode: 'clarify',
      question: 'Что именно?',
      options: [{ label: 'Запустить', intent: 'запустить рекламу' }, { label: 'Снизить ДРР', intent: 'снизить ДРР' }],
      conversationState: 'cs1',
    });
    const { getByPlaceholderText, getByText } = render(<AgentSearch jobsById={{}} />);
    fireEvent.change(getByPlaceholderText(/тему/i), { target: { value: 'реклама' } });
    fireEvent.submit(getByPlaceholderText(/тему/i).closest('form')!);
    await waitFor(() => expect(getByText('Что именно?')).toBeDefined());
    expect(getByText('Запустить')).toBeDefined();
    expect(getByText('Снизить ДРР')).toBeDefined();
  });

  it('calls addJobToTrack on button click', async () => {
    mockResolve.mockResolvedValue({
      mode: 'recommend', answer: '', jobs: [
        { jobId: 'j1', reason: 'r', actions: [{ type: 'add_to_track', jobId: 'j1', label: 'Положить в трек' }] },
      ],
    });
    mockAddJob.mockResolvedValue({ added: 5 });
    const { getByPlaceholderText, getByText } = render(<AgentSearch jobsById={{ j1: { title: 'X', lessonCount: 5, slug: 'x-wb' } }} />);
    fireEvent.change(getByPlaceholderText(/тему/i), { target: { value: 'q' } });
    fireEvent.submit(getByPlaceholderText(/тему/i).closest('form')!);
    await waitFor(() => expect(getByText('Положить в трек')).toBeDefined());
    fireEvent.click(getByText('Положить в трек'));
    await waitFor(() => expect(mockAddJob).toHaveBeenCalledWith({ jobId: 'j1' }));
  });
});
