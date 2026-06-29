# Витрина (storefront) на /dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Превратить /dashboard в редакторскую витрину (ленту полок) на сигнале онбординга + ручных тегах, со страницей-коллекцией и возвратом фильтров в Базу знаний.

**Architecture:** Аддитивное поле `badges String[]` на Lesson+Job (хребет) → tRPC-билдеры `dashboard.getStorefront`/`getCollection` → редизайн /dashboard (карусельные полки) + новая /dashboard/collection/[shelfKey] + ремоунт FilterPanel в /learn/library.

**Tech Stack:** Next.js 14 App Router, tRPC, Prisma 5.22, Supabase, Vitest (unit), Playwright (E2E), Tailwind.

---

## Reference facts (verified against current code — do NOT re-derive)

- `Lesson` model: `packages/db/prisma/schema.prisma:152`. `Job` model: `:666`.
- `UserProfile.goals` = `String[] @default([])`, values: `SALES|ADS|CONTENT|ANALYTICS|OPERATIONS|FINANCE|NEW_MARKETPLACE` (`schema.prisma:~39`).
- `UserProfile.marketplaces` = `String[] @default([])`, values incl. `WB|OZON|YANDEX|...`. `computeEffectiveMarketplaces()` (in `packages/api/src/utils`) collapses to `WB|OZON`.
- `Job.axes` = `Json` holding canonical-5 strings: `ANALYTICS|MARKETING|CONTENT|OPERATIONS|FINANCE` (= `SkillCategory` enum). `ADS` goal maps to axis `MARKETING`.
- `LessonStatus` enum: `NOT_STARTED|IN_PROGRESS|COMPLETED` (`schema.prisma:198`).
- `LearningPath`: `userId @unique`, `lessons Json`, `addedJobs Json @default("[]")`, relation `progress LessonProgress[]` (`schema.prisma:232`). `LessonProgress.status` is the IN_PROGRESS source.
- `JobSummary` type: `packages/shared/src/types/index.ts:396-408`. `LessonWithProgress`: `:105-114`. `JobMarketplace = 'WB'|'OZON'|'BOTH'`: `:394`. `JobCatalogAxis`: `:410-414`.
- `job.ts`: `export const jobRouter`, `getCatalog` at `:27-120`, exported helpers `axisTitle`, `filterByMarketplace`, const `AXIS_ORDER`. JobSummary enrich pattern at `:80-106`.
- `learning.ts`: `export const learningRouter`, `getRecommendedPath` at `:291`. Lesson-locked computed via `isLessonAccessible({order,courseId}, subs, billingEnabled, isAdminBypass, firstJobLessonIds.has(id))`.
- `access` helpers (`packages/api/src/utils/access.ts`) — VERIFIED signatures: `getUserActiveSubscriptions(userId, prisma)`, `getUserAdminBypass(userId, prisma)`, `getFirstJobLessonIds(prisma, lessonIds?)`, `isLessonAccessible(lesson, subs, billingEnabled, isAdminBypass?, isFirstJobLesson?)` (pure/sync). **Billing flag is ASYNC and reads the GLOBAL prisma** (not ctx): `await isFeatureEnabled('billing_enabled')` (`packages/api/src/utils/feature-flags.ts`). In unit tests mock it: `vi.mock('../../utils/feature-flags', () => ({ isFeatureEnabled: vi.fn().mockResolvedValue(true) }))`.
- `root.ts`: 17 router imports + `appRouter = router({...})`. Add `dashboard: dashboardRouter`.
- `JobCard` (`apps/web/src/components/learning/JobCard.tsx`): named export, props `{ job: JobSummary; onAddToTrack?; isAddPending?; initialFavorited? }`. Does NOT read `badges`.
- `LessonCard` (`apps/web/src/components/learning/LessonCard.tsx`): named export `LessonCard`, props `LessonCardProps { lesson: LessonWithProgress; showCourse?; courseName?; isRecommended?; locked?; inTrack?; onToggleTrack?; onRemoveFromTrack?; favorite? }`. Reads `locked ?? lesson.locked`. Does NOT read `badges`.
- `FilterPanel` (`apps/web/src/components/learning/FilterPanel.tsx`): `export interface FilterState` `:8-16` (`category,status,topics,difficulty,duration,courseId,marketplace`), `export const DEFAULT_FILTERS` `:18-26`, `export function FilterPanel` props `{ filters; onFiltersChange; availableTopics; availableCourses }`.
- `library/page.tsx` (`apps/web/src/app/(main)/learn/library/page.tsx`): imports `FilterState` TYPE but does NOT mount `FilterPanel`. Local `filtersFromSearchParams` `:39-49`, local `filterLesson` `:120-144`. Queries `trpc.learning.getCourses` + `trpc.learning.getRecommendedPath`. Lessons filter via `lesson.courseId === '05_ozon'` ⇒ OZON, else WB.
- `dashboard/page.tsx` (`apps/web/src/app/(main)/dashboard/page.tsx`): KEEP profile banner (`:135-155`), DarkIsland hero+stats (`:159-190`), 3 BentoCard entry buttons (`:193-197`), diagnostic entry (`:204-218`), next-lesson LessonCard (`:221-230`). REMOVE recent-activity (`:232-266`), Skill Radar (`:271-297`), Average score (`:300-314`). Radar imported from `@/components/charts/RadarChart`.
- Migration via Supabase Mgmt API only (`prisma migrate/push` FORBIDDEN — localhost dev reads PROD Supabase). Pattern: edit schema → `prisma generate` → tsx apply (ALTER + INSERT `_prisma_migrations`). Existing additive precedent: `packages/db/prisma/migrations/20260608000000_add_user_is_test/migration.sql`.
- Project gotcha: any `$queryRaw` to `auth.users` needs `id::text`. Local Supabase scripts run as `NODE_OPTIONS=--dns-result-order=ipv4first npx tsx ...`.
- Already on branch `feature/storefront-dashboard`. Conventional commits, body ends with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

**Naming contract (spell IDENTICALLY everywhere):** field `badges`; router procedures `getStorefront` / `getCollection`; shelf identifier key `shelfKey`; shelf keys literal `start|continue|goal-<goal>|new|new-<mp>|quick|hot`; const `GOAL_TO_AXES`, `GOAL_LABELS`; helpers `goalShelfKey`, `newShelfKey`, `resolveShelfKey`; types `StorefrontShelf`, `StorefrontItem`; UI helpers `arrowVisibility`, `deriveBadgePills`. Badge taxonomy literals: `START`, `NEW`, `HOT`, `QUICK` (uppercase).

---

## Wave 1 — Хребет (badges backbone + first tag batch)

### Task 1: Add `badges String[]` to Lesson + Job in schema.prisma

**Files:**
- Modify: `packages/db/prisma/schema.prisma:152` (Lesson), `:666` (Job)

Steps:
- [ ] Edit `schema.prisma` — inside `model Lesson` add, right after `isHidden Boolean @default(false)` (line 166):
```prisma
  badges          String[]      @default([]) // editorial storefront tags: START|NEW|HOT|QUICK
```
- [ ] Edit `schema.prisma` — inside `model Job` add, right after `isPublished Boolean @default(false)` (line 676):
```prisma
  badges       String[]                     @default([]) // editorial storefront tags: START|NEW|HOT|QUICK
```
- [ ] Run `pnpm db:generate` (regenerates `@mpstats/db` client with `badges`). Expected: `✔ Generated Prisma Client`.
- [ ] Commit: `git add packages/db/prisma/schema.prisma && git commit -m "feat(storefront): add badges String[] to Lesson and Job schema"` (body Co-Authored-By line).

### Task 2: Add `badges?: string[]` to shared types (JobSummary + LessonWithProgress)

**Files:**
- Modify: `packages/shared/src/types/index.ts:396-408` (JobSummary), `:105-114` (LessonWithProgress)
- Test: `packages/shared` typecheck only (no runtime)

Steps:
- [ ] Edit `JobSummary` (`:396-408`) — add after `isInTrack: boolean;`:
```typescript
  badges?: string[];            // editorial storefront tags (START/NEW/HOT/QUICK)
```
- [ ] Edit `LessonWithProgress` (`:105-114`) — add after `progressState?: InteractiveProgressState | null;`:
```typescript
  badges?: string[];            // editorial storefront tags (START/NEW/HOT/QUICK)
```
- [ ] Run `pnpm --filter @mpstats/shared typecheck` (or `pnpm typecheck`). Expected: no errors.
- [ ] Commit: `git commit -am "feat(storefront): badges field on JobSummary and LessonWithProgress types"`.

