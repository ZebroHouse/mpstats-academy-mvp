import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getRecommendedJobsFromGaps, computeEffectiveMarketplaces } from './job-matcher';
import type { SkillProfile } from '@mpstats/shared';

type FakeJob = {
  id: string;
  slug: string;
  title: string;
  description: string;
  marketplace: 'WB' | 'OZON' | 'BOTH';
  axes: string[];
  isPublished: boolean;
  lessons: Array<{ lesson: { duration: number } }>;
};

function makeJob(overrides: Partial<FakeJob>): FakeJob {
  return {
    id: overrides.id ?? 'job-x',
    slug: overrides.slug ?? 'slug-x',
    title: overrides.title ?? 'Title',
    description: overrides.description ?? 'Description',
    marketplace: overrides.marketplace ?? 'WB',
    axes: overrides.axes ?? [],
    isPublished: overrides.isPublished ?? true,
    lessons: overrides.lessons ?? [{ lesson: { duration: 10 } }],
  };
}

function mockPrisma(jobs: FakeJob[]) {
  return {
    job: {
      findMany: vi.fn().mockImplementation(async ({ where }: any) => {
        return jobs.filter((j) => {
          if (where?.isPublished !== undefined && j.isPublished !== where.isPublished) return false;
          if (where?.marketplace?.in) {
            const allowed: string[] = where.marketplace.in;
            if (!allowed.includes(j.marketplace)) return false;
          }
          return true;
        });
      }),
    },
  } as any;
}

const weakProfile: SkillProfile = {
  finance: 20,
  analytics: 30,
  content: 90,
  marketing: 90,
  operations: 90,
};

describe('computeEffectiveMarketplaces', () => {
  it('возвращает фильтрованные WB/OZON', () => {
    expect(computeEffectiveMarketplaces(['WB'])).toEqual(['WB']);
    expect(computeEffectiveMarketplaces(['WB', 'OZON'])).toEqual(['WB', 'OZON']);
  });

  it('фолбэк на [WB, OZON] для пустого/мусорного ввода', () => {
    expect(computeEffectiveMarketplaces([])).toEqual(['WB', 'OZON']);
    expect(computeEffectiveMarketplaces(['YANDEX', 'OTHER'])).toEqual(['WB', 'OZON']);
  });
});

