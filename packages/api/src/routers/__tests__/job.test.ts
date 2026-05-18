import { describe, it, expect } from 'vitest';
import { axisTitle, filterByMarketplace } from '../job';

describe('axisTitle', () => {
  it('маппит канонические оси на русские названия', () => {
    expect(axisTitle('ANALYTICS')).toBe('Аналитика');
    expect(axisTitle('FINANCE')).toBe('Финансы');
    expect(axisTitle('UNKNOWN')).toBe('UNKNOWN');
  });
});

describe('filterByMarketplace', () => {
  const jobs = [
    { marketplace: 'WB' }, { marketplace: 'OZON' }, { marketplace: 'BOTH' },
  ] as any[];
  it('WB показывает WB + BOTH', () => {
    expect(filterByMarketplace(jobs, 'WB').map((j) => j.marketplace)).toEqual(['WB', 'BOTH']);
  });
  it('OZON показывает OZON + BOTH', () => {
    expect(filterByMarketplace(jobs, 'OZON').map((j) => j.marketplace)).toEqual(['OZON', 'BOTH']);
  });
});
