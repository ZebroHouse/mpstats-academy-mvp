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
  it('PROFILES.academy-lesson exists with audio + frame + text source types', () => {
    const p = PROFILES['academy-lesson'];
    expect(p.sourceTypes).toEqual(['academy_audio', 'academy_video_frame', 'academy_text']);
    expect(p.trustTiers).toEqual([1]);
    expect(p.maxResults).toBe(8);
  });

  it('retrieve("academy-lesson") forwards profile filters to searchChunks', async () => {
    await retrieve('academy-lesson', { query: 'тест' });
    expect(searchChunksMock).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'тест',
        sourceTypes: ['academy_audio', 'academy_video_frame', 'academy_text'],
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

describe('retrieve() — visual keyword boost', () => {
  it('isVisualQuery detects визуальные ключевые слова', async () => {
    const { isVisualQuery } = await import('../profiles');
    expect(isVisualQuery('какая ссылка на экране?')).toBe(true);
    expect(isVisualQuery('число товаров в таблице')).toBe(true);
    expect(isVisualQuery('какие инструменты упоминаются')).toBe(true);
    expect(isVisualQuery('расскажи про методику бол-мотивация')).toBe(false);
    expect(isVisualQuery('что такое юнит-экономика')).toBe(false);
  });

  it('does single pass for non-visual queries', async () => {
    searchChunksMock.mockClear();
    searchChunksMock.mockResolvedValue([]);
    await retrieve('academy-lesson', { query: 'что такое юнит-экономика' });
    expect(searchChunksMock).toHaveBeenCalledTimes(1);
  });

  it('does two passes for visual queries (mixed + frame-only at lower threshold)', async () => {
    searchChunksMock.mockClear();
    searchChunksMock.mockResolvedValue([]);
    await retrieve('academy-lesson', { query: 'какая ссылка показана на экране' });
    expect(searchChunksMock).toHaveBeenCalledTimes(2);
    const secondCall = searchChunksMock.mock.calls[1][0];
    expect(secondCall.sourceTypes).toEqual(['academy_video_frame']);
    expect(secondCall.threshold).toBe(0.3);
  });

  it('merges and dedupes by id, sorted by similarity desc', async () => {
    searchChunksMock.mockClear();
    searchChunksMock
      .mockResolvedValueOnce([
        { id: 'a', similarity: 0.6, source_type: 'academy_audio', lesson_id: 'l', content: 'a', timecode_start: 0, timecode_end: 10, trust_tier: 1 },
        { id: 'shared', similarity: 0.5, source_type: 'academy_video_frame', lesson_id: 'l', content: 's', timecode_start: 30, timecode_end: 30, trust_tier: 1 },
      ])
      .mockResolvedValueOnce([
        { id: 'shared', similarity: 0.5, source_type: 'academy_video_frame', lesson_id: 'l', content: 's', timecode_start: 30, timecode_end: 30, trust_tier: 1 },
        { id: 'f', similarity: 0.4, source_type: 'academy_video_frame', lesson_id: 'l', content: 'f', timecode_start: 60, timecode_end: 60, trust_tier: 1 },
      ]);
    const result = await retrieve('academy-lesson', { query: 'какая ссылка' });
    expect(result.map(r => r.id)).toEqual(['a', 'shared', 'f']);
  });
});
