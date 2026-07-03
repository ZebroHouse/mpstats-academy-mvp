import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/trpc/client', () => ({
  trpc: {
    useUtils: () => ({
      learning: { getRecommendedPath: { invalidate: vi.fn() } },
      job: { getCatalog: { invalidate: vi.fn() } },
      favorite: { isFavorited: { invalidate: vi.fn() }, list: { invalidate: vi.fn() } },
    }),
    learning: { getRecommendedPath: { useQuery: () => ({ data: undefined }) }, addJobToTrack: { useMutation: () => ({ mutateAsync: vi.fn() }) } },
    favorite: {
      add: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      remove: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));

import { RecommendedJobsBlock } from '@/components/diagnostic/RecommendedJobsBlock';

const baseJob = { slug: 's', description: 'd', marketplace: 'WB' as const, axes: [], lessonCount: 3, totalDurationMin: 30, completedLessons: 0, isRecommended: true, isInTrack: false, score: 0.9, matchedAxes: [], badges: [] as string[] };

afterEach(() => cleanup());

describe('RecommendedJobsBlock — axis reason label', () => {
  it('shows reason with «(ваша слабейшая зона)» on job #1', () => {
    const jobs = [
      { ...baseJob, id: 'j1', title: 'Задача 1', rank: 1 as const, axis: 'ANALYTICS', axisLabel: 'Аналитика', axisScore: 33 },
      { ...baseJob, id: 'j2', title: 'Задача 2', rank: 2 as const, axis: 'MARKETING', axisLabel: 'Маркетинг', axisScore: 50 },
    ];
    const { getByText } = render(<RecommendedJobsBlock jobs={jobs} />);
    expect(getByText('Закрывает: Аналитика — 33% (ваша слабейшая зона)')).toBeTruthy();
  });
  it('shows plain reason on job #2', () => {
    const jobs = [
      { ...baseJob, id: 'j1', title: 'Задача 1', rank: 1 as const, axis: 'ANALYTICS', axisLabel: 'Аналитика', axisScore: 33 },
      { ...baseJob, id: 'j2', title: 'Задача 2', rank: 2 as const, axis: 'MARKETING', axisLabel: 'Маркетинг', axisScore: 50 },
    ];
    const { getByText } = render(<RecommendedJobsBlock jobs={jobs} />);
    expect(getByText('Закрывает: Маркетинг — 50%')).toBeTruthy();
  });
  it('renders no axis label when axis data is absent', () => {
    const jobs = [{ ...baseJob, id: 'j1', title: 'Задача 1', rank: 1 as const }];
    const { queryByText } = render(<RecommendedJobsBlock jobs={jobs} />);
    expect(queryByText(/^Закрывает:/)).toBeNull();
  });
});