### Task 3: Create migration folder + apply `badges` columns to PROD Supabase via Mgmt API

**Files:**
- Create: `packages/db/prisma/migrations/20260629030000_add_content_badges/migration.sql`
- Create: `scripts/migrate/apply-content-badges-migration.ts`

Steps:
- [ ] Create `migration.sql`:
```sql
-- Storefront backbone: editorial badges on lessons and jobs (START/NEW/HOT/QUICK).
-- Additive; existing rows default to empty array. Powers /dashboard shelves + library tag filter.
ALTER TABLE "Lesson" ADD COLUMN "badges" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Job" ADD COLUMN "badges" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
```
- [ ] Create `scripts/migrate/apply-content-badges-migration.ts` (token + project ref from env — NEVER hardcode secrets):
```typescript
/**
 * Apply additive `badges` columns to PROD Supabase via Management API.
 * (VPS has no prisma toolchain; localhost dev reads PROD Supabase → prisma migrate/push FORBIDDEN.)
 * Run: SUPABASE_MGMT_TOKEN=<token> SUPABASE_PROJECT_REF=saecuecevicwjkpmaoot \
 *      NODE_OPTIONS=--dns-result-order=ipv4first npx tsx scripts/migrate/apply-content-badges-migration.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const TOKEN = process.env.SUPABASE_MGMT_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF;
if (!TOKEN || !REF) { console.error('Set SUPABASE_MGMT_TOKEN and SUPABASE_PROJECT_REF'); process.exit(1); }
const MGMT_URL = `https://api.supabase.com/v1/projects/${REF}/database/query`;
const MIGRATION = '20260629030000_add_content_badges';
const sqlPath = path.resolve(__dirname, `../../packages/db/prisma/migrations/${MIGRATION}/migration.sql`);
const sql = fs.readFileSync(sqlPath, 'utf-8');
const checksum = crypto.createHash('sha256').update(sql).digest('hex');

async function q(query: string) {
  const r = await fetch(MGMT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!r.ok) throw new Error(`Mgmt API ${r.status}: ${await r.text()}`);
  return r.json();
}

async function main() {
  console.log('Applying ALTER TABLE statements (idempotent IF NOT EXISTS)...');
  await q(`
    ALTER TABLE "Lesson" ADD COLUMN IF NOT EXISTS "badges" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
    ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "badges" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
  `);
  console.log('Recording _prisma_migrations row...');
  await q(`
    INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
    SELECT gen_random_uuid()::text, '${checksum}', NOW(), '${MIGRATION}', NULL, NULL, NOW(), 1
    WHERE NOT EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name = '${MIGRATION}');
  `);
  console.log('Verifying...');
  const v = await q(`
    SELECT
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Lesson' AND column_name='badges') AS lesson_ok,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Job' AND column_name='badges') AS job_ok,
      EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name='${MIGRATION}') AS recorded;
  `);
  console.log(JSON.stringify(v, null, 2));
}
main().catch((e) => { console.error(e.message); process.exit(1); });
```
- [ ] Manually review `migration.sql`: `grep -E 'DROP|TRUNCATE|ALTER COLUMN.*TYPE' migration.sql` → 0 matches (additive only).
- [ ] Run apply script with the Mgmt token (owner supplies `SUPABASE_MGMT_TOKEN`; ref `saecuecevicwjkpmaoot`). Expected verify output: `lesson_ok: true, job_ok: true, recorded: true`.
- [ ] Sanity: `npx tsx -e "import {PrismaClient} from '@prisma/client'; const p=new PrismaClient(); p.lesson.findFirst({select:{id:true,badges:true}}).then(x=>{console.log(x);return p.$disconnect()})"` (with `.env`). Expected: object with `badges: []`.
- [ ] Commit: `git add packages/db/prisma/migrations scripts/migrate && git commit -m "feat(storefront): additive badges migration applied to prod via mgmt api"`.

### Task 4: Programmatic seed of first badge batch — `scripts/seed/seed-content-badges.ts`

**Files:**
- Create: `scripts/seed/seed-content-badges.ts`

Steps:
- [ ] Create the seed (mirror `seed-ads-playbooks.ts` conventions; default DRY, write only with `--apply`; updates ONLY listed rows):
```typescript
/**
 * Программный сид первой пачки редакторских тегов (storefront badges) на уроки/джобы.
 * БЕЗОПАСЕН: обновляет ТОЛЬКО перечисленные ниже строки. По умолчанию dry-run.
 * Запуск:
 *   NODE_OPTIONS=--dns-result-order=ipv4first npx tsx scripts/seed/seed-content-badges.ts            # dry-run
 *   NODE_OPTIONS=--dns-result-order=ipv4first npx tsx scripts/seed/seed-content-badges.ts --apply    # запись
 * Теги: START | NEW | HOT | QUICK (см. таксономию в spec).
 */
import { PrismaClient } from '@prisma/client';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const APPLY = process.argv.includes('--apply');

