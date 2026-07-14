import { describe, it, expect, vi, beforeEach } from 'vitest';

const createMock = vi.fn();
vi.mock('../openrouter', () => ({
  getOpenRouterClient: () => ({ chat: { completions: { create: createMock } } }),
  MODELS: { chat: 'openai/gpt-4.1-mini' },
}));
vi.mock('../generation', () => ({ fixBrandNames: (s: string) => s }));

import { synthesizeAssistantResponse } from '../assistant/synthesize';
import type { LessonCandidate } from '../assistant/types';
import type { JobCandidate } from '../intent/types';

const lessonCands: LessonCandidate[] = [
  { lessonId: 'L1', title: 'ДРР урок', durationMin: 12, courseTitle: 'Реклама', snippet: '...', similarity: 0.8 },
];
const jobCands = [
  { jobId: 'J1', title: 'Настроить рекламу WB', slug: 'nastroit-reklamu', lessonCount: 7 } as JobCandidate,
];
const materialCands = [
  { materialId: 'M1', type: 'CHECKLIST', title: 'Чек-лист карточки', description: null, ctaText: 'Скачать', externalUrl: null, hasFile: true, similarity: 0.7 },
  { materialId: 'M2', type: 'CALCULATION_TABLE', title: 'Таблица юнит-экономики', description: null, ctaText: 'Открыть', externalUrl: 'https://x', hasFile: false, similarity: 0.6 },
  { materialId: 'M3', type: 'MEMO', title: 'Памятка по возвратам', description: null, ctaText: 'Открыть', externalUrl: null, hasFile: true, similarity: 0.55 },
];

function mockReply(json: unknown) {
  createMock.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(json) } }] });
}

describe('synthesizeAssistantResponse', () => {
  beforeEach(() => createMock.mockReset());

  it('обогащает whitelisted lessonIds/jobIds метаданными кандидатов', async () => {
    mockReply({ answer: 'ДРР — доля рекламных расходов ...', lessonIds: ['L1'], jobIds: ['J1'] });
    const r = await synthesizeAssistantResponse({ query: 'ДРР?', history: [], lessonCandidates: lessonCands, jobCandidates: jobCands, materialCandidates: [] });
    expect(r.navLinks).toEqual([]);
    expect(r.answer).toContain('ДРР');
    expect(r.lessons[0].title).toBe('ДРР урок');
    expect(r.jobs[0].slug).toBe('nastroit-reklamu');
  });

  it('выбрасывает выдуманные id, которых нет в кандидатах (anti-hallucination)', async () => {
    mockReply({ answer: 'текст', lessonIds: ['GHOST', 'L1'], jobIds: ['FAKE'] });
    const r = await synthesizeAssistantResponse({ query: 'q', history: [], lessonCandidates: lessonCands, jobCandidates: jobCands, materialCandidates: [] });
    expect(r.lessons.map((l) => l.lessonId)).toEqual(['L1']);
    expect(r.jobs).toEqual([]);
  });

  it('whitelist материалов + кап 2, ghost выброшен', async () => {
    mockReply({ answer: 'текст', lessonIds: [], jobIds: [], materialIds: ['GHOST', 'M1', 'M2', 'M3'] });
    const r = await synthesizeAssistantResponse({ query: 'чек-лист по карточке', history: [], lessonCandidates: [], jobCandidates: [], materialCandidates: materialCands });
    expect(r.materials.map((m) => m.materialId)).toEqual(['M1', 'M2']);
    expect(r.materials[0]).toMatchObject({ isAccessible: true, hasFile: true });
  });

  it('материалы не отдаются при отсутствии materialIds', async () => {
    mockReply({ answer: 'текст', lessonIds: [], jobIds: [] });
    const r = await synthesizeAssistantResponse({ query: 'q', history: [], lessonCandidates: [], jobCandidates: [], materialCandidates: materialCands });
    expect(r.materials).toEqual([]);
  });

  it('фолбэк: явный запрос («дай чек-лист») + LLM пусто → самый релевантный кандидат', async () => {
    mockReply({ answer: 'текст', lessonIds: [], jobIds: [], materialIds: [] });
    const r = await synthesizeAssistantResponse({ query: 'дай чек-лист по карточке', history: [], lessonCandidates: [], jobCandidates: [], materialCandidates: materialCands });
    expect(r.materials.map((m) => m.materialId)).toEqual(['M1']); // топ по similarity (0.7)
  });

  it('фолбэк НЕ срабатывает при слабом топ-кандидате (<0.5)', async () => {
    mockReply({ answer: 'текст', lessonIds: [], jobIds: [], materialIds: [] });
    const weak = materialCands.map((m) => ({ ...m, similarity: 0.4 }));
    const r = await synthesizeAssistantResponse({ query: 'дай чек-лист', history: [], lessonCandidates: [], jobCandidates: [], materialCandidates: weak });
    expect(r.materials).toEqual([]);
  });

  it('фолбэк НЕ срабатывает без явного запроса материала', async () => {
    mockReply({ answer: 'текст', lessonIds: [], jobIds: [], materialIds: [] });
    const r = await synthesizeAssistantResponse({ query: 'как поднять продажи', history: [], lessonCandidates: [], jobCandidates: [], materialCandidates: materialCands });
    expect(r.materials).toEqual([]);
  });

  it('при невалидном JSON возвращает fallback-ответ без карточек', async () => {
    createMock.mockResolvedValueOnce({ choices: [{ message: { content: 'сломано' } }] });
    const r = await synthesizeAssistantResponse({ query: 'q', history: [], lessonCandidates: lessonCands, jobCandidates: jobCands, materialCandidates: [] });
    expect(r.navLinks).toEqual([]);
    expect(r.lessons).toEqual([]);
    expect(r.answer.length).toBeGreaterThan(0);
  });
});
