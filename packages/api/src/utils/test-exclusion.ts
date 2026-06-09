/**
 * Phase 63 — revenue/funnel analytics exclusion rule.
 *
 * A subscription (or its payment) is excluded from money/funnel metrics when:
 *   - the owning user is flagged isTest (the curated test-account backlog), OR
 *   - the plan is hidden (e.g. the 10₽ smoke-test plan).
 *
 * Pure & defensive: missing fields are treated as "not excluded" so a partial
 * row never silently drops real revenue.
 */
export interface ExclusionSubject {
  user?: { isTest?: boolean | null } | null;
  plan?: { hidden?: boolean | null } | null;
}

export function isExcludedFromRevenue(subject: ExclusionSubject): boolean {
  return subject.user?.isTest === true || subject.plan?.hidden === true;
}
