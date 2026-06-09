import { describe, it, expect } from 'vitest';
import { isExcludedFromRevenue } from './test-exclusion';

describe('isExcludedFromRevenue', () => {
  it('excludes a test user', () => {
    expect(isExcludedFromRevenue({ user: { isTest: true }, plan: { hidden: false } })).toBe(true);
  });

  it('excludes a hidden-plan subscription', () => {
    expect(isExcludedFromRevenue({ user: { isTest: false }, plan: { hidden: true } })).toBe(true);
  });

  it('keeps a real user on a visible plan', () => {
    expect(isExcludedFromRevenue({ user: { isTest: false }, plan: { hidden: false } })).toBe(false);
  });

  it('treats missing user/plan as not-excluded (defensive)', () => {
    expect(isExcludedFromRevenue({})).toBe(false);
    expect(isExcludedFromRevenue({ user: null, plan: null })).toBe(false);
  });
});
