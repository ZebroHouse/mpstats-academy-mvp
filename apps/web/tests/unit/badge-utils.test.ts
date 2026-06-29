import { describe, it, expect } from 'vitest';
import { deriveBadgePills } from '@/components/learning/badge-utils';

describe('deriveBadgePills', () => {
  it('undefined / empty → no pills', () => {
    expect(deriveBadgePills(undefined)).toEqual([]);
    expect(deriveBadgePills([])).toEqual([]);
  });
  it('START is not rendered as a visible pill', () => {
    expect(deriveBadgePills(['START'])).toEqual([]);
  });
  it('NEW→blue, HOT→red, QUICK→amber «5 мин»', () => {
    expect(deriveBadgePills(['NEW'])).toEqual([{ key: 'NEW', label: 'NEW', tone: 'blue' }]);
    expect(deriveBadgePills(['HOT'])).toEqual([{ key: 'HOT', label: 'HOT', tone: 'red' }]);
    expect(deriveBadgePills(['QUICK'])).toEqual([{ key: 'QUICK', label: '5 мин', tone: 'amber' }]);
  });
  it('stable order NEW,HOT,QUICK', () => {
    expect(deriveBadgePills(['QUICK', 'HOT', 'NEW']).map((p) => p.key)).toEqual(['NEW', 'HOT', 'QUICK']);
  });
});
