import { describe, it, expect } from 'vitest';
import { buildMaterialText, typeLabel } from './embed-materials';

describe('buildMaterialText', () => {
  it('включает title, description, тип-лейбл и названия уроков', () => {
    const txt = buildMaterialText({
      title: 'Калькулятор юнит-экономики',
      description: 'Таблица для расчёта маржи',
      type: 'CALCULATION_TABLE',
      lessonTitles: ['Юнит-экономика с нуля'],
    });
    expect(txt).toContain('Калькулятор юнит-экономики');
    expect(txt).toContain('Таблица для расчёта маржи');
    expect(txt).toContain('таблица-калькулятор');
    expect(txt).toContain('Юнит-экономика с нуля');
  });
  it('без description/уроков не падает', () => {
    const txt = buildMaterialText({ title: 'Памятка', description: null, type: 'MEMO', lessonTitles: [] });
    expect(txt).toContain('Памятка');
    expect(txt).toContain('памятка');
  });
});

describe('typeLabel', () => {
  it('маппит типы в человекочитаемые лейблы', () => {
    expect(typeLabel('CHECKLIST')).toBe('чек-лист');
    expect(typeLabel('UNKNOWN')).toBe('материал');
  });
});
