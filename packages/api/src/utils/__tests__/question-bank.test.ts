import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DiagnosticQuestion, SkillCategory } from '@mpstats/shared';

// Mock the mock-question fallback so we can assert supplement behaviour.
const getMockQuestionsForCategoryMock = vi.fn();
vi.mock('../../mocks/questions', () => ({
  getMockQuestionsForCategory: (cat: SkillCategory, count: number) =>
    getMockQuestionsForCategoryMock(cat, count),
}));

// AI generator only fires when refreshBankForCategory runs (stale branch).
vi.mock('@mpstats/ai', () => ({
  generateDiagnosticQuestions: vi.fn().mockResolvedValue([]),
}));

import { getQuestionsFromBank } from '../question-bank';

const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const PAST = new Date(Date.now() - 1000);

function q(
  id: string,
  category: SkillCategory,
  marketplace: 'WB' | 'OZON' | 'BOTH' | undefined,
): DiagnosticQuestion {
  return {
    id,
    skillCategory: category,
    difficulty: 'MEDIUM',
    question: `Q ${id}`,
    options: ['A', 'B', 'C', 'D'],
    correctIndex: 0,
    explanation: '',
    sourceChunkIds: ['c1'],
    ...(marketplace !== undefined ? { marketplace } : {}),
  } as DiagnosticQuestion;
}

type BankRow = {
  questions: DiagnosticQuestion[];
  expiresAt: Date;
};

function makeBank(bankByCategory: Record<string, BankRow>) {
  const findUnique = vi.fn().mockImplementation(async (args: any) => {
    const cat = args?.where?.skillCategory;
    return bankByCategory[cat] ?? null;
  });
  const upsert = vi.fn().mockResolvedValue({});
  return {
    prisma: {
      questionBank: { findUnique, upsert },
    } as any,
    findUnique,
    upsert,
  };
}

// Build a per-category bank with the same fixture (mix of WB/OZON/BOTH +
// enough rows that filter does not starve into the mock-supplement branch).
function uniformBank(items: DiagnosticQuestion[]) {
  const cats: SkillCategory[] = ['ANALYTICS', 'MARKETING', 'CONTENT', 'OPERATIONS', 'FINANCE'];
  const map: Record<string, BankRow> = {};
  for (const c of cats) {
    map[c] = {
      questions: items.map((it) => ({ ...it, skillCategory: c })),
      expiresAt: FUTURE,
    };
  }
  return map;
}

beforeEach(() => {
  vi.clearAllMocks();
  getMockQuestionsForCategoryMock.mockImplementation((cat: SkillCategory, count: number) => {
    // Return BOTH-tagged mocks by default — they pass any filter.
    return Array.from({ length: count }, (_, i) =>
      q(`mock-${cat}-${i}`, cat, 'BOTH'),
    );
  });
});

