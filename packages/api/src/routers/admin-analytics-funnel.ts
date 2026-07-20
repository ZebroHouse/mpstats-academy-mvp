// packages/api/src/routers/admin-analytics-funnel.ts
/**
 * Product funnel analytics — mounted at `admin.analytics.funnel.*`.
 *
 * Read-only over the MetrikaSnapshot table (behavior) plus Subscription /
 * Payment (money). Nothing here calls the Metrika API: the cron already
 * persisted the numbers, so the tab stays fast and works when Metrika is down.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import type { PrismaClient } from '@mpstats/db';
import { FUNNEL_GOAL_STEPS, METRIKA_UNIQUE_WINDOWS, goalMetricKey } from '@mpstats/shared';
import { router, adminProcedure } from '../trpc';
import { handleDatabaseError } from '../utils/db-errors';
import { buildFunnel, sumDaily, type DailyPoint } from '../utils/product-funnel';

const rangeInput = z.object({ from: z.date(), to: z.date() });

const TRAFFIC_KEYS = ['visits', 'users', 'pageviews'] as const;
type TrafficKey = (typeof TRAFFIC_KEYS)[number];

/** Насколько строка периодных уников может отставать от конца периода.
 *  Срез снимается за вчера, крон ходит раз в 6 часов — двух суток хватает,
 *  чтобы пережить пропущенный прогон и не выдать цифру за чужой период. */
const SNAPSHOT_EDGE_TOLERANCE_MS = 2 * 86_400_000;

/** Дедуплицированные уники за окно + граница, по которую они посчитаны.
 *  Экспортируется: тип попадает в выводимую сигнатуру appRouter. */
export interface PeriodUsers {
  value: number;
  windowDays: number;
  /** Последний день, попавший в срез (yyyy-mm-dd). */
  throughDay: string;
}

/**
 * Инклюзивная длина периода в календарных днях. Оба конца сначала сводятся к
 * началу UTC-суток: UI шлёт `to` как 23:59:59.999 (`rangeToBounds`), и сырая
 * разница в миллисекундах даёт 6.99999 дня, что после round+1 завышает длину
 * на сутки. Зеркалит `daySpan` из AnalyticsDateRange.tsx.
 */
function inclusiveDaySpan(from: Date, to: Date): number {
  const startOfDay = (d: Date) =>
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((startOfDay(to) - startOfDay(from)) / 86_400_000) + 1;
}

function assertRange(from: Date, to: Date) {
  if ((to.getTime() - from.getTime()) / 86_400_000 > 366) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Диапазон не больше 366 дней' });
  }
}

/** Подневные (аддитивные) строки снапшота за период. */
async function loadDaily(prisma: PrismaClient, from: Date, to: Date): Promise<DailyPoint[]> {
  const rows = await prisma.metrikaSnapshot.findMany({
    where: { windowDays: 1, day: { gte: from, lte: to } },
    select: { metricKey: true, day: true, value: true },
    orderBy: { day: 'asc' },
  });
  return rows.map((r) => ({
    metricKey: r.metricKey,
    day: r.day.toISOString().slice(0, 10),
    value: r.value,
  }));
}

/** Момент последней успешной записи крона — «данные на». */
async function loadSnapshotAt(prisma: PrismaClient): Promise<Date | null> {
  const freshest = await prisma.metrikaSnapshot.findFirst({
    orderBy: { fetchedAt: 'desc' },
    select: { fetchedAt: true },
  });
  return freshest?.fetchedAt ?? null;
}

