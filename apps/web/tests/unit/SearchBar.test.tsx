import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { SearchBar } from '@/components/learning/SearchBar';

let originalInnerWidth: number;

beforeEach(() => {
  originalInnerWidth = window.innerWidth;
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024, writable: true });
});

afterEach(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth, writable: true });
  cleanup();
});

describe('SearchBar', () => {
  it('uses the honest-framing desktop placeholder', () => {
    // innerWidth set to 1024 in beforeEach → desktop branch
    const { container } = render(
      <SearchBar onSearch={vi.fn()} onClear={vi.fn()} isSearching={false} hasResults={false} />,
    );
    const input = container.querySelector('input[type="text"]');
    expect(input).not.toBeNull();
    expect(input?.getAttribute('placeholder')).toBe('Напишите тему, которая вас интересует');
  });

  it('renders topic-style example chips, not problem-style', () => {
    const { getByText, queryByText } = render(
      <SearchBar onSearch={vi.fn()} onClear={vi.fn()} isSearching={false} hasResults={false} />,
    );
    // New topic chips
    expect(getByText('Юнит-экономика')).toBeDefined();
    expect(getByText('Реклама на WB')).toBeDefined();
    expect(getByText('SEO карточки')).toBeDefined();
    expect(getByText('Анализ ниши')).toBeDefined();
    expect(getByText('Контент-стратегия')).toBeDefined();
    // Old problem-style chips must be gone
    expect(queryByText('Как снизить рекламные расходы')).toBeNull();
    expect(queryByText('SEO оптимизация карточки товара')).toBeNull();
  });
});
