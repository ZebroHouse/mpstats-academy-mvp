# Phase 61: Обучение 2.0 — редизайн раздела — Pattern Map

**Mapped:** 2026-06-03
**Files analyzed:** 12 (5 new + 7 modified)
**Analogs found:** 12 / 12 (all have a strong in-repo analog — brownfield refactor)

> This is an integration/refactor phase. Almost every new artifact has a near-exact analog in MAAL from Phases 55/57/58/60. The planner should copy patterns at the cited file:line, not invent new ones. Where a modified file is the change site, the current-state excerpt shows exactly what to split/wrap.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `packages/api/src/routers/favorite.ts` (NEW) | route (tRPC router) | CRUD | `packages/api/src/routers/material.ts` (`list` read) + `learning.ts:1121` (mutation w/ ctx.user.id) | exact (role + flow) |
| `packages/db/prisma/migrations/<ts>_add_favorite/migration.sql` (NEW) | migration | DDL/additive | `migrations/20260528000000_add_referral_code_table/migration.sql` | exact |
| `apps/web/src/components/learning/FavoriteButton.tsx` (NEW) | component | event-driven (optimistic mutation) | `JobCard.tsx` onAddToTrack + `learn/page.tsx:115` optimistic `onMutate` | role-match (optimistic) |
| `apps/web/src/app/(main)/learn/{plan,solutions,library,favorites}/page.tsx` (NEW) | page (client/server) | request-response | `learn/page.tsx` (lens split) + `layout.tsx` redirect (for `/learn`,`/learn/track`) | exact |
| `scripts/migrate-track-to-favorites.ts` (NEW) | utility (one-off script) | batch/idempotent | `scripts/backfill-referral-codes.ts` | exact |
| `apps/web/src/components/shared/sidebar.tsx` (MOD) | component (nav) | event-driven | self (current flat `navItems` render :116-141) | self (change site) |
| `apps/web/src/components/learning/AgentSearch.tsx` (MOD) | component (search) | request-response | self (current `surface:'learn'` hardcode :35) | self (change site) |
| `packages/api/src/routers/material.ts` (MOD) | route (tRPC) | CRUD read | `material.list` :112-160 (read shape) + `getSignedUrl` ACL :398-492 (do-not-weaken) | self (add `listForUser`) |
| `packages/api/src/routers/learning.ts` (MOD ~:274) | route (tRPC) | CRUD read | self (`getRecommendedPath` :274-333) | self (split plan vs favorites) |
| `apps/web/src/app/(main)/dashboard/page.tsx` (MOD) | page | request-response | self (4 stats :138, 2 CTA cards :180-218) | self (3 entry cards above) |
| `apps/web/src/app/(main)/learn/page.tsx` (MOD) | page | request-response | self (lens toggle :71, :335) | self (split + redirect) |

---

## Pattern Assignments

### `packages/api/src/routers/favorite.ts` (NEW — route, CRUD)

**Analogs:** `material.ts` (router skeleton + zod read), `learning.ts:1121` (`ctx.user.id` scoping, upsert idempotency, TRPCError + `handleDatabaseError`), `referral.ts:20` (nested-router/zod `.strict()` shape).

**Router skeleton + imports** — copy from `material.ts:15-21,109-112`:
```typescript
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { handleDatabaseError } from '../utils/db-errors';

export const favoriteRouter = router({
  // ... add/remove/list/isFavorited below
});
```

**`ctx.user.id` scoping + zod input** — the IDOR-safe pattern (`userId` NEVER from input; always `ctx.user.id`). Mirror `learning.ts:1121-1150` (`addJobToTrack`):
```typescript
addJobToTrack: protectedProcedure
  .input(z.object({ jobId: z.string() }))
  .mutation(async ({ ctx, input }) => {
    try {
      // ... ctx.user.id is the only user scoping source
      await ctx.prisma.learningPath.upsert({
        where: { userId: ctx.user.id },
        create: { userId: ctx.user.id, ... },
        update: { ... },
      });
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      handleDatabaseError(error);
    }
  }),
```
- `favorite.add` → `prisma.favorite.create` (or upsert on `@@unique([userId,itemType,itemId])`) with `userId: ctx.user.id`, `itemType` = zod `z.nativeEnum(FavoriteItemType)`, `itemId` = `z.string().min(1)`.
- `favorite.remove` → `deleteMany({ where: { userId: ctx.user.id, itemType, itemId } })`.
- `favorite.list` → `findMany({ where: { userId: ctx.user.id, itemType? } })`. **D-10 landmine:** when resolving `itemId`→entity (lesson/material), filter `isHidden:false` (+ `course.isHidden:false` for lessons) and SKIP dangling polymorphic refs (RESEARCH Security: app-level integrity).
- `favorite.isFavorited` → batch: input `{ items: {itemType,itemId}[] }`, return a `Set`/map. Seeds heart state in catalogs.

