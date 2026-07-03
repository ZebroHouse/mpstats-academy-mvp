import { describe, it, expect } from 'vitest';
import { AXIS_TIER_STYLE, tierBadgeLabel, axisSectionTitle } from '@/app/(main)/learn/plan/axis-section';

describe('axis-section helpers', () => {
  it('maps each tier to a distinct accent', () => {
    expect(AXIS_TIER_STYLE.weak.accent).toContain('border-l-red');
    expect(AXIS_TIER_STYLE.medium.accent).toContain('border-l-yellow');
    expect(AXIS_TIER_STYLE.strong.accent).toContain('border-l-mp-green');
  });
  it('renders tier badge labels with spec emojis', () => {
    expect(tierBadgeLabel('weak')).toBe('🔴 слабая');
    expect(tierBadgeLabel('medium')).toBe('🟡 средняя');
    expect(tierBadgeLabel('strong')).toBe('🟢 сильная');
  });
  it('builds the section title', () => { expect(axisSectionTitle('Аналитика', 33)).toBe('Аналитика — 33%'); });
});
