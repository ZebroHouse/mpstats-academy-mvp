import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@mpstats/db/client', () => ({
  prisma: {
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../embeddings', () => ({
  embedQuery: vi.fn().mockResolvedValue(new Array(1536).fill(0.1)),
}));

import { searchChunks } from '../retrieval';
import { prisma } from '@mpstats/db/client';

describe('searchChunks with source_type / trust_tier filters', () => {
  it('builds SQL with source_type filter when sourceTypes provided', async () => {
    await searchChunks({
      query: 'test query',
      sourceTypes: ['academy_audio', 'academy_video_frame'],
    });
    const sqlArg = (prisma.$queryRawUnsafe as any).mock.calls.at(-1)[0];
    expect(sqlArg).toContain("c.source_type = ANY(ARRAY['academy_audio','academy_video_frame'])");
  });

  it('builds SQL with trust_tier filter when trustTiers provided', async () => {
    await searchChunks({
      query: 'test query',
      trustTiers: [1, 2],
    });
    const sqlArg = (prisma.$queryRawUnsafe as any).mock.calls.at(-1)[0];
    expect(sqlArg).toContain('c.trust_tier = ANY(ARRAY[1,2])');
  });

  it('omits source_type filter when sourceTypes is empty/undefined', async () => {
    await searchChunks({ query: 'test query' });
    const sqlArg = (prisma.$queryRawUnsafe as any).mock.calls.at(-1)[0];
    expect(sqlArg).not.toContain('c.source_type = ANY');
  });

  it('returns chunk source_type in result rows', async () => {
    (prisma.$queryRawUnsafe as any).mockResolvedValueOnce([
      {
        id: 'x',
        lesson_id: 'l',
        content: 'c',
        timecode_start: 0,
        timecode_end: 1,
        similarity: 0.9,
        source_type: 'academy_video_frame',
      },
    ]);
    const result = await searchChunks({ query: 'q' });
    expect(result[0].source_type).toBe('academy_video_frame');
  });
});
