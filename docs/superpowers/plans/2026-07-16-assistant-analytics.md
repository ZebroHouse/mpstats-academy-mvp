# Assistant Analytics Tab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Ассистент" tab to `/admin/analytics` showing adoption, answer-quality, demand, and quota-pressure (upsell) metrics over the existing `AssistantMessage` / `AssistantConversation` data — read-only, no migrations.

**Architecture:** Thin tRPC procedures under `admin.analytics.assistant.*` do raw-SQL aggregation (MSK-day buckets, test-users excluded), pure functions in `packages/api/src/utils/assistant-analytics.ts` shape/ratio/rank the rows (unit-tested), a client page renders 4 sections under one period selector reusing the Phase 63 components (`AnalyticsDateRange`, `StatCard`, `ActivityChart`, `Card`).

**Tech Stack:** Next.js 14 App Router, tRPC, Prisma `$queryRawUnsafe` (Postgres/Supabase), Vitest, recharts.

**Spec:** `docs/superpowers/specs/2026-07-15-assistant-analytics-design.md`

---

## Ground rules (read before any task)

- **Read-only.** No schema changes, no `prisma db push/migrate`, no DDL. Only SELECT.
- **`role='assistant'` filter is mandatory** on every category/inDomain/card/fallback aggregate. User-role rows carry `category=null, inDomain=true` and would poison ratios.
- **Test users excluded everywhere** via join `UserProfile.isTest = false`.
- **MSK-day bucketing:** `to_char((m."createdAt" + interval '3 hours'), 'YYYY-MM-DD')`. Day gap-fill happens in the pure `fillDaySeries` using MSK keys from `enumerateMskDays`.
- **Quota thresholds:** import `FREE_DAILY` from `packages/api/src/utils/assistant-quota.ts`, never hardcode `5`.
- **Fallback signal:** `m."navLinks"::text LIKE '%/support%'` on assistant rows.
- **Counts:** always `::int` in SQL and `Number(...)` defensively in JS (mirror `getActiveUserStats`).
- **Working dir for all paths below:** the worktree `.claude/worktrees/assistant-analytics/` (branch `feature/assistant-analytics`).

---

## File Structure

- **Create** `packages/api/src/utils/assistant-analytics.ts` — pure helpers (MSK day keys, gap-fill, quality ratios, problem labeling, upsell aggregation) + exported types.
- **Create** `packages/api/src/utils/assistant-analytics.test.ts` — unit tests for the pure helpers.
- **Create** `packages/api/src/routers/admin-analytics-assistant.ts` — `assistantAnalyticsRouter` with 5 procedures.
- **Modify** `packages/api/src/routers/admin-analytics.ts` — import + mount `assistant: assistantAnalyticsRouter` inside `adminAnalyticsRouter`.
- **Create** `apps/web/src/app/(admin)/admin/analytics/assistant/page.tsx` — the tab page (4 sections).
- **Modify** `apps/web/src/components/admin/AnalyticsTabs.tsx` — add the "Ассистент" tab entry.

---

## Task 1: Pure helpers — MSK day keys + gap-fill

**Files:**
- Create: `packages/api/src/utils/assistant-analytics.ts`
- Test: `packages/api/src/utils/assistant-analytics.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/src/utils/assistant-analytics.test.ts
import { describe, it, expect } from 'vitest';
import { mskDayKey, enumerateMskDays, fillDaySeries } from './assistant-analytics';

describe('mskDayKey', () => {
  it('shifts UTC into MSK before taking the calendar day', () => {
    // 2026-07-01T22:30:00Z is 2026-07-02 01:30 MSK → MSK day 2026-07-02
    expect(mskDayKey(new Date('2026-07-01T22:30:00Z'))).toBe('2026-07-02');
    // 2026-07-01T20:00:00Z is 2026-07-01 23:00 MSK → still 2026-07-01
    expect(mskDayKey(new Date('2026-07-01T20:00:00Z'))).toBe('2026-07-01');
  });
});

describe('enumerateMskDays', () => {
  it('lists every MSK calendar day in [from..to] inclusive', () => {
    const keys = enumerateMskDays(new Date('2026-07-01T00:00:00Z'), new Date('2026-07-03T12:00:00Z'));
    expect(keys).toEqual(['2026-07-01', '2026-07-02', '2026-07-03']);
  });
});

describe('fillDaySeries', () => {
  it('fills missing days with 0 and preserves order', () => {
    const out = fillDaySeries(
      [{ date: '2026-07-02', count: 5 }],
      ['2026-07-01', '2026-07-02', '2026-07-03'],
    );
    expect(out).toEqual([
      { date: '2026-07-01', count: 0 },
      { date: '2026-07-02', count: 5 },
      { date: '2026-07-03', count: 0 },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mpstats/api test src/utils/assistant-analytics.test.ts`
Expected: FAIL — cannot resolve `./assistant-analytics` (module does not exist yet).

- [ ] **Step 3: Write minimal implementation**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mpstats/api test src/utils/assistant-analytics.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/utils/assistant-analytics.ts packages/api/src/utils/assistant-analytics.test.ts
git commit -m "feat(analytics): assistant-analytics day helpers (MSK keys + gap-fill)"
```

---

## Task 2: Pure helper — quality ratios

**Files:**
- Modify: `packages/api/src/utils/assistant-analytics.ts`
- Test: `packages/api/src/utils/assistant-analytics.test.ts`

- [ ] **Step 1: Write the failing test** (append to the test file)

```ts
import { computeQuality } from './assistant-analytics';

