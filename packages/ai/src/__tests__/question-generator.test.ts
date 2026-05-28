import { describe, it, expect, vi, beforeEach } from 'vitest';

// Phase 59-01 Task 2: prompt + mapper carry marketplace through.

// --- Mocks must be declared before importing the SUT ---

const createMock = vi.fn();

vi.mock('../openrouter', () => ({
  openrouter: {
    chat: {
      completions: {
        create: (...args: unknown[]) => createMock(...args),
      },
    },
  },
  MODELS: { chat: 'mock-primary', fallback: 'mock-fallback' },
}));

vi.mock('@mpstats/db/client', () => ({
  prisma: {
    $queryRawUnsafe: vi.fn(async () => [
      {
        id: 'chunk-1',
        content: 'mock chunk content',
        lesson_id: '01_analytics_l1',
        timecode_start: 0,
        timecode_end: 30,
      },
    ]),
  },
}));

import { generateDiagnosticQuestions } from '../question-generator';
import { buildSystemPrompt } from '../question-prompt';

function llmPayload(marketplace: 'WB' | 'OZON' | 'BOTH') {
  return {
    choices: [
      {
        message: {
          content: JSON.stringify({
            questions: [
              {
                question: 'Тестовый вопрос для проверки marketplace pass-through ровно так.',
                options: ['A', 'B', 'C', 'D'],
                correctIndex: 0,
                explanation: 'Объяснение для теста длиной достаточной.',
                difficulty: 'EASY',
                marketplace,
                sourceIndices: [1],
              },
            ],
          }),
        },
      },
    ],
  };
}

describe('buildSystemPrompt — marketplace section (Phase 59-01)', () => {
  it('mentions marketplace, WB, OZON, BOTH and Wildberries', () => {
    const prompt = buildSystemPrompt('MARKETING', 3);
    expect(prompt).toMatch(/marketplace/);
    expect(prompt).toMatch(/\bWB\b/);
    expect(prompt).toMatch(/\bOZON\b/);
    expect(prompt).toMatch(/\bBOTH\b/);
    expect(prompt).toMatch(/Wildberries/);
  });

  it('places marketplace section before СТРОГО ЗАПРЕЩЕНО', () => {
    const prompt = buildSystemPrompt('ANALYTICS', 3);
    const mkpIdx = prompt.indexOf('marketplace');
    const banIdx = prompt.indexOf('СТРОГО ЗАПРЕЩЕНО');
    expect(mkpIdx).toBeGreaterThan(-1);
    expect(banIdx).toBeGreaterThan(-1);
    expect(mkpIdx).toBeLessThan(banIdx);
  });
});

describe('question-generator mapper — marketplace pass-through (Phase 59-01)', () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it('preserves marketplace = WB from LLM onto persisted DiagnosticQuestion', async () => {
    createMock.mockResolvedValue(llmPayload('WB'));
    const result = await generateDiagnosticQuestions(() => [], {
      categories: ['ANALYTICS'],
      questionsPerCategory: 1,
    });
    expect(result).toHaveLength(1);
    expect(result[0].marketplace).toBe('WB');
  });

  it('preserves marketplace = OZON from LLM', async () => {
    createMock.mockResolvedValue(llmPayload('OZON'));
    const result = await generateDiagnosticQuestions(() => [], {
      categories: ['ANALYTICS'],
      questionsPerCategory: 1,
    });
    expect(result[0].marketplace).toBe('OZON');
  });

  it('preserves marketplace = BOTH from LLM', async () => {
    createMock.mockResolvedValue(llmPayload('BOTH'));
    const result = await generateDiagnosticQuestions(() => [], {
      categories: ['ANALYTICS'],
      questionsPerCategory: 1,
    });
    expect(result[0].marketplace).toBe('BOTH');
  });
});