// ── Конфиг: owner заполняет реальными id/slug. Примеры ниже — ЗАМЕНИТЬ. ──
// Урок: ключ = Lesson.id (вид "01_analytics_m01_start_001").
const LESSON_BADGES: Record<string, string[]> = {
  '01_analytics_m01_start_001': ['START'],   // EXAMPLE — заменить на реальный стартовый урок
  '02_ads_m01_intro_001': ['NEW', 'QUICK'],  // EXAMPLE
};
// Джоба: ключ = Job.slug.
const JOB_BADGES: Record<string, string[]> = {
  'poschitat-yunit-ekonomiku-tovara': ['HOT'], // EXAMPLE — заменить на реальный slug
};

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log(`${APPLY ? '' : '[DRY-RUN] '}Уроки (${Object.keys(LESSON_BADGES).length}):`);
    for (const [id, badges] of Object.entries(LESSON_BADGES)) {
      const lesson = await prisma.lesson.findUnique({ where: { id }, select: { id: true, title: true } });
      if (!lesson) { console.log(`  ⚠ урок не найден: ${id} (пропуск)`); continue; }
      console.log(`  ${badges.join(',').padEnd(12)} ← ${lesson.title}`);
      if (APPLY) await prisma.lesson.update({ where: { id }, data: { badges } });
    }
    console.log(`\n${APPLY ? '' : '[DRY-RUN] '}Джобы (${Object.keys(JOB_BADGES).length}):`);
    for (const [slug, badges] of Object.entries(JOB_BADGES)) {
      const job = await prisma.job.findUnique({ where: { slug }, select: { slug: true, title: true } });
      if (!job) { console.log(`  ⚠ джоба не найдена: ${slug} (пропуск)`); continue; }
      console.log(`  ${badges.join(',').padEnd(12)} ← ${job.title}`);
      if (APPLY) await prisma.job.update({ where: { slug }, data: { badges } });
    }
    console.log(`\n${APPLY ? 'Готово.' : '[DRY-RUN] Ничего не записано. Запусти с --apply.'}`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
```
- [ ] Run dry-run: `NODE_OPTIONS=--dns-result-order=ipv4first npx tsx scripts/seed/seed-content-badges.ts`. Expected: prints rows, `[DRY-RUN] Ничего не записано`. (Examples may warn "не найден" until owner fills real ids — acceptable at this stage.)
- [ ] Commit: `git add scripts/seed/seed-content-badges.ts && git commit -m "feat(storefront): idempotent seed-content-badges script (dry-run default)"`. (Owner runs `--apply` with real ids before the local review gate in Wave 3.)

---

## Wave 2 — Лента (storefront feed)

### Task 5: Pure shelf utilities — `storefront-shelves.ts` + unit tests (TDD)

**Files:**
- Create: `packages/api/src/utils/storefront-shelves.ts`
- Test: `packages/api/src/utils/__tests__/storefront-shelves.test.ts`

Steps:
- [ ] Write failing test `packages/api/src/utils/__tests__/storefront-shelves.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { GOAL_TO_AXES, GOAL_LABELS, goalShelfKey, newShelfKey, resolveShelfKey } from '../storefront-shelves';

describe('GOAL_TO_AXES', () => {
  it('ADS→MARKETING, SALES→[MARKETING,ANALYTICS], NEW_MARKETPLACE→[]', () => {
    expect(GOAL_TO_AXES.ADS).toEqual(['MARKETING']);
    expect(GOAL_TO_AXES.CONTENT).toEqual(['CONTENT']);
    expect(GOAL_TO_AXES.ANALYTICS).toEqual(['ANALYTICS']);
    expect(GOAL_TO_AXES.OPERATIONS).toEqual(['OPERATIONS']);
    expect(GOAL_TO_AXES.FINANCE).toEqual(['FINANCE']);
    expect(GOAL_TO_AXES.SALES).toEqual(['MARKETING', 'ANALYTICS']);
    expect(GOAL_TO_AXES.NEW_MARKETPLACE).toEqual([]);
  });
  it('every goal has a label', () => {
    for (const g of Object.keys(GOAL_TO_AXES)) expect(GOAL_LABELS[g]).toBeTruthy();
  });
});

describe('shelf key helpers', () => {
  it('builds keys', () => {
    expect(goalShelfKey('ADS')).toBe('goal-ads');
    expect(newShelfKey('WB')).toBe('new-wb');
  });
  it('resolveShelfKey round-trips', () => {
    expect(resolveShelfKey('start')).toEqual({ type: 'badge', badge: 'START' });
    expect(resolveShelfKey('quick')).toEqual({ type: 'badge', badge: 'QUICK' });
    expect(resolveShelfKey('hot')).toEqual({ type: 'badge', badge: 'HOT' });
    expect(resolveShelfKey('continue')).toEqual({ type: 'continue' });
    expect(resolveShelfKey('goal-ads')).toEqual({ type: 'goal', goal: 'ADS' });
    expect(resolveShelfKey('new')).toEqual({ type: 'new' });
    expect(resolveShelfKey('new-ozon')).toEqual({ type: 'new', marketplace: 'OZON' });
    expect(resolveShelfKey('garbage')).toBeNull();
  });
});
```
- [ ] Run `cd packages/api && npx vitest run src/utils/__tests__/storefront-shelves.test.ts`. Expected: FAIL (module not found).
- [ ] Implement `packages/api/src/utils/storefront-shelves.ts`:
```typescript
// Pure storefront shelf utilities. No Prisma, no IO — unit-tested in isolation.

/** goal (UserProfile.goals) → Job.axes / SkillCategory. NEW_MARKETPLACE handled via START badge. */
export const GOAL_TO_AXES: Record<string, string[]> = {
  ADS: ['MARKETING'],
  CONTENT: ['CONTENT'],
  ANALYTICS: ['ANALYTICS'],
  OPERATIONS: ['OPERATIONS'],
  FINANCE: ['FINANCE'],
  SALES: ['MARKETING', 'ANALYTICS'],
  NEW_MARKETPLACE: [],
};

export const GOAL_LABELS: Record<string, string> = {
  ADS: 'Реклама',
  CONTENT: 'Контент',
  ANALYTICS: 'Аналитика',
  OPERATIONS: 'Операции',
  FINANCE: 'Финансы',
  SALES: 'Продажи',
  NEW_MARKETPLACE: 'Новый маркетплейс',
};

export const MARKETPLACE_LABELS: Record<string, string> = { WB: 'Wildberries', OZON: 'Ozon' };

export function goalShelfKey(goal: string): string {
  return `goal-${goal.toLowerCase()}`;
}
export function newShelfKey(marketplace: string): string {
  return `new-${marketplace.toLowerCase()}`;
}

export type ShelfSpec =
  | { type: 'badge'; badge: string }
  | { type: 'continue' }
  | { type: 'goal'; goal: string }
  | { type: 'new'; marketplace?: string };

/** Parse a shelfKey back into its build spec (used by getCollection). */
export function resolveShelfKey(shelfKey: string): ShelfSpec | null {
  if (shelfKey === 'start') return { type: 'badge', badge: 'START' };
  if (shelfKey === 'quick') return { type: 'badge', badge: 'QUICK' };
  if (shelfKey === 'hot') return { type: 'badge', badge: 'HOT' };
  if (shelfKey === 'continue') return { type: 'continue' };
  if (shelfKey === 'new') return { type: 'new' };
  if (shelfKey.startsWith('new-')) return { type: 'new', marketplace: shelfKey.slice(4).toUpperCase() };
  if (shelfKey.startsWith('goal-')) return { type: 'goal', goal: shelfKey.slice(5).toUpperCase() };
  return null;
}
```
- [ ] Run the test again. Expected: PASS (all green).
- [ ] Commit: `git commit -am "feat(storefront): pure shelf utilities (goal→axes map, shelf keys)"`.

### Task 6: `dashboard.getStorefront` builder + router + register + tests (TDD)

**Files:**
- Create: `packages/api/src/routers/dashboard.ts`
- Modify: `packages/api/src/root.ts`
- Create: shared types `StorefrontShelf` / `StorefrontItem` in `packages/shared/src/types/index.ts` (after `JobCatalogAxis`, `:414`)
- Test: `packages/api/src/routers/__tests__/dashboard.test.ts`

Steps:
- [ ] Add shared types in `packages/shared/src/types/index.ts` after `JobCatalogAxis`:
```typescript
export type StorefrontItem =
  | { kind: 'job'; job: JobSummary }
  | { kind: 'lesson'; lesson: LessonWithProgress };

export interface StorefrontShelf {
  shelfKey: string;
  title: string;
  marketplace?: JobMarketplace;
  items: StorefrontItem[]; // capped per shelf (≤12; «start» ≤3)
  totalCount: number;      // full count before cap → drives «Смотреть все (N)»
}
```
- [ ] Write failing test `packages/api/src/routers/__tests__/dashboard.test.ts` (mirror `job.test.ts` harness):
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dashboardRouter } from '../dashboard';

// isFeatureEnabled reads the GLOBAL prisma (not ctx) → mock it so unit tests don't hit prod DB.
vi.mock('../../utils/feature-flags', () => ({
  isFeatureEnabled: vi.fn().mockResolvedValue(true),
}));

function makeCtx(over: Partial<{
  goals: string[]; marketplaces: string[];
  jobs: any[]; badgedLessons: any[]; inProgress: any[];
}> = {}) {
  const o = { goals: [], marketplaces: [], jobs: [], badgedLessons: [], inProgress: [], ...over };
  return {
    user: { id: 'user-1' },
    prisma: {
      userProfile: { findUnique: vi.fn().mockResolvedValue({ goals: o.goals, marketplaces: o.marketplaces, lastActiveAt: new Date() }), update: vi.fn() },
      job: { findMany: vi.fn().mockResolvedValue(o.jobs) },
      lesson: { findMany: vi.fn().mockResolvedValue(o.badgedLessons) },
      lessonProgress: { findMany: vi.fn().mockResolvedValue(o.inProgress) },
      subscription: { findMany: vi.fn().mockResolvedValue([]) },
      jobLesson: { findMany: vi.fn().mockResolvedValue([]) }, // used by getFirstJobLessonIds(ctx.prisma)
    },
  } as any;
}
function lesson(id: string, badges: string[], courseId = '02_ads') {
  return { id, courseId, title: id, description: '', videoUrl: '', videoId: null, duration: 5, order: 1, skillCategory: 'MARKETING', skillLevel: 'EASY', badges, isHidden: false, progress: [], course: { title: 'C', isHidden: false } };
}
function job(slug: string, axes: string[], badges: string[], marketplace = 'WB') {
  return { id: slug, slug, title: slug, description: '', marketplace, axes, badges, lessons: [] };
}

beforeEach(() => vi.clearAllMocks());

describe('dashboard.getStorefront', () => {
  it('empty badges + no goals + no progress → no shelves', async () => {
    const res = await dashboardRouter.createCaller(makeCtx()).getStorefront();
    expect(res).toEqual([]);
  });

  it('START lesson → «Начни отсюда» shelf, capped at 3', async () => {
    const badgedLessons = [lesson('l1', ['START']), lesson('l2', ['START']), lesson('l3', ['START']), lesson('l4', ['START'])];
    const res = await dashboardRouter.createCaller(makeCtx({ badgedLessons })).getStorefront();
    const start = res.find((s) => s.shelfKey === 'start')!;
    expect(start.title).toBe('Начни отсюда');
    expect(start.items).toHaveLength(3);
    expect(start.totalCount).toBe(4);
  });

  it('goal ADS → goal-ads shelf with MARKETING jobs', async () => {
    const jobs = [job('ads-1', ['MARKETING'], []), job('an-1', ['ANALYTICS'], [])];
    const res = await dashboardRouter.createCaller(makeCtx({ goals: ['ADS'], jobs })).getStorefront();
    const g = res.find((s) => s.shelfKey === 'goal-ads')!;
    expect(g.title).toBe('Под твою задачу: Реклама');
    expect(g.items.map((i) => (i.kind === 'job' ? i.job.slug : ''))).toContain('ads-1');
    expect(g.items.map((i) => (i.kind === 'job' ? i.job.slug : ''))).not.toContain('an-1');
  });

  it('NEW + marketplaces [WB,OZON] → two new-<mp> shelves', async () => {
    const badgedLessons = [lesson('w', ['NEW'], '02_ads'), lesson('o', ['NEW'], '05_ozon')];
    const res = await dashboardRouter.createCaller(makeCtx({ marketplaces: ['WB', 'OZON'], badgedLessons })).getStorefront();
    expect(res.find((s) => s.shelfKey === 'new-wb')).toBeTruthy();
    expect(res.find((s) => s.shelfKey === 'new-ozon')).toBeTruthy();
  });
});
```
- [ ] Run `cd packages/api && npx vitest run src/routers/__tests__/dashboard.test.ts`. Expected: FAIL (no module).
- [ ] Implement `packages/api/src/routers/dashboard.ts`:
```typescript
import { router, protectedProcedure } from '../trpc';
import { handleDatabaseError } from '../utils/db-errors';
import {
  getUserActiveSubscriptions, getUserAdminBypass, isLessonAccessible, getFirstJobLessonIds,
} from '../utils/access';
import { isFeatureEnabled } from '../utils/feature-flags';
import { filterByMarketplace } from './job';
import { GOAL_TO_AXES, GOAL_LABELS, MARKETPLACE_LABELS, goalShelfKey, newShelfKey } from '../utils/storefront-shelves';
import type { JobSummary, LessonWithProgress, StorefrontShelf, StorefrontItem } from '@mpstats/shared';

const SHELF_CAP = 12;
const START_CAP = 3;

function lessonMarketplace(courseId: string): 'WB' | 'OZON' {
  return courseId === '05_ozon' ? 'OZON' : 'WB';
}

export const dashboardRouter = router({
  getStorefront: protectedProcedure.query(async ({ ctx }): Promise<StorefrontShelf[]> => {
    try {
      const userId = ctx.user.id;
      const [profile, jobsRaw, badgedLessons, inProgressRaw, subs, isAdminBypass, billingEnabled] = await Promise.all([
        ctx.prisma.userProfile.findUnique({ where: { id: userId }, select: { goals: true, marketplaces: true } }),
        ctx.prisma.job.findMany({
          where: { isPublished: true },
          include: { lessons: { where: { lesson: { isHidden: false, course: { isHidden: false } } }, include: { lesson: { include: { progress: { where: { path: { userId } } } } } } } },
        }),
        ctx.prisma.lesson.findMany({
          where: { isHidden: false, course: { isHidden: false, partnerKey: null }, NOT: { badges: { isEmpty: true } } },
          include: { progress: { where: { path: { userId } } }, course: { select: { title: true } } },
        }),
        ctx.prisma.lessonProgress.findMany({
          where: { path: { userId }, status: 'IN_PROGRESS', lesson: { isHidden: false, course: { isHidden: false, partnerKey: null } } },
          include: { lesson: { include: { course: { select: { title: true } } } } },
          orderBy: { lesson: { order: 'asc' } },
        }),
        getUserActiveSubscriptions(userId, ctx.prisma),
        getUserAdminBypass(userId, ctx.prisma),
        isFeatureEnabled('billing_enabled'),
      ]);

      const firstJobLessonIds = await getFirstJobLessonIds(ctx.prisma);
      const goals = (profile?.goals ?? []) as string[];
      const marketplaces = ((profile?.marketplaces ?? []) as string[]).filter((m) => m === 'WB' || m === 'OZON');

      const lockedOf = (l: { id: string; order: number; courseId: string }) =>
        !isLessonAccessible({ order: l.order, courseId: l.courseId }, subs, billingEnabled, isAdminBypass, firstJobLessonIds.has(l.id));

      const toJobItem = (j: any): StorefrontItem => {
        const lessons = j.lessons;
        const summary: JobSummary = {
          id: j.id, slug: j.slug, title: j.title, description: j.description,
          marketplace: j.marketplace, axes: (j.axes as string[]) ?? [],
          lessonCount: lessons.length,
          totalDurationMin: lessons.reduce((s: number, jl: any) => s + (jl.lesson.duration ?? 0), 0),
          completedLessons: lessons.filter((jl: any) => jl.lesson.progress.some((p: any) => p.status === 'COMPLETED')).length,
          isRecommended: false, isInTrack: false, badges: (j.badges as string[]) ?? [],
        };
        return { kind: 'job', job: summary };
      };
      const toLessonItem = (l: any): StorefrontItem => {
        const ld: LessonWithProgress = {
          id: l.id, courseId: l.courseId, title: l.title, description: l.description,
          videoUrl: l.videoUrl || '', videoId: l.videoId, duration: l.duration || 0, order: l.order,
          skillCategory: l.skillCategory, skillLevel: l.skillLevel, isHidden: false,
          status: (l.progress?.[0]?.status || 'NOT_STARTED'),
          watchedPercent: l.progress?.[0]?.watchedPercent || 0,
          locked: lockedOf(l), badges: (l.badges as string[]) ?? [],
        } as unknown as LessonWithProgress;
        return { kind: 'lesson', lesson: ld };
      };

      const cap = (items: StorefrontItem[], n: number, shelfKey: string, title: string, marketplace?: 'WB' | 'OZON'): StorefrontShelf | null => {
        if (items.length === 0) return null;
        return { shelfKey, title, marketplace, items: items.slice(0, n), totalCount: items.length };
      };

      const visibleJobs = (mp?: 'WB' | 'OZON') =>
        (mp ? filterByMarketplace(jobsRaw as any[], mp) : jobsRaw);
      const lessonsWithBadge = (b: string) => badgedLessons.filter((l) => (l.badges as string[]).includes(b));
      const jobsWithBadge = (b: string) => jobsRaw.filter((j) => (j.badges as string[]).includes(b));

      const shelves: (StorefrontShelf | null)[] = [];

      // 1. Начни отсюда (START, mix, ≤3)
      shelves.push(cap(
        [...jobsWithBadge('START').map(toJobItem), ...lessonsWithBadge('START').map(toLessonItem)],
        START_CAP, 'start', 'Начни отсюда',
      ));

      // 2. Продолжить (IN_PROGRESS lessons)
      shelves.push(cap(
        inProgressRaw.map((p: any) => toLessonItem({ ...p.lesson, progress: [{ status: p.status, watchedPercent: p.watchedPercent }] })),
        SHELF_CAP, 'continue', 'Продолжить',
      ));

      // 3. Под твою задачу: {goal} (one per goal)
      for (const goal of goals) {
        const axes = GOAL_TO_AXES[goal] ?? [];
        let items: StorefrontItem[];
        if (axes.length === 0) {
          // NEW_MARKETPLACE → START-tagged beginner content
          items = [...jobsWithBadge('START').map(toJobItem), ...lessonsWithBadge('START').map(toLessonItem)];
        } else {
          const axisJobs = jobsRaw.filter((j) => ((j.axes as string[]) ?? []).some((a) => axes.includes(a)));
          const axisLessons = badgedLessons.filter((l) => axes.includes(l.skillCategory));
          items = [...axisJobs.map(toJobItem), ...axisLessons.map(toLessonItem)];
        }
        shelves.push(cap(items, SHELF_CAP, goalShelfKey(goal), `Под твою задачу: ${GOAL_LABELS[goal] ?? goal}`));
      }

      // 4. Новое на {marketplace} (NEW + marketplace split)
      const newLessons = lessonsWithBadge('NEW');
      const newJobs = jobsWithBadge('NEW');
      if (marketplaces.length === 0) {
        shelves.push(cap([...newJobs.map(toJobItem), ...newLessons.map(toLessonItem)], SHELF_CAP, 'new', 'Новое на платформе'));
      } else {
        for (const mp of marketplaces) {
          const items = [
            ...filterByMarketplace(newJobs as any[], mp).map(toJobItem),
            ...newLessons.filter((l) => lessonMarketplace(l.courseId) === mp).map(toLessonItem),
          ];
          shelves.push(cap(items, SHELF_CAP, newShelfKey(mp), `Новое на ${MARKETPLACE_LABELS[mp] ?? mp}`, mp));
        }
      }

      // 5. Быстрые победы (QUICK)
      shelves.push(cap([...jobsWithBadge('QUICK').map(toJobItem), ...lessonsWithBadge('QUICK').map(toLessonItem)], SHELF_CAP, 'quick', 'Быстрые победы'));

      // 6. Хит платформы (HOT)
      shelves.push(cap([...jobsWithBadge('HOT').map(toJobItem), ...lessonsWithBadge('HOT').map(toLessonItem)], SHELF_CAP, 'hot', 'Хит платформы'));

      return shelves.filter((s): s is StorefrontShelf => s !== null);
    } catch (e) {
      throw handleDatabaseError(e);
    }
  }),
});
```
- [ ] Register in `packages/api/src/root.ts`: add `import { dashboardRouter } from './routers/dashboard';` after the `partnerRouter` import, and `dashboard: dashboardRouter,` inside `appRouter`.
- [ ] Run `cd packages/api && npx vitest run src/routers/__tests__/dashboard.test.ts`. Expected: PASS.
- [ ] Run `pnpm --filter @mpstats/api typecheck`. Expected: no errors. (Helper signatures VERIFIED: `getUserActiveSubscriptions(userId, prisma)`, `getUserAdminBypass(userId, prisma)`, `getFirstJobLessonIds(prisma)`, `await isFeatureEnabled('billing_enabled')` — already correct in code above.)
- [ ] Commit: `git commit -am "feat(storefront): dashboard.getStorefront builder + StorefrontShelf types + router register"`.

### Task 7: Badge pills on JobCard + LessonCard + pure `deriveBadgePills` (TDD)

**Files:**
- Create: `apps/web/src/components/learning/badge-utils.ts`
- Test: `apps/web/tests/unit/badge-utils.test.ts`
- Modify: `apps/web/src/components/learning/JobCard.tsx`, `apps/web/src/components/learning/LessonCard.tsx`

Steps:
- [ ] Write failing test `apps/web/tests/unit/badge-utils.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { deriveBadgePills } from '@/components/learning/badge-utils';

describe('deriveBadgePills', () => {
  it('undefined / empty → no pills', () => {
    expect(deriveBadgePills(undefined)).toEqual([]);
    expect(deriveBadgePills([])).toEqual([]);
  });
  it('START is not rendered as a visible pill', () => {
    expect(deriveBadgePills(['START'])).toEqual([]);
  });
  it('NEW→blue, HOT→red, QUICK→amber «5 мин»', () => {
    expect(deriveBadgePills(['NEW'])).toEqual([{ key: 'NEW', label: 'NEW', tone: 'blue' }]);
    expect(deriveBadgePills(['HOT'])).toEqual([{ key: 'HOT', label: 'HOT', tone: 'red' }]);
    expect(deriveBadgePills(['QUICK'])).toEqual([{ key: 'QUICK', label: '5 мин', tone: 'amber' }]);
  });
  it('stable order NEW,HOT,QUICK', () => {
    expect(deriveBadgePills(['QUICK', 'HOT', 'NEW']).map((p) => p.key)).toEqual(['NEW', 'HOT', 'QUICK']);
  });
});
```
- [ ] Run `cd apps/web && npx vitest run tests/unit/badge-utils.test.ts`. Expected: FAIL.
- [ ] Implement `apps/web/src/components/learning/badge-utils.ts`:
```typescript
export type BadgeTone = 'blue' | 'red' | 'amber';
export interface BadgePill { key: string; label: string; tone: BadgeTone; }

/** START is a shelf-routing tag, not a visible pill (see spec taxonomy). */
export function deriveBadgePills(badges: string[] | undefined): BadgePill[] {
  if (!badges || badges.length === 0) return [];
  const pills: BadgePill[] = [];
  if (badges.includes('NEW')) pills.push({ key: 'NEW', label: 'NEW', tone: 'blue' });
  if (badges.includes('HOT')) pills.push({ key: 'HOT', label: 'HOT', tone: 'red' });
  if (badges.includes('QUICK')) pills.push({ key: 'QUICK', label: '5 мин', tone: 'amber' });
  return pills;
}

export const BADGE_TONE_CLASS: Record<BadgeTone, string> = {
  blue: 'bg-mp-blue-50 text-mp-blue-600',
  red: 'bg-red-50 text-red-600',
  amber: 'bg-amber-50 text-amber-700',
};
```
- [ ] Run the test again. Expected: PASS.
- [ ] Edit `JobCard.tsx` — import `{ deriveBadgePills, BADGE_TONE_CLASS }` from `./badge-utils`; in the card header (near title) render:
```tsx
{deriveBadgePills(job.badges).length > 0 && (
  <div className="flex gap-1 mb-2">
    {deriveBadgePills(job.badges).map((p) => (
      <span key={p.key} className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${BADGE_TONE_CLASS[p.tone]}`}>{p.label}</span>
    ))}
  </div>
)}
```
- [ ] Edit `LessonCard.tsx` — same import; render the identical pill block near the lesson title using `lesson.badges`.
- [ ] Run `cd apps/web && npx vitest run tests/unit/badge-utils.test.ts` + `pnpm --filter web typecheck`. Expected: PASS / no errors.
- [ ] Commit: `git commit -am "feat(storefront): badge pills on JobCard and LessonCard (NEW/HOT/QUICK)"`.

### Task 8: Shelf carousel component + `arrowVisibility` helper (TDD on helper)

**Files:**
- Create: `apps/web/src/components/learning/shelf-utils.ts`
- Test: `apps/web/tests/unit/shelf-utils.test.ts`
- Create: `apps/web/src/components/learning/Shelf.tsx`

Steps:
- [ ] Write failing test `apps/web/tests/unit/shelf-utils.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { arrowVisibility } from '@/components/learning/shelf-utils';

