import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/learning/LearningTabs', () => ({ LearningTabs: () => <div /> }));

let mockPath: { data: unknown; isLoading: boolean };
vi.mock('@/lib/trpc/client', () => ({
  trpc: {
    useUtils: () => ({ learning: { getRecommendedPath: { cancel: vi.fn(), getData: vi.fn(), setData: vi.fn(), invalidate: vi.fn() } } }),
    learning: {
      getRecommendedPath: { useQuery: () => mockPath },
      rebuildTrack: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));

import PlanPage from '@/app/(main)/learn/plan/page';

const lesson = (id: string, title: string) => ({ id, title, courseName: 'Курс', duration: 10, status: 'NOT_STARTED', locked: false });
const path = {
  isAxis: true, addedJobs: [],
  sections: [
    { axis: 'ANALYTICS', label: 'Аналитика', score: 33, tier: 'weak', collapsed: false,
      jobs: [{ id: 'j1', slug: 'zadacha-1', title: 'Задача аналитики', lessons: [lesson('jl1','Урок задачи')] }],
      lessons: [lesson('a1','Обычный урок аналитики')], errorLessons: [lesson('e1','Разбор ошибки аналитики')] },
    { axis: 'FINANCE', label: 'Финансы', score: 100, tier: 'strong', collapsed: true, jobs: [], lessons: [lesson('f1','Продвинутый урок финансов')], errorLessons: [] },
  ],
};

beforeEach(() => { mockPath = { data: path, isLoading: false }; });
afterEach(() => cleanup());

describe('PlanPage — axis sections', () => {
  it('renders axis title «{label} — {score}%» with tier badge', () => {
    const { getByText } = render(<PlanPage />);
    expect(getByText('Аналитика — 33%')).toBeTruthy();
    expect(getByText('🔴 слабая')).toBeTruthy();
    expect(getByText('Финансы — 100%')).toBeTruthy();
    expect(getByText('🟢 сильная')).toBeTruthy();
  });
  it('expands weak axes and collapses strong ones by default', () => {
    const { getByText, queryByText } = render(<PlanPage />);
    expect(getByText(/Обычный урок аналитики/)).toBeTruthy();
    expect(queryByText(/Продвинутый урок финансов/)).toBeNull();
  });
  it('flags error-review lessons at the top of their axis', () => {
    const { getByText } = render(<PlanPage />);
    expect(getByText('⚠ Разбор ошибки')).toBeTruthy();
    expect(getByText(/Разбор ошибки аналитики/)).toBeTruthy();
  });
  it('renders the axis job block inside the section', () => {
    expect(render(<PlanPage />).getByText('Задача аналитики')).toBeTruthy();
  });
});
