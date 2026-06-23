import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { LessonBodyRenderer } from '@/components/learning/LessonBodyRenderer';

afterEach(cleanup);

describe('LessonBodyRenderer', () => {
  it('renders heading and paragraph text from a TipTap doc', async () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Заголовок' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Тело урока' }] },
      ],
    };
    const { findByText } = render(<LessonBodyRenderer doc={doc} />);
    expect(await findByText('Заголовок')).toBeTruthy();
    expect(await findByText('Тело урока')).toBeTruthy();
  });

  it('renders nothing for null doc', () => {
    const { container } = render(<LessonBodyRenderer doc={null} />);
    expect(container.textContent).toBe('');
  });
});
