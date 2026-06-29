import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dashboardRouter } from '../dashboard';

// isFeatureEnabled reads the GLOBAL prisma (not ctx) → mock it so unit tests don't hit prod DB.
vi.mock('../../utils/feature-flags', () => ({
  isFeatureEnabled: vi.fn().mockResolvedValue(true),
}));

function makeCtx(over: Partial<{
  goals: string[]; marketplaces: string[];
  jobs: any[]; badgedLessons: any[]; inProgress: any[];
}> = {}) {
  const o = { goals: [], marketplaces: [], jobs: [], badgedLessons: [], inProgress: [], ...over };
  return {
    user: { id: 'user-1' },
    prisma: {
      userProfile: { findUnique: vi.fn().mockResolvedValue({ goals: o.goals, marketplaces: o.marketplaces, lastActiveAt: new Date() }), update: vi.fn() },
      job: { findMany: vi.fn().mockResolvedValue(o.jobs) },
      lesson: { findMany: vi.fn().mockResolvedValue(o.badgedLessons) },
      lessonProgress: { findMany: vi.fn().mockResolvedValue(o.inProgress) },
      subscription: { findMany: vi.fn().mockResolvedValue([]) },
      jobLesson: { findMany: vi.fn().mockResolvedValue([]) }, // used by getFirstJobLessonIds(ctx.prisma)
    },
  } as any;
}
function lesson(id: string, badges: string[], courseId = '02_ads') {
  return { id, courseId, title: id, description: '', videoUrl: '', videoId: null, duration: 5, order: 1, skillCategory: 'MARKETING', skillLevel: 'EASY', badges, isHidden: false, progress: [], course: { title: 'C', isHidden: false } };
}
function job(slug: string, axes: string[], badges: string[], marketplace = 'WB') {
  return { id: slug, slug, title: slug, description: '', marketplace, axes, badges, lessons: [] };
}

beforeEach(() => vi.clearAllMocks());

describe('dashboard.getStorefront', () => {
  it('empty badges + no goals + no progress → no shelves', async () => {
    const res = await dashboardRouter.createCaller(makeCtx()).getStorefront();
    expect(res).toEqual([]);
  });

  it('START lesson → «Начни отсюда» shelf, capped at 3', async () => {
    const badgedLessons = [lesson('l1', ['START']), lesson('l2', ['START']), lesson('l3', ['START']), lesson('l4', ['START'])];
    const res = await dashboardRouter.createCaller(makeCtx({ badgedLessons })).getStorefront();
    const start = res.find((s) => s.shelfKey === 'start')!;
    expect(start.title).toBe('Начни отсюда');
    expect(start.items).toHaveLength(3);
    expect(start.totalCount).toBe(4);
  });

  it('goal ADS → goal-ads shelf with MARKETING jobs', async () => {
    const jobs = [job('ads-1', ['MARKETING'], []), job('an-1', ['ANALYTICS'], [])];
    const res = await dashboardRouter.createCaller(makeCtx({ goals: ['ADS'], jobs })).getStorefront();
    const g = res.find((s) => s.shelfKey === 'goal-ads')!;
    expect(g.title).toBe('Под твою задачу: Реклама');
    expect(g.items.map((i) => (i.kind === 'job' ? i.job.slug : ''))).toContain('ads-1');
    expect(g.items.map((i) => (i.kind === 'job' ? i.job.slug : ''))).not.toContain('an-1');
  });

  it('NEW + marketplaces [WB,OZON] → two new-<mp> shelves', async () => {
    const badgedLessons = [lesson('w', ['NEW'], '02_ads'), lesson('o', ['NEW'], '05_ozon')];
    const res = await dashboardRouter.createCaller(makeCtx({ marketplaces: ['WB', 'OZON'], badgedLessons })).getStorefront();
    expect(res.find((s) => s.shelfKey === 'new-wb')).toBeTruthy();
    expect(res.find((s) => s.shelfKey === 'new-ozon')).toBeTruthy();
  });
});