describe('arrowVisibility', () => {
  it('at start → left hidden, right shown', () => {
    expect(arrowVisibility(0, 1000, 400)).toEqual({ left: false, right: true });
  });
  it('mid-scroll → both shown', () => {
    expect(arrowVisibility(300, 1000, 400)).toEqual({ left: true, right: true });
  });
  it('at end → left shown, right hidden', () => {
    expect(arrowVisibility(600, 1000, 400)).toEqual({ left: true, right: false });
  });
  it('content fits (no overflow) → both hidden', () => {
    expect(arrowVisibility(0, 400, 400)).toEqual({ left: false, right: false });
  });
});
```
- [ ] Run `cd apps/web && npx vitest run tests/unit/shelf-utils.test.ts`. Expected: FAIL.
- [ ] Implement `apps/web/src/components/learning/shelf-utils.ts`:
```typescript
export interface ArrowState { left: boolean; right: boolean; }

/** Smart-arrow visibility from scroll metrics. 1px tolerance for sub-pixel rounding. */
export function arrowVisibility(scrollLeft: number, scrollWidth: number, clientWidth: number): ArrowState {
  const overflows = scrollWidth > clientWidth + 1;
  if (!overflows) return { left: false, right: false };
  const atStart = scrollLeft <= 1;
  const atEnd = scrollLeft + clientWidth >= scrollWidth - 1;
  return { left: !atStart, right: !atEnd };
}
```
- [ ] Run the test again. Expected: PASS.
- [ ] Implement `apps/web/src/components/learning/Shelf.tsx` (client component; horizontal carousel + smart arrows + «Смотреть все»):
```tsx
'use client';
import { useRef, useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import type { StorefrontShelf } from '@mpstats/shared';
import { JobCard } from './JobCard';
import { LessonCard } from './LessonCard';
import { arrowVisibility, type ArrowState } from './shelf-utils';

export function Shelf({ shelf }: { shelf: StorefrontShelf }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [arrows, setArrows] = useState<ArrowState>({ left: false, right: true });

  const recompute = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setArrows(arrowVisibility(el.scrollLeft, el.scrollWidth, el.clientWidth));
  }, []);

  useEffect(() => { recompute(); }, [recompute, shelf.items.length]);

  const scrollBy = (dir: 1 | -1) => {
    const el = scroller.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  const collectionHref = `/dashboard/collection/${shelf.shelfKey}`;

  return (
    <section className="relative">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-heading font-semibold">{shelf.title}</h2>
        {shelf.totalCount > shelf.items.length && (
          <Link href={collectionHref} className="text-body-sm text-mp-blue-600 hover:underline">
            Смотреть все ({shelf.totalCount}) →
          </Link>
        )}
      </div>
      <div className="relative">
        {arrows.left && (
          <button aria-label="Назад" onClick={() => scrollBy(-1)} className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-white shadow-mp-card flex items-center justify-center">‹</button>
        )}
        <div ref={scroller} onScroll={recompute} className="flex gap-4 overflow-x-auto scroll-smooth snap-x pb-2 no-scrollbar">
          {shelf.items.map((it) => (
            <div key={it.kind === 'job' ? `j-${it.job.id}` : `l-${it.lesson.id}`} className="snap-start shrink-0 w-[300px]">
              {it.kind === 'job' ? <JobCard job={it.job} /> : <LessonCard lesson={it.lesson} locked={it.lesson.locked} />}
            </div>
          ))}
          {shelf.totalCount > shelf.items.length && (
            <Link href={collectionHref} className="snap-start shrink-0 w-[160px] flex items-center justify-center rounded-2xl border-2 border-dashed border-mp-gray-200 text-mp-blue-600 text-body-sm">
              Смотреть все ({shelf.totalCount}) →
            </Link>
          )}
        </div>
        {arrows.right && (
          <button aria-label="Вперёд" onClick={() => scrollBy(1)} className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-white shadow-mp-card flex items-center justify-center">›</button>
        )}
      </div>
    </section>
  );
}
```
- [ ] Run `pnpm --filter web typecheck`. Expected: no errors.
- [ ] Commit: `git commit -am "feat(storefront): Shelf carousel component + arrowVisibility helper"`.

### Task 9: Redesign /dashboard — render shelves, strip radar/avg/recent-activity

**Files:**
- Modify: `apps/web/src/app/(main)/dashboard/page.tsx`

Steps:
- [ ] Edit `dashboard/page.tsx`: add `const storefront = trpc.dashboard.getStorefront.useQuery();` alongside the existing dashboard query, and import `{ Shelf }` from `@/components/learning/Shelf`.
- [ ] Remove the JSX blocks: recent-activity card (`:232-266`), Skill Radar card (`:271-297`), Average-score card (`:300-314`). Remove now-unused import `SkillRadarChart` from `@/components/charts/RadarChart` (line 10).
- [ ] Insert the shelf feed below the kept entry zone (after diagnostic entry / next-lesson, replacing the removed right-column grid):
```tsx
{/* Zone 2 — Лента полок */}
<div className="space-y-8 mt-8">
  {storefront.isLoading && <div className="text-body-sm text-mp-gray-500">Загружаем рекомендации…</div>}
  {storefront.data?.map((shelf) => <Shelf key={shelf.shelfKey} shelf={shelf} />)}
  {storefront.data && storefront.data.length === 0 && (
    <div className="text-center py-10 text-body-sm text-mp-gray-500">
      Пройди <Link href="/diagnostic" className="text-mp-blue-600">диагностику</Link>, чтобы собрать персональную ленту.
    </div>
  )}