**enum source:** `material.ts:18,72` shows `import { MaterialType } from '@mpstats/db'` + `z.nativeEnum(MaterialType)` — same pattern for the new `FavoriteItemType`.

**Wiring:** register `favoriteRouter` in the app router (same place `materialRouter`/`referralRouter` are mounted — grep the root `_app.ts`/`index.ts`).

---

### `packages/db/prisma/migrations/<ts>_add_favorite/migration.sql` (NEW — migration, additive)

**Analog:** `migrations/20260528000000_add_referral_code_table/migration.sql` (byte-for-byte structural template).

**Copy this structure** (from the referral migration :9-34), adapting to `Favorite`:
```sql
-- additive-only. CREATE TYPE (NEW enum, not ALTER TYPE ADD VALUE — RESEARCH anti-pattern)
CREATE TYPE "FavoriteItemType" AS ENUM ('LESSON', 'JOB', 'MATERIAL');

CREATE TABLE "Favorite" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "itemType"  "FavoriteItemType" NOT NULL,
    "itemId"    TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Favorite_userId_itemType_itemId_key" ON "Favorite"("userId","itemType","itemId");
CREATE INDEX "Favorite_userId_itemType_idx" ON "Favorite"("userId","itemType");

ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

**Critical differences from the referral analog:**
- The referral migration used `ALTER TYPE "ReferralCodeType" ADD VALUE 'AMBASSADOR'` (:7) because it extended an EXISTING enum. `FavoriteItemType` is **new** → use `CREATE TYPE` (RESEARCH anti-pattern: ALTER TYPE ADD VALUE can't be used in same txn).
- `onDelete: Cascade` here (vs referral's `Restrict`/`SetNull`) per D-06 schema.

**schema.prisma back-relation** — add `favorites Favorite[]` to `UserProfile` relations block (`schema.prisma:46-59`), right next to `learningPath LearningPath?` (:48). Additive, existing rows untouched. The referral phase added `ambassadorCodesCreated ReferralCode[]` (:59) at this same site.

**Application on prod (VPS has no pnpm/prisma):** Supabase Management API pattern — `reference_supabase_migration_via_mgmt_api.md` (precedent: Phase 60). Compute sha256 of migration.sql → POST `/database/query` → INSERT row in `_prisma_migrations`. Pre-flight grep: `DROP|TRUNCATE|ALTER COLUMN.*TYPE` = 0.

---

### `apps/web/src/components/learning/FavoriteButton.tsx` (NEW — component, optimistic mutation)

**Analogs:** `JobCard.tsx:54-67` (button with `e.preventDefault()/stopPropagation()` inside a `<Link>` card) + `learn/page.tsx:115-142` (`addToTrackMutation` full optimistic pattern: `onMutate`/`onError` rollback/`onSettled` invalidate).

**Optimistic toggle with rollback** — copy the `onMutate`/`onError`/`onSettled` shape from `learn/page.tsx:115-142`:
```typescript
const addToTrackMutation = trpc.learning.addToTrack.useMutation({
  onMutate: async ({ lessonId }) => {
    await utils.learning.getRecommendedPath.cancel();
    const prev = utils.learning.getRecommendedPath.getData();
    utils.learning.getRecommendedPath.setData(undefined, (old) => { /* optimistic */ });
    return { prev };                       // snapshot for rollback
  },
  onError: (_err, _vars, ctx) => {
    if (ctx?.prev) utils.learning.getRecommendedPath.setData(undefined, ctx.prev);
    toast.error('Не удалось добавить урок');
  },
  onSuccess: () => toast.success('Добавлено в трек'),
  onSettled: () => utils.learning.getRecommendedPath.invalidate(),
});
```
For `FavoriteButton`: `favorite.add`/`favorite.remove` (toggle by current state), optimistic flip of the heart, rollback + `toast.error('Не удалось обновить избранное. Попробуйте ещё раз.')` (UI-SPEC error copy), invalidate `favorite.isFavorited`/`favorite.list` on settle.

**Click-inside-card guard** — copy from `JobCard.tsx:55-61` (heart sits on a card that is itself a `<Link>`):
```typescript
onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAddToTrack(job.id); }}
```

**UI-SPEC contract (§5):** lucide `Heart`, `w-5 h-5` icon in `min-h-11 min-w-11` (44px) tap target; off = outline `text-mp-gray-400`; on = filled `mp-pink-500` (A5). `aria-pressed` + `aria-label` («Добавить в избранное» / «Убрать из избранного»). No confirm dialog (reversible).

---

### `apps/web/src/app/(main)/learn/{plan,solutions,library,favorites}/page.tsx` + `/learn` + `/learn/track` redirects (NEW/MOD — pages)

**Analogs:**
- For the 4 new content pages → `learn/page.tsx` (lens split): the `'use client'` + `trpc.*.useQuery` + loading skeleton (:218-228) + error card (:231-256) + empty state (:317-327) patterns transfer directly.
- For `/learn` and `/learn/track` redirects → `(main)/layout.tsx` server `redirect()` (Server Component).

**Client page structure (plan/solutions/library/favorites)** — reuse from `learn/page.tsx`:
- Loading skeleton (`learn/page.tsx:218-228`):
```tsx
if (isLoading) {
  return (
    <div className="space-y-6">
      <div className="h-8 bg-mp-gray-200 rounded-lg w-48 animate-pulse" />
      <div className="grid gap-4">{[1,2,3].map(i => <div key={i} className="h-32 bg-mp-gray-200 rounded-xl animate-pulse" />)}</div>
    </div>
  );
}
```
- Error card with `isDatabaseUnavailable` branch: `learn/page.tsx:231-256`.
- Empty-state banner (track-empty pattern, repurpose for План/Избранное per UI-SPEC §6): `learn/page.tsx:317-327`.
- `/learn/solutions` = the current `lens==='jobs'` block (`learn/page.tsx:335-358`: MarketplaceSwitch + progress filter + `<JobCatalog>`).
- `/learn/library` = the current `lens==='courses'` block (`learn/page.tsx:359-495`: courses accordion + filters).

**Server redirect for aliases** — copy from `(main)/layout.tsx` (Server Component with `redirect()`):
```tsx
// /learn/track/page.tsx — REPLACE entire client component with:
import { redirect } from 'next/navigation';
export default function TrackRedirect() { redirect('/learn/plan'); }
```
For `/learn/page.tsx` default redirect: **must become a Server Component** that reads `prisma.learningPath` (like `layout.tsx` reads profile) and `redirect('/learn/plan')` or `'/learn/library'`. **NEVER `router.push` in `useEffect`** (router-cache loop — RESEARCH Pitfall 1, CLAUDE.md gotcha, incident 2026-05-19; regression-test analog `apps/web/tests/unit/welcome-page.test.tsx`).

---

### `scripts/migrate-track-to-favorites.ts` (NEW — utility, idempotent batch)

**Analog:** `scripts/backfill-referral-codes.ts` (idempotent one-off, `--dry-run`/`--apply` flags, `PrismaClient` + `main().catch().finally($disconnect)`).

**Script harness** — copy verbatim from `backfill-referral-codes.ts:11-14,29-37,81-87`:
```typescript
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const apply = args.includes('--apply');
  if (!dryRun && !apply) { console.error('Usage: --dry-run or --apply'); process.exit(1); }
  // ...
}
main().catch((err) => { console.error(err); process.exit(1); }).finally(() => prisma.$disconnect());
```

**Idempotency** — RESEARCH Code Example: collect rows from each `LearningPath`'s `custom` section (LESSON) + `addedJobs[]` (JOB), then `createMany({ data, skipDuplicates: true })`. Re-run safe via `@@unique([userId,itemType,itemId])`.
- `custom`-section detection is RELIABLE (RESEARCH VERIFIED): router writes `id:'custom'`, title «Мои уроки» at `learning.ts:897/1043`; rebuild excludes it at `:936`; rebuildTrack keys on it at `:1214`. Key migration on `section.id === 'custom'`.
- **HARD RULE:** `LessonProgress` NOT touched (D-03/D-07). Backup (PITR) before `--apply`.

---

## Shared Patterns (cross-cutting — apply to multiple files)

### tRPC protected read + error handling
**Source:** `material.ts:112-160` (read with optional `type`/`search`/cursor) + `learning.ts:1152-1155` (`if (error instanceof TRPCError) throw error; handleDatabaseError(error)`).
**Apply to:** `favorite.ts` (all procs), `material.listForUser`.
```typescript
.query(async ({ ctx, input }) => {
  try {
    const where: any = {};
    if (input.type) where.type = input.type;
    if (!input.includeHidden) where.isHidden = false;
    if (input.search) where.title = { contains: input.search, mode: 'insensitive' };
    const items = await ctx.prisma.material.findMany({ where, orderBy: { createdAt: 'desc' }, take: input.limit, ... });
    return { items, totalCount, nextCursor: ... };
  } catch (e) { handleDatabaseError(e); }
}),
```

### Active-nav state (D-01 submenu)
**Source:** `sidebar.tsx:118,124-138`.
**Apply to:** new «Обучение» nav group + 4 sub-`<Link>`s.
```tsx
const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
// active:  'bg-mp-blue-50 text-mp-blue-600 shadow-mp-sm', icon 'text-mp-blue-500'
// inactive:'text-mp-gray-600 hover:bg-mp-gray-100 hover:text-mp-gray-900', icon 'text-mp-gray-400'
```
Group auto-opens when `pathname.startsWith('/learn')`; hand-roll the chevron toggle (UI-SPEC §1) with the same `Set`-toggle idiom as `learn/page.tsx:206-216 toggleCourseExpanded` (no radix Collapsible).

### isHidden filter (D-10 — Phase 57 auto-sync)
**Source:** `learning.ts:323` (`where: { lesson: { isHidden: false, course: { isHidden: false } } }`) + `material.ts:127` (`if (!input.includeHidden) where.isHidden = false`).
**Apply to:** `material.listForUser`, library search material resolution, `favorite.list` itemId→entity resolution. Forgetting this re-surfaces hidden duplicate lessons (RESEARCH Pitfall 4).

### Material download ACL — DO NOT WEAKEN (D-05, V4 Access Control)
**Source:** `material.ts:437-466` (`getSignedUrl`).
```typescript
// material.ts:437 — standalone (no attached lesson) currently FORBIDDEN
if (material.lessons.length === 0) {
  throw new TRPCError({ code: 'FORBIDDEN', message: 'Material is not attached to any visible lesson' });
}
// then checkLessonAccess per attached visible lesson (:445-466)
```
`material.listForUser` is ADD-ONLY (a read). The download ACL stays untouched. **A8 decision:** standalone materials in Library are `externalUrl`-only this pass (no `storagePath`) so the ACL gap (Pitfall 2) never triggers. `MaterialCard.tsx` `lessonId` becomes optional (RESEARCH Pattern 5).

### Optimistic mutation + invalidate
**Source:** `AgentSearch.tsx:22-31` (simple `onSuccess` invalidate) + `learn/page.tsx:115-142` (full optimistic with rollback).
**Apply to:** `FavoriteButton`, any new add/remove action. Use full rollback variant for heart toggle, simple variant for non-optimistic actions.

---

## Modified-File Change Sites (current-state excerpts)

### `sidebar.tsx` — flat nav → expandable «Обучение» group
**Current render (:116-141)** — `navItems.map()` emits a flat `<Link>` per item; the `Обучение → /learn` entry (:35-43) is one of them. Replace that single entry with a group header button + 4 sub-`<Link>`s. `MobileNav` (`mobile-nav.tsx`) gets the A3 treatment (single bottom-bar item → default route + horizontal pill-tab strip on `/learn/*`).

### `AgentSearch.tsx` — add `scope` prop
**Current hardcode (:35):**
```typescript
const res = await resolveMutation.mutateAsync({ query: q.trim(), surface: 'learn', conversationState });
```
Add `scope: 'solutions' | 'library'`. `scope='solutions'` keeps this (`intent.resolve`, job render :93-118). `scope='library'` → parallel `ai.searchLessons({query})` (lesson cards) + `material.listForUser({search:query})` (material cards), grouped render. **Landmine (:15-19):** the `trackedJobIds` subscription to `getRecommendedPath` interacts with the Wave-D plan/favorites split — update all 3 consumers together (RESEARCH Pitfall 3).

### `material.ts` — add `listForUser` (protectedProcedure)
**Copy read shape from `list` (:112-160)** but change `adminProcedure`→`protectedProcedure`, force `where.isHidden = false` (no `includeHidden` escape), keep `type`/`search` filters. Include standalone (`isStandalone:true`) + lesson-attached. **Do NOT touch `getSignedUrl` (:398-492).**

### `learning.ts` — `getRecommendedPath` plan/favorites split (~:274)
**Current (:274-333):** one query returns diagnostic sections AND `addedJobs` (:317-333) AND `custom` section. For D-03, План reads only diagnostic sections; the `custom` section + `addedJobs` migrate to `Favorite`. RESEARCH recommends keeping `addedJobs` in the response dormant (A2) but removing its consumption from the План front-end. The `addedJobsRaw` block (:318-333) already carries the `isHidden`/`course.isHidden` filter — preserve it.

### `dashboard/page.tsx` — 3 entry cards above condensed stats
**Current stats (:138-174):** 4 `Card` tiles in `grid grid-cols-2 md:grid-cols-4`. **Current 2 CTA cards (:180-218):** `Card variant="soft-blue"`/`"soft-green"` with `hover:-translate-y-1`. Add 3 entry cards (UI-SPEC §3, `variant` soft-blue/soft-green/gradient) ABOVE stats; condense the 4 stat tiles into a compact strip; hide if all-zero (new user).

### `learn/page.tsx` — lens split + redirect
**Current lens state (:71) + toggle (:274-289) + branch (:335-495).** The `lens==='jobs'` block → `/learn/solutions`; `lens==='courses'` block → `/learn/library`. This page itself becomes the server-redirect entry (`/learn` → default). `data-tour` anchors `learn-view-toggle`/`learn-search`/`learn-add-to-track` (:274,:331,:361) must be re-homed under the new structure (D-10) or the onboarding tour breaks.

---

## No Analog Found

None. Every artifact maps to an existing MAAL pattern (Phases 55/57/58/60). This is a reuse/refactor phase; the planner should not pull patterns from RESEARCH Code Examples over the real analogs cited above — they agree.

## Metadata

**Analog search scope:** `packages/api/src/routers/`, `packages/db/prisma/migrations/`, `apps/web/src/components/{learning,shared}/`, `apps/web/src/app/(main)/{learn,dashboard,layout}`, `scripts/`.
**Files scanned:** 11 read in full/targeted (material.ts, AgentSearch.tsx, sidebar.tsx, referral.ts, referral migration.sql, JobCard.tsx, learn/page.tsx, learning.ts ×2 ranges, dashboard/page.tsx, backfill-referral-codes.ts, schema.prisma relations).
**Pattern extraction date:** 2026-06-03

## PATTERN MAPPING COMPLETE

**Phase:** 61 - Обучение 2.0 — редизайн раздела
**Files classified:** 12 (5 new + 7 modified)
**Analogs found:** 12 / 12

### Coverage
- Files with exact analog: 9
- Files with role-match analog: 3 (FavoriteButton optimistic; favorite.ts CRUD compositing two analogs)
- Files with no analog: 0

### Key Patterns Identified
- All new tRPC procedures use `protectedProcedure` + zod + **`ctx.user.id` as the only user-scoping source** (IDOR-safe), wrapped in `try { } catch (e) { handleDatabaseError(e) }` with `TRPCError` re-throw.
- `Favorite` migration is byte-structurally the Phase 60 referral migration, with `CREATE TYPE` (new enum, not ALTER TYPE) and `onDelete: Cascade`; applied via Supabase Management API.
- Optimistic UI (heart toggle, add-to-plan) follows the `onMutate`/`onError`-rollback/`onSettled`-invalidate pattern from `learn/page.tsx:115`; route aliases use **server `redirect()` only** (never `router.push` — router-cache loop).
- `isHidden:false` (+ `course.isHidden:false`) is mandatory in every new Lesson/Material query (Phase 57 auto-sync); material download ACL (`getSignedUrl`) is read-only-frozen — standalone = externalUrl-only this pass.

### File Created
`.planning/phases/61-learning-2-0/61-PATTERNS.md`

### Ready for Planning
Pattern mapping complete. Planner can now reference analog patterns (with file:line) in each PLAN.md action section.
