# Phase 63 — Wave 1: Foundation + Bug Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `/admin/analytics` into 4 sub-tabs (fixing the detached period-selector bug structurally), add the `UserProfile.isTest` flag + revenue-exclusion helper, and groom the analytics procedures out of the oversized `admin.ts` into a nested `admin.analytics.*` router.

**Architecture:** A nested tRPC router (`adminAnalyticsRouter`) holds the moved procedures; client paths become `trpc.admin.analytics.*`. A Next.js layout under `analytics/` renders a tab bar; each tab is its own page with its own header and period selector, so no selector is ever visually detached from its charts. The `isTest` flag + a pure `isExcludedFromRevenue()` helper are introduced now so Waves 2-3 can build on them.

**Tech Stack:** Next.js 14 App Router, tRPC v10, Prisma 5.22, Vitest, recharts, Tailwind.

---

## File Structure

**Schema / DB:**
- `packages/db/prisma/schema.prisma` — add `UserProfile.isTest`.
- `packages/db/prisma/migrations/<ts>_add_user_is_test/migration.sql` — additive migration.
- `scripts/analytics/backfill-is-test.ts` — NEW: list candidates, apply on `--confirm`.

**Backend:**
- `packages/api/src/utils/test-exclusion.ts` — NEW pure helper `isExcludedFromRevenue()`.
- `packages/api/src/utils/test-exclusion.test.ts` — NEW.
- `packages/api/src/routers/admin-analytics.ts` — NEW nested router (moved procedures).
- `packages/api/src/routers/admin.ts` — remove moved procedures, mount `analytics`, extend `toggleUserField`.

**Frontend:**
- `apps/web/src/components/admin/AnalyticsTabs.tsx` — NEW tab bar.
- `apps/web/src/app/(admin)/admin/analytics/layout.tsx` — NEW.
- `apps/web/src/app/(admin)/admin/analytics/page.tsx` — trim to "Обзор".
- `apps/web/src/app/(admin)/admin/analytics/content/page.tsx` — NEW (moved watch-engagement).
- `apps/web/src/app/(admin)/admin/analytics/revenue/page.tsx` — NEW stub.
- `apps/web/src/app/(admin)/admin/analytics/funnel/page.tsx` — NEW stub.
- `apps/web/src/components/admin/ActiveUsersSection.tsx` — update trpc path.
- `apps/web/src/components/admin/UserTable.tsx` — add `isTest` toggle.

---

## Task 1: Add `isTest` to UserProfile schema

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (UserProfile model, after `isActive`)
- Create: `packages/db/prisma/migrations/20260608000000_add_user_is_test/migration.sql`

- [ ] **Step 1: Add the field to schema.prisma**

In `model UserProfile`, add after the `isActive` line (`schema.prisma:31`):

```prisma
  isTest                  Boolean   @default(false) // Phase 63: excludes user from revenue/funnel analytics
```

- [ ] **Step 2: Create the migration SQL**

Create `packages/db/prisma/migrations/20260608000000_add_user_is_test/migration.sql`:

```sql
-- Phase 63: analytics test-user exclusion flag
ALTER TABLE "UserProfile" ADD COLUMN "isTest" BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 3: Regenerate the Prisma client**

Run: `pnpm --filter @mpstats/db db:generate`
Expected: "Generated Prisma Client" with no errors.

- [ ] **Step 4: Typecheck the db package**

Run: `pnpm --filter @mpstats/db typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/20260608000000_add_user_is_test/
git commit -m "feat(63): add UserProfile.isTest flag for analytics exclusion"
```

> **Prod note:** This migration is applied to the shared prod Supabase via the Management API (pattern `reference_supabase_migration_via_mgmt_api.md`), NOT `prisma db push`. The migration row is INSERTed into `_prisma_migrations` with the computed checksum. Do this at Wave 1 deploy time, not now.

---

## Task 2: Pure revenue-exclusion helper

**Files:**
- Create: `packages/api/src/utils/test-exclusion.ts`
- Test: `packages/api/src/utils/test-exclusion.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/api/src/utils/test-exclusion.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isExcludedFromRevenue } from './test-exclusion';

