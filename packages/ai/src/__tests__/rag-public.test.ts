import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@mpstats/db', () => ({
  prisma: {
    lesson: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('../retrieval', () => ({
  searchChunks: vi.fn(),
}));

import { searchChunksPublic, DEEPLINK_BASE } from '../rag-public';
import { searchChunks } from '../retrieval';
import { prisma } from '@mpstats/db';

const mockedSearchChunks = vi.mocked(searchChunks);
const mockedLessonFindMany = vi.mocked(prisma.lesson.findMany);

beforeEach(() => {
  mockedSearchChunks.mockReset();
  mockedLessonFindMany.mockReset();
});

describe('searchChunksPublic', () => {
  it('returns empty array when retrieval returns nothing', async () => {
    mockedSearchChunks.mockResolvedValue([]);
    mockedLessonFindMany.mockResolvedValue([]);
    const result = await searchChunksPublic({ query: 'нет совпадений' });
    expect(result.chunks).toEqual([]);
    expect(mockedLessonFindMany).not.toHaveBeenCalled();
  });

  it('joins lesson/course titles and builds deeplinks', async () => {
    mockedSearchChunks.mockResolvedValue([
      {
        id: 'chunk-1',
        lesson_id: 'lesson_card_001',
        content: 'Размерная сетка снижает возвраты…',
        timecode_start: 750,
        timecode_end: 820,
        similarity: 0.87,
        source_type: 'video',
        trust_tier: 1,
      },
    ]);
    mockedLessonFindMany.mockResolvedValue([
      {
        id: 'lesson_card_001',
        title: 'Карточка товара: размерная сетка',
        course: { id: 'course_ads_3', title: 'Внутренняя реклама 3.0' },
      },
    ] as unknown as Awaited<ReturnType<typeof prisma.lesson.findMany>>);

    const result = await searchChunksPublic({ query: 'размерная сетка' });

    expect(result.chunks).toHaveLength(1);
    const chunk = result.chunks[0]!;
    expect(chunk.lessonId).toBe('lesson_card_001');
    expect(chunk.lessonTitle).toBe('Карточка товара: размерная сетка');
    expect(chunk.courseTitle).toBe('Внутренняя реклама 3.0');
    expect(chunk.content).toContain('Размерная сетка');
    expect(chunk.similarity).toBeCloseTo(0.87, 3);
    expect(chunk.source_type).toBe('video');
    expect(chunk.trust_tier).toBe(1);
    expect(chunk.deeplink).toBe(`${DEEPLINK_BASE}/learn/lesson_card_001?t=750`);
  });

  it('deduplicates lesson ID lookups (one query per unique lesson)', async () => {
    mockedSearchChunks.mockResolvedValue([
      { id: 'c1', lesson_id: 'L1', content: 'a', timecode_start: 10, timecode_end: 30, similarity: 0.9, source_type: 'video', trust_tier: 1 },
      { id: 'c2', lesson_id: 'L1', content: 'b', timecode_start: 40, timecode_end: 60, similarity: 0.8, source_type: 'video', trust_tier: 1 },
      { id: 'c3', lesson_id: 'L2', content: 'c', timecode_start: 0, timecode_end: 20, similarity: 0.7, source_type: 'video', trust_tier: 1 },
    ]);
    mockedLessonFindMany.mockResolvedValue([
      { id: 'L1', title: 'L1 title', course: { id: 'C1', title: 'C1 title' } },
      { id: 'L2', title: 'L2 title', course: { id: 'C2', title: 'C2 title' } },
    ] as unknown as Awaited<ReturnType<typeof prisma.lesson.findMany>>);

    await searchChunksPublic({ query: 'whatever' });

    expect(mockedLessonFindMany).toHaveBeenCalledTimes(1);
    const call = mockedLessonFindMany.mock.calls[0]![0];
    const whereIn = (call as { where: { id: { in: string[] } } }).where.id.in;
    expect(whereIn.sort()).toEqual(['L1', 'L2']);
  });

  it('falls back to lesson id when title row missing (defensive)', async () => {
    mockedSearchChunks.mockResolvedValue([
      { id: 'c1', lesson_id: 'orphan', content: 'a', timecode_start: 5, timecode_end: 10, similarity: 0.8, source_type: 'video', trust_tier: 1 },
    ]);
    mockedLessonFindMany.mockResolvedValue([]);

    const result = await searchChunksPublic({ query: 'orphan' });
    expect(result.chunks[0]!.lessonTitle).toBe('orphan');
    expect(result.chunks[0]!.courseTitle).toBe('');
  });

  it('passes through limit/threshold/sourceTypes/trustTiers to searchChunks', async () => {
    mockedSearchChunks.mockResolvedValue([]);
    await searchChunksPublic({
      query: 'q',
      limit: 3,
      threshold: 0.6,
      sourceTypes: ['video'],
      trustTiers: [1, 2],
    });
    expect(mockedSearchChunks).toHaveBeenCalledWith({
      query: 'q',
      limit: 3,
      threshold: 0.6,
      includeHidden: false,
      sourceTypes: ['video'],
      trustTiers: [1, 2],
    });
  });

  it('always passes includeHidden: false (caller cannot override)', async () => {
    mockedSearchChunks.mockResolvedValue([]);
    await searchChunksPublic({ query: 'q' } as { query: string });
    const call = mockedSearchChunks.mock.calls[0]![0];
    expect(call.includeHidden).toBe(false);
  });
});