</div>
```
- [ ] If the removed sections leave a now-empty grid wrapper (e.g. `lg:grid-cols-3` at `:199`), collapse it to a single-column flow so the kept hero/buttons/diagnostic/next-lesson stack cleanly above the shelves.
- [ ] Run `pnpm --filter web typecheck` + `pnpm --filter web test -- run` (existing dashboard tests if any). Expected: no errors / green.
- [ ] Manual smoke: `pnpm dev` → open `/dashboard` (reads PROD Supabase). Confirm shelves render, radar/avg/recent-activity gone. (Shelves may be sparse until owner runs `seed-content-badges --apply`.)
- [ ] Commit: `git commit -am "feat(storefront): /dashboard renders shelf feed; remove radar/avg-score/recent-activity"`.

---

## Wave 3 — Глубина (collection page + library filters)

### Task 10: `dashboard.getCollection` builder + tests (TDD)

**Files:**
- Modify: `packages/api/src/routers/dashboard.ts`
- Test: extend `packages/api/src/routers/__tests__/dashboard.test.ts`

Steps:
- [ ] Add failing tests to `dashboard.test.ts`:
```typescript
describe('dashboard.getCollection', () => {
  it('start shelf → full jobs+lessons grouped, no cap', async () => {
    const badgedLessons = [lesson('l1', ['START']), lesson('l2', ['START']), lesson('l3', ['START']), lesson('l4', ['START'])];
    const jobs = [job('j1', ['MARKETING'], ['START'])];
    const res = await dashboardRouter.createCaller(makeCtx({ badgedLessons, jobs })).getCollection({ shelfKey: 'start' });
    expect(res.lessons).toHaveLength(4);     // no 3-cap
    expect(res.jobs).toHaveLength(1);
  });
  it('type=lessons → jobs empty', async () => {
    const badgedLessons = [lesson('l1', ['QUICK'])];
    const jobs = [job('j1', ['MARKETING'], ['QUICK'])];
    const res = await dashboardRouter.createCaller(makeCtx({ badgedLessons, jobs })).getCollection({ shelfKey: 'quick', type: 'lessons' });
    expect(res.jobs).toHaveLength(0);
    expect(res.lessons).toHaveLength(1);
  });
  it('unknown shelfKey → empty groups', async () => {
    const res = await dashboardRouter.createCaller(makeCtx()).getCollection({ shelfKey: 'garbage' });
    expect(res).toEqual({ jobs: [], lessons: [] });
  });
});
```
- [ ] Run `cd packages/api && npx vitest run src/routers/__tests__/dashboard.test.ts`. Expected: new tests FAIL.
- [ ] Implement `getCollection` in `dashboard.ts`. Refactor the shelf-building so `getCollection` reuses the same item-derivation. Add at top: `import { z } from 'zod';` and `import { resolveShelfKey } from '../utils/storefront-shelves';`. Add the procedure:
```typescript
  getCollection: protectedProcedure
    .input(z.object({
      shelfKey: z.string(),
      type: z.enum(['all', 'jobs', 'lessons']).default('all'),
      marketplace: z.enum(['WB', 'OZON']).optional(),
      badge: z.enum(['START', 'NEW', 'HOT', 'QUICK']).optional(),
    }))
    .query(async ({ ctx, input }): Promise<{ jobs: JobSummary[]; lessons: LessonWithProgress[] }> => {
      try {
        const spec = resolveShelfKey(input.shelfKey);
        if (!spec) return { jobs: [], lessons: [] };
        const userId = ctx.user.id;
        const [profile, jobsRaw, badgedLessons, inProgressRaw, subs, isAdminBypass, billingEnabled] = await Promise.all([
          ctx.prisma.userProfile.findUnique({ where: { id: userId }, select: { goals: true, marketplaces: true } }),
          ctx.prisma.job.findMany({ where: { isPublished: true }, include: { lessons: { where: { lesson: { isHidden: false, course: { isHidden: false } } }, include: { lesson: { include: { progress: { where: { path: { userId } } } } } } } } }),
          ctx.prisma.lesson.findMany({ where: { isHidden: false, course: { isHidden: false, partnerKey: null }, NOT: { badges: { isEmpty: true } } }, include: { progress: { where: { path: { userId } } }, course: { select: { title: true } } } }),
          ctx.prisma.lessonProgress.findMany({ where: { path: { userId }, status: 'IN_PROGRESS', lesson: { isHidden: false, course: { isHidden: false, partnerKey: null } } }, include: { lesson: { include: { course: { select: { title: true } } } } }, orderBy: { lesson: { order: 'asc' } } }),
          getUserActiveSubscriptions(userId, ctx.prisma),
          getUserAdminBypass(userId, ctx.prisma),
          isFeatureEnabled('billing_enabled'),
        ]);
        const firstJobLessonIds = await getFirstJobLessonIds(ctx.prisma);
        const lockedOf = (l: any) => !isLessonAccessible({ order: l.order, courseId: l.courseId }, subs, billingEnabled, isAdminBypass, firstJobLessonIds.has(l.id));

        const toSummary = (j: any): JobSummary => ({
          id: j.id, slug: j.slug, title: j.title, description: j.description,
          marketplace: j.marketplace, axes: (j.axes as string[]) ?? [],
          lessonCount: j.lessons.length,
          totalDurationMin: j.lessons.reduce((s: number, jl: any) => s + (jl.lesson.duration ?? 0), 0),
          completedLessons: j.lessons.filter((jl: any) => jl.lesson.progress.some((p: any) => p.status === 'COMPLETED')).length,
          isRecommended: false, isInTrack: false, badges: (j.badges as string[]) ?? [],
        });
        const toLesson = (l: any): LessonWithProgress => ({
          id: l.id, courseId: l.courseId, title: l.title, description: l.description,
          videoUrl: l.videoUrl || '', videoId: l.videoId, duration: l.duration || 0, order: l.order,
          skillCategory: l.skillCategory, skillLevel: l.skillLevel, isHidden: false,
          status: (l.progress?.[0]?.status || 'NOT_STARTED'), watchedPercent: l.progress?.[0]?.watchedPercent || 0,
          locked: lockedOf(l), badges: (l.badges as string[]) ?? [],
        } as unknown as LessonWithProgress);
        const lessonMp = (courseId: string) => (courseId === '05_ozon' ? 'OZON' : 'WB');

        let jobs: any[] = [];
        let lessons: any[] = [];
        if (spec.type === 'badge') {
          jobs = jobsRaw.filter((j) => (j.badges as string[]).includes(spec.badge));
          lessons = badgedLessons.filter((l) => (l.badges as string[]).includes(spec.badge));
        } else if (spec.type === 'continue') {
          lessons = inProgressRaw.map((p: any) => ({ ...p.lesson, progress: [{ status: p.status, watchedPercent: p.watchedPercent }] }));
        } else if (spec.type === 'goal') {
          const axes = GOAL_TO_AXES[spec.goal] ?? [];
          if (axes.length === 0) {
            jobs = jobsRaw.filter((j) => (j.badges as string[]).includes('START'));
            lessons = badgedLessons.filter((l) => (l.badges as string[]).includes('START'));
          } else {
            jobs = jobsRaw.filter((j) => ((j.axes as string[]) ?? []).some((a) => axes.includes(a)));
            lessons = badgedLessons.filter((l) => axes.includes(l.skillCategory));
          }
        } else if (spec.type === 'new') {
          jobs = jobsRaw.filter((j) => (j.badges as string[]).includes('NEW'));
          lessons = badgedLessons.filter((l) => (l.badges as string[]).includes('NEW'));
          const mp = input.marketplace ?? spec.marketplace;
          if (mp) {
            jobs = filterByMarketplace(jobs, mp);
            lessons = lessons.filter((l) => lessonMp(l.courseId) === mp);
          }
        }
        // sub-filter chips
        if (input.badge) {
          jobs = jobs.filter((j) => (j.badges as string[]).includes(input.badge!));
          lessons = lessons.filter((l) => (l.badges as string[]).includes(input.badge!));
        }
        if (input.marketplace && spec.type !== 'new') {
          jobs = filterByMarketplace(jobs, input.marketplace);
          lessons = lessons.filter((l) => lessonMp(l.courseId) === input.marketplace);
        }
        return {
          jobs: input.type === 'lessons' ? [] : jobs.map(toSummary),
          lessons: input.type === 'jobs' ? [] : lessons.map(toLesson),
        };
      } catch (e) {
        throw handleDatabaseError(e);
      }
    }),
