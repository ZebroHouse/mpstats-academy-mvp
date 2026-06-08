# Phase 63 — Wave 2: Revenue Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Выручка tab: MRR / paying-base / ARPU overview, upcoming-renewals forecast (recurrent only), actual cash-in by day, and plan split — all excluding test users (`isExcludedFromRevenue` from Wave 1).

**Architecture:** Pure functions in `revenue-metrics.ts` take already-fetched rows (with `plan` + `user.isTest`) and do exclusion + math, mirroring the `mapActiveUserStats` pattern. Thin `admin.analytics.*` procedures fetch + enrich names/emails. The page reuses `ActivityChart` and `StatCard`.

**Tech Stack:** tRPC v10, Prisma 5.22, Vitest, recharts. **Depends on Wave 1** (`isTest` flag, `isExcludedFromRevenue`, `adminAnalyticsRouter`).

---

## File Structure

- `packages/api/src/utils/revenue-metrics.ts` — NEW pure functions.
- `packages/api/src/utils/revenue-metrics.test.ts` — NEW.
- `packages/api/src/routers/admin-analytics.ts` — add `getRevenueOverview`, `getUpcomingRenewals`, `getActualRevenue`.
- `apps/web/src/app/(admin)/admin/analytics/revenue/page.tsx` — replace stub with real dashboard.

---

## Task 1: Pure revenue-overview function

**Files:**
- Create: `packages/api/src/utils/revenue-metrics.ts`
- Test: `packages/api/src/utils/revenue-metrics.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/api/src/utils/revenue-metrics.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeRevenueOverview, type RevenueSubRow } from './revenue-metrics';

const NOW = new Date('2026-06-08T00:00:00Z');
const future = new Date('2026-07-01T00:00:00Z');
const past = new Date('2026-06-01T00:00:00Z');

function sub(p: Partial<RevenueSubRow>): RevenueSubRow {
  return {
    userId: 'u1', status: 'ACTIVE', currentPeriodEnd: future, cpSubscriptionId: 'sc_1',
    plan: { type: 'PLATFORM', price: 2990, hidden: false }, user: { isTest: false },
    ...p,
  };
}

describe('computeRevenueOverview', () => {
  it('counts ACTIVE as paying + MRR, TRIAL as pipeline only', () => {
    const r = computeRevenueOverview([
      sub({ userId: 'a', status: 'ACTIVE', plan: { type: 'PLATFORM', price: 2990, hidden: false } }),
      sub({ userId: 'b', status: 'TRIAL', plan: { type: 'PLATFORM', price: 2990, hidden: false } }),
    ], NOW);
    expect(r.payingUsers).toBe(2);     // active base = ACTIVE + TRIAL within period
    expect(r.activePaying).toBe(1);    // only ACTIVE
    expect(r.trialPipeline).toBe(1);
    expect(r.mrr).toBe(2990);          // TRIAL contributes 0₽
    expect(r.arpu).toBe(2990);
  });

  it('excludes test users and hidden plans', () => {
    const r = computeRevenueOverview([
      sub({ userId: 'a', user: { isTest: true } }),
      sub({ userId: 'b', plan: { type: 'COURSE', price: 1990, hidden: true } }),
      sub({ userId: 'c', status: 'ACTIVE', plan: { type: 'COURSE', price: 1990, hidden: false } }),
    ], NOW);
    expect(r.activePaying).toBe(1);
    expect(r.mrr).toBe(1990);
  });

  it('ignores expired/cancelled and out-of-period rows', () => {
    const r = computeRevenueOverview([
      sub({ userId: 'a', status: 'CANCELLED' }),
      sub({ userId: 'b', status: 'ACTIVE', currentPeriodEnd: past }),
    ], NOW);
    expect(r.payingUsers).toBe(0);
    expect(r.mrr).toBe(0);
    expect(r.arpu).toBe(0);
  });

  it('splits revenue by plan type', () => {
    const r = computeRevenueOverview([
      sub({ userId: 'a', status: 'ACTIVE', plan: { type: 'PLATFORM', price: 2990, hidden: false } }),
      sub({ userId: 'b', status: 'ACTIVE', plan: { type: 'COURSE', price: 1990, hidden: false } }),
    ], NOW);
    const platform = r.planSplit.find((p) => p.type === 'PLATFORM')!;
    const course = r.planSplit.find((p) => p.type === 'COURSE')!;
    expect(platform).toMatchObject({ count: 1, revenue: 2990 });
    expect(course).toMatchObject({ count: 1, revenue: 1990 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mpstats/api test -- revenue-metrics`