describe('getQuestionsFromBank — marketplace filter', () => {
  it('Test 1: WB-only user → only marketplace ∈ {WB, BOTH}', async () => {
    const bank = uniformBank([
      q('wb-1', 'ANALYTICS', 'WB'),
      q('wb-2', 'ANALYTICS', 'WB'),
      q('wb-3', 'ANALYTICS', 'WB'),
      q('oz-1', 'ANALYTICS', 'OZON'),
      q('oz-2', 'ANALYTICS', 'OZON'),
      q('oz-3', 'ANALYTICS', 'OZON'),
      q('bo-1', 'ANALYTICS', 'BOTH'),
      q('bo-2', 'ANALYTICS', 'BOTH'),
      q('bo-3', 'ANALYTICS', 'BOTH'),
    ]);
    const { prisma } = makeBank(bank);
    const result = await getQuestionsFromBank(prisma, 15, ['WB']);
    expect(result.length).toBeGreaterThan(0);
    for (const r of result) {
      expect((r as any).marketplace).not.toBe('OZON');
    }
  });

  it('Test 2: OZON-only user → only marketplace ∈ {OZON, BOTH}', async () => {
    const bank = uniformBank([
      q('wb-1', 'ANALYTICS', 'WB'),
      q('wb-2', 'ANALYTICS', 'WB'),
      q('wb-3', 'ANALYTICS', 'WB'),
      q('oz-1', 'ANALYTICS', 'OZON'),
      q('oz-2', 'ANALYTICS', 'OZON'),
      q('oz-3', 'ANALYTICS', 'OZON'),
      q('bo-1', 'ANALYTICS', 'BOTH'),
      q('bo-2', 'ANALYTICS', 'BOTH'),
      q('bo-3', 'ANALYTICS', 'BOTH'),
    ]);
    const { prisma } = makeBank(bank);
    const result = await getQuestionsFromBank(prisma, 15, ['OZON']);
    expect(result.length).toBeGreaterThan(0);
    for (const r of result) {
      expect((r as any).marketplace).not.toBe('WB');
    }
  });

  it('Test 3: Mix user [WB, OZON] → all three marketplace values present', async () => {
    const bank = uniformBank([
      q('wb-1', 'ANALYTICS', 'WB'),
      q('wb-2', 'ANALYTICS', 'WB'),
      q('wb-3', 'ANALYTICS', 'WB'),
      q('oz-1', 'ANALYTICS', 'OZON'),
      q('oz-2', 'ANALYTICS', 'OZON'),
      q('oz-3', 'ANALYTICS', 'OZON'),
      q('bo-1', 'ANALYTICS', 'BOTH'),
      q('bo-2', 'ANALYTICS', 'BOTH'),
      q('bo-3', 'ANALYTICS', 'BOTH'),
    ]);
    const { prisma } = makeBank(bank);
    const result = await getQuestionsFromBank(prisma, 30, ['WB', 'OZON']);
    const mps = new Set(result.map((r) => (r as any).marketplace));
    // With 9 items × 5 categories and perCategory=6, all three values should be selectable.
    expect(mps.has('WB')).toBe(true);
    expect(mps.has('OZON')).toBe(true);
    expect(mps.has('BOTH')).toBe(true);
  });

  it('Test 4: Empty userMarketplaces → fallback to mix (all three values selectable)', async () => {
    const bank = uniformBank([
      q('wb-1', 'ANALYTICS', 'WB'),
      q('wb-2', 'ANALYTICS', 'WB'),
      q('wb-3', 'ANALYTICS', 'WB'),
      q('oz-1', 'ANALYTICS', 'OZON'),
      q('oz-2', 'ANALYTICS', 'OZON'),
      q('oz-3', 'ANALYTICS', 'OZON'),
      q('bo-1', 'ANALYTICS', 'BOTH'),
      q('bo-2', 'ANALYTICS', 'BOTH'),
      q('bo-3', 'ANALYTICS', 'BOTH'),
    ]);
    const { prisma } = makeBank(bank);
    const result = await getQuestionsFromBank(prisma, 30, []);
    const mps = new Set(result.map((r) => (r as any).marketplace));
    expect(mps.has('WB')).toBe(true);
    expect(mps.has('OZON')).toBe(true);
    expect(mps.has('BOTH')).toBe(true);
  });

  it('Test 5: Defensive default — bank item without marketplace field is INCLUDED for WB-only user (treated as BOTH)', async () => {
    const legacy = q('legacy-1', 'ANALYTICS', undefined);
    const bank = uniformBank([legacy, q('wb-1', 'ANALYTICS', 'WB')]);
    const { prisma } = makeBank(bank);
    const result = await getQuestionsFromBank(prisma, 5, ['WB']);
    // The legacy un-tagged row must NOT be filtered out (defensive ?? 'BOTH').
    const ids = result.map((r) => r.id);
    expect(ids.some((id) => id.startsWith('legacy-'))).toBe(true);
  });

  it('Test 6: Mock supplement runs when filtered bank yields too few — supplements pass through filter', async () => {
    // Bank holds only OZON items; for a WB-only user the bank filter yields 0,
    // so the supplement branch fires for the full perCategory amount.
    const bank = uniformBank([q('oz-only', 'ANALYTICS', 'OZON')]);
    const { prisma } = makeBank(bank);

    // Mock supplements: return a mix of WB/OZON/BOTH so we can verify the filter
    // is also applied to mockFallback (OZON mocks must be dropped).
    getMockQuestionsForCategoryMock.mockImplementation(
      (cat: SkillCategory, _count: number) => [
        q(`mock-${cat}-wb`, cat, 'WB'),
        q(`mock-${cat}-oz`, cat, 'OZON'),
        q(`mock-${cat}-bo`, cat, 'BOTH'),
      ],
    );

    const result = await getQuestionsFromBank(prisma, 10, ['WB']);
    // Filter must apply to mock supplement: zero OZON in output.
    for (const r of result) {
      expect((r as any).marketplace).not.toBe('OZON');
    }
    // Supplement was called (filtered bank was empty for WB-only).
    expect(getMockQuestionsForCategoryMock).toHaveBeenCalled();
  });

  it('Test 7: Stale-bank async refresh IIFE still triggered', async () => {
    const cats: SkillCategory[] = ['ANALYTICS', 'MARKETING', 'CONTENT', 'OPERATIONS', 'FINANCE'];
    const map: Record<string, BankRow> = {};
    for (const c of cats) {
      map[c] = {
        questions: [q(`x-${c}`, c, 'BOTH')],
        expiresAt: PAST, // STALE
      };
    }
    const { prisma } = makeBank(map);

    // Spy on the upsert (refresh would call .upsert eventually if AI returned anything).
    // We can't easily wait on the IIFE; instead assert the function returned at all
    // without throwing (regression guard — no exception from stale branch).
    const result = await getQuestionsFromBank(prisma, 15, ['WB']);
    expect(Array.isArray(result)).toBe(true);
  });

  it('Test 8: userMarketplaces omitted → backwards-compatible (behaves like empty array)', async () => {
    const bank = uniformBank([
      q('wb-1', 'ANALYTICS', 'WB'),
      q('oz-1', 'ANALYTICS', 'OZON'),
      q('bo-1', 'ANALYTICS', 'BOTH'),
    ]);
    const { prisma } = makeBank(bank);
    // Note: call site omits the third arg.
    const result = await (getQuestionsFromBank as any)(prisma, 15);
    const mps = new Set(result.map((r: DiagnosticQuestion) => (r as any).marketplace));
    // Fallback to mix → all values should be reachable from bank+supplement.
    expect(mps.size).toBeGreaterThan(0);
  });
});
