export type BadgeTone = 'blue' | 'red' | 'amber';
export interface BadgePill { key: string; label: string; tone: BadgeTone; }

/** START is a shelf-routing tag, not a visible pill (see spec taxonomy). */
export function deriveBadgePills(badges: string[] | undefined): BadgePill[] {
  if (!badges || badges.length === 0) return [];
  const pills: BadgePill[] = [];
  if (badges.includes('NEW')) pills.push({ key: 'NEW', label: 'NEW', tone: 'blue' });
  if (badges.includes('HOT')) pills.push({ key: 'HOT', label: 'HOT', tone: 'red' });
  if (badges.includes('QUICK')) pills.push({ key: 'QUICK', label: '5 мин', tone: 'amber' });
  return pills;
}

export const BADGE_TONE_CLASS: Record<BadgeTone, string> = {
  blue: 'bg-mp-blue-50 text-mp-blue-600',
  red: 'bg-red-50 text-red-600',
  amber: 'bg-amber-50 text-amber-700',
};
