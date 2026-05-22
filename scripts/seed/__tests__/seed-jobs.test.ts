import { describe, it, expect, vi } from 'vitest';

// Mock external deps so the pure-function module loads without DB/env
vi.mock('@prisma/client', () => ({ PrismaClient: vi.fn() }));
vi.mock('dotenv', () => ({ config: vi.fn() }));

import { buildJobUpsert, type ProposalJob } from '../seed-jobs';

describe('buildJobUpsert', () => {
  it('преобразует джобу пропозала в Prisma upsert-payload', () => {
    const job: ProposalJob = {
      slug: 'poschitat-unit-ekonomiku', title: 'Посчитать юнит-экономику товара',
      description: 'Расчёт прибыли', outcomes: ['посчитать маржу'],
      axes: ['FINANCE'], skillBlocks: ['FINANCE/unit_economics'],
      marketplace: 'BOTH', displayOrder: 3,
      lessonIds: ['01_analytics_m02_economics_001', '02_ads_unit_004'],
    };
    const r = buildJobUpsert(job);
    expect(r.where).toEqual({ slug: 'poschitat-unit-ekonomiku' });
    expect(r.create.title).toBe('Посчитать юнит-экономику товара');
    expect(r.create.marketplace).toBe('BOTH');
    expect(r.create.isPublished).toBe(true);
    expect(r.create.lessons.create).toEqual([
      { lessonId: '01_analytics_m02_economics_001', order: 0 },
      { lessonId: '02_ads_unit_004', order: 1 },
    ]);
  });
});
