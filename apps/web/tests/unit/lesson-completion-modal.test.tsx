import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { LessonCompletionModal } from '@/components/learning/LessonCompletionModal';

describe('LessonCompletionModal', () => {
  it('job: заголовок + кнопки к задаче и к плану', () => {
    render(<LessonCompletionModal kind="job" label="задача «X»" returnHref="/learn/job/x" onStay={() => {}} />);
    expect(screen.getByText('Задача пройдена')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Вернуться к задаче' })).toHaveAttribute('href', '/learn/job/x');
    expect(screen.getByRole('link', { name: 'К персональному плану' })).toHaveAttribute('href', '/learn/plan');
  });
  it('course: «Курс пройден» + к курсу', () => {
    render(<LessonCompletionModal kind="course" label="курс «Y»" returnHref="/learn/library#c1" onStay={() => {}} />);
    expect(screen.getByText('Курс пройден')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Вернуться к курсу' })).toHaveAttribute('href', '/learn/library#c1');
  });
  it('plan: primary=к плану, secondary=остаться (onStay)', () => {
    const onStay = vi.fn();
    render(<LessonCompletionModal kind="plan" label="Персональный план" returnHref="/learn/plan" onStay={onStay} />);
    expect(screen.getByRole('link', { name: 'К персональному плану' })).toHaveAttribute('href', '/learn/plan');
    fireEvent.click(screen.getByRole('button', { name: 'Остаться на уроке' }));
    expect(onStay).toHaveBeenCalled();
  });
  it('favorites: «В избранное»', () => {
    render(<LessonCompletionModal kind="favorites" label="Избранное" returnHref="/learn/favorites" onStay={() => {}} />);
    expect(screen.getByRole('link', { name: 'В избранное' })).toHaveAttribute('href', '/learn/favorites');
  });
  it('storefront: «На главную»', () => {
    render(<LessonCompletionModal kind="storefront" label="Главная" returnHref="/dashboard" onStay={() => {}} />);
    expect(screen.getByRole('link', { name: 'На главную' })).toHaveAttribute('href', '/dashboard');
  });
});
