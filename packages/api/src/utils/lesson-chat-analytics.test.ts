import { describe, it, expect } from 'vitest';
import { isRefusalAnswer, buildChatMessageRows, computeLessonChatQuality } from './lesson-chat-analytics';

describe('isRefusalAnswer', () => {
  it('flags known refusal phrases (case-insensitive)', () => {
    expect(isRefusalAnswer('В этом фрагменте урока ответа нет.')).toBe(true);
    expect(isRefusalAnswer('Извините, не удалось сгенерировать ответ.')).toBe(true);
    expect(isRefusalAnswer('Ответа нет в контексте урока.')).toBe(true);
  });
  it('does not flag a normal grounded answer', () => {
    expect(isRefusalAnswer('Юнит-экономика — это анализ доходов и расходов на единицу товара [1].')).toBe(false);
  });
});

describe('buildChatMessageRows', () => {
  it('builds a user row and an assistant row; assistant carries metadata', () => {
    const rows = buildChatMessageRows({
      userId: 'u1', lessonId: 'l1', message: 'что такое ДРР?',
      answer: 'ДРР — доля рекламных расходов [1].', model: 'gpt-4.1-mini', sourceCount: 2,
    });
    expect(rows).toEqual([
      { userId: 'u1', lessonId: 'l1', role: 'USER', content: 'что такое ДРР?', model: null, sourceCount: null, noAnswer: false },
      { userId: 'u1', lessonId: 'l1', role: 'ASSISTANT', content: 'ДРР — доля рекламных расходов [1].', model: 'gpt-4.1-mini', sourceCount: 2, noAnswer: false },
    ]);
  });
  it('marks noAnswer when there are no sources', () => {
    const rows = buildChatMessageRows({ userId: 'u1', lessonId: 'l1', message: 'q', answer: 'любой ответ', model: 'm', sourceCount: 0 });
    expect(rows[1].noAnswer).toBe(true);
  });
  it('marks noAnswer when the answer is a refusal even with sources', () => {
    const rows = buildChatMessageRows({ userId: 'u1', lessonId: 'l1', message: 'q', answer: 'в этом фрагменте урока ответа нет', model: 'm', sourceCount: 3 });
    expect(rows[1].noAnswer).toBe(true);
  });
});

describe('computeLessonChatQuality', () => {
  it('computes rates with zero-guard', () => {
    expect(computeLessonChatQuality({ total: 0, noAnswer: 0, noGrounding: 0 })).toEqual({
      total: 0, noAnswer: 0, noAnswerRate: 0, noGrounding: 0, noGroundingRate: 0,
    });
    const q = computeLessonChatQuality({ total: 50, noAnswer: 10, noGrounding: 5 });
    expect(q.noAnswerRate).toBeCloseTo(0.2);
    expect(q.noGroundingRate).toBeCloseTo(0.1);
  });
});
