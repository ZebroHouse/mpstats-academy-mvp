import { describe, it, expect, vi, beforeEach } from 'vitest';

// server-only guard throws in non-server environments — mock it out
vi.mock('server-only', () => ({}));

const mockSearchChunks = vi.hoisted(() => vi.fn());
const mockLessonFindMany = vi.hoisted(() => vi.fn());
const mockSubscriptions = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const mockBillingFlag = vi.hoisted(() => vi.fn().mockResolvedValue(false));
const mockAdminBypass = vi.hoisted(() => vi.fn().mockResolvedValue(true));
const mockPathFindUnique = vi.hoisted(() => vi.fn().mockResolvedValue(null));

// Mock @mpstats/ai directly (avoids importing server-only via importOriginal)
vi.mock('@mpstats/ai', () => ({
  searchChunks: mockSearchChunks,
  generateLessonSummary: vi.fn(),
  generateChatResponse: vi.fn(),
}));

vi.mock('../../utils/access', async (importOriginal) => {
  const orig = await importOriginal<Record<string, unknown>>();
  return {
    ...orig,
    getUserActiveSubscriptions: mockSubscriptions,
    getUserAdminBypass: mockAdminBypass,
    isLessonAccessible: () => true,
  };
});

vi.mock('../../utils/feature-flags', async (importOriginal) => {
  const orig = await importOriginal<Record<string, unknown>>();
  return {
    ...orig,
    isFeatureEnabled: mockBillingFlag,
  };
});

const ctxPrismaStub = {
  lesson: { findMany: mockLessonFindMany },
  learningPath: { findUnique: mockPathFindUnique },
  userProfile: {
    findUnique: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue({}),
  },
};

const ctx = { user: { id: 'user-1' }, prisma: ctxPrismaStub as any };

import { aiRouter } from '../ai';

const caller = () => aiRouter.createCaller(ctx as any);

function lessonRow(over: Partial<any> = {}) {
  return {
    id: 'l1',
    courseId: 'c1',
    title: 'Юнит-экономика и маржа',
    description: 'Базовый разбор расчёта',
    duration: 10,
    order: 1,
    skillCategory: 'OPERATIONS',
    skillLevel: 'MEDIUM',
    skillCategories: [],
    topics: [],
    isHidden: false,
    course: { id: 'c1', title: 'Курс', isHidden: false },
    progress: [],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSubscriptions.mockResolvedValue([]);
  mockBillingFlag.mockResolvedValue(false);
  mockAdminBypass.mockResolvedValue(true);
  mockPathFindUnique.mockResolvedValue(null);
});

describe('ai.searchLessons ranking', () => {
  it('strong semantic hit beats a weak title keyword match', async () => {
    // Two lessons:
    //  - l1: title contains the query word "маржа", no chunk hit
    //  - l2: no title/description match, but strong semantic chunk sim=0.92
    mockSearchChunks.mockResolvedValue([
      { id: 'ch1', lesson_id: 'l2', content: 'про маржу подробно', timecode_start: 0, timecode_end: 10, source_type: 'academy_audio', trust_tier: 1, similarity: 0.92 },
    ]);
    mockLessonFindMany
      .mockResolvedValueOnce([{ id: 'l1', title: 'Юнит-экономика и маржа', description: 'X' }]) // keyword query
      .mockResolvedValueOnce([
        lessonRow({ id: 'l1', title: 'Юнит-экономика и маржа' }),
        lessonRow({ id: 'l2', title: 'Другой урок' }),
      ]);

    const res = await caller().searchLessons({ query: 'маржа' });

    // l2 (semantic 0.92) should outrank l1 (title floor 0.8)
    expect(res.results[0].lesson.id).toBe('l2');
    expect(res.results[1].lesson.id).toBe('l1');
    expect(res.results[0].bestSimilarity).toBeCloseTo(0.92, 2);
    expect(res.results[1].bestSimilarity).toBeCloseTo(0.8, 2);
  });

  it('title-only keyword match gets floor 0.8 when there are no chunks', async () => {
    mockSearchChunks.mockResolvedValue([]);
    mockLessonFindMany
      .mockResolvedValueOnce([{ id: 'l1', title: 'SEO карточки товара', description: '' }])
      .mockResolvedValueOnce([lessonRow({ id: 'l1', title: 'SEO карточки товара' })]);

    const res = await caller().searchLessons({ query: 'SEO' });
    expect(res.results).toHaveLength(1);
    expect(res.results[0].bestSimilarity).toBeCloseTo(0.8, 2);
  });

  it('description-only keyword match gets floor 0.65', async () => {
    mockSearchChunks.mockResolvedValue([]);
    mockLessonFindMany
      .mockResolvedValueOnce([{ id: 'l1', title: 'Совсем другое', description: 'упоминается рекламный кабинет' }])
      .mockResolvedValueOnce([lessonRow({ id: 'l1', title: 'Совсем другое', description: 'упоминается рекламный кабинет' })]);

    const res = await caller().searchLessons({ query: 'рекламный' });
    expect(res.results[0].bestSimilarity).toBeCloseTo(0.65, 2);
  });

  it('vector-only hit keeps its own similarity', async () => {
    mockSearchChunks.mockResolvedValue([
      { id: 'ch1', lesson_id: 'l1', content: 'snippet', timecode_start: 0, timecode_end: 10, source_type: 'academy_audio', trust_tier: 1, similarity: 0.7 },
    ]);
    mockLessonFindMany
      .mockResolvedValueOnce([]) // no keyword match
      .mockResolvedValueOnce([lessonRow({ id: 'l1' })]);

    const res = await caller().searchLessons({ query: 'непохожая фраза' });
    expect(res.results[0].bestSimilarity).toBeCloseTo(0.7, 2);
  });
});
