import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import {
  RegisterValuePanel,
  RegisterValueTeaser,
  RegisterValueStats,
} from '@/components/register/value-panel';

afterEach(() => cleanup());

const AXES = ['Аналитика', 'Маркетинг', 'Контент', 'Операции', 'Финансы'];

describe('RegisterValuePanel (desktop)', () => {
  it('renders headline, all 5 axes, 4 stats and the price comparison', () => {
    const { container } = render(<RegisterValuePanel />);
    expect(screen.getByText('Обучение маркетплейсам, собранное под вас')).toBeInTheDocument();
    for (const axis of AXES) expect(screen.getByText(axis)).toBeInTheDocument();
    expect(screen.getByText('400+')).toBeInTheDocument();
    expect(screen.getByText('150+')).toBeInTheDocument();
    expect(screen.getByText('10 мин')).toBeInTheDocument();
    expect(screen.getByText('AI')).toBeInTheDocument();
    expect(screen.getByText('2 990 ₽ / мес — полный доступ')).toBeInTheDocument();
    expect(container.querySelector('.line-through')?.textContent)
      .toContain('45 000–90 000 ₽');
    // 4 stat icons + radar background svg => at least 5 svg nodes
    expect(container.querySelectorAll('svg').length).toBeGreaterThanOrEqual(5);
  });

  it('does NOT use emoji for stat icons (lucide only)', () => {
    const { container } = render(<RegisterValuePanel />);
    expect(container.textContent).not.toMatch(/📚|⏱️|🎯|🤖/u);
  });
});

describe('RegisterValueTeaser (mobile top)', () => {
  it('renders headline, subhead and the 5 axis chips', () => {
    render(<RegisterValueTeaser />);
    expect(screen.getByText('Обучение маркетплейсам, собранное под вас')).toBeInTheDocument();
    for (const axis of AXES) expect(screen.getByText(axis)).toBeInTheDocument();
  });

  it('passes through className', () => {
    const { container } = render(<RegisterValueTeaser className="lg:hidden" />);
    expect(container.firstElementChild?.className).toContain('lg:hidden');
  });
});

describe('RegisterValueStats (mobile bottom)', () => {
  it('renders the 4 stats and the price comparison', () => {
    render(<RegisterValueStats />);
    expect(screen.getByText('400+')).toBeInTheDocument();
    expect(screen.getByText('150+')).toBeInTheDocument();
    expect(screen.getByText('10 мин')).toBeInTheDocument();
    expect(screen.getByText('2 990 ₽ / мес — полный доступ')).toBeInTheDocument();
  });

  it('passes through className', () => {
    const { container } = render(<RegisterValueStats className="lg:hidden" />);
    expect(container.firstElementChild?.className).toContain('lg:hidden');
  });
});
