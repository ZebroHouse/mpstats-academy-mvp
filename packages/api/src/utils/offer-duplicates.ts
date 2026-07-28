/** A subscription row as fetched for the duplicate monitor: userId + the
 * plan's intervalDays (duplicates are scoped per-tier, not per-planType). */
export interface SubscriptionRow {
  userId: string;
  plan: { intervalDays: number };
}

export interface DuplicateReport {
  total: number; // number of (userId, intervalDays) pairs with >1 active sub
  rows: { userId: string; intervalDays: number; count: number }[]; // count desc
}

/**
 * Reduce a flat list of active PLATFORM subscriptions to the (userId,
 * intervalDays) pairs that have MORE THAN ONE active sub — the
 * double-initiate race artefact the monitor watches. Grouping is keyed by
 * intervalDays (not just PLATFORM) so a user legitimately holding subs on
 * two different tiers (e.g. a 30d sub and a separately-obtained 90d sub) is
 * NOT flagged as a duplicate — only two ACTIVE subs on the SAME tier are.
 * Steady state is empty; a non-empty list is a manual-triage signal.
 */
export function tallyDuplicatePlatformSubs(rows: SubscriptionRow[]): DuplicateReport {
  const tally = new Map<string, { userId: string; intervalDays: number; count: number }>();
  for (const row of rows) {
    const key = `${row.userId}:${row.plan.intervalDays}`;
    const existing = tally.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      tally.set(key, { userId: row.userId, intervalDays: row.plan.intervalDays, count: 1 });
    }
  }
  const dupes = [...tally.values()]
    .filter((r) => r.count > 1)
    .sort((a, b) => b.count - a.count);
  return { total: dupes.length, rows: dupes };
}
