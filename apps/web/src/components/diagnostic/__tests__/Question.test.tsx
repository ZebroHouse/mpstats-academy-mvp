import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { DiagnosticQuestion } from '@mpstats/shared';

import { Question } from '../Question';

afterEach(() => {
  cleanup();
});

function mkQuestion(mp: 'WB' | 'OZON' | 'BOTH' | undefined): DiagnosticQuestion {
  return {
    id: 'q1',
    skillCategory: 'ANALYTICS',
    difficulty: 'MEDIUM',
    question: 'Тестовый вопрос?',
    options: ['Один', 'Два', 'Три', 'Четыре'],
    correctIndex: 0,
    explanation: '',
    ...(mp !== undefined ? { marketplace: mp } : {}),
  } as DiagnosticQuestion;
}

describe('Question — marketplace badge (Phase 59 D-09)', () => {
  it('Test 1: mix user + WB question → renders "Про Wildberries"', () => {
    const { getByText } = render(
      <Question
        question={mkQuestion('WB')}
        onAnswer={() => {}}
        userMarketplaces={['WB', 'OZON']}
      />,
    );
    expect(getByText('Про Wildberries')).toBeDefined();
  });

  it('Test 2: mix user + OZON question → renders "Про Ozon"', () => {
    const { getByText } = render(
      <Question
        question={mkQuestion('OZON')}
        onAnswer={() => {}}
        userMarketplaces={['WB', 'OZON']}
      />,
    );
    expect(getByText('Про Ozon')).toBeDefined();
  });

  it('Test 3: mix user + BOTH question → no badge', () => {
    const { queryByText } = render(
      <Question
        question={mkQuestion('BOTH')}
        onAnswer={() => {}}
        userMarketplaces={['WB', 'OZON']}
      />,
    );
    expect(queryByText('Про Wildberries')).toBeNull();
    expect(queryByText('Про Ozon')).toBeNull();
  });

  it('Test 4: WB-only user + WB question → no badge', () => {
    const { queryByText } = render(
      <Question
        question={mkQuestion('WB')}
        onAnswer={() => {}}
        userMarketplaces={['WB']}
      />,
    );
    expect(queryByText('Про Wildberries')).toBeNull();
    expect(queryByText('Про Ozon')).toBeNull();
  });

  it('Test 5: OZON-only user + OZON question → no badge', () => {
    const { queryByText } = render(
      <Question
        question={mkQuestion('OZON')}
        onAnswer={() => {}}
        userMarketplaces={['OZON']}
      />,
    );
    expect(queryByText('Про Wildberries')).toBeNull();
    expect(queryByText('Про Ozon')).toBeNull();
  });

  it('Test 6: userMarketplaces undefined → no badge, no crash', () => {
    const { queryByText } = render(
      <Question
        question={mkQuestion('WB')}
        onAnswer={() => {}}
      />,
    );
    expect(queryByText('Про Wildberries')).toBeNull();
    expect(queryByText('Про Ozon')).toBeNull();
  });

  it('Test 7: question.marketplace undefined (legacy session) → no badge, no crash', () => {
    const { queryByText } = render(
      <Question
        question={mkQuestion(undefined)}
        onAnswer={() => {}}
        userMarketplaces={['WB', 'OZON']}
      />,
    );
    expect(queryByText('Про Wildberries')).toBeNull();
    expect(queryByText('Про Ozon')).toBeNull();
  });
});
