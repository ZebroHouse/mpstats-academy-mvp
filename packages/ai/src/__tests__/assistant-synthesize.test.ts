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

  it('при невалидном JSON возвращает fallback-ответ без карточек', async () => {
    createMock.mockResolvedValueOnce({ choices: [{ message: { content: 'сломано' } }] });
    const r = await synthesizeAssistantResponse({ query: 'q', history: [], lessonCandidates: lessonCands, jobCandidates: jobCands, materialCandidates: [] });
    expect(r.navLinks).toEqual([]);
    expect(r.lessons).toEqual([]);
    expect(r.answer.length).toBeGreaterThan(0);
  });
});