Expected: FAIL — "Cannot find module './revenue-metrics'".

- [ ] **Step 3: Write the implementation**

Create `packages/api/src/utils/revenue-metrics.ts`:

```ts
/**
 * Phase 63 — pure revenue metrics over already-fetched subscription rows.
 *
 * "Paying base" = ACTIVE + TRIAL still within period. MRR counts ACTIVE only
 * (TRIAL pays 0₽ — it is pipeline). All money is honest, not period-normalized:
 * both plans are 30-day intervals today. If a plan with a different intervalDays
 * is ever added, normalize price → price * 30 / intervalDays here.
 */
import { isExcludedFromRevenue } from './test-exclusion';

export type PlanType = 'COURSE' | 'PLATFORM';
export type SubStatus = 'PENDING' | 'ACTIVE' | 'TRIAL' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED';

export interface RevenueSubRow {
  userId: string;
  status: SubStatus;
  currentPeriodEnd: Date;
  cpSubscriptionId: string | null;
  plan: { type: PlanType; price: number; hidden: boolean };
  user: { isTest: boolean };
}

export interface RevenueOverview {
  payingUsers: number;
  activePaying: number;
  trialPipeline: number;
  mrr: number;
  arpu: number;
  planSplit: Array<{ type: PlanType; count: number; revenue: number }>;
}

export function computeRevenueOverview(rows: RevenueSubRow[], now: Date): RevenueOverview {
  const kept = rows.filter((r) => !isExcludedFromRevenue(r));
  const inPeriod = kept.filter((r) => r.currentPeriodEnd > now);

  const activeBase = inPeriod.filter((r) => r.status === 'ACTIVE' || r.status === 'TRIAL');
  const active = inPeriod.filter((r) => r.status === 'ACTIVE');
  const trials = inPeriod.filter((r) => r.status === 'TRIAL');

  const payingUsers = new Set(activeBase.map((r) => r.userId)).size;
  const activePaying = new Set(active.map((r) => r.userId)).size;
  const trialPipeline = new Set(trials.map((r) => r.userId)).size;

  const mrr = active.reduce((sum, r) => sum + r.plan.price, 0);
  const arpu = activePaying > 0 ? Math.round(mrr / activePaying) : 0;

  const splitMap = new Map<PlanType, { count: number; revenue: number }>();
  for (const r of active) {
    const e = splitMap.get(r.plan.type) ?? { count: 0, revenue: 0 };
    e.count += 1;
    e.revenue += r.plan.price;
    splitMap.set(r.plan.type, e);
  }
  const planSplit = (['COURSE', 'PLATFORM'] as PlanType[]).map((type) => ({
    type,
    count: splitMap.get(type)?.count ?? 0,
    revenue: splitMap.get(type)?.revenue ?? 0,
  }));

  return { payingUsers, activePaying, trialPipeline, mrr, arpu, planSplit };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mpstats/api test -- revenue-metrics`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/utils/revenue-metrics.ts packages/api/src/utils/revenue-metrics.test.ts
git commit -m "feat(63): computeRevenueOverview pure function"
```

---

## Task 2: Pure upcoming-renewals + actual-revenue functions

**Files:**
- Modify: `packages/api/src/utils/revenue-metrics.ts`
- Modify: `packages/api/src/utils/revenue-metrics.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `revenue-metrics.test.ts`:

