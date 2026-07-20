import { METRIKA_PLATFORM_FILTER } from '@mpstats/shared';

export interface RangeChunk {
  date1: string;
  date2: string;
}

export interface SnapshotRow {
  metricKey: string;
  day: string;
  value: number;
}

const DAY_MS = 86_400_000;

export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDateKey(key: string): number {
  return new Date(`${key}T00:00:00.000Z`).getTime();
}

/**
 * Метрика отвечает "Query is too complicated" на длинных окнах с большим
 * числом метрик, поэтому бэкфилл идёт слайсами.
 */
export function splitRange(date1: string, date2: string, maxDays: number): RangeChunk[] {
  const start = parseDateKey(date1);
  const end = parseDateKey(date2);
  const chunks: RangeChunk[] = [];

  for (let cursor = start; cursor <= end; cursor += maxDays * DAY_MS) {
    const chunkEnd = Math.min(cursor + (maxDays - 1) * DAY_MS, end);
    chunks.push({
      date1: toDateKey(new Date(cursor)),
      date2: toDateKey(new Date(chunkEnd)),
    });
  }

  return chunks;
}

export function buildByTimeParams(args: {
  counterId: string;
  metrics: string[];
  date1: string;
  date2: string;
}): URLSearchParams {
  return new URLSearchParams({
    ids: args.counterId,
    metrics: args.metrics.join(','),
    filters: METRIKA_PLATFORM_FILTER,
    date1: args.date1,
    date2: args.date2,
    group: 'day',
  });
}

export function buildTotalsParams(args: {
  counterId: string;
  metrics: string[];
  date1: string;
  date2: string;
}): URLSearchParams {
  return new URLSearchParams({
    ids: args.counterId,
    metrics: args.metrics.join(','),
    filters: METRIKA_PLATFORM_FILTER,
    date1: args.date1,
    date2: args.date2,
  });
}

interface ByTimeResponse {
  time_intervals: string[][];
  totals: number[][];
}

/**
 * `totals` в /bytime — массив по метрикам, внутри значения по интервалам,
 * в порядке запрошенных метрик. Парсим его, а не `data`: при пустой выборке
 * `data` приходит пустым массивом, а форма `totals` стабильна.
 */
export function parseByTimeResponse(response: ByTimeResponse, metricKeys: string[]): SnapshotRow[] {
  const intervals = response.time_intervals ?? [];
  if (intervals.length === 0) return [];

  const totals = response.totals ?? [];
  if (totals.length !== metricKeys.length) {
    throw new Error(
      `Метрика вернула ${totals.length} серий на ${metricKeys.length} ключей — порядок метрик разъехался`,
    );
  }

  const rows: SnapshotRow[] = [];
  totals.forEach((series, metricIndex) => {
    series.forEach((value, intervalIndex) => {
      const interval = intervals[intervalIndex];
      if (!interval) return;
      rows.push({
        metricKey: metricKeys[metricIndex],
        day: interval[0],
        value: Math.round(value ?? 0),
      });
    });
  });

  return rows;
}

interface TotalsResponse {
  totals: number[];
}

/** Ответ /stat/v1/data (без bytime): totals — плоский массив по метрикам. */
export function parseTotalsResponse(response: TotalsResponse, metricKeys: string[]): number[] {
  const totals = response.totals ?? [];
  if (totals.length !== metricKeys.length) {
    throw new Error(
      `Метрика вернула ${totals.length} значений на ${metricKeys.length} ключей — порядок метрик разъехался`,
    );
  }
  return totals.map((v) => Math.round(v ?? 0));
}
