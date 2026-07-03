import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { HowLearningWorks } from '@/components/diagnostic/HowLearningWorks';

afterEach(() => cleanup());

describe('HowLearningWorks', () => {
  it('renders the section heading', () => {
    const { getByText } = render(<HowLearningWorks />);
    expect(getByText('Как устроено обучение')).toBeTruthy();
  });
  it('explains what a Задача is', () => {
    const { getByText } = render(<HowLearningWorks />);
    expect(getByText('Задача')).toBeTruthy();
    expect(getByText(/готовый маршрут из уроков под конкретную цель/i)).toBeTruthy();
  });
  it('explains what a Урок is', () => {
    const { getByText } = render(<HowLearningWorks />);
    expect(getByText('Урок')).toBeTruthy();
    expect(getByText(/один материал: видео или текст/i)).toBeTruthy();
  });
});
