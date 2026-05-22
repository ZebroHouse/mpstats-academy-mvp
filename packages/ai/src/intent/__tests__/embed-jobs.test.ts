import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockEmbedQuery = vi.hoisted(() => vi.fn());
const mockJobFindMany = vi.hoisted(() => vi.fn());
const mockExecuteRaw = vi.hoisted(() => vi.fn());

vi.mock('../../embeddings', () => ({ embedQuery: mockEmbedQuery }));
vi.mock('@mpstats/db/client', () => ({
  prisma: {
    job: { findMany: mockJobFindMany },
    $executeRawUnsafe: mockExecuteRaw,
  },
}));

import { embedJob, buildJobText } from '../embed-jobs';

beforeEach(() => { vi.clearAllMocks(); });

describe('buildJobText', () => {
  it('concatenates title, description and lesson topics', () => {
    const txt = buildJobText({
      title: 'Снизить ДРР',
      description: 'Оптимизация рекламы WB',
      lessons: [{ title: 'Что такое ДРР' }, { title: 'Биддер ставок' }],
    });
    expect(txt).toContain('Снизить ДРР');
    expect(txt).toContain('Оптимизация рекламы WB');
    expect(txt).toContain('Что такое ДРР');
    expect(txt).toContain('Биддер ставок');
  });
});

describe('embedJob', () => {
  it('skips when embedding already exists and force=false', async () => {
    await embedJob({ id: 'j1', embedding: [0.1], title: 't', description: 'd', lessons: [] }, { force: false });
    expect(mockEmbedQuery).not.toHaveBeenCalled();
    expect(mockExecuteRaw).not.toHaveBeenCalled();
  });

  it('embeds and writes UPDATE with vector literal', async () => {
    mockEmbedQuery.mockResolvedValue(new Array(1536).fill(0.01));
    await embedJob({ id: 'j1', embedding: null, title: 'X', description: 'Y', lessons: [{ title: 'Z' }] }, { force: false });
    expect(mockEmbedQuery).toHaveBeenCalledOnce();
    expect(mockExecuteRaw).toHaveBeenCalledOnce();
    const [sql] = mockExecuteRaw.mock.calls[0];
    expect(sql).toMatch(/UPDATE "Job" SET "embedding"/);
    expect(sql).toMatch(/'\[0\.01,0\.01.*?\]'::vector/);
    expect(sql).toMatch(/WHERE "id" = 'j1'/);
  });
});
