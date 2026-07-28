import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AssistantLauncher } from '@/components/assistant/AssistantLauncher';

vi.mock('@/components/assistant/AssistantConversation', () => ({ AssistantConversation: () => <div>тело чата</div> }));

const markTourCompletedMutate = vi.fn();
vi.mock('@/lib/trpc/client', () => ({
  trpc: {
    profile: {
      markTourCompleted: { useMutation: () => ({ mutate: markTourCompletedMutate }) },
    },
  },
}));

describe('AssistantLauncher', () => {
  it('не рендерится, когда enabled=false', () => {
    const { container } = render(
      <AssistantLauncher enabled={false} userName={null} assistantSeen={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('рендерит кнопку и открывает drawer по клику', () => {
    render(<AssistantLauncher enabled userName="Егор" assistantSeen={false} />);
    const btn = screen.getByRole('button', { name: /AI-ассистент/i });
    fireEvent.click(btn);
    expect(screen.getByText('тело чата')).toBeInTheDocument();
  });

  it('показывает бейдж «1», когда assistantSeen=false, и прячет после клика', () => {
    render(<AssistantLauncher enabled userName={null} assistantSeen={false} />);
    expect(screen.getByText('1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /AI-ассистент/i }));
    expect(screen.queryByText('1')).not.toBeInTheDocument();
    expect(markTourCompletedMutate).toHaveBeenCalledWith({ page: 'assistant' });
  });

  it('не показывает бейдж, когда assistantSeen=true', () => {
    render(<AssistantLauncher enabled userName={null} assistantSeen />);
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });
});
