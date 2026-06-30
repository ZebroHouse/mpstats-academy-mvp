import { describe, it, expect } from 'vitest';
import { GOAL_TO_AXES, GOAL_LABELS, goalShelfKey, newShelfKey, resolveShelfKey } from '../storefront-shelves';

describe('GOAL_TO_AXES', () => {
  it('ADS→MARKETING, SALES→[MARKETING,ANALYTICS], NEW_MARKETPLACE→[]', () => {
    expect(GOAL_TO_AXES.ADS).toEqual(['MARKETING']);
    expect(GOAL_TO_AXES.CONTENT).toEqual(['CONTENT']);
    expect(GOAL_TO_AXES.ANALYTICS).toEqual(['ANALYTICS']);
    expect(GOAL_TO_AXES.OPERATIONS).toEqual(['OPERATIONS']);
    expect(GOAL_TO_AXES.FINANCE).toEqual(['FINANCE']);
    expect(GOAL_TO_AXES.SALES).toEqual(['MARKETING', 'ANALYTICS']);
    expect(GOAL_TO_AXES.NEW_MARKETPLACE).toEqual([]);
  });
  it('every goal has a label', () => {
    for (const g of Object.keys(GOAL_TO_AXES)) expect(GOAL_LABELS[g]).toBeTruthy();
  });
});

describe('shelf key helpers', () => {
  it('builds keys', () => {
    expect(goalShelfKey('ADS')).toBe('goal-ads');
    expect(newShelfKey('WB')).toBe('new-wb');
  });
  it('resolveShelfKey round-trips', () => {
    expect(resolveShelfKey('start')).toEqual({ type: 'badge', badge: 'START' });
    expect(resolveShelfKey('quick')).toEqual({ type: 'badge', badge: 'QUICK' });
    expect(resolveShelfKey('hot')).toEqual({ type: 'badge', badge: 'HOT' });
    expect(resolveShelfKey('continue')).toEqual({ type: 'continue' });
    expect(resolveShelfKey('goal-ads')).toEqual({ type: 'goal', goal: 'ADS' });
    expect(resolveShelfKey('new')).toEqual({ type: 'new' });
    expect(resolveShelfKey('new-ozon')).toEqual({ type: 'new', marketplace: 'OZON' });
    expect(resolveShelfKey('garbage')).toBeNull();
  });
});
