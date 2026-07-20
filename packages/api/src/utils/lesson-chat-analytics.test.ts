import { describe, it, expect } from 'vitest';
import { isRefusalAnswer, buildChatMessageRows, computeLessonChatQuality } from './lesson-chat-analytics';
import { isMetaQuestion, buildMetaOrientation } from './lesson-chat-analytics';

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

describe('isRefusalAnswer — widened', () => {
  it('catches the interpolated prod refusal', () => {
    expect(isRefusalAnswer('В этом фрагменте урока ответа на вопрос «Что ты умеешь?» нет.')).toBe(true);
  });
  it('catches the new softened refusal anchor', () => {
    expect(isRefusalAnswer('В этом уроке это не разбирается. Спросите про настройку рекламы.')).toBe(true);
  });
  it('still catches the plain forms', () => {
    expect(isRefusalAnswer('ответа нет в контексте')).toBe(true);
    expect(isRefusalAnswer('Извините, не удалось сгенерировать ответ.')).toBe(true);
  });
  it('does not flag a normal grounded answer', () => {
    expect(isRefusalAnswer('ДРР — доля рекламных расходов [1]. Считается как расходы делить на выручку.')).toBe(false);
  });
  it('does not flag grounded answers that contain «ответ … нет» in a normal sentence', () => {
    expect(isRefusalAnswer('Ответ зависит от того, есть у вас карточка или нет.')).toBe(false);
    expect(isRefusalAnswer('Ответ на ваш вопрос — да или нет, решать вам.')).toBe(false);
  });
});

describe('isMetaQuestion', () => {
  it('flags capability / meta questions', () => {
    expect(isMetaQuestion('Что ты умеешь?')).toBe(true);
    expect(isMetaQuestion('какой вопрос я тебе могу задать')).toBe(true);
    expect(isMetaQuestion('кто ты')).toBe(true);
  });
  it('flags short greetings', () => {
    expect(isMetaQuestion('Привет')).toBe(true);
    expect(isMetaQuestion('привет бот')).toBe(true);
  });
  it('does NOT flag real content questions', () => {
    expect(isMetaQuestion('Что можешь рассказать про юнит-экономику?')).toBe(false);
    expect(isMetaQuestion('Как настроить рекламную кампанию на Wildberries?')).toBe(false);
    expect(isMetaQuestion('привет, расскажи как считать ДРР по этому уроку')).toBe(false);
  });
  it('does NOT flag empty', () => {
    expect(isMetaQuestion('   ')).toBe(false);
  });
});

describe('buildMetaOrientation', () => {
  it('includes the lesson title when present', () => {
    const s = buildMetaOrientation('Настройка автобиддера');
    expect(s).toContain('«Настройка автобиддера»');
    expect(s.toLowerCase()).toContain('ассистент');
  });
  it('falls back gracefully without a title', () => {
    const s = buildMetaOrientation(undefined);
    expect(s).toContain('по этому уроку');
    expect(s).not.toContain('«»');
  });
});

describe('buildChatMessageRows — answered flag', () => {
  it('forces noAnswer=false for an answered meta orientation even with sourceCount 0', () => {
    const rows = buildChatMessageRows({ userId: 'u', lessonId: 'l', message: 'что ты умеешь', answer: 'Я — ассистент…', model: 'meta', sourceCount: 0, answered: true });
    expect(rows[1].noAnswer).toBe(false);
  });
  it('still flags a content refusal (no answered flag)', () => {
    const rows = buildChatMessageRows({ userId: 'u', lessonId: 'l', message: 'q', answer: 'В этом уроке это не разбирается.', model: 'm', sourceCount: 5 });
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
