import { describe, it, expect } from 'vitest';
import { isStyleguideEnabled } from '@/app/styleguide/gate';

describe('isStyleguideEnabled', () => {
  it('returns true only when STYLEGUIDE_ENABLED is exactly "true"', () => {
    expect(isStyleguideEnabled({ STYLEGUIDE_ENABLED: 'true' })).toBe(true);
  });

  it('returns false when flag is unset', () => {
    expect(isStyleguideEnabled({})).toBe(false);
  });

  it('returns false for truthy-but-not-"true" values', () => {
    expect(isStyleguideEnabled({ STYLEGUIDE_ENABLED: '1' })).toBe(false);
    expect(isStyleguideEnabled({ STYLEGUIDE_ENABLED: 'TRUE' })).toBe(false);
    expect(isStyleguideEnabled({ STYLEGUIDE_ENABLED: 'yes' })).toBe(false);
    expect(isStyleguideEnabled({ STYLEGUIDE_ENABLED: '' })).toBe(false);
  });
});
