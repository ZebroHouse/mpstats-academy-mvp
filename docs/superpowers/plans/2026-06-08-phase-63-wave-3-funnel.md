# Phase 63 — Wave 3: Funnel & Retention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Воронка tab: registration→diagnostic→paid conversion, **accurate** trial→paid (derived from the separate-immutable-row model + a regression test guarding the invariant), churn, and referral attribution — all excluding test users.

**Architecture:** Trial→paid is derived purely from existing data: TRIAL subscriptions are separate rows whose status is never mutated (verified in code), and conversion = the user's first COMPLETED payment. Pure functions in `trial-conversion.ts` and `funnel-metrics.ts` are unit-tested; thin procedures fetch rows. A regression test pins the "TRIAL rows never change status" invariant.

**Tech Stack:** tRPC v10, Prisma 5.22, Vitest. **Depends on Wave 1** (`isTest`, `isExcludedFromRevenue`, `adminAnalyticsRouter`).

---

## File Structure

- `packages/api/src/utils/trial-conversion.ts` + `.test.ts` — NEW: `deriveTrialConversion`.
- `packages/api/src/utils/funnel-metrics.ts` + `.test.ts` — NEW: `computeConversionFunnel`, `churnRate`.
- `packages/api/src/routers/admin-analytics.ts` — add `getConversionFunnel`, `getTrialConversion`, `getChurn`, `getAttribution`.
- `apps/web/src/lib/cloudpayments/__tests__/trial-invariant.test.ts` — NEW regression test.
- `apps/web/src/app/(admin)/admin/analytics/funnel/page.tsx` — replace stub with dashboard.

---

## Task 1: `deriveTrialConversion` pure function (the accurate trial→paid core)

**Files:**
- Create: `packages/api/src/utils/trial-conversion.ts`
- Test: `packages/api/src/utils/trial-conversion.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/api/src/utils/trial-conversion.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { deriveTrialConversion, type TrialRow, type ConversionPayment } from './trial-conversion';

const NOW = new Date('2026-06-08T00:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

function trial(p: Partial<TrialRow>): TrialRow {
  return {
    userId: 'u', trialStart: new Date(NOW.getTime() - 20 * DAY), trialEnd: new Date(NOW.getTime() - 6 * DAY),
    user: { isTest: false }, plan: { hidden: false }, ...p,
  };
}
function pay(p: Partial<ConversionPayment>): ConversionPayment {
  return { userId: 'u', paidAt: new Date(NOW.getTime() - 3 * DAY), subscription: { user: { isTest: false }, plan: { hidden: false } }, ...p };
}

describe('deriveTrialConversion', () => {
  it('counts a matured trial with a payment as converted', () => {
    const r = deriveTrialConversion([trial({ userId: 'a' })], [pay({ userId: 'a' })], NOW);
    expect(r.trialsStarted).toBe(1);
    expect(r.converted).toBe(1);
    expect(r.conversionRate).toBe(100);
    expect(r.churnedTrials).toBe(0);
    expect(r.activeTrials).toBe(0);
    expect(r.avgDaysToConvert).toBe(3); // paidAt = trialEnd + 3d
  });

  it('counts a matured trial without payment as churned', () => {
    const r = deriveTrialConversion([trial({ userId: 'a' })], [], NOW);
    expect(r.converted).toBe(0);
    expect(r.churnedTrials).toBe(1);
    expect(r.conversionRate).toBe(0);
  });

  it('counts an active trial (not yet ended) separately, excluded from rate denominator', () => {
    const active = trial({ userId: 'a', trialEnd: new Date(NOW.getTime() + 5 * DAY) });
    const r = deriveTrialConversion([active], [], NOW);
    expect(r.activeTrials).toBe(1);
    expect(r.churnedTrials).toBe(0);
    expect(r.conversionRate).toBe(0); // no matured trials → 0, not NaN
  });

  it('derives conversion even though the paid subscription is a separate ACTIVE row (invariant)', () => {
    // The trial row is still status=TRIAL; conversion is read from the payment, not a status flip.
    const r = deriveTrialConversion([trial({ userId: 'a' })], [pay({ userId: 'a' })], NOW);
    expect(r.converted).toBe(1);
  });

  it('excludes test users and hidden-plan rows from both trials and payments', () => {
    const r = deriveTrialConversion(
      [trial({ userId: 'a', user: { isTest: true } }), trial({ userId: 'b' })],
      [pay({ userId: 'b', subscription: { user: { isTest: false }, plan: { hidden: true } } })],
      NOW,
    );
    expect(r.trialsStarted).toBe(1); // only b
    expect(r.converted).toBe(0);     // b's payment was on a hidden plan → not a real conversion
    expect(r.churnedTrials).toBe(1);
  });

  it('dedupes multiple trial rows per user to the earliest', () => {
    const r = deriveTrialConversion(
      [trial({ userId: 'a', trialStart: new Date(NOW.getTime() - 40 * DAY), trialEnd: new Date(NOW.getTime() - 26 * DAY) }),
       trial({ userId: 'a' })],
      [], NOW,
    );
    expect(r.trialsStarted).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @mpstats/api test -- trial-conversion`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/api/src/utils/trial-conversion.ts`:

```ts
/**
 * Phase 63 — accurate trial→paid derivation.
 *
 * INVARIANT (guarded by trial-invariant.test.ts): a TRIAL Subscription row is
 * NEVER status-mutated. Payment creates a SEPARATE row. Therefore:
 *   - trial cohort      = rows with status=TRIAL (immutable historical fact)
 *   - conversion        = the user has a COMPLETED payment on a non-excluded sub
 *   - conversion moment = that user's earliest COMPLETED payment
 * Conversion physically happens after trial end (billing.ts blocks paying while
 * a trial is active), so days-to-convert is measured from trialEnd (clamped ≥0).
 */
