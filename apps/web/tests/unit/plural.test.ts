import { describe, it, expect } from 'vitest';
import { pluralRu, pluralizeDays } from '@/lib/plural';

describe('pluralizeDays', () => {
  it('uses «день» for 1, 21, 31 (mod10===1, except 11)', () => {
    expect(pluralizeDays(1)).toBe('день');
    expect(pluralizeDays(21)).toBe('день');
    expect(pluralizeDays(31)).toBe('день');
  });

  it('uses «дня» for 2-4, 22-24 (mod10 in 2..4, except 12-14)', () => {
    expect(pluralizeDays(2)).toBe('дня');
    expect(pluralizeDays(3)).toBe('дня');
    expect(pluralizeDays(4)).toBe('дня');
    expect(pluralizeDays(22)).toBe('дня');
  });

  it('uses «дней» for 5-20, and the 11-14 exception', () => {
    expect(pluralizeDays(5)).toBe('дней');
    expect(pluralizeDays(7)).toBe('дней');
    expect(pluralizeDays(11)).toBe('дней');
    expect(pluralizeDays(12)).toBe('дней');
    expect(pluralizeDays(13)).toBe('дней');
    expect(pluralizeDays(14)).toBe('дней');
    expect(pluralizeDays(20)).toBe('дней');
  });

  it('the regression cases from the banners read naturally', () => {
    expect(`Забрать ${3} ${pluralizeDays(3)}`).toBe('Забрать 3 дня');
    expect(`подарили ${14} ${pluralizeDays(14)}`).toBe('подарили 14 дней');
    expect(`подарили ${1} ${pluralizeDays(1)}`).toBe('подарили 1 день');
  });
});

describe('pluralRu (generic)', () => {
  it('selects one/few/many forms by Russian rules', () => {
    const forms: [string, string, string] = ['товар', 'товара', 'товаров'];
    expect(pluralRu(1, forms)).toBe('товар');
    expect(pluralRu(3, forms)).toBe('товара');
    expect(pluralRu(5, forms)).toBe('товаров');
    expect(pluralRu(11, forms)).toBe('товаров');
  });
});
