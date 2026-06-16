import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import {
  RegisterValuePanel,
  RegisterValueTeaser,
  RegisterValueStats,
} from '@/components/register/value-panel';

afterEach(() => cleanup());

const HEADLINE = 'Обучение маркетплейсам, собранное под вас';
const AXES = ['Аналитика', 'Маркетинг', 'Контент', 'Операции', 'Финансы'];
const THESIS_TITLES = [
  'AI-диагностика за 10 минут',
  '400+ уроков · 150+ часов',
  'AI-ассистент в уроке',
  '5 направлений',
];

describe('RegisterValuePanel (desktop)', () => {
  it('renders headline, all 4 thesis cards, all 5 axes and the price', () => {
    const { container } = render(<RegisterValuePanel />);
    expect(screen.getByText(HEADLINE)).toBeInTheDocument();
    for (const title of THESIS_TITLES) expect(screen.getByText(title)).toBeInTheDocument();
    // the "5 направлений" card spells out every axis (no "+2" truncation)
    for (const axis of AXES) expect(screen.getByText(axis)).toBeInTheDocument();
    expect(container.textContent).toContain('2 990 ₽');
    expect(screen.getByText('полный доступ')).toBeInTheDocument();
    expect(container.querySelector('.line-through')?.textContent)
      .toContain('45 000–90 000 ₽');
    // 4 thesis cards each carry one lucide <svg> icon
    expect(container.querySelectorAll('svg').length).toBeGreaterThanOrEqual(4);
  });

  it('does NOT use emoji for icons (lucide only)', () => {
    const { container } = render(<RegisterValuePanel />);
    expect(container.textContent).not.toMatch(/📚|⏱️|🎯|🤖|🎁/u);
  });
});

describe('RegisterValueTeaser (mobile top)', () => {
  it('renders the headline and subhead', () => {
    render(<RegisterValueTeaser />);
    expect(screen.getByText(HEADLINE)).toBeInTheDocument();
    expect(
      screen.getByText('Персональная программа вместо одинакового потока для всех.'),
    ).toBeInTheDocument();
  });

  it('passes through className', () => {
    const { container } = render(<RegisterValueTeaser className="lg:hidden" />);
    expect(container.firstElementChild?.className).toContain('lg:hidden');
  });
});

describe('RegisterValueStats (mobile bottom)', () => {
  it('renders the 4 thesis cards and the price', () => {
    const { container } = render(<RegisterValueStats />);
    for (const title of THESIS_TITLES) expect(screen.getByText(title)).toBeInTheDocument();
    expect(container.textContent).toContain('2 990 ₽');
  });

  it('passes through className', () => {
    const { container } = render(<RegisterValueStats className="lg:hidden" />);
    expect(container.firstElementChild?.className).toContain('lg:hidden');
  });
});
