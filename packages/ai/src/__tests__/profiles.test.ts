import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { searchChunksMock } = vi.hoisted(() => ({
  searchChunksMock: vi.fn().mockResolvedValue([]),
}));
vi.mock('../retrieval', async () => {
  const actual = await vi.importActual<typeof import('../retrieval')>('../retrieval');
  return { ...actual, searchChunks: searchChunksMock };
});

import { retrieve, PROFILES } from '../profiles';

describe('retrieve()', () => {
  it('PROFILES.academy-lesson exists with frame + audio source types', () => {
    const p = PROFILES['academy-lesson'];
    expect(p.sourceTypes).toEqual(['academy_audio', 'academy_video_frame']);
    expect(p.trustTiers).toEqual([1]);
    expect(p.maxResults).toBe(8);
  });

  it('retrieve("academy-lesson") forwards profile filters to searchChunks', async () => {
    await retrieve('academy-lesson', { query: 'тест' });
    expect(searchChunksMock).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'тест',
        sourceTypes: ['academy_audio', 'academy_video_frame'],
        trustTiers: [1],
        limit: 8,
        threshold: 0.5,
      }),
    );
  });

  it('caller can override limit and threshold', async () => {
    await retrieve('academy-lesson', { query: 'q', limit: 3, threshold: 0.7 });
    expect(searchChunksMock).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 3, threshold: 0.7 }),
    );
  });

  it('throws on unknown profile name', async () => {
    await expect(
      retrieve('nonexistent' as any, { query: 'q' }),
    ).rejects.toThrow(/Unknown profile/);
  });
});
