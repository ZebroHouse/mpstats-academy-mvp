import { describe, it, expect } from 'vitest';
import { arrowVisibility } from '@/components/learning/shelf-utils';

describe('arrowVisibility', () => {
  it('at start → left hidden, right shown', () => {
    expect(arrowVisibility(0, 1000, 400)).toEqual({ left: false, right: true });
  });
  it('mid-scroll → both shown', () => {
    expect(arrowVisibility(300, 1000, 400)).toEqual({ left: true, right: true });
  });
  it('at end → left shown, right hidden', () => {
    expect(arrowVisibility(600, 1000, 400)).toEqual({ left: true, right: false });
  });
  it('content fits (no overflow) → both hidden', () => {
    expect(arrowVisibility(0, 400, 400)).toEqual({ left: false, right: false });
  });
});
