import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockEmbHits = vi.hoisted(() => vi.fn());
const mockChunkHits = vi.hoisted(() => vi.fn());
const mockSynth = vi.hoisted(() => vi.fn());

vi.mock('../retrieval', () => ({
  searchJobsByEmbedding: mockEmbHits,
  aggregateChunksToJobs: mockChunkHits,
  mergeJobCandidates: (a: any[], b: any[]) => [...a, ...b],
}));
vi.mock('../synthesize', () => ({ synthesizeIntentResponse: mockSynth }));

import { resolveIntent } from '../resolve';

beforeEach(() => { vi.clearAllMocks(); });

describe('resolveIntent', () => {
  it('runs both retrievers in parallel and passes merged candidates to synth', async () => {
    mockEmbHits.mockResolvedValue([{ jobId: 'j1', combinedScore: 0.8 }]);
    mockChunkHits.mockResolvedValue([{ jobId: 'j2', combinedScore: 0.6 }]);
    mockSynth.mockResolvedValue({ mode: 'empty', message: 'm' });
    await resolveIntent({ query: 'q', surface: 'learn' });
    expect(mockSynth).toHaveBeenCalledWith(expect.objectContaining({
      query: 'q',
      candidates: expect.arrayContaining([
        expect.objectContaining({ jobId: 'j1' }),
        expect.objectContaining({ jobId: 'j2' }),
      ]),
    }));
  });
});
