import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dashboardRouter } from '../dashboard';

// isFeatureEnabled reads the GLOBAL prisma (not ctx) → mock it so unit tests don't hit prod DB.
vi.mock('../../utils/feature-flags', () => ({
  isFeatureEnabled: vi.fn().mockResolvedValue(true),
}));

function makeCtx(over: Partial<{
  goals: string[]; marketplaces: string[]; role: string | undefined;
  jobs: any[]; badgedLessons: any[]; inProgress: any[];
  subscriptions: any[]; jobLessons: any[];
}> = {}) {
  const o = { goals: [], marketplaces: [], role: undefined, jobs: [], badgedLessons: [], inProgress: [], subscriptions: [], jobLessons: [], ...over };
  return {
    user: { id: 'user-1' },
    prisma: {
      userProfile: { findUnique: vi.fn().mockResolvedValue({ goals: o.goals, marketplaces: o.marketplaces, role: o.role, lastActiveAt: new Date() }), update: vi.fn() },
      job: { findMany: vi.fn().mockResolvedValue(o.jobs) },
      lesson: { findMany: vi.fn().mockResolvedValue(o.badgedLessons) },
      lessonProgress: { findMany: vi.fn().mockResolvedValue(o.inProgress) },
      subscription: { findMany: vi.fn().mockResolvedValue(o.subscriptions) },
      jobLesson: { findMany: vi.fn().mockResolvedValue(o.jobLessons) }, // used by getFirstJobLessonIds(ctx.prisma)
    },
  } as any;
}
function lesson(id: string, badges: string[], courseId = '02_ads') {
  return { id, courseId, title: id, description: '', videoUrl: '', videoId: null, duration: 5, order: 1, skillCategory: 'MARKETING', skillLevel: 'EASY', badges, isHidden: false, progress: [], course: { title: 'C', isHidden: false } };
}
function job(slug: string, axes: string[], badges: string[], marketplace = 'WB') {
  return { id: slug, slug, title: slug, description: '', marketplace, axes, badges, lessons: [] };
}
// A job carrying one lesson with a COMPLETED progress row (for completedLessons assertions).
function jobWithCompletedLesson(slug: string, badges: string[]) {
  return {
    id: slug, slug, title: slug, description: '', marketplace: 'WB', axes: [], badges,
    lessons: [{ lesson: { duration: 5, progress: [{ status: 'COMPLETED' }] } }],
  };
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

  it('IN_PROGRESS lesson → «Продолжить» shelf with status + watchedPercent', async () => {
    const inProgress = [{ status: 'IN_PROGRESS', watchedPercent: 42, lesson: lesson('lp1', []) }];
    const res = await dashboardRouter.createCaller(makeCtx({ inProgress })).getStorefront();
    const cont = res.find((s) => s.shelfKey === 'continue')!;
    expect(cont.title).toBe('Продолжить');
    const item = cont.items[0];
    expect(item.kind).toBe('lesson');
    if (item.kind === 'lesson') {
      expect(item.lesson.status).toBe('IN_PROGRESS');
      expect(item.lesson.watchedPercent).toBe(42);
    }
  });

  it('locked=true when no subs + billing on + not-first-job + not admin', async () => {
    // makeCtx defaults: subscriptions []=no subs, jobLessons []=empty firstJobLessonIds,
    // role undefined=not admin; isFeatureEnabled mocked → true (billing on).
    const badgedLessons = [lesson('l1', ['START'])];
    const res = await dashboardRouter.createCaller(makeCtx({ badgedLessons })).getStorefront();
    const start = res.find((s) => s.shelfKey === 'start')!;
    const item = start.items[0];
    expect(item.kind).toBe('lesson');
    if (item.kind === 'lesson') expect(item.lesson.locked).toBe(true);
  });

  it('completedLessons counts COMPLETED progress rows on a job', async () => {
    const jobs = [jobWithCompletedLesson('j1', ['START'])];
    const res = await dashboardRouter.createCaller(makeCtx({ jobs })).getStorefront();
    const start = res.find((s) => s.shelfKey === 'start')!;
    const item = start.items.find((i) => i.kind === 'job')!;
    if (item.kind === 'job') {
      expect(item.job.lessonCount).toBe(1);
      expect(item.job.completedLessons).toBe(1);
    }
  });
});

describe('dashboard.getCollection', () => {
  it('start shelf → full jobs+lessons grouped, no cap', async () => {
    const badgedLessons = [lesson('l1', ['START']), lesson('l2', ['START']), lesson('l3', ['START']), lesson('l4', ['START'])];
    const jobs = [job('j1', ['MARKETING'], ['START'])];
    const res = await dashboardRouter.createCaller(makeCtx({ badgedLessons, jobs })).getCollection({ shelfKey: 'start' });
    expect(res.lessons).toHaveLength(4); // no 3-cap
    expect(res.jobs).toHaveLength(1);
  });

  it('type=lessons → jobs empty', async () => {
    const badgedLessons = [lesson('l1', ['QUICK'])];
    const jobs = [job('j1', ['MARKETING'], ['QUICK'])];
    const res = await dashboardRouter.createCaller(makeCtx({ badgedLessons, jobs })).getCollection({ shelfKey: 'quick', type: 'lessons' });
    expect(res.jobs).toHaveLength(0);
    expect(res.lessons).toHaveLength(1);
  });

  it('unknown shelfKey → empty groups', async () => {
    const res = await dashboardRouter.createCaller(makeCtx()).getCollection({ shelfKey: 'garbage' });
    expect(res).toEqual({ jobs: [], lessons: [] });
  });
});