```ts
import { computeUpcomingRenewals, groupRevenueByDay, type PaymentRow } from './revenue-metrics';

describe('computeUpcomingRenewals', () => {
  const NOW2 = new Date('2026-06-08T00:00:00Z');
  const within = new Date('2026-06-12T00:00:00Z');
  const beyond = new Date('2026-07-20T00:00:00Z');

  it('keeps only ACTIVE recurrent subs renewing within the window, sorted', () => {
    const r = computeUpcomingRenewals([
      sub({ userId: 'a', status: 'ACTIVE', cpSubscriptionId: 'sc_a', currentPeriodEnd: within, plan: { type: 'PLATFORM', price: 2990, hidden: false } }),
      sub({ userId: 'b', status: 'ACTIVE', cpSubscriptionId: null, currentPeriodEnd: within }),    // not recurrent
      sub({ userId: 'c', status: 'TRIAL', cpSubscriptionId: 'sc_c', currentPeriodEnd: within }),   // not ACTIVE
      sub({ userId: 'd', status: 'ACTIVE', cpSubscriptionId: 'sc_d', currentPeriodEnd: beyond }),  // out of window
    ], NOW2, new Date('2026-06-15T00:00:00Z'));
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ userId: 'a', planType: 'PLATFORM', amount: 2990 });
    expect(r.totalExpected).toBe(2990);
  });
});

describe('groupRevenueByDay', () => {
  function pay(p: Partial<PaymentRow>): PaymentRow {
    return { paidAt: new Date('2026-06-05T10:00:00Z'), amount: 2990, subscription: { plan: { hidden: false }, user: { isTest: false } }, ...p };
  }
  it('sums COMPLETED payments per UTC day, excluding test/hidden', () => {
    const r = groupRevenueByDay([
      pay({ paidAt: new Date('2026-06-05T10:00:00Z'), amount: 2990 }),
      pay({ paidAt: new Date('2026-06-05T20:00:00Z'), amount: 1990 }),
      pay({ amount: 999, subscription: { plan: { hidden: false }, user: { isTest: true } } }),
    ]);
    const day = r.byDay.find((d) => d.date === '2026-06-05')!;
    expect(day.amount).toBe(4980);
    expect(r.total).toBe(4980);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @mpstats/api test -- revenue-metrics`
Expected: FAIL — `computeUpcomingRenewals` / `groupRevenueByDay` / `PaymentRow` not exported.

- [ ] **Step 3: Implement**

Append to `revenue-metrics.ts`:

