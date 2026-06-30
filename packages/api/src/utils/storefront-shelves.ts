// Pure storefront shelf utilities. No Prisma, no IO — unit-tested in isolation.

/** goal (UserProfile.goals) → Job.axes / SkillCategory. NEW_MARKETPLACE handled via START badge. */
export const GOAL_TO_AXES: Record<string, string[]> = {
  ADS: ['MARKETING'],
  CONTENT: ['CONTENT'],
  ANALYTICS: ['ANALYTICS'],
  OPERATIONS: ['OPERATIONS'],
  FINANCE: ['FINANCE'],
  SALES: ['MARKETING', 'ANALYTICS'],
  NEW_MARKETPLACE: [],
};

export const GOAL_LABELS: Record<string, string> = {
  ADS: 'Реклама',
  CONTENT: 'Контент',
  ANALYTICS: 'Аналитика',
  OPERATIONS: 'Операции',
  FINANCE: 'Финансы',
  SALES: 'Продажи',
  NEW_MARKETPLACE: 'Новый маркетплейс',
};

export const MARKETPLACE_LABELS: Record<string, string> = { WB: 'Wildberries', OZON: 'Ozon' };

export function goalShelfKey(goal: string): string {
  return `goal-${goal.toLowerCase()}`;
}
export function newShelfKey(marketplace: string): string {
  return `new-${marketplace.toLowerCase()}`;
}

export type ShelfSpec =
  | { type: 'badge'; badge: string }
  | { type: 'continue' }
  | { type: 'goal'; goal: string }
  | { type: 'new'; marketplace?: string };

/** Parse a shelfKey back into its build spec (used by getCollection). */
export function resolveShelfKey(shelfKey: string): ShelfSpec | null {
  if (shelfKey === 'start') return { type: 'badge', badge: 'START' };
  if (shelfKey === 'quick') return { type: 'badge', badge: 'QUICK' };
  if (shelfKey === 'hot') return { type: 'badge', badge: 'HOT' };
  if (shelfKey === 'continue') return { type: 'continue' };
  if (shelfKey === 'new') return { type: 'new' };
  if (shelfKey.startsWith('new-')) return { type: 'new', marketplace: shelfKey.slice(4).toUpperCase() };
  if (shelfKey.startsWith('goal-')) return { type: 'goal', goal: shelfKey.slice(5).toUpperCase() };
  return null;
}
