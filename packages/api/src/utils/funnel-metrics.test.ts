import { describe, it, expect } from 'vitest';
import { computeConversionFunnel, churnRate, type FunnelUserRow } from './funnel-metrics';

function row(p: Partial<FunnelUserRow>): FunnelUserRow {
  return { userId: 'u', completedDiagnostic: false, paid: false, ...p };
}

describe('computeConversionFunnel', () => {
  it('computes step counts and rates', () => {
    const r = computeConversionFunnel([
      row({ userId: 'a', completedDiagnostic: true, paid: true }),
      row({ userId: 'b', completedDiagnostic: true, paid: false }),
      row({ userId: 'c', completedDiagnostic: false, paid: false }),
      row({ userId: 'd', completedDiagnostic: false, paid: false }),
    ]);
    expect(r.registered).toBe(4);
    expect(r.completedDiagnostic).toBe(2);
    expect(r.paid).toBe(1);
    expect(r.diagRate).toBe(50);  // 2/4
    expect(r.paidRate).toBe(50);  // 1/2 of those who did diagnostic
  });

  it('returns zero rates on empty input (no NaN)', () => {
    const r = computeConversionFunnel([]);
    expect(r).toMatchObject({ registered: 0, completedDiagnostic: 0, paid: 0, diagRate: 0, paidRate: 0 });
  });
});

describe('churnRate', () => {
  it('is cancelled / base as a percent', () => {
    expect(churnRate(5, 100)).toBe(5);
  });
  it('is 0 when base is 0', () => {
    expect(churnRate(3, 0)).toBe(0);
  });
});
