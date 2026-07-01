import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }), useSearchParams: () => ({ get: () => 'sess-1' }) }));
vi.mock('@/lib/analytics/metrika', () => ({ reachGoal: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/charts/RadarChart', () => ({ SkillRadarChart: () => <div data-testid="radar" /> }));

let mockResults: { data: unknown; isLoading: boolean };
let mockPath: { data: unknown };
vi.mock('@/lib/trpc/client', () => ({
  trpc: {
    useUtils: () => ({
      learning: { getRecommendedPath: { invalidate: vi.fn() } },
      job: { getCatalog: { invalidate: vi.fn() } },
      favorite: { isFavorited: { invalidate: vi.fn() }, list: { invalidate: vi.fn() } },
    }),
    diagnostic: { getResults: { useQuery: () => mockResults }, getHistory: { useQuery: () => ({ data: [] }) } },
    learning: { getRecommendedPath: { useQuery: () => mockPath }, addJobToTrack: { useMutation: () => ({ mutateAsync: vi.fn() }) } },
    favorite: {
      isFavorited: { useQuery: () => ({ data: false }) },
      add: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      remove: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));

import DiagnosticResultsPage from '@/app/(main)/diagnostic/results/page';

const results = {
  sessionId: 'sess-1', totalQuestions: 15, correctAnswers: 6, accuracy: 40, skillProfile: {},
  gaps: [{ category: 'ANALYTICS', label: 'Аналитика', currentScore: 33, targetScore: 80, gap: 47, priority: 'HIGH' }],
  recommendedPath: ['l1', 'l2'],
  recommendedJobs: [{ id: 'j1', slug: 's1', title: 'Задача 1', description: 'd', marketplace: 'WB', axes: [], lessonCount: 3, totalDurationMin: 30, completedLessons: 0, isRecommended: true, isInTrack: false, score: 0.9, matchedAxes: [], badges: [], rank: 1, axis: 'ANALYTICS', axisLabel: 'Аналитика', axisScore: 33 }],
};
const path = {
  isAxis: true,
  sections: [{ axis: 'ANALYTICS', label: 'Аналитика', score: 33, tier: 'weak', collapsed: false, jobs: [], lessons: [{ id: 'a1', title: 'Урок А1', courseName: 'Курс' }], errorLessons: [] }],
  lessons: [{ id: 'a1', title: 'Урок А1', courseName: 'Курс', locked: false, status: 'NOT_STARTED' }],
  addedJobs: [],
};

beforeEach(() => { pushMock.mockReset(); mockResults = { data: results, isLoading: false }; mockPath = { data: path }; });
afterEach(() => cleanup());

describe('DiagnosticResultsPage — axis-centric flow', () => {
  it('renders the explainer', () => { expect(render(<DiagnosticResultsPage />).getByText('Как устроено обучение')).toBeTruthy(); });
  it('main CTA links to the personal plan', () => {
    const cta = render(<DiagnosticResultsPage />).getByRole('link', { name: /Открыть персональный план/i });
    expect(cta.getAttribute('href')).toBe('/learn/plan');
  });
  it('does NOT render the legacy «Рекомендованные уроки» wall', () => {
    expect(render(<DiagnosticResultsPage />).queryByText('Рекомендованные уроки')).toBeNull();
  });
  it('renders the per-axis lesson teaser', () => {
    const { getByText } = render(<DiagnosticResultsPage />);
    expect(getByText('Или начните с отдельного урока')).toBeTruthy();
    expect(getByText('Урок А1')).toBeTruthy();
  });
});
