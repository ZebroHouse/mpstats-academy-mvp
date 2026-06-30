import { describe, it, expect } from 'vitest';
import { computeStickyVisible } from '@/components/v8/StickyCTA';

describe('computeStickyVisible', () => {
  it('hidden before the user scrolls past the threshold', () => {
    expect(computeStickyVisible(false, false)).toBe(false);
  });

  it('visible after scrolling past, while the final CTA section is off-screen', () => {
    expect(computeStickyVisible(true, false)).toBe(true);
  });

  it('hidden once the final CTA section enters the viewport (no overlap/duplicate)', () => {
    expect(computeStickyVisible(true, true)).toBe(false);
  });

  it('stays hidden if the final section is visible even before the scroll threshold', () => {
    expect(computeStickyVisible(false, true)).toBe(false);
  });
});
