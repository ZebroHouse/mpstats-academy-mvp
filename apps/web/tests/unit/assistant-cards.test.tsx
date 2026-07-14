import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AssistantCards } from '@/components/assistant/AssistantCards';

vi.mock('@/components/learning/FavoriteButton', () => ({
  FavoriteButton: () => <button aria-label="В избранное" />,
}));

describe('AssistantCards', () => {
  it('рендерит карточки уроков и задач', () => {
    render(
      <AssistantCards
        lessons={[{ lessonId: 'L1', title: 'ДРР урок', durationMin: 12, courseTitle: 'Реклама', reason: '' }]}
        jobs={[{ jobId: 'J1', title: 'Настроить рекламу', slug: 'nastroit', lessonCount: 7, reason: '' }]}
        favoritedKeys={new Set()}
      />,
    );
    expect(screen.getByText('ДРР урок')).toBeInTheDocument();
    expect(screen.getByText('Настроить рекламу')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ДРР урок/ })).toHaveAttribute('href', '/learn/L1?from=assistant');
    expect(screen.getByRole('link', { name: /Настроить рекламу/ })).toHaveAttribute('href', '/learn/job/nastroit');
  });

  it('ничего не рендерит без карточек', () => {
    const { container } = render(<AssistantCards lessons={[]} jobs={[]} favoritedKeys={new Set()} />);
    expect(container.firstChild).toBeNull();
  });
});
