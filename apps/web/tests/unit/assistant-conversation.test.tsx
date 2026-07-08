import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const sendMutate = vi.fn();
const resetMutate = vi.fn();
vi.mock('@/lib/trpc/client', () => ({
  trpc: {
    assistant: {
      getConversation: { useQuery: () => ({ data: { messages: [] }, isLoading: false }) },
      getQuota: { useQuery: () => ({ data: { tier: 'free', limit: 5, used: 0, remaining: 5, resetsAt: new Date().toISOString() } }) },
      sendMessage: { useMutation: (opts: any) => ({ mutate: (v: any) => { sendMutate(v); opts.onSuccess?.({ inDomain: true, answer: 'ответ', lessons: [], jobs: [], quota: { tier: 'free', limit: 5, used: 1, remaining: 4 } }); }, isPending: false }) },
      resetConversation: { useMutation: () => ({ mutate: resetMutate }) },
    },
    favorite: { isFavorited: { useQuery: () => ({ data: { favorited: [] } }) } },
    useUtils: () => ({ assistant: { getConversation: { invalidate: vi.fn() }, getQuota: { invalidate: vi.fn() } } }),
  },
}));
vi.mock('@/components/assistant/AssistantCards', () => ({ AssistantCards: () => null }));

import { AssistantConversation } from '@/components/assistant/AssistantConversation';

describe('AssistantConversation', () => {
  beforeEach(() => { sendMutate.mockReset(); resetMutate.mockReset(); });

  it('отправляет сообщение и показывает ответ ассистента', async () => {
    render(<AssistantConversation />);
    const input = screen.getByPlaceholderText(/Спроси про уроки/i);
    fireEvent.change(input, { target: { value: 'что такое ДРР' } });
    fireEvent.click(screen.getByRole('button', { name: /Отправить/i }));
    expect(sendMutate).toHaveBeenCalledWith({ message: 'что такое ДРР' });
    await waitFor(() => expect(screen.getByText('ответ')).toBeInTheDocument());
    expect(screen.getByText('что такое ДРР')).toBeInTheDocument();
  });
});
