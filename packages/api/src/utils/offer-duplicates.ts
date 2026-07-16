/** A prisma groupBy row: subscriptions grouped by userId with a count. */
export interface GroupedSubRow {
  userId: string;
  _count: { _all: number };
}

export interface DuplicateReport {
  total: number; // number of users with >1 active PLATFORM sub
  rows: { userId: string; count: number }[]; // count desc
}

/**
 * Reduce a groupBy(userId) result to the users who have MORE THAN ONE active
 * PLATFORM subscription — the double-initiate race artefact the monitor watches.
 * Steady state is empty; a non-empty list is a manual-triage signal.
 */
export function tallyDuplicatePlatformSubs(rows: GroupedSubRow[]): DuplicateReport {
  const dupes = rows
    .filter((r) => r._count._all > 1)
    .map((r) => ({ userId: r.userId, count: r._count._all }))
    .sort((a, b) => b.count - a.count);
  return { total: dupes.length, rows: dupes };
}
