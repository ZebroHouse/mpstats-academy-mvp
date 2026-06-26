import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// server-only guard throws in non-server environments — mock it out
vi.mock('server-only', () => ({}));

const mockSearchChunks = vi.hoisted(() => vi.fn());
const mockLessonFindMany = vi.hoisted(() => vi.fn());
const mockSubscriptions = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const mockBillingFlag = vi.hoisted(() => vi.fn().mockResolvedValue(true)); // billing enabled
const mockAdminBypass = vi.hoisted(() => vi.fn().mockResolvedValue(false)); // NOT admin
const mockPathFindUnique = vi.hoisted(() => vi.fn().mockResolvedValue(null));

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
    // Use the REAL isLessonAccessible so partner logic is exercised
    isLessonAccessible: (orig as any).isLessonAccessible,
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
  jobLesson: { findMany: vi.fn().mockResolvedValue([]) },
  learningPath: { findUnique: mockPathFindUnique },
  userProfile: {
    findUnique: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue({}),
  },
};

const ctx = { user: { id: 'user-1' }, prisma: ctxPrismaStub as any };

import { aiRouter } from '../ai';

const caller = () => aiRouter.createCaller(ctx as any);

/** Partner lesson row: order > 2, course.partnerKey = 'mpstats' */
function partnerLessonRow(over: Partial<any> = {}) {
  return {
    id: 'lp1',
    courseId: 'partner-course-1',
    title: 'Инструмент анализа конкурентов',
    description: 'Обзор инструмента',
    duration: 8,
    order: 5, // > 2 → normally locked without subscription
    skillCategory: 'ANALYTICS',
    skillLevel: 'MEDIUM',
    skillCategories: [],
    topics: [],
    isHidden: false,
    course: { id: 'partner-course-1', title: 'MPSTATS Tools', isHidden: false, partnerKey: 'mpstats' },
    progress: [],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSubscriptions.mockResolvedValue([]); // no subscription
  mockBillingFlag.mockResolvedValue(true);  // billing enabled
  mockAdminBypass.mockResolvedValue(false); // not admin
  mockPathFindUnique.mockResolvedValue(null);
  process.env.PARTNER_COURSES_ENABLED = 'true'; // partner section enabled (staging-like)
});

afterEach(() => {
  delete process.env.PARTNER_COURSES_ENABLED;
});

describe('ai.searchLessons — partner course handling', () => {
  it('partner lesson (partnerKey=mpstats, order>2) appears unlocked with isPartner=true for user with no subscription', async () => {
    // Semantic hit on partner lesson
    mockSearchChunks.mockResolvedValue([
      {
        id: 'ch-p1',
        lesson_id: 'lp1',
        content: 'анализ конкурентов через mpstats',
        timecode_start: 0,
        timecode_end: 15,
        source_type: 'academy_audio',
        trust_tier: 1,
        similarity: 0.85,
      },
    ]);
    mockLessonFindMany
      // 1st findMany: keyword query (id/title/description) — no keyword match
      .mockResolvedValueOnce([])
      // 2nd findMany: enrichment — returns the partner lesson
      .mockResolvedValueOnce([partnerLessonRow()]);

    const res = await caller().searchLessons({ query: 'конкуренты mpstats' });

    expect(res.results).toHaveLength(1);
    const result = res.results[0];

    // Must NOT be locked — partner free access
    expect(result.locked).toBe(false);

    // Must carry partner routing hint
    expect((result as any).isPartner).toBe(true);
  });

  it('non-partner lesson with order>2 stays locked when billing enabled and no subscription', async () => {
    mockSearchChunks.mockResolvedValue([
      {
        id: 'ch-r1',
        lesson_id: 'lr1',
        content: 'обычный урок по аналитике',
        timecode_start: 0,
        timecode_end: 10,
        source_type: 'academy_audio',
        trust_tier: 1,
        similarity: 0.75,
      },
    ]);
    mockLessonFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'lr1',
          courseId: 'regular-course-1',
          title: 'Аналитика продаж',
          description: 'Обычный урок',
          duration: 12,
          order: 5, // > 2 → locked without subscription
          skillCategory: 'ANALYTICS',
          skillLevel: 'MEDIUM',
          skillCategories: [],
          topics: [],
          isHidden: false,
          course: { id: 'regular-course-1', title: 'Аналитика', isHidden: false, partnerKey: null },
          progress: [],
        },
      ]);

    const res = await caller().searchLessons({ query: 'аналитика продаж' });

    expect(res.results).toHaveLength(1);
    const result = res.results[0];

    // Non-partner, no subscription, order>2 → must be locked
    expect(result.locked).toBe(true);
    expect((result as any).isPartner).toBe(false);
  });

  it('partner lesson is filtered OUT of search results when PARTNER_COURSES_ENABLED is off (prod gate)', async () => {
    process.env.PARTNER_COURSES_ENABLED = 'false';
    mockSearchChunks.mockResolvedValue([
      {
        id: 'ch-p1',
        lesson_id: 'lp1',
        content: 'анализ конкурентов через mpstats',
        timecode_start: 0,
        timecode_end: 15,
        source_type: 'academy_audio',
        trust_tier: 1,
        similarity: 0.85,
      },
    ]);
    mockLessonFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([partnerLessonRow()]);

    const res = await caller().searchLessons({ query: 'конкуренты mpstats' });

    // Flag off → partner lessons excluded from search entirely
    expect(res.results).toHaveLength(0);
  });
});
