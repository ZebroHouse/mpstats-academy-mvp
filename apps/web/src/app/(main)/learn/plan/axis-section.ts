export type AxisTier = 'weak' | 'medium' | 'strong';

export const AXIS_TIER_STYLE: Record<AxisTier, { accent: string; chip: string; title: string }> = {
  weak: { accent: 'border-l-red-400', chip: 'bg-red-100 text-red-700', title: 'text-red-700' },
  medium: { accent: 'border-l-yellow-400', chip: 'bg-yellow-100 text-yellow-700', title: 'text-yellow-700' },
  strong: { accent: 'border-l-mp-green-400', chip: 'bg-mp-green-100 text-mp-green-700', title: 'text-mp-green-700' },
};

const TIER_BADGE: Record<AxisTier, string> = { weak: '🔴 слабая', medium: '🟡 средняя', strong: '🟢 сильная' };

export function tierBadgeLabel(tier: AxisTier): string { return TIER_BADGE[tier]; }
export function axisSectionTitle(label: string, score: number): string { return `${label} — ${score}%`; }