```
- [ ] Run `cd packages/api && npx vitest run src/routers/__tests__/dashboard.test.ts`. Expected: all PASS.
- [ ] Run `pnpm --filter @mpstats/api typecheck`. Expected: no errors.
- [ ] Commit: `git commit -am "feat(storefront): dashboard.getCollection builder (grouped jobs+lessons, sub-filters)"`.

### Task 11: Collection page `/dashboard/collection/[shelfKey]`

**Files:**
- Create: `apps/web/src/app/(main)/dashboard/collection/[shelfKey]/page.tsx`

Steps:
- [ ] Create the page (client component; reuses JobCard 3-col + LessonCard 4-col, toggle + chips, reads `useParams`/`useSearchParams`):
```tsx
'use client';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import { JobCard } from '@/components/learning/JobCard';
import { LessonCard } from '@/components/learning/LessonCard';

type ViewType = 'all' | 'jobs' | 'lessons';

export default function CollectionPage() {
  const { shelfKey } = useParams<{ shelfKey: string }>();
  const sp = useSearchParams();
  const router = useRouter();
  const type = (sp.get('type') as ViewType) ?? 'all';
  const marketplace = (sp.get('marketplace') as 'WB' | 'OZON' | null) ?? undefined;
  const badge = (sp.get('badge') as 'START' | 'NEW' | 'HOT' | 'QUICK' | null) ?? undefined;

  const { data, isLoading } = trpc.dashboard.getCollection.useQuery({ shelfKey, type, marketplace, badge });

  const setParam = (k: string, v?: string) => {
    const next = new URLSearchParams(sp.toString());
    if (v && v !== 'all') next.set(k, v); else next.delete(k);
    router.replace(`/dashboard/collection/${shelfKey}?${next.toString()}`);
  };

  const jobs = data?.jobs ?? [];
  const lessons = data?.lessons ?? [];

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      <Link href="/dashboard" className="text-body-sm text-mp-blue-600">‹ Назад на главную</Link>

      <div className="flex flex-wrap gap-2">
        {(['all', 'jobs', 'lessons'] as ViewType[]).map((t) => (
          <button key={t} onClick={() => setParam('type', t)}
            className={`px-3 py-1 rounded-full text-body-sm ${type === t ? 'bg-mp-blue-600 text-white' : 'bg-mp-gray-100 text-mp-gray-600'}`}>
            {t === 'all' ? 'Всё' : t === 'jobs' ? 'Задачи' : 'Уроки'}
          </button>
        ))}
        {/* marketplace + tag chips */}
        {(['WB', 'OZON'] as const).map((mp) => (
          <button key={mp} onClick={() => setParam('marketplace', marketplace === mp ? undefined : mp)}
            className={`px-3 py-1 rounded-full text-body-sm ${marketplace === mp ? 'bg-mp-blue-600 text-white' : 'bg-mp-gray-100 text-mp-gray-600'}`}>
            {mp === 'WB' ? 'Wildberries' : 'Ozon'}
          </button>
        ))}
        {(['NEW', 'HOT', 'QUICK'] as const).map((b) => (
          <button key={b} onClick={() => setParam('badge', badge === b ? undefined : b)}
            className={`px-3 py-1 rounded-full text-body-sm ${badge === b ? 'bg-mp-blue-600 text-white' : 'bg-mp-gray-100 text-mp-gray-600'}`}>
            {b === 'QUICK' ? '5 мин' : b}
          </button>
        ))}
      </div>

      {isLoading && <div className="text-body-sm text-mp-gray-500">Загрузка…</div>}

      {type !== 'lessons' && jobs.length > 0 && (
        <section>
          <h2 className="text-heading font-semibold mb-3">Задачи ({jobs.length})</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {jobs.map((j) => <JobCard key={j.id} job={j} />)}
          </div>
        </section>
      )}

      {type !== 'jobs' && lessons.length > 0 && (
        <section>
          <h2 className="text-heading font-semibold mb-3">Уроки ({lessons.length})</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {lessons.map((l) => <LessonCard key={l.id} lesson={l} locked={l.locked} />)}
          </div>
        </section>
      )}

      {!isLoading && jobs.length === 0 && lessons.length === 0 && (
        <div className="text-center py-10 text-body-sm text-mp-gray-500">Здесь пока пусто.</div>
      )}
    </div>
  );
}
```
- [ ] Run `pnpm --filter web typecheck`. Expected: no errors.
- [ ] Manual smoke (`pnpm dev`): open `/dashboard/collection/start`, toggle `[Всё·Задачи·Уроки]`, click chips → URL params update, grids re-filter. Breadcrumb returns to `/dashboard`.
- [ ] Commit: `git commit -am "feat(storefront): collection page /dashboard/collection/[shelfKey] (grouped grids + toggle + chips)"`.

### Task 12: Re-mount FilterPanel in /learn/library + add badge filter (TDD on filter fn)

**Files:**
- Modify: `apps/web/src/components/learning/FilterPanel.tsx:8-26` (FilterState + DEFAULT_FILTERS + UI control)
- Modify: `apps/web/src/app/(main)/learn/library/page.tsx:39-49` (filtersFromSearchParams), `:120-144` (filterLesson), render FilterPanel
- Test: `apps/web/tests/unit/library-filter-badge.test.ts`

Steps:
- [ ] Add `badge: string;` to `FilterState` (`FilterPanel.tsx:8-16`) and `badge: 'ALL',` to `DEFAULT_FILTERS` (`:18-26`).
- [ ] In `FilterPanel` body add a tag control (mirror existing select-style filters):
```tsx
<div>
  <label className="text-body-sm font-medium">Тег</label>
  <select value={filters.badge} onChange={(e) => onFiltersChange({ ...filters, badge: e.target.value })}
    className="w-full mt-1 border rounded-lg px-2 py-1 text-body-sm">
    <option value="ALL">Все</option>
    <option value="START">Начни отсюда</option>
    <option value="NEW">Новое</option>
    <option value="HOT">Хит</option>
    <option value="QUICK">5 мин</option>
  </select>
