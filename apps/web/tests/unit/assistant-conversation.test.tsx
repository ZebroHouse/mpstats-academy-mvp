import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const sendMutate = vi.fn();
const resetMutate = vi.fn();
// Mutable so each test can control what getConversation resolves with.
let conversationData: { messages: any[] } = { messages: [] };

vi.mock('@/lib/trpc/client', () => ({
  trpc: {
    assistant: {
      getConversation: { useQuery: () => ({ data: conversationData, isLoading: false }) },
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
  beforeEach(() => {
    sendMutate.mockReset();
    resetMutate.mockReset();
    conversationData = { messages: [] };
  });

  it('отправляет сообщение и показывает ответ ассистента', async () => {
    render(<AssistantConversation />);
    const input = screen.getByPlaceholderText(/Спроси про уроки/i);
    fireEvent.change(input, { target: { value: 'что такое ДРР' } });
    fireEvent.click(screen.getByRole('button', { name: /Отправить/i }));
    expect(sendMutate).toHaveBeenCalledWith({ message: 'что такое ДРР' });
    await waitFor(() => expect(screen.getByText('ответ')).toBeInTheDocument());
    expect(screen.getByText('что такое ДРР')).toBeInTheDocument();
  });

  it('гидрирует историю из getConversation при загрузке', async () => {
    conversationData = {
      messages: [
        { role: 'user', content: 'старый вопрос', lessons: [], jobs: [], inDomain: true },
        { role: 'assistant', content: 'старый ответ', lessons: [], jobs: [], inDomain: true },
      ],
    };
    render(<AssistantConversation />);
    await waitFor(() => expect(screen.getByText('старый вопрос')).toBeInTheDocument());
    expect(screen.getByText('старый ответ')).toBeInTheDocument();
  });
});
