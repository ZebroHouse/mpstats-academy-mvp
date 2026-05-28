import { describe, it, expect } from 'vitest';
import { generatedQuestionSchema, questionJsonSchema } from '../question-schema';

// Phase 59-01 Task 1: marketplace field enforced at LLM-output validation layer.

const validBase = {
  question: 'Какой тип рекламной кампании на WB даёт максимальный охват?',
  options: ['Поиск', 'Каталог', 'Авто', 'Карточка'],
  correctIndex: 0,
  explanation: 'Это базовое объяснение для теста.',
  difficulty: 'EASY' as const,
  sourceIndices: [1],
};

describe('generatedQuestionSchema marketplace enum (Phase 59-01)', () => {
  it('accepts marketplace = WB', () => {
    const res = generatedQuestionSchema.safeParse({ ...validBase, marketplace: 'WB' });
    expect(res.success).toBe(true);
  });

  it('accepts marketplace = OZON', () => {
    const res = generatedQuestionSchema.safeParse({ ...validBase, marketplace: 'OZON' });
    expect(res.success).toBe(true);
  });

  it('accepts marketplace = BOTH', () => {
    const res = generatedQuestionSchema.safeParse({ ...validBase, marketplace: 'BOTH' });
    expect(res.success).toBe(true);
  });

  it('rejects marketplace = YANDEX (out-of-enum)', () => {
    const res = generatedQuestionSchema.safeParse({ ...validBase, marketplace: 'YANDEX' });
    expect(res.success).toBe(false);
  });

  it('rejects missing marketplace field — LLM contract is mandatory', () => {
    const res = generatedQuestionSchema.safeParse({ ...validBase });
    expect(res.success).toBe(false);
  });
});

describe('questionJsonSchema marketplace declaration (Phase 59-01)', () => {
  it('declares marketplace in items.properties and items.required', () => {
    const items: any = (questionJsonSchema as any).properties.questions.items;
    expect(items.properties.marketplace).toBeDefined();
    expect(items.properties.marketplace.enum).toEqual(['WB', 'OZON', 'BOTH']);
    expect(items.required).toContain('marketplace');
  });
});
