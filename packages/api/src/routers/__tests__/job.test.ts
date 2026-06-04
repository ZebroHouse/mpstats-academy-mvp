import { describe, it, expect, vi, beforeEach } from 'vitest';
import { axisTitle, filterByMarketplace, jobRouter } from '../job';

function makeCtx(jobFindUnique: any) {
  return {
    user: { id: 'user-1' },
    prisma: {
      job: { findUnique: jobFindUnique },
      userProfile: {
        findUnique: vi.fn().mockResolvedValue({ lastActiveAt: new Date() }),
        update: vi.fn().mockResolvedValue({}),
      },
    },
  } as any;
}

beforeEach(() => vi.clearAllMocks());

describe('getTitleBySlug', () => {
  it('опубликованная задача → возвращает { slug, title }', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      slug: 'ozon-ads', title: 'Реклама на Ozon', isPublished: true,
    });
    const caller = jobRouter.createCaller(makeCtx(findUnique));
    const res = await caller.getTitleBySlug({ slug: 'ozon-ads' });

    expect(res).toEqual({ slug: 'ozon-ads', title: 'Реклама на Ozon' });
    // лёгкий select — без lessons/include
    const arg = findUnique.mock.calls[0][0];
    expect(arg.select).toEqual({ slug: true, title: true, isPublished: true });
    expect(arg.include).toBeUndefined();
  });

  it('неопубликованная задача → возвращает null', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      slug: 'draft-job', title: 'Черновик', isPublished: false,
    });
    const caller = jobRouter.createCaller(makeCtx(findUnique));
    const res = await caller.getTitleBySlug({ slug: 'draft-job' });
    expect(res).toBeNull();
  });

  it('slug не найден → возвращает null', async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const caller = jobRouter.createCaller(makeCtx(findUnique));
    const res = await caller.getTitleBySlug({ slug: 'missing' });
    expect(res).toBeNull();
  });
});

describe('axisTitle', () => {
  it('маппит канонические оси на русские названия', () => {
    expect(axisTitle('ANALYTICS')).toBe('Аналитика');
    expect(axisTitle('FINANCE')).toBe('Финансы');
    expect(axisTitle('UNKNOWN')).toBe('UNKNOWN');
  });
});

describe('filterByMarketplace', () => {
  const jobs = [
    { marketplace: 'WB' }, { marketplace: 'OZON' }, { marketplace: 'BOTH' },
  ] as any[];
  it('WB показывает WB + BOTH', () => {
    expect(filterByMarketplace(jobs, 'WB').map((j) => j.marketplace)).toEqual(['WB', 'BOTH']);
  });
  it('OZON показывает OZON + BOTH', () => {
    expect(filterByMarketplace(jobs, 'OZON').map((j) => j.marketplace)).toEqual(['OZON', 'BOTH']);
  });
});
