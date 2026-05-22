import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockEmbed = vi.hoisted(() => vi.fn());
const mockRawQuery = vi.hoisted(() => vi.fn());
const mockSearchChunks = vi.hoisted(() => vi.fn());
const mockJobLessonFindMany = vi.hoisted(() => vi.fn());

vi.mock('../../embeddings', () => ({ embedQuery: mockEmbed }));
vi.mock('../../retrieval', () => ({ searchChunks: mockSearchChunks }));
vi.mock('@mpstats/db/client', () => ({
  prisma: {
    $queryRawUnsafe: mockRawQuery,
    jobLesson: { findMany: mockJobLessonFindMany },
    job: { findMany: vi.fn() },
  },
}));

import { searchJobsByEmbedding, aggregateChunksToJobs, mergeJobCandidates } from '../retrieval';

beforeEach(() => { vi.clearAllMocks(); });

describe('searchJobsByEmbedding', () => {
  it('returns ranked jobs above threshold', async () => {
    mockEmbed.mockResolvedValue([0.1, 0.2]);
    mockRawQuery.mockResolvedValue([
      { id: 'j1', title: 'A', description: 'd', lesson_count: 5, similarity: 0.82 },
      { id: 'j2', title: 'B', description: null, lesson_count: 3, similarity: 0.61 },
    ]);
    const out = await searchJobsByEmbedding('запрос', { limit: 10, threshold: 0.5 });
    expect(out).toHaveLength(2);
    expect(out[0].jobId).toBe('j1');
    expect(out[0].jobEmbeddingSim).toBeCloseTo(0.82, 2);
  });
});

describe('aggregateChunksToJobs', () => {
  it('rolls chunk hits up to parent jobs via JobLesson join', async () => {
    mockSearchChunks.mockResolvedValue([
      { id: 'c1', lesson_id: 'l1', content: 's1', similarity: 0.7 },
      { id: 'c2', lesson_id: 'l2', content: 's2', similarity: 0.65 },
      { id: 'c3', lesson_id: 'l1', content: 's3', similarity: 0.55 },
    ]);
    // l1→j1, l2→j1 (both lessons belong to the same job)
    mockJobLessonFindMany.mockResolvedValue([
      { lessonId: 'l1', jobId: 'j1' },
      { lessonId: 'l2', jobId: 'j1' },
    ]);
    const out = await aggregateChunksToJobs('q', { chunkLimit: 30 });
    expect(out).toHaveLength(1);
    expect(out[0].jobId).toBe('j1');
    expect(out[0].topChunkSim).toBeCloseTo(0.7, 2);
    expect(out[0].topSnippets).toHaveLength(2); // top-2 per job
  });
});

describe('mergeJobCandidates', () => {
  it('combines scores: 0.7 * jobEmb + 0.3 * topChunk', () => {
    const merged = mergeJobCandidates(
      [{ jobId: 'j1', title: 'T', description: null, lessonCount: 5, jobEmbeddingSim: 0.8, topChunkSim: 0, combinedScore: 0, topSnippets: [] }],
      [{ jobId: 'j1', title: 'T', description: null, lessonCount: 5, jobEmbeddingSim: 0, topChunkSim: 0.6, combinedScore: 0, topSnippets: [{ content: 's', similarity: 0.6 }] }],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].combinedScore).toBeCloseTo(0.7 * 0.8 + 0.3 * 0.6, 2);
    expect(merged[0].topSnippets).toHaveLength(1);
  });

  it('keeps jobs that appeared only in one source', () => {
    const merged = mergeJobCandidates(
      [{ jobId: 'j1', title: 'T', description: null, lessonCount: 5, jobEmbeddingSim: 0.8, topChunkSim: 0, combinedScore: 0, topSnippets: [] }],
      [{ jobId: 'j2', title: 'T2', description: null, lessonCount: 5, jobEmbeddingSim: 0, topChunkSim: 0.7, combinedScore: 0, topSnippets: [] }],
    );
    expect(merged).toHaveLength(2);
    const j1 = merged.find((j) => j.jobId === 'j1')!;
    const j2 = merged.find((j) => j.jobId === 'j2')!;
    expect(j1.combinedScore).toBeCloseTo(0.7 * 0.8 + 0.3 * 0, 2);
    expect(j2.combinedScore).toBeCloseTo(0.7 * 0 + 0.3 * 0.7, 2);
  });
});
