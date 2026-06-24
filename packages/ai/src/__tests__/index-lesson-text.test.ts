import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../embeddings', () => ({
  embedQuery: vi.fn().mockResolvedValue(new Array(1536).fill(0.01)),
}));

import { indexLessonText } from '../text-index';
import { embedQuery } from '../embeddings';

function makePrisma() {
  return {
    $executeRaw: vi.fn().mockResolvedValue(1),
    $executeRawUnsafe: vi.fn().mockResolvedValue(1),
  } as any;
}

const doc = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Юнит-экономика — это про маржу.' }] },
  ],
};

describe('indexLessonText', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes old text chunks then inserts one chunk per segment', async () => {
    const prisma = makePrisma();
    const res = await indexLessonText({ prisma, lessonId: 'c1_text_x', skillCategory: 'ANALYTICS', doc });
    expect(res.chunks).toBe(1);
    expect(embedQuery).toHaveBeenCalledTimes(1);
    // 1 delete + 1 insert
    expect(prisma.$executeRawUnsafe).toHaveBeenCalled();
  });

  it('only deletes (no embed) when body has no text', async () => {
    const prisma = makePrisma();
    const res = await indexLessonText({ prisma, lessonId: 'c1_text_x', skillCategory: null, doc: { type: 'doc', content: [] } });
    expect(res.chunks).toBe(0);
    expect(embedQuery).not.toHaveBeenCalled();
  });
});
