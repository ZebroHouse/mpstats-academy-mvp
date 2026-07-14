import { describe, it, expect, vi, beforeEach } from 'vitest';

const { queryRawUnsafe, embedQuery } = vi.hoisted(() => ({
  queryRawUnsafe: vi.fn(),
  embedQuery: vi.fn(),
}));
vi.mock('@mpstats/db/client', () => ({ prisma: { $queryRawUnsafe: queryRawUnsafe } }));
vi.mock('../../embeddings', () => ({ embedQuery }));

import { searchMaterialsByEmbedding } from './retrieve-materials';

describe('searchMaterialsByEmbedding', () => {
  beforeEach(() => { queryRawUnsafe.mockReset(); embedQuery.mockReset().mockResolvedValue([0.1, 0.2]); });

  it('маппит строки БД в MaterialCandidate', async () => {
    queryRawUnsafe.mockResolvedValue([
      { id: 'm1', type: 'CHECKLIST', title: 'Чек-лист', description: 'd', cta_text: 'Скачать', external_url: null, has_file: true, similarity: 0.7 },
    ]);
    const r = await searchMaterialsByEmbedding('как проверить карточку', { limit: 6, threshold: 0.3 });
    expect(r).toEqual([
      { materialId: 'm1', type: 'CHECKLIST', title: 'Чек-лист', description: 'd', ctaText: 'Скачать', externalUrl: null, hasFile: true, similarity: 0.7 },
    ]);
    expect(embedQuery).toHaveBeenCalledWith('как проверить карточку');
  });

  it('пустой результат → []', async () => {
    queryRawUnsafe.mockResolvedValue([]);
    expect(await searchMaterialsByEmbedding('x', {})).toEqual([]);
  });
});