</div>
```
- [ ] Update `filtersFromSearchParams` (`library/page.tsx:39-49`) — add `badge: sp.get('badge') ?? 'ALL',`.
- [ ] Write failing test `apps/web/tests/unit/library-filter-badge.test.ts` exercising the badge branch. Since `filterLesson` is local to the page, EXTRACT it to a pure exported helper `filterLessonByState(lesson, filters)` in a new `apps/web/src/components/learning/library-filter.ts` (move the `:120-144` body verbatim, then add the badge branch), and have `page.tsx` import it. Test:
```typescript
import { describe, it, expect } from 'vitest';
import { filterLessonByState } from '@/components/learning/library-filter';
import { DEFAULT_FILTERS } from '@/components/learning/FilterPanel';

const base: any = { skillCategory: 'MARKETING', status: 'NOT_STARTED', duration: 5, topics: [], courseId: '02_ads', badges: ['NEW'] };

describe('filterLessonByState — badge', () => {
  it('badge=ALL → passes', () => {
    expect(filterLessonByState(base, { ...DEFAULT_FILTERS })).toBe(true);
  });
  it('badge=NEW + lesson has NEW → passes', () => {
    expect(filterLessonByState(base, { ...DEFAULT_FILTERS, badge: 'NEW' })).toBe(true);
  });
  it('badge=HOT + lesson lacks HOT → filtered out', () => {
    expect(filterLessonByState(base, { ...DEFAULT_FILTERS, badge: 'HOT' })).toBe(false);
  });
});
```
- [ ] Run `cd apps/web && npx vitest run tests/unit/library-filter-badge.test.ts`. Expected: FAIL.
- [ ] Create `apps/web/src/components/learning/library-filter.ts` exporting `filterLessonByState(lesson, filters)` — the verbatim `:120-144` logic plus, at the end before `return true;`:
```typescript
  if (filters.badge !== 'ALL') {
    const badges = (((lesson as unknown) as Record<string, unknown>).badges as string[] | undefined) ?? [];
    if (!badges.includes(filters.badge)) return false;
  }