import { isExcludedFromRevenue } from './test-exclusion';

export interface TrialRow {
  userId: string;
  trialStart: Date;
  trialEnd: Date;
  user: { isTest: boolean };
  plan: { hidden: boolean };
}

export interface ConversionPayment {
  userId: string;
  paidAt: Date;
  subscription: { user: { isTest: boolean }; plan: { hidden: boolean } };
}

export interface TrialConversionResult {
  trialsStarted: number;
  converted: number;
  conversionRate: number; // % over matured trials only
  activeTrials: number;
  churnedTrials: number;
  avgDaysToConvert: number;
}

const DAY = 24 * 60 * 60 * 1000;

export function deriveTrialConversion(
  trials: TrialRow[],
  payments: ConversionPayment[],
  now: Date,
): TrialConversionResult {
  // earliest trial per user (excluding test/hidden)
  const byUser = new Map<string, { trialStart: Date; trialEnd: Date }>();
  for (const t of trials) {
    if (isExcludedFromRevenue({ user: t.user, plan: t.plan })) continue;
    const cur = byUser.get(t.userId);
    if (!cur || t.trialStart < cur.trialStart) byUser.set(t.userId, { trialStart: t.trialStart, trialEnd: t.trialEnd });
  }

  // earliest qualifying payment per user (excluding test/hidden)
  const firstPaid = new Map<string, Date>();
  for (const p of payments) {
    if (isExcludedFromRevenue({ user: p.subscription.user, plan: p.subscription.plan })) continue;
    const cur = firstPaid.get(p.userId);
    if (!cur || p.paidAt < cur) firstPaid.set(p.userId, p.paidAt);
  }

  let converted = 0, activeTrials = 0, churnedTrials = 0, maturedTotal = 0, maturedConverted = 0;
  const daysToConvert: number[] = [];

  for (const [userId, t] of byUser) {
    const paid = firstPaid.get(userId);
    const matured = t.trialEnd < now;
    if (paid) {
      converted += 1;
      daysToConvert.push(Math.max(0, (paid.getTime() - t.trialEnd.getTime()) / DAY));
    } else if (matured) {
      churnedTrials += 1;
    } else {
      activeTrials += 1;
    }
    if (matured) {
      maturedTotal += 1;
      if (paid) maturedConverted += 1;
    }
  }

  const conversionRate = maturedTotal > 0 ? Math.round((maturedConverted / maturedTotal) * 100) : 0;
  const avgDaysToConvert = daysToConvert.length
    ? Math.round(daysToConvert.reduce((s, d) => s + d, 0) / daysToConvert.length)
    : 0;

  return { trialsStarted: byUser.size, converted, conversionRate, activeTrials, churnedTrials, avgDaysToConvert };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @mpstats/api test -- trial-conversion`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/utils/trial-conversion.ts packages/api/src/utils/trial-conversion.test.ts
git commit -m "feat(63): deriveTrialConversion — accurate trial→paid from data"
```

---

## Task 2: `computeConversionFunnel` + `churnRate` pure functions

**Files:**
- Create: `packages/api/src/utils/funnel-metrics.ts`
- Test: `packages/api/src/utils/funnel-metrics.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/api/src/utils/funnel-metrics.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeConversionFunnel, churnRate, type FunnelUserRow } from './funnel-metrics';

function row(p: Partial<FunnelUserRow>): FunnelUserRow {
  return { userId: 'u', completedDiagnostic: false, paid: false, ...p };
}

describe('computeConversionFunnel', () => {
  it('computes step counts and rates', () => {
    const r = computeConversionFunnel([
      row({ userId: 'a', completedDiagnostic: true, paid: true }),
      row({ userId: 'b', completedDiagnostic: true, paid: false }),
      row({ userId: 'c', completedDiagnostic: false, paid: false }),
      row({ userId: 'd', completedDiagnostic: false, paid: false }),
    ]);
    expect(r.registered).toBe(4);
    expect(r.completedDiagnostic).toBe(2);
    expect(r.paid).toBe(1);
    expect(r.diagRate).toBe(50);  // 2/4
    expect(r.paidRate).toBe(50);  // 1/2 of those who did diagnostic
  });

  it('returns zero rates on empty input (no NaN)', () => {
    const r = computeConversionFunnel([]);
    expect(r).toMatchObject({ registered: 0, completedDiagnostic: 0, paid: 0, diagRate: 0, paidRate: 0 });
  });
});

describe('churnRate', () => {
  it('is cancelled / base as a percent', () => {
    expect(churnRate(5, 100)).toBe(5);
  });
  it('is 0 when base is 0', () => {
    expect(churnRate(3, 0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @mpstats/api test -- funnel-metrics`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/api/src/utils/funnel-metrics.ts`:

```ts
/**
 * Phase 63 — pure funnel/churn math. Rows arrive already test-excluded.
 */
export interface FunnelUserRow {
  userId: string;
  completedDiagnostic: boolean;
  paid: boolean;
}

export interface ConversionFunnel {
  registered: number;
  completedDiagnostic: number;
  paid: number;
  diagRate: number; // % of registered who completed a diagnostic
  paidRate: number; // % of diagnostic-completers who paid
}

export function computeConversionFunnel(rows: FunnelUserRow[]): ConversionFunnel {
  const registered = rows.length;
  const completedDiagnostic = rows.filter((r) => r.completedDiagnostic).length;
  const paid = rows.filter((r) => r.paid).length;
  return {
    registered,
    completedDiagnostic,
    paid,
    diagRate: registered > 0 ? Math.round((completedDiagnostic / registered) * 100) : 0,
    paidRate: completedDiagnostic > 0 ? Math.round((paid / completedDiagnostic) * 100) : 0,
  };
}

/** Approximate period churn: cancelled / active-base, as a percent. */
export function churnRate(cancelled: number, base: number): number {
  return base > 0 ? Math.round((cancelled / base) * 100) : 0;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @mpstats/api test -- funnel-metrics`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/utils/funnel-metrics.ts packages/api/src/utils/funnel-metrics.test.ts
git commit -m "feat(63): computeConversionFunnel + churnRate pure functions"
```

---

## Task 3: Trial invariant regression test

**Files:**
- Create: `apps/web/src/lib/cloudpayments/__tests__/trial-invariant.test.ts`
- Modify: `packages/api/src/services/billing/trial-subscription.ts` (doc comment)

- [ ] **Step 1: Write the regression test**

Create `apps/web/src/lib/cloudpayments/__tests__/trial-invariant.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all side-effect deps of subscription-service before importing it.
const update = vi.fn().mockResolvedValue({});
const findUnique = vi.fn();

vi.mock('@mpstats/db/client', () => ({
  prisma: { subscription: { update, findUnique } },
}));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('@/lib/carrotquest/emails', () => ({
  sendPaymentSuccessEmail: vi.fn().mockResolvedValue(undefined),
  sendPaymentFailedEmail: vi.fn().mockResolvedValue(undefined),
  sendCancellationEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/referral/conversion', () => ({ processReferralConversion: vi.fn().mockResolvedValue(undefined) }));

import { handlePaymentSuccess } from '../subscription-service';

describe('trial→paid invariant: paid activation never mutates the trial row', () => {
  beforeEach(() => { update.mockClear(); findUnique.mockReset(); });

  it('handlePaymentSuccess updates only the paid subscription id, leaving TRIAL row untouched', async () => {
    // Scenario: user has TRIAL row "trial_1" and a separate PENDING paid row "paid_1".
    findUnique.mockResolvedValue({
      id: 'paid_1', userId: 'user_1', cpSubscriptionId: null,
      plan: { intervalDays: 30, name: 'Полный доступ' },
    });

    await handlePaymentSuccess('paid_1', { id: 'pay_1', amount: 2990, cpSubscriptionId: 'sc_1' });

    // Every update call must target the paid row, never the trial row.
    expect(update).toHaveBeenCalled();
    for (const call of update.mock.calls) {
      expect(call[0].where).toEqual({ id: 'paid_1' });
    }
    const trialTouched = update.mock.calls.some((c) => c[0].where?.id === 'trial_1');
    expect(trialTouched).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it passes (documents current correct behavior)**

Run: `pnpm --filter web test -- trial-invariant`
Expected: PASS. (If it fails, a code change has broken the invariant the trial→paid metric relies on — investigate before proceeding.)

- [ ] **Step 3: Add the invariant doc comment**

In `packages/api/src/services/billing/trial-subscription.ts`, add above `createTrialSubscription` (after the existing JSDoc):

```ts
// INVARIANT (Phase 63 analytics): a TRIAL row's `status` is never mutated.
// Paying creates a SEPARATE Subscription row (see billing.initiatePayment).
// deriveTrialConversion() relies on this to read the trial cohort historically.
// Guarded by apps/web/src/lib/cloudpayments/__tests__/trial-invariant.test.ts.
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/cloudpayments/__tests__/trial-invariant.test.ts packages/api/src/services/billing/trial-subscription.ts
git commit -m "test(63): regression guard for trial-row immutability invariant"
```

---

## Task 4: Funnel procedures in `admin.analytics.*`

**Files:**
- Modify: `packages/api/src/routers/admin-analytics.ts`

- [ ] **Step 1: Add imports**

```ts
import { deriveTrialConversion } from '../utils/trial-conversion';
import { computeConversionFunnel, churnRate, type FunnelUserRow } from '../utils/funnel-metrics';
```

- [ ] **Step 2: Add `getConversionFunnel`**

```ts
  /** Registration → diagnostic → paid conversion within `days`. Excludes test users. */
  getConversionFunnel: adminProcedure
    .input(z.object({ days: z.number().int().min(1).max(90).default(30) }))
    .query(async ({ ctx, input }) => {
      try {
        const start = new Date();
        start.setDate(start.getDate() - input.days);

        const registered = await ctx.prisma.userProfile.findMany({
          where: { createdAt: { gte: start }, isTest: false },
          select: { id: true },
        });
        const ids = registered.map((u) => u.id);
        if (ids.length === 0) return computeConversionFunnel([]);

        const diagUsers = await ctx.prisma.diagnosticSession.findMany({
          where: { status: 'COMPLETED', userId: { in: ids } },
          select: { userId: true },
          distinct: ['userId'],
        });
        const diagSet = new Set(diagUsers.map((d) => d.userId));

        const paidRows = await ctx.prisma.payment.findMany({
          where: { status: 'COMPLETED', subscription: { userId: { in: ids }, user: { isTest: false }, plan: { hidden: false } } },
          select: { subscription: { select: { userId: true } } },
        });
        const paidSet = new Set(paidRows.map((p) => p.subscription.userId));

        const rows: FunnelUserRow[] = ids.map((id) => ({
          userId: id,
          completedDiagnostic: diagSet.has(id),
          paid: paidSet.has(id),
        }));
        return computeConversionFunnel(rows);
      } catch (error) {
        handleDatabaseError(error);
      }
    }),
```

- [ ] **Step 3: Add `getTrialConversion`**

```ts
  /** Accurate trial→paid, derived from TRIAL rows + COMPLETED payments. */
  getTrialConversion: adminProcedure
    .input(z.object({ days: z.number().int().min(1).max(90).default(90) }))
    .query(async ({ ctx, input }) => {
      try {
        const start = new Date();
        start.setDate(start.getDate() - input.days);

        const trials = await ctx.prisma.subscription.findMany({
          where: { status: 'TRIAL', currentPeriodStart: { gte: start } },
          select: {
            userId: true,
            currentPeriodStart: true,
            currentPeriodEnd: true,
            user: { select: { isTest: true } },
            plan: { select: { hidden: true } },
          },
        });

        const payments = await ctx.prisma.payment.findMany({
          where: { status: 'COMPLETED' },
          select: {
            paidAt: true,
            subscription: { select: { userId: true, user: { select: { isTest: true } }, plan: { select: { hidden: true } } } },
          },
        });

        const trialRows = trials.map((t) => ({
          userId: t.userId,
          trialStart: t.currentPeriodStart,
          trialEnd: t.currentPeriodEnd,
          user: t.user,
          plan: t.plan,
        }));
        const paymentRows = payments
          .filter((p) => p.paidAt != null)
          .map((p) => ({
            userId: p.subscription.userId,
            paidAt: p.paidAt as Date,
            subscription: { user: p.subscription.user, plan: p.subscription.plan },
          }));

        return deriveTrialConversion(trialRows, paymentRows, new Date());
      } catch (error) {
        handleDatabaseError(error);
      }
    }),
```

- [ ] **Step 4: Add `getChurn`**

```ts
  /** Churn over `days`: cancellations, current PAST_DUE, approx churn rate. */
  getChurn: adminProcedure
    .input(z.object({ days: z.number().int().min(1).max(90).default(30) }))
    .query(async ({ ctx, input }) => {
      try {
        const now = new Date();
        const start = new Date();
        start.setDate(start.getDate() - input.days);
        const notTest = { user: { isTest: false }, plan: { hidden: false } };

        const [cancelled, pastDue, activeBase] = await Promise.all([
          ctx.prisma.subscription.count({ where: { status: 'CANCELLED', cancelledAt: { gte: start }, ...notTest } }),
          ctx.prisma.subscription.count({ where: { status: 'PAST_DUE', ...notTest } }),
          ctx.prisma.subscription.count({ where: { status: 'ACTIVE', currentPeriodEnd: { gt: now }, ...notTest } }),
        ]);

        return { cancelled, pastDue, activeBase, churnRate: churnRate(cancelled, activeBase) };
      } catch (error) {
        handleDatabaseError(error);
      }
    }),
```

- [ ] **Step 5: Add `getAttribution`**

```ts
  /** Revenue source: referred vs organic paying users within `days`. */
  getAttribution: adminProcedure
    .input(z.object({ days: z.number().int().min(1).max(90).default(30) }))
    .query(async ({ ctx, input }) => {
      try {
        const start = new Date();
        start.setDate(start.getDate() - input.days);

        const paidRows = await ctx.prisma.payment.findMany({
          where: { status: 'COMPLETED', paidAt: { gte: start }, subscription: { user: { isTest: false }, plan: { hidden: false } } },
          select: { amount: true, subscription: { select: { userId: true } } },
        });

        const userIds = [...new Set(paidRows.map((p) => p.subscription.userId))];
        const referredRows = userIds.length
          ? await ctx.prisma.referral.findMany({ where: { referredUserId: { in: userIds } }, select: { referredUserId: true } })
          : [];
        const referredSet = new Set(referredRows.map((r) => r.referredUserId));

        const acc = { referred: { users: new Set<string>(), revenue: 0 }, organic: { users: new Set<string>(), revenue: 0 } };
        for (const p of paidRows) {
          const uid = p.subscription.userId;
          const bucket = referredSet.has(uid) ? acc.referred : acc.organic;
          bucket.users.add(uid);
          bucket.revenue += p.amount;
        }
        return {
          referred: { users: acc.referred.users.size, revenue: acc.referred.revenue },
          organic: { users: acc.organic.users.size, revenue: acc.organic.revenue },
        };
      } catch (error) {
        handleDatabaseError(error);
      }
    }),
```

- [ ] **Step 6: Typecheck + tests**

Run: `pnpm --filter @mpstats/api typecheck && pnpm --filter @mpstats/api test`
Expected: no type errors; all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/routers/admin-analytics.ts
git commit -m "feat(63): funnel procedures (conversion, trial, churn, attribution)"
```

---

## Task 5: Funnel page UI

**Files:**
- Modify: `apps/web/src/app/(admin)/admin/analytics/funnel/page.tsx` (replace stub)

- [ ] **Step 1: Replace the stub**

Overwrite `apps/web/src/app/(admin)/admin/analytics/funnel/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { StatCard } from '@/components/admin/StatCard';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { UserPlus, ClipboardCheck, CreditCard, FlaskConical, TrendingDown, Share2 } from 'lucide-react';

const PERIODS = [
  { label: '7d', days: 7 },
  { label: '14d', days: 14 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
] as const;

const rub = (n: number) => `${n.toLocaleString('ru-RU')} ₽`;

export default function AnalyticsFunnelPage() {
  const [days, setDays] = useState(30);
  const funnel = trpc.admin.analytics.getConversionFunnel.useQuery({ days });
  const trial = trpc.admin.analytics.getTrialConversion.useQuery({ days: 90 });
  const churn = trpc.admin.analytics.getChurn.useQuery({ days });
  const attr = trpc.admin.analytics.getAttribution.useQuery({ days });

  const f = funnel.data;
  const t = trial.data;
  const c = churn.data;
  const a = attr.data;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-heading-lg font-bold text-mp-gray-900">Воронка</h2>
          <p className="text-body-sm text-mp-gray-500 mt-1">Конверсия, trial→paid, отток, источники (без тестовых)</p>
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

      {/* Conversion funnel */}
      <Card className="p-5">
        <h4 className="text-body font-semibold text-mp-gray-900 mb-4">Регистрация → диагностика → оплата ({days}д)</h4>
        {funnel.isLoading ? <Skeleton className="h-20 w-full" /> : f ? (
          <div className="grid grid-cols-3 gap-4">
            <StatCard title="Регистрации" value={f.registered} icon={UserPlus} color="blue" />
            <StatCard title="Прошли диагностику" value={f.completedDiagnostic} icon={ClipboardCheck} color="green"
              trend={`${f.diagRate}% от регистраций`} />
            <StatCard title="Оплатили" value={f.paid} icon={CreditCard} color="pink"
              trend={`${f.paidRate}% от прошедших`} />
          </div>
        ) : null}
      </Card>

      {/* Trial → paid */}
      <Card className="p-5">
        <h4 className="text-body font-semibold text-mp-gray-900 mb-1">Trial → Paid (когорта за 90д)</h4>
        <p className="text-xs text-mp-gray-400 mb-4">Конверсия считается по «дозревшим» триалам (триал уже закончился).</p>
        {trial.isLoading ? <Skeleton className="h-20 w-full" /> : t ? (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard title="Триалов начато" value={t.trialsStarted} icon={FlaskConical} color="gray" />
            <StatCard title="Сконвертилось" value={t.converted} icon={CreditCard} color="green"
              trend={`${t.conversionRate}% конверсия`} />
            <StatCard title="Активных триалов" value={t.activeTrials} icon={FlaskConical} color="blue" />
            <StatCard title="Ушло без оплаты" value={t.churnedTrials} icon={TrendingDown} color="pink" />
            <StatCard title="Дней до оплаты" value={t.avgDaysToConvert} icon={ClipboardCheck} color="gray" />
          </div>
        ) : null}
      </Card>

      {/* Churn */}
      <Card className="p-5">
        <h4 className="text-body font-semibold text-mp-gray-900 mb-1">Отток ({days}д)</h4>
        <p className="text-xs text-mp-gray-400 mb-4">Приблизительно: churn rate = отмены / текущая активная база.</p>
        {churn.isLoading ? <Skeleton className="h-20 w-full" /> : c ? (
          <div className="grid grid-cols-3 gap-4">
            <StatCard title="Отмен за период" value={c.cancelled} icon={TrendingDown} color="pink" trend={`${c.churnRate}% churn`} />
            <StatCard title="PAST_DUE сейчас" value={c.pastDue} icon={CreditCard} color="gray" />
            <StatCard title="Активная база" value={c.activeBase} icon={UserPlus} color="blue" />
          </div>
        ) : null}
      </Card>

      {/* Attribution */}
      <Card className="p-5">
        <h4 className="text-body font-semibold text-mp-gray-900 mb-4">Источник выручки ({days}д)</h4>
        {attr.isLoading ? <Skeleton className="h-16 w-full" /> : a ? (
          <table className="w-full text-body-sm">
            <thead><tr className="border-b border-mp-gray-200">
              <th className="text-left py-2 pr-4 text-mp-gray-500 font-medium">Источник</th>
              <th className="text-right py-2 px-4 text-mp-gray-500 font-medium">Платящих</th>
              <th className="text-right py-2 pl-4 text-mp-gray-500 font-medium">Выручка</th>
            </tr></thead>
            <tbody>
              <tr className="border-b border-mp-gray-100">
                <td className="py-2 pr-4 text-mp-gray-900">По приглашению (реферал)</td>
                <td className="py-2 px-4 text-right text-mp-gray-700">{a.referred.users}</td>
                <td className="py-2 pl-4 text-right text-mp-gray-700">{rub(a.referred.revenue)}</td>
              </tr>
              <tr>
                <td className="py-2 pr-4 text-mp-gray-900">Органика</td>
                <td className="py-2 px-4 text-right text-mp-gray-700">{a.organic.users}</td>
                <td className="py-2 pl-4 text-right text-mp-gray-700">{rub(a.organic.revenue)}</td>
              </tr>
            </tbody>
          </table>
        ) : null}
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck web**

Run: `pnpm --filter web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(admin)/admin/analytics/funnel/page.tsx"
git commit -m "feat(63): Воронка dashboard UI (conversion, trial→paid, churn, attribution)"
```

---

## Task 6: Verify

- [ ] **Step 1: Full typecheck + tests**

Run: `pnpm typecheck && pnpm test`
Expected: all green, including `trial-conversion`, `funnel-metrics`, `trial-invariant`.

- [ ] **Step 2: Manual check**

`pnpm dev` → `/admin/analytics/funnel`: conversion cards with rates, trial→paid cohort numbers add up (`converted + churnedTrials + activeTrials == trialsStarted`), churn + attribution render. Confirm test accounts are excluded.

---

## Self-Review

- **Spec coverage:** §E getConversionFunnel (Task 2+4), getTrialConversion (Task 1+4), getChurn (Task 2+4), getAttribution (Task 4); §F invariant regression (Task 3); UI (Task 5).
- **Placeholder scan:** all code complete; disclaimers are intentional UI copy, not placeholders.
- **Type consistency:** `TrialRow`/`ConversionPayment`/`TrialConversionResult` (Task 1) and `FunnelUserRow`/`ConversionFunnel` (Task 2) consumed in Task 4. tRPC paths `admin.analytics.getConversionFunnel|getTrialConversion|getChurn|getAttribution` consistent Tasks 4↔5. `churnRate` helper name consistent Tasks 2↔4.
- **Invariant:** `deriveTrialConversion` (Task 1) depends on the immutability guarded by Task 3's test — both reference the same fact.

## Deploy

Tests green → staging `--no-cache` + content-check `/admin/analytics/funnel` → owner UAT (focus: trial→paid numbers vs known test conversions) → `git checkout master` → merge → prod smoke. No new migration. After Wave 3 ships, update `MAAL/CLAUDE.md` Current Status (v1.15 Analytics 2.0) + write memory entry.
