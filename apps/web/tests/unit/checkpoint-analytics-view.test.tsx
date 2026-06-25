import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';

// Mutable mock state — reassigned per test before render, mirroring AgentSearch.test.tsx.
let mockLessons: { data: unknown; isLoading: boolean; error: unknown };
let mockAnalytics: { data: unknown; isLoading: boolean; error: unknown };

vi.mock('@/lib/trpc/client', () => ({
  trpc: {
    admin: {
      analytics: {
        listInteractiveLessons: { useQuery: () => mockLessons },
        getCheckpointAnalytics: { useQuery: () => mockAnalytics },
      },
    },
  },
}));

import { CheckpointAnalytics } from '@/components/admin/CheckpointAnalytics';

const sampleLessons = [
  { lessonId: 'l1', title: 'Урок про рекламу', courseTitle: 'Аналитика', isHidden: false, respondentCount: 12 },
  { lessonId: 'l2', title: 'Скрытый урок', courseTitle: 'Реклама', isHidden: true, respondentCount: 0 },
];

const sampleAnalytics = {
  lessonId: 'l1',
  lessonTitle: 'Урок про рекламу',
  courseTitle: 'Аналитика',
  totalRespondents: 12,
  checkpoints: [
    {
      checkpointId: 'cp1',
      contextLabel: 'Какой бюджет выбрать?',
      totalAnswered: 10,
      options: [
        { optionId: 'o1', label: 'Низкий', count: 7, percent: 70 },
        { optionId: 'o2', label: 'Высокий', count: 3, percent: 30 },
      ],
    },
  ],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('CheckpointAnalytics', () => {
  it('renders the lesson list with respondent counts', () => {
    mockLessons = { data: sampleLessons, isLoading: false, error: null };
    mockAnalytics = { data: sampleAnalytics, isLoading: false, error: null };
    const { getByText, getAllByText } = render(<CheckpointAnalytics />);
    // Title appears in the left list AND in the right-panel header.
    expect(getAllByText('Урок про рекламу').length).toBeGreaterThanOrEqual(1);
    expect(getByText('12 ответов')).toBeDefined();
    expect(getByText('0 ответов')).toBeDefined();
    // Hidden lesson is tagged.
    expect(getByText('скрыт')).toBeDefined();
  });

  it('renders a checkpoint card with option label and percent bar for the default lesson', () => {
    mockLessons = { data: sampleLessons, isLoading: false, error: null };
    mockAnalytics = { data: sampleAnalytics, isLoading: false, error: null };
    const { getByText } = render(<CheckpointAnalytics />);
    expect(getByText('Какой бюджет выбрать?')).toBeDefined();
    expect(getByText('Ответили: 10')).toBeDefined();
    expect(getByText('Низкий')).toBeDefined();
    expect(getByText('7 (70%)')).toBeDefined();
    expect(getByText('3 (30%)')).toBeDefined();
  });

  it('lets the user select a different lesson', () => {
    mockLessons = { data: sampleLessons, isLoading: false, error: null };
    mockAnalytics = { data: sampleAnalytics, isLoading: false, error: null };
    const { getByText } = render(<CheckpointAnalytics />);
    // Clicking the second lesson does not throw and keeps the panel mounted.
    fireEvent.click(getByText('Скрытый урок'));
    expect(getByText('Скрытый урок')).toBeDefined();
  });

  it('shows the empty state when there are no interactive lessons', () => {
    mockLessons = { data: [], isLoading: false, error: null };
    mockAnalytics = { data: undefined, isLoading: false, error: null };
    const { getByText } = render(<CheckpointAnalytics />);
    expect(getByText('Пока нет интерактивных уроков с чекпоинтами')).toBeDefined();
  });

  it('shows a note when the selected lesson has zero respondents', () => {
    mockLessons = {
      data: [{ lessonId: 'l2', title: 'Скрытый урок', courseTitle: 'Реклама', isHidden: true, respondentCount: 0 }],
      isLoading: false,
      error: null,
    };
    mockAnalytics = {
      data: {
        lessonId: 'l2',
        lessonTitle: 'Скрытый урок',
        courseTitle: 'Реклама',
        totalRespondents: 0,
        checkpoints: [
          {
            checkpointId: 'cp1',
            contextLabel: 'Чекпоинт 1',
            totalAnswered: 0,
            options: [{ optionId: 'o1', label: 'Вариант 1', count: 0, percent: 0 }],
          },
        ],
      },
      isLoading: false,
      error: null,
    };
    const { getByText } = render(<CheckpointAnalytics />);
    expect(getByText('Пока нет ответов учеников')).toBeDefined();
    // Checkpoint structure still shown, with a dash instead of a bar.
    expect(getByText('Чекпоинт 1')).toBeDefined();
    expect(getByText('Вариант 1')).toBeDefined();
  });
});
