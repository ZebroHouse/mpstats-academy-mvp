import { describe, it, expect } from 'vitest';
import { formatCountdown } from './formatCountdown';

describe('formatCountdown', () => {
  const H = 60 * 60 * 1000;
  const M = 60 * 1000;
  const S = 1000;

  it('shows "Nд HH:MM" when more than a day remains', () => {
    expect(formatCountdown(2 * 24 * H + 3 * H + 7 * M)).toBe('2д 03:07');
  });

  it('shows "HH:MM" (no days part) between 1h and 24h', () => {
    expect(formatCountdown(5 * H + 9 * M)).toBe('05:09');
  });

  it('switches to "MM:SS" under the final hour', () => {
    expect(formatCountdown(4 * M + 5 * S)).toBe('04:05');
  });

  it('clamps to 0:00 at or below zero', () => {
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(-5000)).toBe('0:00');
  });
});