describe('isExcludedFromRevenue', () => {
  it('excludes a test user', () => {
    expect(isExcludedFromRevenue({ user: { isTest: true }, plan: { hidden: false } })).toBe(true);
  });

  it('excludes a hidden-plan subscription', () => {
    expect(isExcludedFromRevenue({ user: { isTest: false }, plan: { hidden: true } })).toBe(true);
  });

  it('keeps a real user on a visible plan', () => {
    expect(isExcludedFromRevenue({ user: { isTest: false }, plan: { hidden: false } })).toBe(false);
  });

  it('treats missing user/plan as not-excluded (defensive)', () => {
    expect(isExcludedFromRevenue({})).toBe(false);
    expect(isExcludedFromRevenue({ user: null, plan: null })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mpstats/api test -- test-exclusion`
Expected: FAIL — "Cannot find module './test-exclusion'".

- [ ] **Step 3: Write the implementation**

Create `packages/api/src/utils/test-exclusion.ts`:

```ts
/**
 * Phase 63 — revenue/funnel analytics exclusion rule.
 *
 * A subscription (or its payment) is excluded from money/funnel metrics when:
 *   - the owning user is flagged isTest (the curated test-account backlog), OR
 *   - the plan is hidden (e.g. the 10₽ smoke-test plan).
 *
 * Pure & defensive: missing fields are treated as "not excluded" so a partial
 * row never silently drops real revenue.
 */
export interface ExclusionSubject {
  user?: { isTest?: boolean | null } | null;
  plan?: { hidden?: boolean | null } | null;
}

export function isExcludedFromRevenue(subject: ExclusionSubject): boolean {
  return subject.user?.isTest === true || subject.plan?.hidden === true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mpstats/api test -- test-exclusion`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/utils/test-exclusion.ts packages/api/src/utils/test-exclusion.test.ts
git commit -m "feat(63): add isExcludedFromRevenue analytics helper"
```

---

## Task 3: Extend `toggleUserField` to `isTest`

**Files:**
- Modify: `packages/api/src/routers/admin.ts:342-382` (`toggleUserField`)
- Test: `packages/api/src/routers/__tests__/admin-toggle-istest.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/api/src/routers/__tests__/admin-toggle-istest.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminRouter } from '../admin';

function makeCtx(profile: Record<string, unknown> | null) {
  const update = vi.fn().mockResolvedValue({ id: 'u1', isTest: true });
  return {
    ctx: {
      user: { id: 'admin1' },
      userRole: 'SUPERADMIN',
      prisma: {
        userProfile: {
          findUnique: vi.fn().mockResolvedValue(profile),
          update,
        },
      },
    },
    update,
  };
}

describe('admin.toggleUserField isTest', () => {
  it('flips isTest from false to true', async () => {
    const { ctx, update } = makeCtx({ isTest: false });
    const caller = adminRouter.createCaller(ctx as never);
    await caller.toggleUserField({ userId: 'u1', field: 'isTest' });
    expect(update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { isTest: true } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mpstats/api test -- admin-toggle-istest`
Expected: FAIL — zod rejects `field: 'isTest'` (enum only allows `'isActive'`).

- [ ] **Step 3: Widen the enum**

In `packages/api/src/routers/admin.ts`, change the `toggleUserField` input enum (line ~346):

```ts
        field: z.enum(['isActive', 'isTest']),
```

The existing self-deactivation guard is `isActive`-specific (`if (field === 'isActive' && userId === ctx.user.id)`) — leave it as-is; it correctly does not block `isTest`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mpstats/api test -- admin-toggle-istest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routers/admin.ts packages/api/src/routers/__tests__/admin-toggle-istest.test.ts
git commit -m "feat(63): allow toggling UserProfile.isTest via admin.toggleUserField"
```

---

## Task 4: Backfill script for the test-account backlog

**Files:**
- Create: `scripts/analytics/backfill-is-test.ts`

- [ ] **Step 1: Write the script**

Create `scripts/analytics/backfill-is-test.ts`:

```ts
/**
 * Phase 63 — list & flag the test-account backlog (UserProfile.isTest).
 *
 * Candidate heuristic (owner reviews the printed list BEFORE applying):
 *   - email matches @mpstats.academy / @mpstats.io, or starts with tester@/test@
 *   - OR the user owns a subscription on a hidden plan (e.g. 10₽ smoke plan)
 *
 * Usage:
 *   pnpm tsx scripts/analytics/backfill-is-test.ts            # dry-run: print candidates
 *   pnpm tsx scripts/analytics/backfill-is-test.ts --confirm  # apply isTest=true
 *
 * Reads SUPABASE_SECRET_KEY + NEXT_PUBLIC_SUPABASE_URL + DATABASE_URL from env.
 */
import { prisma } from '@mpstats/db';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--confirm');

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // 1. email-based candidates
  const { data: authData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const emailById = new Map<string, string>();
  (authData?.users ?? []).forEach((u) => { if (u.email) emailById.set(u.id, u.email); });
  const emailCandidates = [...emailById.entries()]
    .filter(([, email]) => {
      const e = email.toLowerCase();
      return e.endsWith('@mpstats.academy') || e.endsWith('@mpstats.io') ||
             e.startsWith('tester@') || e.startsWith('test@');
    })
    .map(([id]) => id);

  // 2. hidden-plan subscribers
  const hiddenSubs = await prisma.subscription.findMany({
    where: { plan: { hidden: true } },
    select: { userId: true },
  });
  const hiddenPlanUserIds = hiddenSubs.map((s) => s.userId);

  const candidateIds = [...new Set([...emailCandidates, ...hiddenPlanUserIds])];

  console.log(`\n=== ${candidateIds.length} test-account candidates ===`);
  for (const id of candidateIds) {
    console.log(`  ${id}  ${emailById.get(id) ?? '(no email)'}`);
  }

  if (!APPLY) {
    console.log('\nDry-run. Re-run with --confirm to set isTest=true on the above.');
    return;
  }

  const res = await prisma.userProfile.updateMany({
    where: { id: { in: candidateIds } },
    data: { isTest: true },
  });
  console.log(`\nApplied isTest=true to ${res.count} users.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @mpstats/api exec tsc --noEmit scripts/analytics/backfill-is-test.ts` (or rely on workspace typecheck in Step 4 of Task 9).
Expected: no type errors. (If `tsx`/path resolution differs, match the invocation used by existing `scripts/` — they run via `pnpm tsx`.)

- [ ] **Step 3: Commit**

```bash
git add scripts/analytics/backfill-is-test.ts
git commit -m "chore(63): backfill script to flag test-account backlog (dry-run default)"
```

> **Execution note:** Run dry-run, hand the candidate list to owner, apply with `--confirm` only after sign-off. On prod (VPS has no pnpm/prisma) the apply is done via Supabase Mgmt API `UPDATE "UserProfile" SET "isTest"=true WHERE id IN (...)` with the owner-approved id list.

---

## Task 5: Create the nested `admin-analytics` router (move procedures)

**Files:**
- Create: `packages/api/src/routers/admin-analytics.ts`
- Modify: `packages/api/src/routers/admin.ts` (remove 3 procedures, add import + mount)

- [ ] **Step 1: Create admin-analytics.ts with the three moved procedures**

Create `packages/api/src/routers/admin-analytics.ts`. Move the bodies of `getAnalytics` (admin.ts:116-177), `getActiveUserStats` (admin.ts:193-243), and `getWatchStats` (admin.ts:819-939) verbatim into this router. Header:

```ts
/**
 * Admin Analytics sub-router — Phase 63.
 *
 * Groups platform-analytics procedures previously inlined in admin.ts:
 *   - getAnalytics       (user growth + diagnostic activity per day)
 *   - getActiveUserStats (DAU/WAU/MAU + stickiness)
 *   - getWatchStats      (video watch engagement)
 *
 * Mounted under `admin.analytics.*`. Revenue (Wave 2) and funnel (Wave 3)
 * procedures will be added here.
 */
import { z } from 'zod';
import { router, adminProcedure } from '../trpc';
import { handleDatabaseError } from '../utils/db-errors';
import { mapActiveUserStats, type ActiveUserDayRow } from '../utils/active-user-stats';

export const adminAnalyticsRouter = router({
  getAnalytics: adminProcedure
    .input(z.object({ days: z.number().int().min(1).max(90).default(7) }))
    .query(async ({ ctx, input }) => {
      // ... move body verbatim from admin.ts:118-176 ...
    }),

  getActiveUserStats: adminProcedure
    .input(z.object({ days: z.number().int().min(1).max(90).default(30) }))
    .query(async ({ ctx, input }) => {
      // ... move body verbatim from admin.ts:195-242 ...
    }),

  getWatchStats: adminProcedure.query(async ({ ctx }) => {
    // ... move body verbatim from admin.ts:820-938 ...
  }),
});
```

> Copy the procedure bodies exactly as they are in `admin.ts` today (including comments). Do not change logic.

- [ ] **Step 2: Remove the three procedures from admin.ts and mount the sub-router**

In `packages/api/src/routers/admin.ts`:
- Delete the `getAnalytics`, `getActiveUserStats`, and `getWatchStats` procedure definitions.
- Remove now-unused imports if any became unused (`mapActiveUserStats`, `ActiveUserDayRow` — check; they're only used by the moved procedures).
- Add the import at top:

```ts
import { adminAnalyticsRouter } from './admin-analytics';
```

- Add the mount inside `router({ ... })` (e.g. right after `getDashboardStats`):

```ts
  analytics: adminAnalyticsRouter,
```

- [ ] **Step 3: Run the API test suite**

Run: `pnpm --filter @mpstats/api test`
Expected: all PASS. The pure-mapper test (`active-user-stats.test.ts`) is unaffected (it imports the util, not the router).

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @mpstats/api typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routers/admin-analytics.ts packages/api/src/routers/admin.ts
git commit -m "refactor(63): extract analytics procedures into admin.analytics sub-router"
```

---

## Task 6: Update client consumers to `admin.analytics.*`

**Files:**
- Modify: `apps/web/src/components/admin/ActiveUsersSection.tsx:55`
- Modify: `apps/web/src/app/(admin)/admin/analytics/page.tsx` (temporary — fully rewritten in Task 8)

- [ ] **Step 1: Update ActiveUsersSection**

In `apps/web/src/components/admin/ActiveUsersSection.tsx`, line 55, change:

```ts
  const stats = trpc.admin.analytics.getActiveUserStats.useQuery({ days });
```

- [ ] **Step 2: Update the current analytics page calls (interim)**

In `apps/web/src/app/(admin)/admin/analytics/page.tsx`, change lines 29-30:

```ts
  const analytics = trpc.admin.analytics.getAnalytics.useQuery({ days });
  const watchStats = trpc.admin.analytics.getWatchStats.useQuery();
```

- [ ] **Step 3: Typecheck web**

Run: `pnpm --filter web typecheck`
Expected: no errors (tRPC types now expose `admin.analytics.*`).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/admin/ActiveUsersSection.tsx "apps/web/src/app/(admin)/admin/analytics/page.tsx"
git commit -m "refactor(63): point analytics consumers at admin.analytics.* paths"
```

---

## Task 7: AnalyticsTabs component + layout

**Files:**
- Create: `apps/web/src/components/admin/AnalyticsTabs.tsx`
- Create: `apps/web/src/app/(admin)/admin/analytics/layout.tsx`

- [ ] **Step 1: Create the tab bar**

Create `apps/web/src/components/admin/AnalyticsTabs.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const TABS = [
  { label: 'Обзор', href: '/admin/analytics' },
  { label: 'Выручка', href: '/admin/analytics/revenue' },
  { label: 'Воронка', href: '/admin/analytics/funnel' },
  { label: 'Контент', href: '/admin/analytics/content' },
] as const;

export function AnalyticsTabs() {
  const pathname = usePathname();

  return (
    <div className="border-b border-mp-gray-200">
      <nav className="flex gap-1 -mb-px overflow-x-auto">
        {TABS.map((tab) => {
          const isActive =
            tab.href === '/admin/analytics'
              ? pathname === '/admin/analytics'
              : pathname === tab.href || pathname.startsWith(tab.href + '/');
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'px-4 py-2.5 text-body-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                isActive
                  ? 'border-mp-blue-600 text-mp-blue-600'
                  : 'border-transparent text-mp-gray-500 hover:text-mp-gray-900',
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
```

- [ ] **Step 2: Create the analytics layout**

Create `apps/web/src/app/(admin)/admin/analytics/layout.tsx`:

```tsx
import { AnalyticsTabs } from '@/components/admin/AnalyticsTabs';

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <AnalyticsTabs />
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck web**

Run: `pnpm --filter web typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/admin/AnalyticsTabs.tsx "apps/web/src/app/(admin)/admin/analytics/layout.tsx"
git commit -m "feat(63): analytics tab bar + section layout"
```

---

## Task 8: Trim the Обзор page (remove watch-engagement, keep growth + DAU/WAU/MAU)

**Files:**
- Modify: `apps/web/src/app/(admin)/admin/analytics/page.tsx`

- [ ] **Step 1: Replace page.tsx with the Обзор-only version**

Overwrite `apps/web/src/app/(admin)/admin/analytics/page.tsx` with:

```tsx
'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { ActivityChart } from '@/components/admin/ActivityChart';
import { ActiveUsersSection } from '@/components/admin/ActiveUsersSection';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const PERIODS = [
  { label: '7d', days: 7 },
  { label: '14d', days: 14 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
] as const;

function SummaryStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center">
      <p className="text-2xl font-bold text-mp-gray-900">{value}</p>
      <p className="text-xs text-mp-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

export default function AnalyticsOverviewPage() {
  const [days, setDays] = useState(7);
  const analytics = trpc.admin.analytics.getAnalytics.useQuery({ days });

  const userTotal = analytics.data?.userGrowth.reduce((s, d) => s + d.count, 0) ?? 0;
  const activityTotal = analytics.data?.activity.reduce((s, d) => s + d.count, 0) ?? 0;
  const userAvg = days > 0 ? (userTotal / days).toFixed(1) : '0';
  const activityAvg = days > 0 ? (activityTotal / days).toFixed(1) : '0';
  const userPeak = analytics.data?.userGrowth.reduce((max, d) => Math.max(max, d.count), 0) ?? 0;
  const activityPeak = analytics.data?.activity.reduce((max, d) => Math.max(max, d.count), 0) ?? 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Growth header + its OWN period selector */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-heading-lg font-bold text-mp-gray-900">Обзор</h2>
          <p className="text-body-sm text-mp-gray-500 mt-1">Рост пользователей и активность</p>
        </div>
        <div className="flex items-center gap-1 bg-mp-gray-100 rounded-lg p-1">
          {PERIODS.map((p) => (
            <button
              key={p.days}
              onClick={() => setDays(p.days)}
              className={cn(
                'px-3 py-1.5 text-body-sm font-medium rounded-md transition-all duration-200',
                days === p.days
                  ? 'bg-white text-mp-blue-600 shadow-sm'
                  : 'text-mp-gray-600 hover:text-mp-gray-900',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary stats — controlled by the selector directly above */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Card className="p-4"><SummaryStat label="New users" value={userTotal} /></Card>
        <Card className="p-4"><SummaryStat label="Avg/day" value={userAvg} /></Card>
        <Card className="p-4"><SummaryStat label="Peak day" value={userPeak} /></Card>
        <Card className="p-4"><SummaryStat label="Diagnostics" value={activityTotal} /></Card>
        <Card className="p-4"><SummaryStat label="Avg/day" value={activityAvg} /></Card>
        <Card className="p-4"><SummaryStat label="Peak day" value={activityPeak} /></Card>
      </div>

      {/* Growth charts */}
      {analytics.isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-5"><Skeleton className="h-5 w-32 mb-4" /><Skeleton className="h-[250px] w-full" /></Card>
          <Card className="p-5"><Skeleton className="h-5 w-32 mb-4" /><Skeleton className="h-[250px] w-full" /></Card>
        </div>
      ) : analytics.error ? (
        <Card className="p-6 text-center">
          <p className="text-red-600 font-medium">Failed to load analytics</p>
          <p className="text-body-sm text-mp-gray-500 mt-1">{analytics.error.message}</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-5">
            <ActivityChart data={analytics.data?.userGrowth ?? []} title="User Growth" color="#2563eb" />
          </Card>
          <Card className="p-5">
            <ActivityChart data={analytics.data?.activity ?? []} title="Diagnostic Activity" color="#16a34a" />
          </Card>
        </div>
      )}

      {/* Active users — DAU/WAU/MAU with its own internal selector */}
      <div className="space-y-6 pt-4">
        <div>
          <h3 className="text-heading font-bold text-mp-gray-900">Активные пользователи</h3>
          <p className="text-body-sm text-mp-gray-500 mt-1">DAU / WAU / MAU и липкость аудитории</p>
        </div>
        <ActiveUsersSection />
      </div>
    </div>
  );
}
```

> Note: the period selector now sits directly above the Summary stats + Growth charts it controls. DAU/WAU/MAU (own selector) moves to the bottom of the page where it no longer separates a control from its target. **This is the structural bug fix.**

- [ ] **Step 2: Typecheck web**

Run: `pnpm --filter web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(admin)/admin/analytics/page.tsx"
git commit -m "fix(63): Обзор tab — period selector sits directly above its charts"
```

---

## Task 9: Контент page (move watch-engagement) + Выручка/Воронка stubs

**Files:**
- Create: `apps/web/src/app/(admin)/admin/analytics/content/page.tsx`
- Create: `apps/web/src/app/(admin)/admin/analytics/revenue/page.tsx`
- Create: `apps/web/src/app/(admin)/admin/analytics/funnel/page.tsx`

- [ ] **Step 1: Create the Контент page**

Create `apps/web/src/app/(admin)/admin/analytics/content/page.tsx` (the watch-engagement block lifted from the old page.tsx:135-232, now standalone):

```tsx
'use client';

import { trpc } from '@/lib/trpc/client';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

function SummaryStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center">
      <p className="text-2xl font-bold text-mp-gray-900">{value}</p>
      <p className="text-xs text-mp-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

export default function AnalyticsContentPage() {
  const watchStats = trpc.admin.analytics.getWatchStats.useQuery();

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-heading-lg font-bold text-mp-gray-900">Контент</h2>
        <p className="text-body-sm text-mp-gray-500 mt-1">Вовлечённость в видеоуроки</p>
      </div>

      {watchStats.isLoading ? (
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-4">
              <Skeleton className="h-8 w-16 mx-auto mb-2" />
              <Skeleton className="h-4 w-24 mx-auto" />
            </Card>
          ))}
        </div>
      ) : watchStats.error ? (
        <Card className="p-6 text-center">
          <p className="text-red-600 font-medium">Failed to load watch stats</p>
          <p className="text-body-sm text-mp-gray-500 mt-1">{watchStats.error.message}</p>
        </Card>
      ) : watchStats.data ? (
        <>
          <div className="grid grid-cols-3 gap-4">
            <Card className="p-4"><SummaryStat label="Средний % просмотра" value={`${watchStats.data.avgWatchPercent}%`} /></Card>
            <Card className="p-4"><SummaryStat label="Всего просмотров" value={watchStats.data.totalWatchSessions} /></Card>
            <Card className="p-4"><SummaryStat label="Доля завершений" value={`${watchStats.data.completionRate}%`} /></Card>
          </div>

          {watchStats.data.courseEngagement.length > 0 && (
            <Card className="p-5">
              <h4 className="text-body font-semibold text-mp-gray-900 mb-3">По курсам</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-body-sm">
                  <thead>
                    <tr className="border-b border-mp-gray-200">
                      <th className="text-left py-2 pr-4 text-mp-gray-500 font-medium">Курс</th>
                      <th className="text-right py-2 px-4 text-mp-gray-500 font-medium">Средний %</th>
                      <th className="text-right py-2 px-4 text-mp-gray-500 font-medium">Начато</th>
                      <th className="text-right py-2 pl-4 text-mp-gray-500 font-medium">Завершено</th>
                    </tr>
                  </thead>
                  <tbody>
                    {watchStats.data.courseEngagement.map((c) => (
                      <tr key={c.courseId} className="border-b border-mp-gray-100 last:border-0">
                        <td className="py-2 pr-4 text-mp-gray-900">{c.courseTitle}</td>
                        <td className="py-2 px-4 text-right text-mp-gray-700">{c.avgPercent}%</td>
                        <td className="py-2 px-4 text-right text-mp-gray-700">{c.startedCount}</td>
                        <td className="py-2 pl-4 text-right text-mp-gray-700">{c.completedCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {watchStats.data.topActiveUsers.length > 0 && (
            <Card className="p-5">
              <h4 className="text-body font-semibold text-mp-gray-900 mb-3">Топ-5 активных пользователей</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-body-sm">
                  <thead>
                    <tr className="border-b border-mp-gray-200">
                      <th className="text-left py-2 pr-4 text-mp-gray-500 font-medium">Пользователь</th>
                      <th className="text-left py-2 px-4 text-mp-gray-500 font-medium">Email</th>
                      <th className="text-right py-2 px-4 text-mp-gray-500 font-medium">Открыто уроков</th>
                      <th className="text-right py-2 px-4 text-mp-gray-500 font-medium">Завершено</th>
                      <th className="text-right py-2 pl-4 text-mp-gray-500 font-medium">Средний %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {watchStats.data.topActiveUsers.map((u) => (
                      <tr key={u.userId} className="border-b border-mp-gray-100 last:border-0">
                        <td className="py-2 pr-4 text-mp-gray-900">{u.name}</td>
                        <td className="py-2 px-4 text-mp-gray-600">{u.email || '—'}</td>
                        <td className="py-2 px-4 text-right text-mp-gray-700">{u.lessonsWatched}</td>
                        <td className="py-2 px-4 text-right text-mp-gray-700">{u.lessonsCompleted}</td>
                        <td className="py-2 pl-4 text-right text-mp-gray-700">{u.avgPercent}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Create the Выручка stub**

Create `apps/web/src/app/(admin)/admin/analytics/revenue/page.tsx`:

```tsx
import { Card } from '@/components/ui/card';

export default function AnalyticsRevenuePage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-heading-lg font-bold text-mp-gray-900">Выручка</h2>
        <p className="text-body-sm text-mp-gray-500 mt-1">MRR, продления, приход, ARPU</p>
      </div>
      <Card className="p-8 text-center text-mp-gray-500">Скоро — раздел в разработке (Wave 2).</Card>
    </div>
  );
}
```

- [ ] **Step 3: Create the Воронка stub**

Create `apps/web/src/app/(admin)/admin/analytics/funnel/page.tsx`:

```tsx
import { Card } from '@/components/ui/card';

export default function AnalyticsFunnelPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-heading-lg font-bold text-mp-gray-900">Воронка</h2>
        <p className="text-body-sm text-mp-gray-500 mt-1">Конверсия, trial→paid, отток</p>
      </div>
      <Card className="p-8 text-center text-mp-gray-500">Скоро — раздел в разработке (Wave 3).</Card>
    </div>
  );
}
```

- [ ] **Step 4: Full workspace typecheck + tests**

Run: `pnpm typecheck && pnpm test`
Expected: all packages typecheck; api + web test suites PASS.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(admin)/admin/analytics/content/page.tsx" "apps/web/src/app/(admin)/admin/analytics/revenue/page.tsx" "apps/web/src/app/(admin)/admin/analytics/funnel/page.tsx"
git commit -m "feat(63): Контент tab + Выручка/Воронка stubs"
```

---

## Task 10: `isTest` toggle in the user table

**Files:**
- Modify: `apps/web/src/components/admin/UserTable.tsx`

- [ ] **Step 1: Read the current UserTable to match its mutation pattern**

Run: `sed -n '1,80p' apps/web/src/components/admin/UserTable.tsx`
Identify how `toggleUserField` is already called for `isActive` (mutation + `useUtils().admin.getUsers.invalidate()` pattern) and the row layout.

- [ ] **Step 2: Add an isTest toggle following the existing isActive pattern**

In `UserTable.tsx`, mirror the existing `isActive` toggle (same `trpc.admin.toggleUserField.useMutation` with `field: 'isTest'`, invalidate `getUsers` on success). Add a "Тест" column header and a per-row toggle/badge showing `user.isTest`. Keep all hooks above any early return (Rules of Hooks — see `feedback_rules_of_hooks_early_returns.md`). Use the same button styling as the isActive control already in the file.

```tsx
// near the existing isActive mutation:
const toggleTest = trpc.admin.toggleUserField.useMutation({
  onSuccess: () => utils.admin.getUsers.invalidate(),
});
// in the row, a compact toggle:
<button
  onClick={() => toggleTest.mutate({ userId: user.id, field: 'isTest' })}
  disabled={toggleTest.isPending}
  className={cn(
    'px-2 py-0.5 rounded-full text-xs font-medium',
    user.isTest ? 'bg-amber-100 text-amber-700' : 'bg-mp-gray-100 text-mp-gray-500',
  )}
>
  {user.isTest ? 'Тест' : '—'}
</button>
```

> `getUsers` already returns full `UserProfile` rows, so `user.isTest` is present after Task 1's client regen. If the `getUsers` `select`/`include` is narrowed (it currently uses `findMany` without `select`, so all scalar fields including `isTest` are returned) — verify `isTest` is in the row type; if a `select` is later added, include `isTest`.

- [ ] **Step 3: Typecheck web**

Run: `pnpm --filter web typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/admin/UserTable.tsx
git commit -m "feat(63): isTest toggle column in admin user table"
```

---

## Task 11: Manual verification of the bug fix

- [ ] **Step 1: Run dev and verify each tab**

Run: `pnpm dev` → open `/admin/analytics`.
Verify:
- Tab bar shows Обзор / Выручка / Воронка / Контент; active tab underlined.
- **Обзор:** period selector (7d/14d/30d/90d) sits directly above Summary stats + Growth charts; switching period updates them immediately. DAU/WAU/MAU block is at the bottom with its own selector. No selector is "floating" away from its charts.
- **Контент:** watch-engagement KPIs + tables render.
- **Выручка / Воронка:** stub cards render.
- `/admin/users`: isTest toggle flips and persists on refresh.

- [ ] **Step 2: Confirm no console/type errors**

Expected: clean console, no tRPC 404s on `admin.analytics.*`.

---

## Self-Review

- **Spec coverage:** §A nav (Tasks 7-9), §B router groom (Tasks 5-6), §C isTest + exclusion + backfill + toggle (Tasks 1-4, 10), bug fix (Task 8). Revenue/funnel metrics are Waves 2-3 (separate plans).
- **Placeholder scan:** procedure bodies in Task 5 are explicitly "move verbatim from admin.ts:<lines>" — the source is the current file, not a placeholder. All new code shown in full.
- **Type consistency:** `isExcludedFromRevenue(ExclusionSubject)` defined in Task 2, consumed in Waves 2-3. `admin.analytics.*` paths consistent across Tasks 5/6/8/9. `field: z.enum(['isActive','isTest'])` consistent Tasks 3/10.

## Deploy (after all tasks)

1. Apply `isTest` migration to prod Supabase via Mgmt API + INSERT `_prisma_migrations` row.
2. Run backfill dry-run → owner reviews → apply approved ids.
3. Staging: `docker compose -p maal-staging -f docker-compose.staging.yml up -d --build` (`--no-cache`), content-check `/admin/analytics` bundle, owner UAT.
4. `git checkout master` → merge → prod deploy → smoke `/admin/analytics`.
