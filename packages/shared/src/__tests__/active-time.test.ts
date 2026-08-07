import { describe, it, expect } from 'vitest';
import { accumulateActiveSeconds } from '../active-time';

describe('accumulateActiveSeconds', () => {
  it('обычный тик: позиция сдвинулась на секунду → +1', () => {
    expect(accumulateActiveSeconds({
      prevPosition: 10, nextPosition: 11, elapsedMs: 1000, prevActiveSeconds: 5,
    })).toBe(6);
  });

  it('пауза: позиция не сдвинулась → без изменений', () => {
    expect(accumulateActiveSeconds({
      prevPosition: 10, nextPosition: 10, elapsedMs: 1000, prevActiveSeconds: 5,
    })).toBe(5);
  });

  it('перемотка назад → без изменений', () => {
    expect(accumulateActiveSeconds({
      prevPosition: 10, nextPosition: 4, elapsedMs: 1000, prevActiveSeconds: 5,
    })).toBe(5);
  });

  it('скорость 2x: позиция +2, часы +1 → засчитываем 1 (настенное время)', () => {
    expect(accumulateActiveSeconds({
      prevPosition: 10, nextPosition: 12, elapsedMs: 1000, prevActiveSeconds: 5,
    })).toBe(6);
  });

  it('перемотка вперёд на минуту за один тик → не больше потолка', () => {
    expect(accumulateActiveSeconds({
      prevPosition: 10, nextPosition: 70, elapsedMs: 1000, prevActiveSeconds: 5,
    })).toBe(6);
  });

  it('замороженный таймер (вкладка в фоне 60с) → прибавка обрезана потолком', () => {
    expect(accumulateActiveSeconds({
      prevPosition: 10, nextPosition: 11, elapsedMs: 60_000, prevActiveSeconds: 5,
    })).toBe(7);
  });

  it('микросдвиг ниже порога (дрожание опроса) → без изменений', () => {
    expect(accumulateActiveSeconds({
      prevPosition: 10, nextPosition: 10.05, elapsedMs: 1000, prevActiveSeconds: 5,
    })).toBe(5);
  });

  it('нулевое или отрицательное время между тиками → без изменений', () => {
    expect(accumulateActiveSeconds({
      prevPosition: 10, nextPosition: 11, elapsedMs: 0, prevActiveSeconds: 5,
    })).toBe(5);
    expect(accumulateActiveSeconds({
      prevPosition: 10, nextPosition: 11, elapsedMs: -100, prevActiveSeconds: 5,
    })).toBe(5);
  });
});
