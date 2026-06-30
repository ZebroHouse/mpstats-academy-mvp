import { describe, it, expect } from 'vitest';
import { expandSellerQuery } from '../seller-lexicon';

describe('expandSellerQuery', () => {
  it('expands a Cyrillic abbreviation, appending in parentheses (not replacing)', () => {
    expect(expandSellerQuery('опиши анализ ЦА')).toBe(
      'опиши анализ ЦА (целевая аудитория)',
    );
  });

  it('expands multiple abbreviations in one query', () => {
    const out = expandSellerQuery('снизить ДРР и CPO');
    expect(out).toContain('ДРР (доля рекламных расходов)');
    expect(out).toContain('CPO (стоимость заказа)');
  });

  it('matches Latin abbreviations case-insensitively', () => {
    expect(expandSellerQuery('как поднять ctr')).toContain('ctr (кликабельность');
    expect(expandSellerQuery('SKU висит')).toContain('SKU (товарная позиция');
  });

  it('does not match an abbreviation inside a longer word', () => {
    // "СРЦА" / "цапля" must not trigger ЦА; "скунс" must not trigger no-op false hits
    expect(expandSellerQuery('цапля на болоте')).toBe('цапля на болоте');
    expect(expandSellerQuery('сканер штрихкодов')).toBe('сканер штрихкодов');
  });

  it('is a no-op when no known term is present', () => {
    expect(expandSellerQuery('как красиво оформить карточку')).toBe(
      'как красиво оформить карточку',
    );
  });

  it('does not double-expand when the expansion is already written out', () => {
    expect(expandSellerQuery('что такое целевая аудитория, она же ЦА')).toBe(
      'что такое целевая аудитория, она же ЦА',
    );
  });

  it('trims to no-op on empty input', () => {
    expect(expandSellerQuery('')).toBe('');
    expect(expandSellerQuery('   ')).toBe('   ');
  });
});
