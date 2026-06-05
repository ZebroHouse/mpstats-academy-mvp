/**
 * Active-user analytics helpers (DAU/WAU/MAU + stickiness).
 *
 * The heavy counting lives in parameterized SQL over "UserActivityDay"
 * (see admin.getActiveUserStats). These pure functions map the raw per-day
 * rows into the API response shape so the mapping logic can be unit-tested
 * without a database.
 */

/** One raw row returned by the per-day rolling-count SQL. */
export interface ActiveUserDayRow {
  /** YYYY-MM-DD (UTC). */
  date: string;
  dau: number;
  wau: number;
  mau: number;
}

export interface ActiveUserPoint {
  date: string;
  dau: number;
  wau: number;
  mau: number;
  /** dau/mau in 0..1; 0 when mau is 0. */
  stickiness: number;
}

export interface ActiveUserStats {
  series: ActiveUserPoint[];
  current: { dau: number; wau: number; mau: number; stickiness: number };
  previous: { dau: number; wau: number; mau: number };
}

/**
 * Stickiness = DAU / MAU. Returns 0 when MAU is 0 (avoids divide-by-zero).
 * Result is a 0..1 ratio (not a percentage).
 */
export function computeStickiness(dau: number, mau: number): number {
  if (mau <= 0) return 0;
  return dau / mau;
}

/**
 * Map the rolling per-day rows into the full response shape.
 *
 * - `series` covers the requested window (end = today, start = today-(days-1)),
 *   one point per day, with stickiness derived per day.
 * - `current` = the metrics of the last (most recent) day.
 * - `previous` = the metrics for the day exactly `days` before the end, i.e.
 *   the first row of the window. This is the baseline used to compute trend
 *   deltas (current vs the start of the window).
 *
 * Rows MUST be ordered ascending by date and cover the full window. If the
 * array is empty, a zeroed result is returned.
 */
export function mapActiveUserStats(rows: ActiveUserDayRow[]): ActiveUserStats {
  const series: ActiveUserPoint[] = rows.map((r) => ({
    date: r.date,
    dau: r.dau,
    wau: r.wau,
    mau: r.mau,
    stickiness: computeStickiness(r.dau, r.mau),
  }));

  if (series.length === 0) {
    return {
      series,
      current: { dau: 0, wau: 0, mau: 0, stickiness: 0 },
      previous: { dau: 0, wau: 0, mau: 0 },
    };
  }

  const last = series[series.length - 1];
  const first = series[0];

  return {
    series,
    current: {
      dau: last.dau,
      wau: last.wau,
      mau: last.mau,
      stickiness: last.stickiness,
    },
    previous: {
      dau: first.dau,
      wau: first.wau,
      mau: first.mau,
    },
  };
}