export const adminAnalyticsFunnelRouter = router({
  /** Трафик по дням + отметка свежести снапшота. */
  getTrafficOverview: adminProcedure.input(rangeInput).query(async ({ ctx, input }) => {
    try {
      assertRange(input.from, input.to);
      const daily = await loadDaily(ctx.prisma, input.from, input.to);

      const byDay = new Map<string, { day: string; visits: number; users: number; pageviews: number }>();
      for (const point of daily) {
        if (!(TRAFFIC_KEYS as readonly string[]).includes(point.metricKey)) continue;
        const entry = byDay.get(point.day) ?? { day: point.day, visits: 0, users: 0, pageviews: 0 };
        entry[point.metricKey as TrafficKey] = point.value;
        byDay.set(point.day, entry);
      }

      // Уники за период берём только из окна нужной длины: сумма дневных
      // уников задваивает людей, вернувшихся на следующий день.
      //
      // Крон истории уников не ведёт — он перезаписывает один срез, снятый
      // за вчера. Поэтому строка годится, только если её `day` примыкает
      // к концу запрошенного периода. Без этой проверки выбор недели в июне
      // вернул бы уников за прошедшую неделю, поданных как июньские:
      // цифра тихо неверная, а такие уходят во внешние отчёты.
      // Длина периода должна совпасть с окном ТОЧНО. Допуск здесь был бы
      // вреден: выбрав 6 дней, админ получил бы недельную цифру как свою.
      const spanDays = inclusiveDaySpan(input.from, input.to);
      const matchedWindow = METRIKA_UNIQUE_WINDOWS.find((w) => w === spanDays) ?? null;
      let periodUsers: PeriodUsers | null = null;
      if (matchedWindow) {
        const row = await ctx.prisma.metrikaSnapshot.findFirst({
          where: {
            metricKey: 'users',
            windowDays: matchedWindow,
            day: { gte: new Date(input.to.getTime() - SNAPSHOT_EDGE_TOLERANCE_MS), lte: input.to },
          },
          orderBy: { day: 'desc' },
        });
        // Окно крона заканчивается вчерашним днём, а период может кончаться
        // сегодня. Возвращаем не голое число, а границу, по которую оно
        // посчитано, чтобы UI подписал цифру, а не выдавал её за «ровно
        // выбранный период».
        periodUsers = row
          ? { value: row.value, windowDays: matchedWindow, throughDay: row.day.toISOString().slice(0, 10) }
          : null;
      }

      return {
        series: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)),
        totals: {
          visits: sumDaily(daily, 'visits'),
          pageviews: sumDaily(daily, 'pageviews'),
          /** null = период не совпал с пресетным окном, честных уников нет. */
          periodUsers,
        },
        snapshotAt: await loadSnapshotAt(ctx.prisma),
      };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      handleDatabaseError(error);
    }
  }),

  /** Сквозная воронка: поведение из снапшота, триал и оплаты из БД. */
  getProductFunnel: adminProcedure.input(rangeInput).query(async ({ ctx, input }) => {
    try {
      assertRange(input.from, input.to);
      const daily = await loadDaily(ctx.prisma, input.from, input.to);

      const goalVisits = Object.fromEntries(
        FUNNEL_GOAL_STEPS.map((goal) => [goal, sumDaily(daily, goalMetricKey(goal, 'visits'))]),
      ) as Record<(typeof FUNNEL_GOAL_STEPS)[number], number>;

      // Тот же фильтр, что в getTrialConversion (admin-analytics.ts),
      // иначе новый таб разойдётся с существующим табом «Триал→оплата».
      const trials = await ctx.prisma.subscription.count({
        where: {
          status: 'TRIAL',
          currentPeriodStart: { gte: input.from, lte: input.to },
          user: { isTest: false },
          plan: { hidden: false },
        },
      });

      // Деньги — только из БД: клиентская цель platform_payment ловит
      // 10-12 оплат за 30 дней там, где БД знает реальное число.
      const paidRows = await ctx.prisma.payment.findMany({
        where: {
          status: 'COMPLETED',
          paidAt: { gte: input.from, lte: input.to },
          subscription: { user: { isTest: false }, plan: { hidden: false } },
        },
        select: { subscription: { select: { userId: true } } },
      });
      const payments = new Set(paidRows.map((p) => p.subscription.userId)).size;

      return {
        steps: buildFunnel({ visits: sumDaily(daily, 'visits'), goalVisits, trials, payments }),
        snapshotAt: await loadSnapshotAt(ctx.prisma),
      };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      handleDatabaseError(error);
    }
  }),
});