describe('getRecommendedJobsFromGaps', () => {
  beforeEach(() => vi.clearAllMocks());

  it('Test 1: ранжирует по пересечению с топ-2 слабых осей и исключает джобы без overlap', async () => {
    const jobs = [
      makeJob({ id: 'A', axes: ['FINANCE', 'ANALYTICS'] }),
      makeJob({ id: 'B', axes: ['FINANCE'] }),
      makeJob({ id: 'C', axes: ['ANALYTICS'] }),
      makeJob({ id: 'D', axes: ['CONTENT'] }),
    ];
    const prisma = mockPrisma(jobs);
    const result = await getRecommendedJobsFromGaps(prisma, {
      skillProfile: weakProfile,
      userMarketplaces: ['WB'],
    });
    expect(result.map((r) => r.id)).toEqual(['A', 'B', 'C']);
    expect(result[0].rank).toBe(1);
    expect(result[2].rank).toBe(3);
  });

  it('Test 2: tiebreaker — Job.id ASC при равном score', async () => {
    const jobs = [
      makeJob({ id: 'z-job', axes: ['FINANCE'] }),
      makeJob({ id: 'a-job', axes: ['FINANCE'] }),
      makeJob({ id: 'm-job', axes: ['FINANCE'] }),
    ];
    const prisma = mockPrisma(jobs);
    const result = await getRecommendedJobsFromGaps(prisma, {
      skillProfile: weakProfile,
      userMarketplaces: ['WB'],
    });
    expect(result.map((r) => r.id)).toEqual(['a-job', 'm-job', 'z-job']);
  });

  it('Test 3: лимит top-3 по умолчанию', async () => {
    const jobs = Array.from({ length: 10 }, (_, i) =>
      makeJob({ id: `job-${String(i).padStart(2, '0')}`, axes: ['FINANCE', 'ANALYTICS'] }),
    );
    const prisma = mockPrisma(jobs);
    const result = await getRecommendedJobsFromGaps(prisma, {
      skillProfile: weakProfile,
      userMarketplaces: ['WB', 'OZON'],
    });
    expect(result).toHaveLength(3);
  });

  it('Test 4: marketplace-фильтр — WB-юзер не видит OZON', async () => {
    const jobs = [
      makeJob({ id: 'wb', marketplace: 'WB', axes: ['FINANCE'] }),
      makeJob({ id: 'ozon', marketplace: 'OZON', axes: ['FINANCE'] }),
      makeJob({ id: 'both', marketplace: 'BOTH', axes: ['FINANCE'] }),
    ];
    const prisma = mockPrisma(jobs);
    const result = await getRecommendedJobsFromGaps(prisma, {
      skillProfile: weakProfile,
      userMarketplaces: ['WB'],
    });
    const ids = result.map((r) => r.id);
    expect(ids).toContain('wb');
    expect(ids).toContain('both');
    expect(ids).not.toContain('ozon');
  });

  it('Test 5: marketplace fallback при legacy-значениях', async () => {
    const jobs = [
      makeJob({ id: 'wb', marketplace: 'WB', axes: ['FINANCE'] }),
      makeJob({ id: 'ozon', marketplace: 'OZON', axes: ['FINANCE'] }),
      makeJob({ id: 'both', marketplace: 'BOTH', axes: ['FINANCE'] }),
    ];
    const prisma = mockPrisma(jobs);
    const result = await getRecommendedJobsFromGaps(prisma, {
      skillProfile: weakProfile,
      userMarketplaces: ['YANDEX'],
    });
    expect(result.map((r) => r.id).sort()).toEqual(['both', 'ozon', 'wb']);
  });

  it('Test 6: empty marketplaces → фолбэк [WB, OZON]', async () => {
    const jobs = [
      makeJob({ id: 'wb', marketplace: 'WB', axes: ['FINANCE'] }),
      makeJob({ id: 'ozon', marketplace: 'OZON', axes: ['FINANCE'] }),
    ];
    const prisma = mockPrisma(jobs);
    const result = await getRecommendedJobsFromGaps(prisma, {
      skillProfile: weakProfile,
      userMarketplaces: [],
    });
    expect(result.map((r) => r.id).sort()).toEqual(['ozon', 'wb']);
  });

  it('Test 7: isPublished-гейт — unpublished исключены', async () => {
    const jobs = [
      makeJob({ id: 'published', axes: ['FINANCE'], isPublished: true }),
      makeJob({ id: 'draft', axes: ['FINANCE'], isPublished: false }),
    ];
    const prisma = mockPrisma(jobs);
    const result = await getRecommendedJobsFromGaps(prisma, {
      skillProfile: weakProfile,
      userMarketplaces: ['WB'],
    });
    expect(result.map((r) => r.id)).toEqual(['published']);
  });

  it('Test 8: пустой результат когда ничего не подходит', async () => {
    const jobs = [
      makeJob({ id: 'only-content', axes: ['CONTENT'] }),
    ];
    const prisma = mockPrisma(jobs);
    const result = await getRecommendedJobsFromGaps(prisma, {
      skillProfile: weakProfile,
      userMarketplaces: ['WB'],
    });
    expect(result).toEqual([]);
  });

  it('Test 9: addedJobIds → isInTrack=true для отмеченных', async () => {
    const jobs = [
      makeJob({ id: 'A', axes: ['FINANCE', 'ANALYTICS'] }),
      makeJob({ id: 'B', axes: ['FINANCE'] }),
    ];
    const prisma = mockPrisma(jobs);
    const result = await getRecommendedJobsFromGaps(prisma, {
      skillProfile: weakProfile,
      userMarketplaces: ['WB'],
      addedJobIds: ['A'],
    });
    expect(result.find((r) => r.id === 'A')?.isInTrack).toBe(true);
    expect(result.find((r) => r.id === 'B')?.isInTrack).toBe(false);
  });
});
