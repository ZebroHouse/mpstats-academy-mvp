import { describe, it, expect } from 'vitest';
import { partnerFilter } from './analytics-filters';

describe('partnerFilter', () => {
  it('excludes partner entries when includePartner is false', () => {
    expect(partnerFilter(false)).toEqual({ isPartnerEntry: false });
  });

  it('adds no filter when includePartner is true', () => {
    expect(partnerFilter(true)).toEqual({});
  });
});