```ts
export interface RenewalRow {
  userId: string;
  planType: PlanType;
  amount: number;
  renewalDate: Date;
}

export function computeUpcomingRenewals(
  rows: RevenueSubRow[],
  now: Date,
  windowEnd: Date,
): { rows: RenewalRow[]; totalExpected: number } {
  const kept = rows
    .filter((r) => !isExcludedFromRevenue(r))
    .filter((r) => r.status === 'ACTIVE' && r.cpSubscriptionId != null)
    .filter((r) => r.currentPeriodEnd >= now && r.currentPeriodEnd <= windowEnd)
    .map((r) => ({
      userId: r.userId,
      planType: r.plan.type,
      amount: r.plan.price,
      renewalDate: r.currentPeriodEnd,
    }))
    .sort((a, b) => a.renewalDate.getTime() - b.renewalDate.getTime());

  return { rows: kept, totalExpected: kept.reduce((s, r) => s + r.amount, 0) };
}

export interface PaymentRow {
  paidAt: Date;
  amount: number;
  subscription: { plan: { hidden: boolean }; user: { isTest: boolean } };
}

export function groupRevenueByDay(
  payments: PaymentRow[],
): { byDay: Array<{ date: string; amount: number }>; total: number } {
  const map = new Map<string, number>();
  let total = 0;
  for (const p of payments) {
    if (isExcludedFromRevenue({ user: p.subscription.user, plan: p.subscription.plan })) continue;
    const key = p.paidAt.toISOString().split('T')[0];
    map.set(key, (map.get(key) ?? 0) + p.amount);
    total += p.amount;
  }
  const byDay = [...map.entries()]
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return { byDay, total };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @mpstats/api test -- revenue-metrics`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/utils/revenue-metrics.ts packages/api/src/utils/revenue-metrics.test.ts
git commit -m "feat(63): computeUpcomingRenewals + groupRevenueByDay pure functions"
```

---

## Task 3: Revenue procedures in `admin.analytics.*`

**Files:**
- Modify: `packages/api/src/routers/admin-analytics.ts`

- [ ] **Step 1: Add the three procedures**

In `admin-analytics.ts`, add imports at top:

```ts
import { computeRevenueOverview, computeUpcomingRenewals, groupRevenueByDay } from '../utils/revenue-metrics';
```

Add inside the `router({ ... })`:

```ts
  /** Revenue overview: paying base, MRR, ARPU, plan split. Excludes test users. */
  getRevenueOverview: adminProcedure.query(async ({ ctx }) => {
    try {
      const subs = await ctx.prisma.subscription.findMany({
        where: { status: { in: ['ACTIVE', 'TRIAL'] } },
        select: {
          userId: true,
          status: true,
          currentPeriodEnd: true,
          cpSubscriptionId: true,
          plan: { select: { type: true, price: true, hidden: true } },
          user: { select: { isTest: true } },
        },
      });
      return computeRevenueOverview(subs as never, new Date());
    } catch (error) {
      handleDatabaseError(error);
    }
  }),

  /** Upcoming recurrent renewals within `days`. Returns enriched rows + total. */
  getUpcomingRenewals: adminProcedure
    .input(z.object({ days: z.number().int().min(1).max(90).default(30) }))
    .query(async ({ ctx, input }) => {
      try {
        const now = new Date();
        const windowEnd = new Date(now.getTime() + input.days * 24 * 60 * 60 * 1000);

        const subs = await ctx.prisma.subscription.findMany({
          where: { status: 'ACTIVE', cpSubscriptionId: { not: null }, currentPeriodEnd: { gte: now, lte: windowEnd } },
          select: {
            userId: true,
            status: true,
            currentPeriodEnd: true,
            cpSubscriptionId: true,
            plan: { select: { type: true, price: true, hidden: true } },
            user: { select: { isTest: true } },
          },
        });

        const { rows, totalExpected } = computeUpcomingRenewals(subs as never, now, windowEnd);

        // Enrich with name + email (same pattern as getWatchStats).
        const userIds = [...new Set(rows.map((r) => r.userId))];
        const profiles = userIds.length
          ? await ctx.prisma.userProfile.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
          : [];
        const nameMap = new Map(profiles.map((p) => [p.id, p.name]));
        const emailMap = new Map<string, string>();
        if (userIds.length) {
          try {
            const r = await ctx.prisma.$queryRawUnsafe<Array<{ id: string; email: string | null }>>(
              `SELECT id::text AS id, email FROM auth.users WHERE id IN (${userIds.map((_, i) => `$${i + 1}::uuid`).join(',')})`,
              ...userIds,
            );
            r.forEach((row) => { if (row.email) emailMap.set(row.id, row.email); });
          } catch { /* emails optional */ }
        }

        return {
          rows: rows.map((r) => ({
            ...r,
            name: nameMap.get(r.userId) ?? 'Unknown',
            email: emailMap.get(r.userId) ?? null,
          })),
          totalExpected,
        };
      } catch (error) {
        handleDatabaseError(error);
      }
    }),

  /** Actual cash-in: COMPLETED payments per day within `days`. Excludes test users. */
  getActualRevenue: adminProcedure
    .input(z.object({ days: z.number().int().min(1).max(90).default(30) }))
    .query(async ({ ctx, input }) => {
      try {
        const start = new Date();
        start.setDate(start.getDate() - input.days);
        const payments = await ctx.prisma.payment.findMany({
          where: { status: 'COMPLETED', paidAt: { gte: start } },
          select: {
            paidAt: true,
            amount: true,
            subscription: {
              select: { plan: { select: { hidden: true } }, user: { select: { isTest: true } } },
            },
          },
        });
        // paidAt is nullable in schema but COMPLETED rows have it; filter defensively.
        const rows = payments.filter((p) => p.paidAt != null);
        return groupRevenueByDay(rows as never);
      } catch (error) {
        handleDatabaseError(error);
      }
    }),
```

- [ ] **Step 2: Typecheck + tests**

Run: `pnpm --filter @mpstats/api typecheck && pnpm --filter @mpstats/api test`
Expected: no type errors; all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/routers/admin-analytics.ts
git commit -m "feat(63): revenue procedures (overview, renewals, actual) in admin.analytics"
```