describe('computeQuality', () => {
  it('computes rates and guards division by zero', () => {
    expect(computeQuality({ total: 0, offDomain: 0, complaint: 0, fallback: 0 })).toEqual({
      total: 0,
      offDomain: 0, offDomainRate: 0,
      complaint: 0, complaintRate: 0,
      fallback: 0, fallbackRate: 0,
    });
  });

  it('divides each problem count by total', () => {
    const q = computeQuality({ total: 200, offDomain: 20, complaint: 10, fallback: 30 });
    expect(q.offDomainRate).toBeCloseTo(0.1);
    expect(q.complaintRate).toBeCloseTo(0.05);
    expect(q.fallbackRate).toBeCloseTo(0.15);
    expect(q.total).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mpstats/api test src/utils/assistant-analytics.test.ts`
Expected: FAIL — `computeQuality` is not exported.

- [ ] **Step 3: Write minimal implementation** (append to `assistant-analytics.ts`)

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mpstats/api test src/utils/assistant-analytics.test.ts`
Expected: PASS (5 tests total).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/utils/assistant-analytics.ts packages/api/src/utils/assistant-analytics.test.ts
git commit -m "feat(analytics): computeQuality ratios with zero-guard"
```

---

## Task 3: Pure helper — problem-message labeling

**Files:**
- Modify: `packages/api/src/utils/assistant-analytics.ts`
- Test: `packages/api/src/utils/assistant-analytics.test.ts`

- [ ] **Step 1: Write the failing test** (append)

```ts
import { labelProblem } from './assistant-analytics';

describe('labelProblem', () => {
  it('labels a complaint', () => {
    const out = labelProblem({
      createdAt: new Date('2026-07-02T09:00:00Z'),
      category: 'complaint',
      isFallback: false,
      query: 'всё тормозит',
    });
    expect(out).toEqual({ date: '2026-07-02', kind: 'complaint', label: 'Жалоба', query: 'всё тормозит' });
  });

  it('labels an off-domain refusal', () => {
    const out = labelProblem({
      createdAt: new Date('2026-07-02T09:00:00Z'),
      category: 'off_domain',
      isFallback: false,
      query: 'погода завтра',
    });
    expect(out.kind).toBe('off_domain');
    expect(out.label).toBe('Офф-топик');
  });

  it('labels a concierge fallback when category is not a problem category', () => {
    const out = labelProblem({
      createdAt: new Date('2026-07-02T09:00:00Z'),
      category: 'platform_help',
      isFallback: true,
      query: 'где кнопка X',
    });
    expect(out.kind).toBe('fallback');
    expect(out.label).toBe('Не смог помочь (→ поддержка)');
  });

  it('tolerates a null query', () => {
    const out = labelProblem({ createdAt: new Date('2026-07-02T09:00:00Z'), category: 'off_domain', isFallback: false, query: null });
    expect(out.query).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mpstats/api test src/utils/assistant-analytics.test.ts`
Expected: FAIL — `labelProblem` is not exported.

- [ ] **Step 3: Write minimal implementation** (append)

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mpstats/api test src/utils/assistant-analytics.test.ts`
Expected: PASS (9 tests total).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/utils/assistant-analytics.ts packages/api/src/utils/assistant-analytics.test.ts
git commit -m "feat(analytics): labelProblem for assistant miss list"
```

---

## Task 4: Pure helper — upsell aggregation

**Files:**
- Modify: `packages/api/src/utils/assistant-analytics.ts`
- Test: `packages/api/src/utils/assistant-analytics.test.ts`

- [ ] **Step 1: Write the failing test** (append)

```ts
import { computeUpsell } from './assistant-analytics';

describe('computeUpsell', () => {
  const opts = { cap: 5, repeatThreshold: 2 };

  it('counts capped users, repeat cappers, and clamps the load histogram', () => {
    const rows = [
      { userId: 'a', dayCount: 5 }, // a capped day 1
      { userId: 'a', dayCount: 7 }, // a capped day 2 (clamped to bucket 5)
      { userId: 'b', dayCount: 5 }, // b capped once
      { userId: 'c', dayCount: 3 }, // c never capped
      { userId: 'c', dayCount: 1 },
    ];
    const out = computeUpsell(rows, opts);
    expect(out.cappedUsers).toBe(2); // a, b
    expect(out.repeatCappers).toBe(1); // only a (>=2 capped days)
    expect(out.loadHistogram).toEqual([
      { bucket: 1, userDays: 1 }, // c's 1
      { bucket: 2, userDays: 0 },
      { bucket: 3, userDays: 1 }, // c's 3
      { bucket: 4, userDays: 0 },
      { bucket: 5, userDays: 3 }, // a(5), a(7→5), b(5)
    ]);
  });

  it('returns zeroed buckets for an empty input', () => {
    const out = computeUpsell([], opts);
    expect(out.cappedUsers).toBe(0);
    expect(out.repeatCappers).toBe(0);
    expect(out.loadHistogram).toEqual([
      { bucket: 1, userDays: 0 },
      { bucket: 2, userDays: 0 },
      { bucket: 3, userDays: 0 },
      { bucket: 4, userDays: 0 },
      { bucket: 5, userDays: 0 },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mpstats/api test src/utils/assistant-analytics.test.ts`
Expected: FAIL — `computeUpsell` is not exported.

- [ ] **Step 3: Write minimal implementation** (append)

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mpstats/api test src/utils/assistant-analytics.test.ts`
Expected: PASS (11 tests total).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/utils/assistant-analytics.ts packages/api/src/utils/assistant-analytics.test.ts
git commit -m "feat(analytics): computeUpsell quota-pressure aggregation"
```

---

## Task 5: Router file + `getPulse` + mount

**Files:**
- Create: `packages/api/src/routers/admin-analytics-assistant.ts`
- Modify: `packages/api/src/routers/admin-analytics.ts` (import at top with the other imports; mount inside the `router({ ... })` object)

- [ ] **Step 1: Create the router file with the shared input + `getPulse`**

```ts
// packages/api/src/routers/admin-analytics-assistant.ts
/**
 * Assistant analytics — mounted at `admin.analytics.assistant.*`.
 * Read-only aggregation over AssistantMessage / AssistantConversation.
 * All aggregates filter role='assistant' where category/inDomain/cards matter,
 * exclude test users (UserProfile.isTest=false), and bucket by MSK calendar day.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, adminProcedure } from '../trpc';
import { handleDatabaseError } from '../utils/db-errors';
import { FREE_DAILY } from '../utils/assistant-quota';
import {
  enumerateMskDays,
  fillDaySeries,
  computeQuality,
  labelProblem,
  computeUpsell,
  type RawProblemRow,
} from '../utils/assistant-analytics';

const rangeInput = z.object({ from: z.date(), to: z.date() });

function assertRange(from: Date, to: Date) {
  if ((to.getTime() - from.getTime()) / 86_400_000 > 366) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Диапазон не больше 366 дней' });
  }
}

export const assistantAnalyticsRouter = router({
  /** Section 1 — adoption pulse: KPI totals + daily user-message & DAU series. */
  getPulse: adminProcedure.input(rangeInput).query(async ({ ctx, input }) => {
    try {
      const { from, to } = input;
      assertRange(from, to);
      const dayKeys = enumerateMskDays(from, to);

      const messagesByDayRows = await ctx.prisma.$queryRawUnsafe<Array<{ date: string; count: number }>>(
        `
        SELECT to_char((m."createdAt" + interval '3 hours'), 'YYYY-MM-DD') AS date,
               COUNT(*)::int AS count
        FROM "AssistantMessage" m
        JOIN "AssistantConversation" c ON c.id = m."conversationId"
        JOIN "UserProfile" up ON up.id = c."userId"
        WHERE m.role = 'user' AND m."createdAt" BETWEEN $1 AND $2 AND up."isTest" = false
        GROUP BY 1 ORDER BY 1
        `,
        from,
        to,
      );

      const usersByDayRows = await ctx.prisma.$queryRawUnsafe<Array<{ date: string; count: number }>>(
        `
        SELECT to_char((m."createdAt" + interval '3 hours'), 'YYYY-MM-DD') AS date,
               COUNT(DISTINCT c."userId")::int AS count
        FROM "AssistantMessage" m
        JOIN "AssistantConversation" c ON c.id = m."conversationId"
        JOIN "UserProfile" up ON up.id = c."userId"
        WHERE m."createdAt" BETWEEN $1 AND $2 AND up."isTest" = false
        GROUP BY 1 ORDER BY 1
        `,
        from,
        to,
      );

      const [totals] = await ctx.prisma.$queryRawUnsafe<
        Array<{ messages: number; users: number; conversations: number }>
      >(
        `
        SELECT
          COUNT(*) FILTER (WHERE m.role = 'user')::int AS messages,
          COUNT(DISTINCT c."userId")::int AS users,
          COUNT(DISTINCT m."conversationId")::int AS conversations
        FROM "AssistantMessage" m
        JOIN "AssistantConversation" c ON c.id = m."conversationId"
        JOIN "UserProfile" up ON up.id = c."userId"
        WHERE m."createdAt" BETWEEN $1 AND $2 AND up."isTest" = false
        `,
        from,
        to,
      );

      const messages = Number(totals?.messages ?? 0);
      const conversations = Number(totals?.conversations ?? 0);

      return {
        kpi: {
          messages,
          users: Number(totals?.users ?? 0),
          conversations,
          avgPerConversation: conversations === 0 ? 0 : messages / conversations,
        },
        messagesByDay: fillDaySeries(messagesByDayRows, dayKeys),
        usersByDay: fillDaySeries(usersByDayRows, dayKeys),
      };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      handleDatabaseError(error);
    }
  }),
});
```

- [ ] **Step 2: Mount the sub-router**

In `packages/api/src/routers/admin-analytics.ts`, add the import next to the other imports (after line 23):

```ts
import { assistantAnalyticsRouter } from './admin-analytics-assistant';
```

Then, inside `export const adminAnalyticsRouter = router({` (the top-level object opened at line 39), add this property (e.g. right after the opening brace, before `getAnalytics:`):

```ts
  /** Assistant analytics sub-namespace → admin.analytics.assistant.* */
  assistant: assistantAnalyticsRouter,
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @mpstats/api typecheck`
Expected: PASS (no errors). If `FREE_DAILY`, `labelProblem`, `computeUpsell`, or `RawProblemRow` show as unused, that is expected until Tasks 6–8 — leave them imported (they are used there). If the linter blocks on unused imports, add them per-procedure instead: import only `enumerateMskDays, fillDaySeries` now and extend the import in Tasks 6/8.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/routers/admin-analytics-assistant.ts packages/api/src/routers/admin-analytics.ts
git commit -m "feat(analytics): assistant getPulse procedure + mount under admin.analytics.assistant"
```

---

## Task 6: `getQuality` + `getProblemMessages`

**Files:**
- Modify: `packages/api/src/routers/admin-analytics-assistant.ts`

- [ ] **Step 1: Add `getQuality` procedure** (inside the `router({ ... })`, after `getPulse`)

```ts
  /** Section 2a — answer quality: off-domain / complaint / fallback rates. */
  getQuality: adminProcedure.input(rangeInput).query(async ({ ctx, input }) => {
    try {
      const { from, to } = input;
      assertRange(from, to);
      const [row] = await ctx.prisma.$queryRawUnsafe<
        Array<{ total: number; off_domain: number; complaint: number; fallback: number }>
      >(
        `
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE m.category = 'off_domain')::int AS off_domain,
          COUNT(*) FILTER (WHERE m.category = 'complaint')::int AS complaint,
          COUNT(*) FILTER (WHERE m."navLinks"::text LIKE '%/support%')::int AS fallback
        FROM "AssistantMessage" m
        JOIN "AssistantConversation" c ON c.id = m."conversationId"
        JOIN "UserProfile" up ON up.id = c."userId"
        WHERE m.role = 'assistant' AND m."createdAt" BETWEEN $1 AND $2 AND up."isTest" = false
        `,
        from,
        to,
      );
      return computeQuality({
        total: row?.total ?? 0,
        offDomain: row?.off_domain ?? 0,
        complaint: row?.complaint ?? 0,
        fallback: row?.fallback ?? 0,
      });
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      handleDatabaseError(error);
    }
  }),
```

Make sure `computeQuality` is in the import block from `../utils/assistant-analytics` (it is, per Task 5).

- [ ] **Step 2: Add `getProblemMessages` procedure** (after `getQuality`)

```ts
  /** Section 2b — last N problem turns (off-domain / complaint / fallback) with the user query. */
  getProblemMessages: adminProcedure
    .input(rangeInput.extend({ limit: z.number().int().min(1).max(200).default(50) }))
    .query(async ({ ctx, input }) => {
      try {
        const { from, to, limit } = input;
        assertRange(from, to);
        const rows = await ctx.prisma.$queryRawUnsafe<RawProblemRow[]>(
          `
          SELECT
            m."createdAt" AS "createdAt",
            m.category AS category,
            (m."navLinks"::text LIKE '%/support%') AS "isFallback",
            q.content AS query
          FROM "AssistantMessage" m
          JOIN "AssistantConversation" c ON c.id = m."conversationId"
          JOIN "UserProfile" up ON up.id = c."userId"
          LEFT JOIN LATERAL (
            SELECT u.content FROM "AssistantMessage" u
            WHERE u."conversationId" = m."conversationId"
              AND u.role = 'user'
              AND u."createdAt" <= m."createdAt"
            ORDER BY u."createdAt" DESC
            LIMIT 1
          ) q ON true
          WHERE m.role = 'assistant'
            AND m."createdAt" BETWEEN $1 AND $2
            AND up."isTest" = false
            AND (m.category IN ('off_domain','complaint') OR m."navLinks"::text LIKE '%/support%')
          ORDER BY m."createdAt" DESC
          LIMIT $3
          `,
          from,
          to,
          limit,
        );
        return { items: rows.map(labelProblem) };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        handleDatabaseError(error);
      }
    }),
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @mpstats/api typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/routers/admin-analytics-assistant.ts
git commit -m "feat(analytics): assistant getQuality + getProblemMessages"
```

---

## Task 7: `getDemand`

**Files:**
- Modify: `packages/api/src/routers/admin-analytics-assistant.ts`

- [ ] **Step 1: Add `getDemand` procedure** (after `getProblemMessages`)

```ts
  /** Section 3 — demand: category breakdown + top surfaced materials/lessons/jobs. */
  getDemand: adminProcedure.input(rangeInput).query(async ({ ctx, input }) => {
    try {
      const { from, to } = input;
      assertRange(from, to);

      const categoryRows = await ctx.prisma.$queryRawUnsafe<Array<{ category: string; count: number }>>(
        `
        SELECT m.category AS category, COUNT(*)::int AS count
        FROM "AssistantMessage" m
        JOIN "AssistantConversation" c ON c.id = m."conversationId"
        JOIN "UserProfile" up ON up.id = c."userId"
        WHERE m.role = 'assistant' AND m.category IS NOT NULL
          AND m."createdAt" BETWEEN $1 AND $2 AND up."isTest" = false
        GROUP BY 1 ORDER BY count DESC
        `,
        from,
        to,
      );

      const topMaterials = await ctx.prisma.$queryRawUnsafe<Array<{ id: string; title: string; count: number }>>(
        `
        SELECT mat.id AS id, mat.title AS title, COUNT(*)::int AS count
        FROM "AssistantMessage" m
        JOIN "AssistantConversation" c ON c.id = m."conversationId"
        JOIN "UserProfile" up ON up.id = c."userId"
        CROSS JOIN LATERAL unnest(m."materialIds") AS mid(id)
        JOIN "Material" mat ON mat.id = mid.id
        WHERE m.role = 'assistant' AND m."createdAt" BETWEEN $1 AND $2 AND up."isTest" = false
        GROUP BY mat.id, mat.title ORDER BY count DESC LIMIT 10
        `,
        from,
        to,
      );

      const topLessons = await ctx.prisma.$queryRawUnsafe<Array<{ id: string; title: string; count: number }>>(
        `
        SELECT l.id AS id, l.title AS title, COUNT(*)::int AS count
        FROM "AssistantMessage" m
        JOIN "AssistantConversation" c ON c.id = m."conversationId"
        JOIN "UserProfile" up ON up.id = c."userId"
        CROSS JOIN LATERAL unnest(m."lessonIds") AS lid(id)
        JOIN "Lesson" l ON l.id = lid.id
        WHERE m.role = 'assistant' AND m."createdAt" BETWEEN $1 AND $2 AND up."isTest" = false
        GROUP BY l.id, l.title ORDER BY count DESC LIMIT 10
        `,
        from,
        to,
      );

      const topJobs = await ctx.prisma.$queryRawUnsafe<Array<{ id: string; title: string; count: number }>>(
        `
        SELECT j.id AS id, j.title AS title, COUNT(*)::int AS count
        FROM "AssistantMessage" m
        JOIN "AssistantConversation" c ON c.id = m."conversationId"
        JOIN "UserProfile" up ON up.id = c."userId"
        CROSS JOIN LATERAL unnest(m."jobIds") AS jid(id)
        JOIN "Job" j ON j.id = jid.id
        WHERE m.role = 'assistant' AND m."createdAt" BETWEEN $1 AND $2 AND up."isTest" = false
        GROUP BY j.id, j.title ORDER BY count DESC LIMIT 10
        `,
        from,
        to,
      );

      return {
        categories: categoryRows.map((r) => ({ category: r.category, count: Number(r.count) })),
        topMaterials: topMaterials.map((r) => ({ id: r.id, title: r.title, count: Number(r.count) })),
        topLessons: topLessons.map((r) => ({ id: r.id, title: r.title, count: Number(r.count) })),
        topJobs: topJobs.map((r) => ({ id: r.id, title: r.title, count: Number(r.count) })),
      };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      handleDatabaseError(error);
    }
  }),
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @mpstats/api typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/routers/admin-analytics-assistant.ts
git commit -m "feat(analytics): assistant getDemand (category + top cards)"
```

---

## Task 8: `getUpsell`

**Files:**
- Modify: `packages/api/src/routers/admin-analytics-assistant.ts`

**Note on free/paid classification (v1 approximation, per spec):** a user is "full" if their `UserProfile.role` is ADMIN/SUPERADMIN/SALES **or** they currently hold a `Subscription` with status in (ACTIVE, TRIAL, CANCELLED) and `currentPeriodEnd > now()`. This mirrors `getUserAdminBypass` + `getUserActiveSubscriptions`. Classification is by CURRENT status, not historical.

- [ ] **Step 1: Add `getUpsell` procedure** (after `getDemand`)

```ts
  /** Section 4 — quota pressure: free users hitting the daily cap + upsell candidates. */
  getUpsell: adminProcedure.input(rangeInput).query(async ({ ctx, input }) => {
    try {
      const { from, to } = input;
      assertRange(from, to);

      // Shared CTE fragment: free = not admin-role and no currently-active subscription.
      const freeDayCountsCte = `
        WITH full_users AS (
          SELECT up.id FROM "UserProfile" up
          WHERE up.role IN ('ADMIN','SUPERADMIN','SALES')
          UNION
          SELECT s."userId" FROM "Subscription" s
          WHERE s.status IN ('ACTIVE','TRIAL','CANCELLED') AND s."currentPeriodEnd" > now()
        ),
        day_counts AS (
          SELECT c."userId" AS "userId",
                 to_char((m."createdAt" + interval '3 hours'), 'YYYY-MM-DD') AS day,
                 COUNT(*)::int AS "dayCount"
          FROM "AssistantMessage" m
          JOIN "AssistantConversation" c ON c.id = m."conversationId"
          JOIN "UserProfile" up ON up.id = c."userId"
          WHERE m.role = 'assistant' AND m."inDomain" = true
            AND m."createdAt" BETWEEN $1 AND $2
            AND up."isTest" = false
            AND c."userId" NOT IN (SELECT id FROM full_users)
          GROUP BY c."userId", 2
        )
      `;

      const dayCountRows = await ctx.prisma.$queryRawUnsafe<Array<{ userId: string; dayCount: number }>>(
        `${freeDayCountsCte}
         SELECT dc."userId" AS "userId", dc."dayCount" AS "dayCount" FROM day_counts dc`,
        from,
        to,
      );

      const candidateRows = await ctx.prisma.$queryRawUnsafe<
        Array<{ userId: string; email: string | null; total: number; daysCapped: number }>
      >(
        `${freeDayCountsCte}
         SELECT dc."userId" AS "userId",
                au.email AS email,
                SUM(dc."dayCount")::int AS total,
                COUNT(*) FILTER (WHERE dc."dayCount" >= $3)::int AS "daysCapped"
         FROM day_counts dc
         LEFT JOIN auth.users au ON au.id::text = dc."userId"
         GROUP BY dc."userId", au.email
         ORDER BY total DESC
         LIMIT 20`,
        from,
        to,
        FREE_DAILY,
      );

      const summary = computeUpsell(dayCountRows, { cap: FREE_DAILY, repeatThreshold: 2 });

      return {
        cap: FREE_DAILY,
        ...summary,
        candidates: candidateRows.map((r) => ({
          userId: r.userId,
          email: r.email,
          total: Number(r.total),
          daysCapped: Number(r.daysCapped),
        })),
      };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      handleDatabaseError(error);
    }
  }),
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @mpstats/api typecheck`
Expected: PASS.

- [ ] **Step 3: Run the full api unit suite** (confirms nothing regressed and pure fns pass)

Run: `pnpm --filter @mpstats/api test`
Expected: PASS (existing suite + 11 new assistant-analytics tests).

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/routers/admin-analytics-assistant.ts
git commit -m "feat(analytics): assistant getUpsell (quota pressure + candidates)"
```

---

## Task 9: Tab entry + page shell with Section 1 (Пульс)

**Files:**
- Modify: `apps/web/src/components/admin/AnalyticsTabs.tsx:7-15`
- Create: `apps/web/src/app/(admin)/admin/analytics/assistant/page.tsx`

- [ ] **Step 1: Add the tab**

In `AnalyticsTabs.tsx`, add to the `TABS` array (after the "Чекпоинты" entry):

```ts
  { label: 'Ассистент', href: '/admin/analytics/assistant' },
```

- [ ] **Step 2: Create the page with the period selector + Section 1**

```tsx
// apps/web/src/app/(admin)/admin/analytics/assistant/page.tsx
'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { ActivityChart } from '@/components/admin/ActivityChart';
import { StatCard } from '@/components/admin/StatCard';
import { AnalyticsDateRange, presetRange, rangeToBounds } from '@/components/admin/AnalyticsDateRange';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageSquare, Users, MessagesSquare, Gauge } from 'lucide-react';

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export default function AssistantAnalyticsPage() {
  const [range, setRange] = useState(presetRange(30));
  const { from, to } = rangeToBounds(range);

  const pulse = trpc.admin.analytics.assistant.getPulse.useQuery({ from, to });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-heading-lg font-bold text-mp-gray-900">Ассистент</h2>
          <p className="text-body-sm text-mp-gray-500 mt-1">
            Adoption, качество ответов, спрос и давление квоты (без тестовых)
          </p>
        </div>
        <AnalyticsDateRange value={range} onChange={setRange} />
      </div>

      {/* Section 1 — Пульс */}
      <section className="space-y-4">
        <h3 className="text-body font-semibold text-mp-gray-900">Пульс</h3>
        {pulse.isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="p-5"><Skeleton className="h-4 w-24 mb-3" /><Skeleton className="h-8 w-16" /></Card>
            ))}
          </div>
        ) : pulse.data ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="Сообщений" value={pulse.data.kpi.messages} icon={MessageSquare} color="blue" />
            <StatCard title="Уник. юзеров" value={pulse.data.kpi.users} icon={Users} color="green" />
            <StatCard title="Диалогов" value={pulse.data.kpi.conversations} icon={MessagesSquare} color="gray" />
            <StatCard title="Ср. на диалог" value={pulse.data.kpi.avgPerConversation.toFixed(1)} icon={Gauge} color="pink" />
          </div>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-5">
            {pulse.isLoading ? <Skeleton className="h-[250px] w-full" /> :
              <ActivityChart data={pulse.data?.messagesByDay ?? []} title="Сообщений в день" color="#2563eb" />}
          </Card>
          <Card className="p-5">
            {pulse.isLoading ? <Skeleton className="h-[250px] w-full" /> :
              <ActivityChart data={pulse.data?.usersByDay ?? []} title="Уник. юзеров в день" color="#16a34a" />}
          </Card>
        </div>
      </section>
    </div>
  );
}
```

> Note: `StatCard`, `ActivityChart`, `AnalyticsDateRange`, `presetRange`, `rangeToBounds`, `Card`, `Skeleton` are the exact imports used by `revenue/page.tsx`. If `StatCard`'s `value` prop rejects a `number`, wrap with `String(...)` (revenue passes strings) — check `StatCard`'s prop type and match it.

- [ ] **Step 3: Typecheck web**

Run: `pnpm --filter web typecheck`
Expected: PASS. If `StatCard` value type errors, coerce numbers to strings as noted.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/admin/AnalyticsTabs.tsx "apps/web/src/app/(admin)/admin/analytics/assistant/page.tsx"
git commit -m "feat(analytics): assistant tab + pulse section"
```

---

## Task 10: Sections 2 (Качество) + 3 (Спрос)

**Files:**
- Modify: `apps/web/src/app/(admin)/admin/analytics/assistant/page.tsx`

- [ ] **Step 1: Add the two queries** (below the `pulse` query)

```tsx
  const quality = trpc.admin.analytics.assistant.getQuality.useQuery({ from, to });
  const problems = trpc.admin.analytics.assistant.getProblemMessages.useQuery({ from, to, limit: 50 });
  const demand = trpc.admin.analytics.assistant.getDemand.useQuery({ from, to });
```

- [ ] **Step 2: Add a small top-list helper + a `CATEGORY_LABEL` map** (module scope, above the component)

```tsx
const CATEGORY_LABEL: Record<string, string> = {
  material: 'Материалы',
  platform_help: 'Помощь по платформе',
  complaint: 'Жалобы',
  off_domain: 'Офф-топик',
};

function TopList({ title, rows }: { title: string; rows: Array<{ id: string; title: string; count: number }> }) {
  return (
    <Card className="p-5">
      <h4 className="text-body font-semibold text-mp-gray-900 mb-3">{title}</h4>
      {rows.length === 0 ? (
        <p className="text-body-sm text-mp-gray-500">Нет данных за период.</p>
      ) : (
        <table className="w-full text-body-sm">
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-mp-gray-100 last:border-0">
                <td className="py-2 pr-4 text-mp-gray-900">{r.title}</td>
                <td className="py-2 pl-4 text-right text-mp-gray-700 tabular-nums">{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
```

- [ ] **Step 3: Add Section 2 markup** (after the Section 1 `</section>`)

```tsx
      {/* Section 2 — Качество */}
      <section className="space-y-4">
        <h3 className="text-body font-semibold text-mp-gray-900">Качество ответов</h3>
        {quality.isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <Card key={i} className="p-5"><Skeleton className="h-4 w-24 mb-3" /><Skeleton className="h-8 w-16" /></Card>)}
          </div>
        ) : quality.data ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard title="Офф-топик" value={pct(quality.data.offDomainRate)} icon={Gauge} color="gray" trend={`${quality.data.offDomain} из ${quality.data.total}`} />
            <StatCard title="Жалобы" value={pct(quality.data.complaintRate)} icon={Gauge} color="pink" trend={`${quality.data.complaint} из ${quality.data.total}`} />
            <StatCard title="Не смог помочь" value={pct(quality.data.fallbackRate)} icon={Gauge} color="gray" trend={`${quality.data.fallback} из ${quality.data.total}`} />
          </div>
        ) : null}

        <Card className="p-5">
          <h4 className="text-body font-semibold text-mp-gray-900 mb-3">Последние промахи</h4>
          {problems.isLoading ? <Skeleton className="h-24 w-full" /> :
            problems.data && problems.data.items.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-body-sm">
                  <thead><tr className="border-b border-mp-gray-200">
                    <th className="text-left py-2 pr-4 text-mp-gray-500 font-medium">Дата</th>
                    <th className="text-left py-2 px-4 text-mp-gray-500 font-medium">Тип</th>
                    <th className="text-left py-2 pl-4 text-mp-gray-500 font-medium">Запрос</th>
                  </tr></thead>
                  <tbody>
                    {problems.data.items.map((it, i) => (
                      <tr key={i} className="border-b border-mp-gray-100 last:border-0">
                        <td className="py-2 pr-4 text-mp-gray-600 whitespace-nowrap">{it.date}</td>
                        <td className="py-2 px-4 text-mp-gray-700 whitespace-nowrap">{it.label}</td>
                        <td className="py-2 pl-4 text-mp-gray-900">{it.query || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-body-sm text-mp-gray-500">Промахов за период нет.</p>}
        </Card>
      </section>
```

- [ ] **Step 4: Add Section 3 markup** (after Section 2)

```tsx
      {/* Section 3 — Спрос */}
      <section className="space-y-4">
        <h3 className="text-body font-semibold text-mp-gray-900">Спрос</h3>
        <Card className="p-5">
          <h4 className="text-body font-semibold text-mp-gray-900 mb-3">О чём спрашивают (категории)</h4>
          {demand.isLoading ? <Skeleton className="h-24 w-full" /> :
            demand.data && demand.data.categories.length > 0 ? (
              <table className="w-full text-body-sm">
                <tbody>
                  {demand.data.categories.map((c) => (
                    <tr key={c.category} className="border-b border-mp-gray-100 last:border-0">
                      <td className="py-2 pr-4 text-mp-gray-900">{CATEGORY_LABEL[c.category] ?? c.category}</td>
                      <td className="py-2 pl-4 text-right text-mp-gray-700 tabular-nums">{c.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="text-body-sm text-mp-gray-500">Нет данных за период.</p>}
        </Card>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <TopList title="Топ материалов" rows={demand.data?.topMaterials ?? []} />
          <TopList title="Топ уроков" rows={demand.data?.topLessons ?? []} />
          <TopList title="Топ задач" rows={demand.data?.topJobs ?? []} />
        </div>
      </section>
```

- [ ] **Step 5: Typecheck web**

Run: `pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/(admin)/admin/analytics/assistant/page.tsx"
git commit -m "feat(analytics): assistant quality + demand sections"
```

---

## Task 11: Section 4 (Апселл)

**Files:**
- Modify: `apps/web/src/app/(admin)/admin/analytics/assistant/page.tsx`

- [ ] **Step 1: Add the query** (below the `demand` query)

```tsx
  const upsell = trpc.admin.analytics.assistant.getUpsell.useQuery({ from, to });
```

- [ ] **Step 2: Add Section 4 markup** (after Section 3)

```tsx
      {/* Section 4 — Апселл */}
      <section className="space-y-4">
        <div>
          <h3 className="text-body font-semibold text-mp-gray-900">Давление квоты (апселл)</h3>
          <p className="text-body-sm text-mp-gray-500 mt-0.5">Free-юзеры по текущему статусу подписки; «упёрся» = {upsell.data?.cap ?? 5}+ ответов в день</p>
        </div>
        {upsell.isLoading ? (
          <div className="grid grid-cols-2 gap-4">
            {[1, 2].map((i) => <Card key={i} className="p-5"><Skeleton className="h-4 w-24 mb-3" /><Skeleton className="h-8 w-16" /></Card>)}
          </div>
        ) : upsell.data ? (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <StatCard title="Упёрлись в лимит" value={upsell.data.cappedUsers} icon={Gauge} color="pink" />
              <StatCard title="Повторно упирались" value={upsell.data.repeatCappers} icon={Gauge} color="pink" />
            </div>

            <Card className="p-5">
              <h4 className="text-body font-semibold text-mp-gray-900 mb-3">Распределение дневной нагрузки (free)</h4>
              <table className="w-full text-body-sm">
                <thead><tr className="border-b border-mp-gray-200">
                  <th className="text-left py-2 pr-4 text-mp-gray-500 font-medium">Ответов в день</th>
                  <th className="text-right py-2 pl-4 text-mp-gray-500 font-medium">Юзеро-дней</th>
                </tr></thead>
                <tbody>
                  {upsell.data.loadHistogram.map((b) => (
                    <tr key={b.bucket} className="border-b border-mp-gray-100 last:border-0">
                      <td className="py-2 pr-4 text-mp-gray-900">{b.bucket === upsell.data!.cap ? `${b.bucket}+` : b.bucket}</td>
                      <td className="py-2 pl-4 text-right text-mp-gray-700 tabular-nums">{b.userDays}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <Card className="p-5">
              <h4 className="text-body font-semibold text-mp-gray-900 mb-3">Кандидаты на апселл (топ free по объёму)</h4>
              {upsell.data.candidates.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-body-sm">
                    <thead><tr className="border-b border-mp-gray-200">
                      <th className="text-left py-2 pr-4 text-mp-gray-500 font-medium">Email</th>
                      <th className="text-right py-2 px-4 text-mp-gray-500 font-medium">Всего ответов</th>
                      <th className="text-right py-2 pl-4 text-mp-gray-500 font-medium">Дней упирался</th>
                    </tr></thead>
                    <tbody>
                      {upsell.data.candidates.map((c) => (
                        <tr key={c.userId} className="border-b border-mp-gray-100 last:border-0">
                          <td className="py-2 pr-4 text-mp-gray-900">{c.email || '—'}</td>
                          <td className="py-2 px-4 text-right text-mp-gray-700 tabular-nums">{c.total}</td>
                          <td className="py-2 pl-4 text-right text-mp-gray-700 tabular-nums">{c.daysCapped}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="text-body-sm text-mp-gray-500">Нет активных free-юзеров ассистента за период.</p>}
            </Card>
          </>
        ) : null}
      </section>
```

- [ ] **Step 3: Typecheck web**

Run: `pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(admin)/admin/analytics/assistant/page.tsx"
git commit -m "feat(analytics): assistant upsell section"
```

---

## Task 12: Full verification + production build gate

**Files:** none (verification only)

- [ ] **Step 1: Run the full api unit suite**

Run: `pnpm --filter @mpstats/api test`
Expected: PASS (existing + 11 new assistant-analytics tests).

- [ ] **Step 2: Typecheck the whole workspace**

Run: `pnpm --filter @mpstats/api typecheck && pnpm --filter web typecheck`
Expected: both PASS.

- [ ] **Step 3: Production build the web app** (catches server-only-in-client that `tsc` misses — mandatory before deploy)

Run: `pnpm --filter web build`
Expected: build succeeds; the `/admin/analytics/assistant` route appears in the route list. If it fails with a "server-only" error, an import in the page pulled a value from a server-only barrel — switch that import to `import type` or move the data fetch server-side.

- [ ] **Step 4: Manual smoke against prod data (localhost reads prod Supabase — read-only, safe)**

Run: `pnpm dev`, open `http://localhost:3000/admin/analytics/assistant` as an admin. Verify all 4 sections render, the period selector re-queries, KPI numbers look sane, and the problem list / candidate list populate. This is the owner-review step (owner validates on their machine per usual flow).

- [ ] **Step 5: No commit** — verification only. Deployment (staging build-gate → master `--no-ff` → prod `--no-cache web`) follows the standard runbook in `MAAL/CLAUDE.md` after owner sign-off.

---

## Self-review notes (author)

- **Spec coverage:** Section 1 → Task 5/9; Section 2 (rates + problem list) → Task 6/10; Section 3 (category + top cards) → Task 7/10; Section 4 (quota pressure + candidates) → Task 8/11. Test-user exclusion, MSK bucketing, `role='assistant'` filter, `FREE_DAILY` import, `/support` fallback signal — all encoded in the SQL. Both open questions resolved to v1 defaults (current-status free/paid; last-50 problem list, no pagination).
- **Known approximation surfaced in UI:** Section 4 subtitle states "по текущему статусу подписки" so the admin knows free/paid is not historical.
- **Type consistency:** `DayCount`, `QualityMetrics`, `ProblemItem`/`RawProblemRow`, `UpsellSummary` defined in Task 1–4 and consumed unchanged in the router (Tasks 5–8) and page (Tasks 9–11). Procedure names `getPulse/getQuality/getProblemMessages/getDemand/getUpsell` used identically in router and client.
- **Deferred (spec non-goals, not in any task):** full conversation viewer, assistant→payment attribution, LLM topic clustering.
