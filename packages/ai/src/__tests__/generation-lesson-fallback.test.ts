import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('server-only', () => ({}));

const retrieveMock = vi.fn();
vi.mock('../profiles', () => ({
  retrieve: (...args: unknown[]) => retrieveMock(...args),
}));

const createMock = vi.fn();
vi.mock('../openrouter', () => ({
  openrouter: { chat: { completions: { create: (...a: unknown[]) => createMock(...a) } } },
  MODELS: { chat: 'test-model' },
  MODEL_CONFIG: { maxTokens: 100, ragTemperature: 0.3 },
}));

import { generateChatResponse } from '../generation';

const chunk = (id: string) => ({
  id,
  lesson_id: 'L',
  content: 'разбор целевой аудитории',
  timecode_start: 0,
  timecode_end: 10,
  similarity: 0.35,
  source_type: 'academy_audio',
  trust_tier: 1,
});

beforeEach(() => {
  retrieveMock.mockReset();
  createMock.mockReset();
  createMock.mockResolvedValue({ choices: [{ message: { content: 'ответ из урока' } }] });
});

describe('generateChatResponse — lesson-scoped recall fallback', () => {
  it('re-retrieves with threshold 0 when the primary (0.5) pass finds nothing', async () => {
    // Primary pass misses (terse/abbreviated query or differently-phrased
    // transcript), fallback grounds in the lesson's best chunks.
    retrieveMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([chunk('c0'), chunk('c1')]);

    const res = await generateChatResponse('L', 'опиши анализ ЦА');

    expect(retrieveMock).toHaveBeenCalledTimes(2);
    // First pass: no explicit threshold (uses profile default 0.5).
    expect(retrieveMock.mock.calls[0][1]).toMatchObject({ lessonId: 'L' });
    expect(retrieveMock.mock.calls[0][1]).not.toHaveProperty('threshold', 0);
    // Fallback pass: floor removed.
    expect(retrieveMock.mock.calls[1][1]).toMatchObject({ lessonId: 'L', threshold: 0 });
    expect(res.sources).toHaveLength(2);
    expect(res.sources[0].id).toBe('c0');
  });

  it('does not re-retrieve when the primary pass already found chunks', async () => {
    retrieveMock.mockResolvedValueOnce([chunk('c0')]);

    await generateChatResponse('L', 'нормальный вопрос по уроку');

    expect(retrieveMock).toHaveBeenCalledTimes(1);
  });

  it('stays empty (no infinite retry) when the lesson has no chunks at all', async () => {
    retrieveMock.mockResolvedValue([]);

    const res = await generateChatResponse('L', 'что угодно');

    expect(retrieveMock).toHaveBeenCalledTimes(2);
    expect(res.sources).toHaveLength(0);
  });
});