---

## Task 4: Revenue page UI

**Files:**
- Modify: `apps/web/src/app/(admin)/admin/analytics/revenue/page.tsx` (replace stub)

- [ ] **Step 1: Replace the stub with the dashboard**

Overwrite `apps/web/src/app/(admin)/admin/analytics/revenue/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { ActivityChart } from '@/components/admin/ActivityChart';
import { StatCard } from '@/components/admin/StatCard';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Users, CreditCard, TrendingUp, Wallet, FlaskConical } from 'lucide-react';

const PERIODS = [
  { label: '7d', days: 7 },
  { label: '14d', days: 14 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
] as const;

const rub = (n: number) => `${n.toLocaleString('ru-RU')} ₽`;
const fmtDate = (d: string) => { const p = d.split('-'); return `${p[2]}.${p[1]}.${p[0]}`; };

export default function AnalyticsRevenuePage() {
  const [days, setDays] = useState(30);
  const overview = trpc.admin.analytics.getRevenueOverview.useQuery();
  const renewals = trpc.admin.analytics.getUpcomingRenewals.useQuery({ days });
  const actual = trpc.admin.analytics.getActualRevenue.useQuery({ days });

  const o = overview.data;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-heading-lg font-bold text-mp-gray-900">Выручка</h2>
          <p className="text-body-sm text-mp-gray-500 mt-1">MRR, продления, приход, ARPU (без тестовых)</p>
        </div>
        <div className="flex items-center gap-1 bg-mp-gray-100 rounded-lg p-1">
          {PERIODS.map((p) => (
            <button key={p.days} onClick={() => setDays(p.days)}
              className={cn('px-3 py-1.5 text-body-sm font-medium rounded-md transition-all duration-200',
                days === p.days ? 'bg-white text-mp-blue-600 shadow-sm' : 'text-mp-gray-600 hover:text-mp-gray-900')}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      {overview.isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => <Card key={i} className="p-5"><Skeleton className="h-4 w-24 mb-3" /><Skeleton className="h-8 w-16" /></Card>)}
        </div>
      ) : o ? (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard title="MRR" value={rub(o.mrr)} icon={Wallet} color="green" />
          <StatCard title="Платящих (ACTIVE)" value={o.activePaying} icon={CreditCard} color="blue" />
          <StatCard title="Триалы (пайплайн)" value={o.trialPipeline} icon={FlaskConical} color="pink" />
          <StatCard title="Активная база" value={o.payingUsers} icon={Users} color="gray" />
          <StatCard title="ARPU" value={rub(o.arpu)} icon={TrendingUp} color="blue" />
        </div>
      ) : null}

      {/* Plan split */}
      {o && (
        <Card className="p-5">
          <h4 className="text-body font-semibold text-mp-gray-900 mb-3">Сплит планов</h4>
          <table className="w-full text-body-sm">
            <thead><tr className="border-b border-mp-gray-200">
              <th className="text-left py-2 pr-4 text-mp-gray-500 font-medium">План</th>
              <th className="text-right py-2 px-4 text-mp-gray-500 font-medium">Подписок</th>
              <th className="text-right py-2 pl-4 text-mp-gray-500 font-medium">MRR</th>
            </tr></thead>
            <tbody>
              {o.planSplit.map((p) => (
                <tr key={p.type} className="border-b border-mp-gray-100 last:border-0">
                  <td className="py-2 pr-4 text-mp-gray-900">{p.type === 'PLATFORM' ? 'Полный доступ' : 'Курс'}</td>
                  <td className="py-2 px-4 text-right text-mp-gray-700">{p.count}</td>
                  <td className="py-2 pl-4 text-right text-mp-gray-700">{rub(p.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Actual revenue chart */}
      <Card className="p-5">
        <div className="flex items-baseline justify-between mb-2">
          <h4 className="text-body font-semibold text-mp-gray-900">Фактический приход</h4>
          {actual.data && <span className="text-body-sm text-mp-gray-500">Итого: {rub(actual.data.total)}</span>}
        </div>
        {actual.isLoading ? <Skeleton className="h-[250px] w-full" /> :
          <ActivityChart
            data={(actual.data?.byDay ?? []).map((d) => ({ date: d.date, count: d.amount }))}
            title=""
            color="#16a34a"
          />}
      </Card>

      {/* Upcoming renewals */}
      <Card className="p-5">
        <div className="flex items-baseline justify-between mb-3">
          <h4 className="text-body font-semibold text-mp-gray-900">Ближайшие продления ({days}д)</h4>
          {renewals.data && <span className="text-body-sm text-mp-gray-500">Ожидаем: {rub(renewals.data.totalExpected)}</span>}
        </div>
        {renewals.isLoading ? <Skeleton className="h-24 w-full" /> :
          renewals.data && renewals.data.rows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-body-sm">
                <thead><tr className="border-b border-mp-gray-200">
                  <th className="text-left py-2 pr-4 text-mp-gray-500 font-medium">Пользователь</th>
                  <th className="text-left py-2 px-4 text-mp-gray-500 font-medium">Email</th>
                  <th className="text-left py-2 px-4 text-mp-gray-500 font-medium">План</th>
                  <th className="text-right py-2 px-4 text-mp-gray-500 font-medium">Сумма</th>
                  <th className="text-right py-2 pl-4 text-mp-gray-500 font-medium">Дата</th>
                </tr></thead>
                <tbody>
                  {renewals.data.rows.map((r, i) => (
                    <tr key={`${r.userId}-${i}`} className="border-b border-mp-gray-100 last:border-0">
                      <td className="py-2 pr-4 text-mp-gray-900">{r.name}</td>
                      <td className="py-2 px-4 text-mp-gray-600">{r.email || '—'}</td>
                      <td className="py-2 px-4 text-mp-gray-700">{r.planType === 'PLATFORM' ? 'Полный доступ' : 'Курс'}</td>
                      <td className="py-2 px-4 text-right text-mp-gray-700">{rub(r.amount)}</td>
                      <td className="py-2 pl-4 text-right text-mp-gray-700">{fmtDate(new Date(r.renewalDate).toISOString().split('T')[0])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="text-body-sm text-mp-gray-500">Нет рекуррентных продлений в окне.</p>}
      </Card>
    </div>
  );
}
```

