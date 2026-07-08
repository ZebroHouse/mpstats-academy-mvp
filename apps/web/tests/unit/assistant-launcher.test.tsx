import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AssistantLauncher } from '@/components/assistant/AssistantLauncher';

vi.mock('@/components/assistant/AssistantConversation', () => ({ AssistantConversation: () => <div>тело чата</div> }));

describe('AssistantLauncher', () => {
  it('не рендерится, когда enabled=false', () => {
    const { container } = render(<AssistantLauncher enabled={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('рендерит кнопку и открывает drawer по клику', () => {
    render(<AssistantLauncher enabled />);
    const btn = screen.getByRole('button', { name: /AI-ассистент/i });
    fireEvent.click(btn);
    expect(screen.getByText('тело чата')).toBeInTheDocument();
  });
});