```
- [ ] Update `library/page.tsx` to import `filterLessonByState` and `FilterPanel`, replace the inline `filterLesson` with `(l) => filterLessonByState(l, filters)`, and MOUNT `<FilterPanel filters={filters} onFiltersChange={...} availableTopics={...} availableCourses={...} />` in the page layout (it was imported as a type only; render it now). Wire `onFiltersChange` to push params via the existing search-param mechanism.
- [ ] Run the test again + `pnpm --filter web typecheck`. Expected: PASS / no errors.
- [ ] Manual smoke (`pnpm dev`): `/learn/library` shows FilterPanel; selecting a tag filters lessons.
- [ ] Commit: `git commit -am "feat(storefront): re-mount FilterPanel in library + badge tag filter"`.

### Task 13: LOCAL REVIEW GATE — owner reviews full storefront on localhost (HARD BLOCK before deploy)

**Files:** none (review checkpoint)

Steps:
- [ ] Owner runs `seed-content-badges.ts --apply` with real lesson ids / job slugs filled into the config map (this populates the shelves on PROD Supabase, which localhost reads).
- [ ] Run `pnpm dev` (reads PROD Supabase). Owner walks: `/dashboard` (shelves render in spec order; START≤3; «Продолжить» shows IN_PROGRESS; goal/marketplace splits correct; radar/avg/recent-activity gone), smart arrows (left hidden at start, appears after scroll, right hides at end), «Смотреть все (N)» → `/dashboard/collection/[shelfKey]`, collection toggle + chips, `/learn/library` FilterPanel + tag filter, badge pills (NEW blue / HOT red / QUICK «5 мин» amber).
- [ ] Cross-check visual against `docs/design-system/` (product light system).
- [ ] **STOP. Do NOT proceed to deploy until owner gives explicit local OK.** Capture any change requests as follow-up commits, then re-review.

### Task 14: Deploy runbook (gated behind owner local OK)

**Files:** none (ops)

Steps:
- [ ] Pre-flight: `pnpm typecheck` (all packages green), `cd packages/api && npx vitest run` (api green), `cd apps/web && npx vitest run` (web green; ignore the known `yandex-oauth` flake).
- [ ] Request code-review via `superpowers:requesting-code-review` (or a `code-reviewer` subagent) on the full diff; address findings.
- [ ] Staging: `ssh deploy@89.208.106.208 && cd /home/deploy/maal && git fetch && git checkout feature/storefront-dashboard && docker compose -p maal-staging -f docker-compose.staging.yml up -d --build` (force `--no-cache web`). Content-check the bundle for a new marker (e.g. `getStorefront`) inside `/app/apps/web/.next/server/chunks` BEFORE declaring success (node-scan inside container — cyrillic via SSH→docker grep mangles). Smoke `staging.platform.mpstats.academy/dashboard` 200.
- [ ] After staging OK: `ssh deploy@... cd /home/deploy/maal && git checkout master` (MANDATORY before prod deploy).
- [ ] Merge: locally `git checkout master && git merge --no-ff feature/storefront-dashboard` → push. (Branch already carries all commits.)
- [ ] Prod: on VPS `git checkout master && git pull && docker compose build --no-cache web && docker compose up -d` (recreate; old container serves during build). Smoke: `platform.mpstats.academy/` 200, `/api/health` 200, `/dashboard` renders shelves; bundle content-check `getStorefront` present.
- [ ] Rollback if needed: `git revert -m 1 <merge-commit>` + redeploy. (The `badges` columns are additive — no schema rollback needed.)
- [ ] Update `MAAL/CLAUDE.md` status table + memory note (`project_storefront_dashboard.md`).

---

## Self-check coverage map (spec section → task)

- Schema `badges` on Lesson+Job → Task 1, migration via Mgmt API → Task 3.
- Programmatic first tag batch → Task 4 (+ owner `--apply` at Task 13).
- Shelf order + goal→axis map + cold-start empties → Task 5 (map) + Task 6 (builder + empty filtering).
- `/dashboard` redesign + remove radar/avg/recent-activity → Task 9.
- Carousel + smart arrows + «Смотреть все» → Task 8.
- Badge pills (NEW/HOT/QUICK) → Task 7.
- Collection page (grouped grids + toggle + chips + breadcrumb) → Task 11; builder → Task 10.
- FilterPanel re-mount + badge filter → Task 12.
- Local review gate → Task 13; deploy → Task 14.
- NON-SCOPE (admin tag editor, auto-HOT, Lesson.createdAt) → intentionally absent.
