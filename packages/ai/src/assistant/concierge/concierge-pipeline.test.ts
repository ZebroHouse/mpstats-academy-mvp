import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted: vi.mock хойстится выше объявлений — обычный const в фабрике даёт TDZ ReferenceError.
const { matchTopK, synthesizeConcierge, resolveCourseFacts, embedQuery } = vi.hoisted(() => ({
  matchTopK: vi.fn(),
  synthesizeConcierge: vi.fn(),
  resolveCourseFacts: vi.fn(),
  embedQuery: vi.fn(),
}));

vi.mock('./concierge-match', async (orig) => ({ ...(await orig<any>()), matchTopK }));
vi.mock('./concierge-synthesize', async (orig) => ({ ...(await orig<any>()), synthesizeConcierge }));
vi.mock('./course-facts', async (orig) => ({ ...(await orig<any>()), resolveCourseFacts }));
vi.mock('../../embeddings', () => ({ embedQuery }));
vi.mock('./platform-map.embeddings', () => ({
  MAP_EMBEDDINGS: [
    { id: 'cancel-subscription', vec: [1, 0] },
    { id: 'course-catalog', vec: [0, 1] },
  ],
}));

import { runConciergePipeline } from './concierge-pipeline';

describe('runConciergePipeline', () => {
  beforeEach(() => {
    matchTopK.mockReset();
    synthesizeConcierge.mockReset();
    resolveCourseFacts.mockReset();
    embedQuery.mockReset().mockResolvedValue([1, 0]);
  });

  it('промах (пусто) → честный отказ + /support', async () => {
    matchTopK.mockReturnValue([]);
    const r = await runConciergePipeline({ query: 'непонятно', history: [] });
    expect(r.navLinks).toEqual([{ label: 'Написать в поддержку', href: '/support' }]);
    expect(synthesizeConcierge).not.toHaveBeenCalled();
  });

  it('static-хит → синтез + whitelisted deep-link', async () => {
    matchTopK.mockReturnValue([{ id: 'cancel-subscription', score: 0.9 }]);
    synthesizeConcierge.mockResolvedValue('Открой Профиль → Подписка → Отменить.');
    const r = await runConciergePipeline({ query: 'как отписаться', history: [] });
    expect(r.answer).toContain('Отменить');
    expect(r.navLinks).toEqual([{ label: 'Открыть Профиль', href: '/profile' }]);
    expect(resolveCourseFacts).not.toHaveBeenCalled();
  });

  it('dynamic-хит → тянет факты курсов', async () => {
    matchTopK.mockReturnValue([{ id: 'course-catalog', score: 0.8 }]);
    resolveCourseFacts.mockResolvedValue([{ title: 'Аналитика', lessonCount: 12, topics: ['Ниши'] }]);
    synthesizeConcierge.mockResolvedValue('В курсе Аналитика 12 уроков.');
    const r = await runConciergePipeline({ query: 'сколько уроков в аналитике', history: [] });
    expect(resolveCourseFacts).toHaveBeenCalled();
    expect(synthesizeConcierge).toHaveBeenCalledWith(expect.objectContaining({ courseFacts: expect.stringContaining('Аналитика') }));
  });
});
