import { describe, it, expect, vi, beforeEach } from 'vitest';

const searchChunksMock = vi.fn();
const searchJobsMock = vi.fn();
const aggregateMock = vi.fn();
const mergeMock = vi.fn();
const findManyMock = vi.fn();

vi.mock('../retrieval', () => ({ searchChunks: (...a: unknown[]) => searchChunksMock(...a) }));
vi.mock('../intent/retrieval', () => ({
  searchJobsByEmbedding: (...a: unknown[]) => searchJobsMock(...a),
  aggregateChunksToJobs: (...a: unknown[]) => aggregateMock(...a),
  mergeJobCandidates: (...a: unknown[]) => mergeMock(...a),
}));
vi.mock('../seller-lexicon', () => ({ expandSellerQuery: (q: string) => q + ' [exp]' }));
vi.mock('@mpstats/db', () => ({ prisma: { lesson: { findMany: (...a: unknown[]) => findManyMock(...a) } } }));

import { retrieveForAssistant } from '../assistant/retrieve';

describe('retrieveForAssistant', () => {
  beforeEach(() => {
    searchChunksMock.mockReset();
    searchJobsMock.mockReset();
    aggregateMock.mockReset();
    mergeMock.mockReset();
    findManyMock.mockReset();
  });

  it('группирует чанки в уроки и обогащает заголовками', async () => {
    searchChunksMock.mockResolvedValue([
      { lesson_id: 'L1', content: 'про ДРР ...', similarity: 0.8 },
      { lesson_id: 'L1', content: 'ещё ...', similarity: 0.6 },
      { lesson_id: 'L2', content: 'реклама ...', similarity: 0.7 },
    ]);
    searchJobsMock.mockResolvedValue([]);
    aggregateMock.mockResolvedValue([]);
    mergeMock.mockResolvedValue([]);
    findManyMock.mockResolvedValue([
      { id: 'L1', title: 'ДРР урок', duration: 12, course: { title: 'Реклама' } },
      { id: 'L2', title: 'Ставки', duration: 9, course: { title: 'Реклама' } },
    ]);

    const { lessons, jobs } = await retrieveForAssistant('что такое ДРР');

    expect(searchJobsMock).toHaveBeenCalledWith('что такое ДРР', expect.any(Object));
    expect(lessons).toHaveLength(2);
    const l1 = lessons.find((l) => l.lessonId === 'L1')!;
    expect(l1.title).toBe('ДРР урок');
    expect(l1.similarity).toBeCloseTo(0.8);
    expect(jobs).toEqual([]);
  });
});
