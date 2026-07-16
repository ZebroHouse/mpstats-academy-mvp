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
