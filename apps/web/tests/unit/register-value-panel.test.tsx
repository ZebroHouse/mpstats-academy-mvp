import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import {
  RegisterValueTeaser,
  RegisterValueStats,
} from '@/components/register/value-panel';

afterEach(() => cleanup());

const HEADLINE = 'Обучение маркетплейсам, собранное под вас';
const SUBHEAD = 'Персональная программа вместо одинакового потока для всех.';
const AXES = ['Аналитика', 'Маркетинг', 'Контент', 'Операции', 'Финансы'];
const THESIS_TITLES = [
  'AI-диагностика за 10 минут',
  '400+ уроков · 150+ часов',
  'AI-ассистент в каждом уроке',
  '5 направлений',
];

describe('RegisterValueTeaser (promo headline)', () => {
  it('renders the headline and subhead', () => {
    render(<RegisterValueTeaser />);
    expect(screen.getByText(HEADLINE)).toBeInTheDocument();
    expect(screen.getByText(SUBHEAD)).toBeInTheDocument();
  });

  it('passes through className', () => {
    const { container } = render(<RegisterValueTeaser className="lg:row-start-1" />);
    expect(container.firstElementChild?.className).toContain('lg:row-start-1');
  });
});

describe('RegisterValueStats (theses + price)', () => {
  it('renders all 4 thesis plaques, all 5 axes and the price', () => {
    const { container } = render(<RegisterValueStats />);
    for (const title of THESIS_TITLES) expect(screen.getByText(title)).toBeInTheDocument();
    // the "5 направлений" plaque spells out every axis (no "+N" truncation)
    for (const axis of AXES) expect(screen.getByText(axis)).toBeInTheDocument();
    expect(container.textContent).toContain('2 990 ₽');
    expect(screen.getByText('полный доступ')).toBeInTheDocument();
    expect(container.querySelector('.line-through')?.textContent)
      .toContain('45 000–90 000 ₽');
    // 4 thesis plaques each carry one lucide <svg> icon
    expect(container.querySelectorAll('svg').length).toBeGreaterThanOrEqual(4);
  });

  it('does NOT use emoji for icons (lucide only)', () => {
    const { container } = render(<RegisterValueStats />);
    expect(container.textContent).not.toMatch(/📚|⏱️|🎯|🤖|🎁/u);
  });

  it('passes through className', () => {
    const { container } = render(<RegisterValueStats className="lg:row-start-2" />);
    expect(container.firstElementChild?.className).toContain('lg:row-start-2');
  });
});