> Note: `ActivityChart` renders its own `<h3>{title}</h3>`; passing `title=""` keeps the card's own `<h4>` as the heading. The renewal date arrives as an ISO string over the wire (tRPC serializes Date) — `new Date(r.renewalDate)` re-hydrates it.

- [ ] **Step 2: Typecheck web**

Run: `pnpm --filter web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(admin)/admin/analytics/revenue/page.tsx"
git commit -m "feat(63): Выручка dashboard UI (MRR, renewals, actual, split)"
```

---

## Task 5: Verify

- [ ] **Step 1: Full typecheck + tests**

Run: `pnpm typecheck && pnpm test`
Expected: all green.

- [ ] **Step 2: Manual check**

`pnpm dev` → `/admin/analytics/revenue`: KPI cards show numbers, plan split table, actual-revenue chart reacts to period, renewals table lists recurrent subs with the expected total. Confirm test accounts (flagged in Wave 1) are NOT counted.

---

## Self-Review

- **Spec coverage:** §D getRevenueOverview (Task 1+3), getUpcomingRenewals (Task 2+3), getActualRevenue (Task 2+3), UI (Task 4). Exclusion via Wave 1 helper, used in every pure fn.
- **Placeholder scan:** all code complete; no TODO/TBD.
- **Type consistency:** `RevenueSubRow`/`PaymentRow`/`RevenueOverview`/`RenewalRow` defined in Tasks 1-2, consumed in Task 3. tRPC paths `admin.analytics.getRevenueOverview|getUpcomingRenewals|getActualRevenue` consistent Tasks 3↔4.

## Deploy

Tests green → staging `--no-cache` + content-check `/admin/analytics/revenue` → owner UAT → `git checkout master` → merge → prod smoke. No new migration in this wave (uses Wave 1's `isTest`).
