// packages/api/src/utils/assistant-analytics.ts

/** MSK is UTC+3, no DST. Mirror of assistant-quota.ts day math. */
export const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Calendar day (YYYY-MM-DD) that a timestamp falls into in Moscow time. */
export function mskDayKey(d: Date): string {
  return new Date(d.getTime() + MSK_OFFSET_MS).toISOString().slice(0, 10);
}

/** Every MSK calendar day key in [from..to], inclusive. */
export function enumerateMskDays(from: Date, to: Date): string[] {
  const keys: string[] = [];
  let cur = new Date(`${mskDayKey(from)}T00:00:00Z`);
  const end = new Date(`${mskDayKey(to)}T00:00:00Z`);
  while (cur.getTime() <= end.getTime()) {
    keys.push(cur.toISOString().slice(0, 10));
    cur = new Date(cur.getTime() + 24 * 60 * 60 * 1000);
  }
  return keys;
}

export interface DayCount {
  date: string;
  count: number;
}

/** Left-join sparse day rows onto the full key list, zero-filling gaps. */
export function fillDaySeries(
  sparse: Array<{ date: string; count: number | bigint }>,
  dayKeys: string[],
): DayCount[] {
  const m = new Map(sparse.map((r) => [r.date, Number(r.count)]));
  return dayKeys.map((date) => ({ date, count: m.get(date) ?? 0 }));
}

export interface QualityMetrics {
  total: number;
  offDomain: number;
  offDomainRate: number;
  complaint: number;
  complaintRate: number;
  fallback: number;
  fallbackRate: number;
}

export function computeQuality(i: {
  total: number | bigint;
  offDomain: number | bigint;
  complaint: number | bigint;
  fallback: number | bigint;
}): QualityMetrics {
  const total = Number(i.total);
  const offDomain = Number(i.offDomain);
  const complaint = Number(i.complaint);
  const fallback = Number(i.fallback);
  const rate = (x: number) => (total === 0 ? 0 : x / total);
  return {
    total,
    offDomain,
    offDomainRate: rate(offDomain),
    complaint,
    complaintRate: rate(complaint),
    fallback,
    fallbackRate: rate(fallback),
  };
}

export type ProblemKind = 'off_domain' | 'complaint' | 'fallback';

export interface RawProblemRow {
  createdAt: Date | string;
  category: string | null;
  isFallback: boolean;
  query: string | null;
}

export interface ProblemItem {
  date: string;
  kind: ProblemKind;
  label: string;
  query: string;
}

const PROBLEM_LABEL: Record<ProblemKind, string> = {
  complaint: 'Жалоба',
  off_domain: 'Офф-топик',
  fallback: 'Не смог помочь (→ поддержка)',
};

/**
 * Category is authoritative: complaint / off_domain are mutually exclusive
 * categories. Anything else that reached the problem list did so because it
 * was a concierge fallback (navLinks → /support), so label it fallback.
 */
export function labelProblem(row: RawProblemRow): ProblemItem {
  const kind: ProblemKind =
    row.category === 'complaint' ? 'complaint' : row.category === 'off_domain' ? 'off_domain' : 'fallback';
  const at = typeof row.createdAt === 'string' ? new Date(row.createdAt) : row.createdAt;
  return { date: mskDayKey(at), kind, label: PROBLEM_LABEL[kind], query: row.query ?? '' };
}

export interface UpsellSummary {
  cappedUsers: number;
  repeatCappers: number;
  loadHistogram: Array<{ bucket: number; userDays: number }>;
}

/**
 * rows = one entry per (free user, MSK day) with dayCount = inDomain assistant
 * replies that day. "Capped" = dayCount >= cap (exactly the quota rule).
 */
export function computeUpsell(
  rows: Array<{ userId: string; dayCount: number | bigint }>,
  opts: { cap: number; repeatThreshold: number },
): UpsellSummary {
  const cappedDaysByUser = new Map<string, number>();
  const histogram = new Map<number, number>();
  for (let b = 1; b <= opts.cap; b++) histogram.set(b, 0);

  for (const r of rows) {
    const c = Number(r.dayCount);
    if (c <= 0) continue;
    const bucket = Math.min(c, opts.cap);
    histogram.set(bucket, (histogram.get(bucket) ?? 0) + 1);
    if (c >= opts.cap) cappedDaysByUser.set(r.userId, (cappedDaysByUser.get(r.userId) ?? 0) + 1);
  }

  let repeatCappers = 0;
  for (const days of cappedDaysByUser.values()) if (days >= opts.repeatThreshold) repeatCappers++;

  const loadHistogram = Array.from(histogram.entries())
    .map(([bucket, userDays]) => ({ bucket, userDays }))
    .sort((a, b) => a.bucket - b.bucket);

  return { cappedUsers: cappedDaysByUser.size, repeatCappers, loadHistogram };
}
