/**
 * Phase 63 — pure funnel/churn math. Rows arrive already test-excluded.
 */
export interface FunnelUserRow {
  userId: string;
  completedDiagnostic: boolean;
  paid: boolean;
}

export interface ConversionFunnel {
  registered: number;
  completedDiagnostic: number;
  paid: number;
  diagRate: number; // % of registered who completed a diagnostic
  paidRate: number; // % of diagnostic-completers who paid
}

export function computeConversionFunnel(rows: FunnelUserRow[]): ConversionFunnel {
  const registered = rows.length;
  const completedDiagnostic = rows.filter((r) => r.completedDiagnostic).length;
  const paid = rows.filter((r) => r.paid).length;
  return {
    registered,
    completedDiagnostic,
    paid,
    diagRate: registered > 0 ? Math.round((completedDiagnostic / registered) * 100) : 0,
    paidRate: completedDiagnostic > 0 ? Math.round((paid / completedDiagnostic) * 100) : 0,
  };
}

/** Approximate period churn: cancelled / active-base, as a percent. */
export function churnRate(cancelled: number, base: number): number {
  return base > 0 ? Math.round((cancelled / base) * 100) : 0;
}
