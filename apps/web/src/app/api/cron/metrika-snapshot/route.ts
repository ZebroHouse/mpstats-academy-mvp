import { NextResponse } from 'next/server';
import { prisma } from '@mpstats/db/client';
import { Prisma } from '@mpstats/db';
import {
  METRIKA_GOAL_IDS,
  METRIKA_TRAFFIC_METRICS,
  METRIKA_UNIQUE_WINDOWS,
  goalApiMetric,
  goalMetricKey,
  type MetrikaGoalKey,
} from '@mpstats/shared';
import { fetchByTime, fetchTotals, metrikaCredentials } from '@/lib/metrika/client';
import {
  buildByTimeParams,
  buildTotalsParams,
  parseByTimeResponse,
  parseTotalsResponse,
  splitRange,
  toDateKey,
  type SnapshotRow,
} from '@/lib/metrika/query';

export const dynamic = 'force-dynamic';

/** Метрика доуточняет вчерашние цифры ещё несколько дней — перезаписываем окно. */
const DEFAULT_WINDOW_DAYS = 8;
const MAX_WINDOW_DAYS = 400;
/** Длинные окна с 16 метриками ловят "Query is too complicated". */
const CHUNK_DAYS = 60;

const GOAL_KEYS = Object.keys(METRIKA_GOAL_IDS) as MetrikaGoalKey[];
/** Батч на один INSERT. Бэкфилл за год — это 19 ключей × 365 дней ≈ 7000 строк;
 *  построчный upsert по удалённой Supabase не уложится в таймаут крона. */
const UPSERT_CHUNK = 500;

interface UpsertRow {
  metricKey: string;
  day: string;
  windowDays: number;
  value: number;
}

/** Идемпотентная запись пачками: повторный прогон крона перезаписывает
 *  значения, а не плодит дубли (первичный ключ — metricKey+day+windowDays). */
async function upsertSnapshotRows(rows: UpsertRow[]): Promise<void> {
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    const values = chunk.map(
      (r) => Prisma.sql`(${r.metricKey}, ${r.day}::date, ${r.windowDays}, ${r.value}, NOW())`,
    );
    await prisma.$executeRaw`
      INSERT INTO "MetrikaSnapshot" ("metricKey", "day", "windowDays", "value", "fetchedAt")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("metricKey", "day", "windowDays")
      DO UPDATE SET "value" = EXCLUDED."value", "fetchedAt" = EXCLUDED."fetchedAt"
    `;
  }
}

async function handle(request: Request) {
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const creds = metrikaCredentials();
  if (!creds) {
    return NextResponse.json(
      { error: 'YANDEX_METRIKA_COUNTER_ID / YANDEX_METRIKA_OAUTH_TOKEN не заданы' },
      { status: 500 },
    );
  }

  const requested = Number(new URL(request.url).searchParams.get('days') ?? DEFAULT_WINDOW_DAYS);
  const windowDays = Math.min(
    Math.max(Number.isFinite(requested) ? requested : DEFAULT_WINDOW_DAYS, 1),
    MAX_WINDOW_DAYS,
  );

  const today = new Date();
  const date2 = toDateKey(today);
  const date1 = toDateKey(new Date(today.getTime() - (windowDays - 1) * 86_400_000));

  try {
    const rows: SnapshotRow[] = [];

    // Два запроса вместо одного: лимит Метрики — 20 метрик на запрос,
    // трафик (3) + цели (16) = 19 упирается в потолок вплотную.
    const trafficMetrics = METRIKA_TRAFFIC_METRICS.map((m) => `ym:s:${m}`);
    const trafficKeys = [...METRIKA_TRAFFIC_METRICS];

    const goalMetrics: string[] = [];
    const goalKeys: string[] = [];
    for (const goal of GOAL_KEYS) {
      for (const kind of ['visits', 'users'] as const) {
        goalMetrics.push(goalApiMetric(goal, kind));
        goalKeys.push(goalMetricKey(goal, kind));
      }
    }

    for (const chunk of splitRange(date1, date2, CHUNK_DAYS)) {
      const traffic = await fetchByTime(
        buildByTimeParams({ counterId: creds.counterId, metrics: trafficMetrics, ...chunk }),
        creds.token,
      );
      rows.push(...parseByTimeResponse(traffic as never, trafficKeys));

      const goals = await fetchByTime(
        buildByTimeParams({ counterId: creds.counterId, metrics: goalMetrics, ...chunk }),
        creds.token,
      );
      rows.push(...parseByTimeResponse(goals as never, goalKeys));
    }

    await upsertSnapshotRows(rows.map((r) => ({ ...r, windowDays: 1 })));

    // Периодные уники: users не аддитивны по дням, поэтому для пресетных окон
    // снимаем дедуплицированное значение отдельным запросом за целый период.
    const yesterday = new Date(today.getTime() - 86_400_000);
    const uniqueDayKey = toDateKey(yesterday);
    const periodRows: UpsertRow[] = [];

    for (const period of METRIKA_UNIQUE_WINDOWS) {
      const periodStart = toDateKey(new Date(yesterday.getTime() - (period - 1) * 86_400_000));
      const response = await fetchTotals(
        buildTotalsParams({
          counterId: creds.counterId,
          metrics: ['ym:s:users', 'ym:s:visits'],
          date1: periodStart,
          date2: uniqueDayKey,
        }),
        creds.token,
      );
      const [users, visits] = parseTotalsResponse(response as never, ['users', 'visits']);

      periodRows.push(
        { metricKey: 'users', day: uniqueDayKey, windowDays: period, value: users },
        { metricKey: 'visits', day: uniqueDayKey, windowDays: period, value: visits },
      );
    }

    await upsertSnapshotRows(periodRows);

    return NextResponse.json({
      ok: true,
      from: date1,
      to: date2,
      dailyRows: rows.length,
      uniqueRows: periodRows.length,
    });
  } catch (error) {
    // Падение Метрики не должно ронять крон: снапшот остаётся прежним,
    // админка покажет последние успешные данные с отметкой даты.
    const message = error instanceof Error ? error.message : 'unknown';
    console.error('[cron/metrika-snapshot] failed:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 200 });
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
