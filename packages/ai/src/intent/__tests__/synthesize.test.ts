import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const mockCreate = vi.hoisted(() => vi.fn());
vi.mock('../../openrouter', () => ({
  openrouter: { chat: { completions: { create: mockCreate } } },
  MODELS: { default: 'openai/gpt-4.1-mini' },
}));

import { synthesizeIntentResponse } from '../synthesize';
import type { JobCandidate } from '../types';

const candidates: JobCandidate[] = [
  {
    jobId: 'j1',
    title: 'Снизить ДРР',
    description: null,
    lessonCount: 5,
    jobEmbeddingSim: 0.82,
    topChunkSim: 0.7,
    combinedScore: 0.78,
    topSnippets: [],
  },
];

function llmResponse(payload: unknown) {
  return { choices: [{ message: { content: JSON.stringify(payload) } }] };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('synthesizeIntentResponse', () => {
  it('passes recommend mode through when LLM picks valid job IDs', async () => {
    mockCreate.mockResolvedValue(
      llmResponse({
        mode: 'recommend',
        answer: 'Вот набор по снижению ДРР',
        jobs: [{ jobId: 'j1', reason: 'покрывает рекламу WB' }],
      }),
    );
    const res = await synthesizeIntentResponse({ query: 'снизить ДРР', candidates });
    expect(res.mode).toBe('recommend');
    if (res.mode === 'recommend') {
      expect(res.jobs[0].jobId).toBe('j1');
      expect(res.jobs[0].actions[0]).toMatchObject({ type: 'add_to_track', jobId: 'j1' });
    }
  });

  it('drops jobIds that are not in the candidate set (hallucination guardrail)', async () => {
    mockCreate.mockResolvedValue(
      llmResponse({
        mode: 'recommend',
        answer: 'X',
        jobs: [
          { jobId: 'j1', reason: 'ok' },
          { jobId: 'INVENTED', reason: 'bad' },
        ],
      }),
    );
    const res = await synthesizeIntentResponse({ query: 'q', candidates });
    if (res.mode !== 'recommend') throw new Error('mode');
    expect(res.jobs.map((j) => j.jobId)).toEqual(['j1']);
  });

  it('returns empty when no candidates passed in', async () => {
    const res = await synthesizeIntentResponse({ query: 'q', candidates: [] });
    expect(res.mode).toBe('empty');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('passes through clarify mode', async () => {
    mockCreate.mockResolvedValue(
      llmResponse({
        mode: 'clarify',
        question: 'Что именно интересует?',
        options: [
          { label: 'Запустить', intent: 'запустить рекламу' },
          { label: 'Снизить ДРР', intent: 'снизить ДРР' },
        ],
      }),
    );
    const res = await synthesizeIntentResponse({ query: 'реклама', candidates });
    expect(res.mode).toBe('clarify');
    if (res.mode === 'clarify') expect(res.options).toHaveLength(2);
  });
});
