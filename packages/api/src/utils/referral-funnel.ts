/**
 * Pure assembly of the per-code referral funnel + per-day series from already-
 * fetched rows. DB-agnostic so it can be unit-tested in isolation; the
 * admin.analytics.getReferralFunnel procedure does the queries and calls this.
 *
 * Funnel stages per code: Clicks → Registrations → Onboarded → Sales.
 * Clicks come from ReferralCodeClickDay (going-forward only). Registrations are
 * Referral rows (test users excluded). Sales are distinct referred paying users.
 */

export interface FunnelCodeMeta {
  id: string;
  code: string;
  label: string;
  landingTarget: string;
}

export interface FunnelReferral {
  codeId: string;
  referredUserId: string;
  createdAt: Date;
  isTest: boolean;
  onboarded: boolean;
}

export interface FunnelPayment {
  userId: string;
  paidAt: Date;
}

export interface FunnelInput {
  codes: FunnelCodeMeta[];
  /** [{ codeId, clicks }] summed over the range. */
  clicksByCode: Array<{ codeId: string; clicks: number }>;
  /** [{ day: 'YYYY-MM-DD', clicks }] across all codes. */
  clicksByDay: Array<{ day: string; clicks: number }>;
  referrals: FunnelReferral[];
  /** COMPLETED, non-test, non-hidden payments in range. */
  payments: FunnelPayment[];
}

export interface FunnelCodeRow {
  codeId: string;
  code: string;
  label: string;
  landingTarget: string;
  clicks: number;
  registrations: number;
  onboarded: number;
  sales: number;
  regPerClick: number | null; // null when clicks === 0
  salePerReg: number | null; // null when registrations === 0
}

export interface FunnelDay {
  day: string;
  clicks: number;
  registrations: number;
  sales: number;
}

export interface FunnelResult {
  perCode: FunnelCodeRow[];
  series: FunnelDay[];
  totals: { clicks: number; registrations: number; onboarded: number; sales: number };
}

// Buckets a Date into its UTC calendar day (YYYY-MM-DD). Prisma returns UTC
// Dates, and the procedure's range boundary is a UTC-midnight, so series days
// line up with the per-code windows.
function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function ratio(num: number, den: number): number | null {
  if (den === 0) return null;
  return Math.round((num / den) * 1000) / 10; // one decimal percent
}

export function assembleReferralFunnel(input: FunnelInput): FunnelResult {
  const clicksByCode = new Map(input.clicksByCode.map((c) => [c.codeId, c.clicks]));

  // referredUserId → codeId (non-test referrals only). A user maps to one code
  // (Referral.referredUserId is unique), so last-write is harmless.
  const userToCode = new Map<string, string>();
  for (const r of input.referrals) {
    if (!r.isTest) userToCode.set(r.referredUserId, r.codeId);
  }

  // Distinct paying users per code (sales).
  const salesUsersByCode = new Map<string, Set<string>>();
  for (const p of input.payments) {
    const codeId = userToCode.get(p.userId);
    if (!codeId) continue;
    if (!salesUsersByCode.has(codeId)) salesUsersByCode.set(codeId, new Set());
    salesUsersByCode.get(codeId)!.add(p.userId);
  }

  // Registrations + onboarded per code (test users excluded).
  const regByCode = new Map<string, number>();
  const onboardedByCode = new Map<string, number>();
  for (const r of input.referrals) {
    if (r.isTest) continue;
    regByCode.set(r.codeId, (regByCode.get(r.codeId) ?? 0) + 1);
    if (r.onboarded) onboardedByCode.set(r.codeId, (onboardedByCode.get(r.codeId) ?? 0) + 1);
  }

  const perCode: FunnelCodeRow[] = input.codes
    .map((c) => {
      const clicks = clicksByCode.get(c.id) ?? 0;
      const registrations = regByCode.get(c.id) ?? 0;
      const onboarded = onboardedByCode.get(c.id) ?? 0;
      const sales = salesUsersByCode.get(c.id)?.size ?? 0;
      return {
        codeId: c.id,
        code: c.code,
        label: c.label,
        landingTarget: c.landingTarget,
        clicks,
        registrations,
        onboarded,
        sales,
        regPerClick: ratio(registrations, clicks),
        salePerReg: ratio(sales, registrations),
      };
    })
    // Most active codes first; fully-empty codes sink to the bottom.
    .sort((a, b) => b.clicks + b.registrations + b.sales - (a.clicks + a.registrations + a.sales));

  // Per-day series (aggregate across all codes).
  const dayMap = new Map<string, FunnelDay>();
  const ensureDay = (day: string): FunnelDay => {
    let d = dayMap.get(day);
    if (!d) {
      d = { day, clicks: 0, registrations: 0, sales: 0 };
      dayMap.set(day, d);
    }
    return d;
  };
  for (const c of input.clicksByDay) ensureDay(c.day).clicks += c.clicks;
  for (const r of input.referrals) {
    if (r.isTest) continue;
    ensureDay(utcDay(r.createdAt)).registrations += 1;
  }
  for (const p of input.payments) {
    if (!userToCode.has(p.userId)) continue;
    ensureDay(utcDay(p.paidAt)).sales += 1;
  }
  const series = [...dayMap.values()].sort((a, b) => a.day.localeCompare(b.day));

  const totals = perCode.reduce(
    (acc, r) => ({
      clicks: acc.clicks + r.clicks,
      registrations: acc.registrations + r.registrations,
      onboarded: acc.onboarded + r.onboarded,
      sales: acc.sales + r.sales,
    }),
    { clicks: 0, registrations: 0, onboarded: 0, sales: 0 },
  );

  return { perCode, series, totals };
}
