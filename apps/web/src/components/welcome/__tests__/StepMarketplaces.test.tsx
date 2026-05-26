import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';

import { StepMarketplaces } from '../StepMarketplaces';
import { MARKETPLACE_OPTIONS } from '../options';

afterEach(() => {
  cleanup();
});

describe('StepMarketplaces — D-12 marketplace collapse', () => {
  it('renders exactly 2 marketplace cards (WB + Ozon)', () => {
    const { getAllByRole } = render(
      <StepMarketplaces marketplaces={[]} onChange={() => {}} />,
    );

    const cards = getAllByRole('button');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent('Wildberries');
    expect(cards[1]).toHaveTextContent('Ozon');
  });

  it('options source of truth is length 2', () => {
    expect(MARKETPLACE_OPTIONS).toHaveLength(2);
    expect(MARKETPLACE_OPTIONS.map((m) => m.key)).toEqual(['WB', 'OZON']);
  });

  it('toggles selection on click', () => {
    const onChange = vi.fn();
    const { getAllByRole } = render(
      <StepMarketplaces marketplaces={[]} onChange={onChange} />,
    );

    fireEvent.click(getAllByRole('button')[0]);
    expect(onChange).toHaveBeenCalledWith(['WB']);
  });
});
