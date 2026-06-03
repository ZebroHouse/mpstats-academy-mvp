---
phase: 61
plan: "07"
subsystem: favorites-split
tags: [wave-8, learning-2.0, favorites, data-migration, idempotent, D-03, D-06, D-07, checkpoint-pending]
requires:
  - "61-06 (Favorite model + favorite.{add,remove,list,isFavorited} router; schema migration applied to prod)"
  - "61-02 (/learn/plan diagnostic-only, /learn/favorites placeholder)"
  - "61-04 (LessonResultCard + AgentSearch scope; MaterialCard heart slot)"
  - "61-00 (migrate-track-to-favorites.test.ts RED stub)"
provides:
  - "scripts/migrate-track-to-favorites.ts — idempotent track→Favorite data migration (collectFavoriteRows + migrate)"
  - "FavoriteButton — shared optimistic heart toggle (D-06), mounted on Job/Material/Lesson cards"
  - "/learn/favorites — real favorite.list listing with type-filter chips"
  - "План/Избранное split complete (D-03) — 3 getRecommendedPath consumers reconciled"
affects:
  - scripts/migrate-track-to-favorites.ts
  - scripts/__tests__/migrate-track-to-favorites.test.ts
  - apps/web/src/components/learning/FavoriteButton.tsx
  - apps/web/src/components/learning/JobCard.tsx
  - apps/web/src/components/learning/JobCatalog.tsx
  - apps/web/src/components/learning/MaterialCard.tsx
  - apps/web/src/components/learning/LessonResultCard.tsx
  - apps/web/src/app/(main)/learn/favorites/page.tsx
  - apps/web/src/components/learning/__tests__/AgentSearch.test.tsx
tech-stack:
  added: []
  patterns:
    - "data migration split into pure collectFavoriteRows() (unit-testable) + migrate(prisma,{apply}) (I/O); PrismaClient lazy-required so the test imports migrate() without @prisma/client in the module graph"
    - "idempotent write via createMany({skipDuplicates}) on @@unique([userId,itemType,itemId]); LessonProgress count-only (read), never written (D-03/D-07)"
    - "FavoriteButton: string-literal itemType ('LESSON'|'JOB'|'MATERIAL') NOT @mpstats/db enum — keeps Prisma out of the client bundle"
    - "optimistic toggle: onMutate flip + onError rollback + toast + onSettled invalidate(isFavorited/list); all hooks above any early return (Rules of Hooks)"
    - "catalog-level batch isFavorited seeding (JobCatalog) → no N+1 per card"
    - "favorites listing types via inferRouterOutputs<AppRouter> (useQuery data-union widened to {} from the router's void-catch branch)"
key-files:
  created:
    - scripts/migrate-track-to-favorites.ts
    - apps/web/src/components/learning/FavoriteButton.tsx
  modified:
    - scripts/__tests__/migrate-track-to-favorites.test.ts
    - apps/web/src/components/learning/JobCard.tsx
    - apps/web/src/components/learning/JobCatalog.tsx
    - apps/web/src/components/learning/MaterialCard.tsx
    - apps/web/src/components/learning/LessonResultCard.tsx
    - apps/web/src/app/(main)/learn/favorites/page.tsx
    - apps/web/src/components/learning/__tests__/AgentSearch.test.tsx
decisions:
  - "Migration reads REAL prod shapes (LearningPath.lessons = SectionedLearningPath{version:2,sections:[{id,lessonIds}]}, addedJobs = string[]), NOT the 61-00 stub's draft shape — the stub fixture was an it.skip scaffold, realigned to the real shapes in the GREEN fill (Rule 1)"
  - "collectFavoriteRows is pure (no DB) → unit-tested directly + dedupes per user via a seen-set; migrate() does count-only reads of LessonProgress to prove the before==after invariant"
  - "PrismaClient lazy-required inside main() (not top-level import) — vite/node test harness can't resolve @prisma/client from repo-root scripts/; CLI still works via tsx (require.main===module guard)"
  - "FavoriteButton props use string-literal itemType, not the @mpstats/db FavoriteItemType enum — importing the enum risks pulling the Prisma runtime into the client bundle; router input z.nativeEnum accepts the string values"
  - "Избранное cards are purpose-built for the favorite.list resolved shape ({id,title,slug/type}); MaterialCard is NOT reused there because list-entity lacks externalUrl/ctaText/hasFile (61-06 router frozen, not expanded)"
  - "JobCard text «В треке»/«+ В трек» left as-is (out of this plan's scope — canon rename belongs to the card's own owner); only the heart was added"
metrics:
  duration: ~22min
  completed: 2026-06-03
status: PARTIAL — code shipped + tested; prod track→favorites DATA migration HALTED at blocking human-action checkpoint (Task 4)
---

# Phase 61 Plan 07: План/Избранное Split + Track→Favorites Migration Summary

Completed the План/Избранное split (D-03): built the idempotent `migrate-track-to-favorites` data migration (custom-section lessons + `addedJobs` → `Favorite`, `LessonProgress` untouched), the shared optimistic `FavoriteButton` (D-06) mounted on all three entity cards, the real `/learn/favorites` listing, and reconciled all three `getRecommendedPath` consumers so «План» stays purely diagnostic while manual additions live in «Избранное». **Plan is PARTIAL**: the data migration must run against the shared live prod Supabase DB — a blocking human-action checkpoint (Task 4) the executor did NOT run.

## What Was Built

**Task 1 — idempotent migration script + tests** (commit `00e8a32`):
- `scripts/migrate-track-to-favorites.ts` mirrors `backfill-referral-codes.ts` (`--dry-run`/`--apply`, `require.main===module` guard, `$disconnect` in finally). Split into:
  - `collectFavoriteRows(rows)` — PURE: parses each `LearningPath` via `parseLearningPath`, lifts the `section.id === 'custom'` `lessonIds` → `Favorite(LESSON)` and `addedJobs[]` (JSON array of jobId strings) → `Favorite(JOB)`, deduped per user.
  - `migrate(prisma, { apply })` — does `lessonProgress.count()` before AND after (read-only, proves the invariant), `learningPath.findMany`, then on `--apply` writes `favorite.createMany({ data, skipDuplicates: true })`. Throws if the LessonProgress count changed.
- **`@prisma/client` is NOT imported at module top-level** — lazy-`require`d inside `main()` so the unit test imports `migrate()` cleanly under the api vitest harness (vite couldn't resolve the client from the repo-root `scripts/` path).
- Realigned the 61-00 stub fixture to REAL prod shapes (`lessons` = `{version:2,sections:[{id,lessonIds}]}`, `addedJobs` = `string[]`) and un-skipped all bodies. 6 tests: skipDuplicates contract, custom→LESSON + addedJobs→JOB mapping (diagnostic lesson `l-9` NOT migrated), idempotent re-run (first inserts 3, second inserts 0), LessonProgress before==after, pure `collectFavoriteRows` shape, `--dry-run` writes nothing.

**Task 2 — FavoriteButton + mounts + Избранное page** (commit `280e555`):
- `FavoriteButton.tsx` — `'use client'`, props `{ itemType: 'LESSON'|'JOB'|'MATERIAL'; itemId; initialFavorited?; className? }`. Optimistic toggle: `add`/`remove` by current state, `onMutate` flips heart + snapshots prev, `onError` rolls back + `toast.error('Не удалось обновить избранное. Попробуйте ещё раз.')`, `onSettled` invalidates `favorite.isFavorited` + `favorite.list`. lucide `Heart w-5 h-5` in `min-h-11 min-w-11`; off `text-mp-gray-400`, on `fill-mp-pink-500 text-mp-pink-500` (A5); `aria-pressed` + aria-label «Добавить/Убрать из избранного»; `e.preventDefault()` + `e.stopPropagation()` (click-inside-`<Link>` guard); no confirm dialog. ALL hooks above any early return (no early returns at all — Rules of Hooks, CLAUDE.md gotcha).
- Mounted on `JobCard` (JOB), `MaterialCard` (MATERIAL), `LessonResultCard` (LESSON). `JobCatalog` batch-seeds `initialFavorited` via one `favorite.isFavorited` query keyed by all visible job ids (no N+1).
- `/learn/favorites` replaced the 61-02 placeholder with a real `favorite.list` listing + a type-filter chip row (Все/Уроки/Решения/Материалы), purpose-built favorite-row cards (link + inline un-favorite heart), loading skeleton, and the retained «В избранном пусто» empty state.
- AgentSearch test mock gains `favorite.{add,remove,isFavorited}` + `useUtils().favorite.{isFavorited,list}.invalidate` stubs (the newly-mounted heart inside LessonResultCard/MaterialCard rendered under that test).

**Task 3 — План diagnostic-only + 3-consumer reconcile + D-10 CQ check** (no code diff — already satisfied):
- `/learn/plan` already renders ONLY the diagnostic-section allowlist (`errors/deepening/growth/advanced`) and drops `custom`/`addedJobs` — done in 61-02. Verified: `grep -E "addedJobs|'custom'|\"custom\""` on `plan/page.tsx` returns **0**.
- The 3 `getRecommendedPath` consumers are consistent (RESEARCH Pitfall 3):
  - **#1 AgentSearch** `trackedJobIds` reads `addedJobs` → green «В плане» badge (addJobToTrack). Unchanged.
  - **#2 /learn/plan** diagnostic-only.
  - **#3 former /learn/track** is a pure server-side `redirect('/learn/plan')` — reads no path shape.
- In-track (green «В треке/плане», from `addedJobs`) and in-favorites (pink heart, from `Favorite`) are **independent signals** — different data source, different mutation, neither suppresses the other at render time (A4/A5).

**Task 4 — [BLOCKING] run data migration on PROD: NOT EXECUTED.** Halted at checkpoint (see below).

## CarrotQuest pa_* disposition (D-10)

**No silent regression — nothing dropped.** Grepped `pa_*` / `reachGoal` / `trackEvent` / `carrotquest` across `apps/web/src` learning components and `learning.ts`:
- The ONLY analytics events in the learning area are `METRIKA_GOALS.MATERIAL_OPEN` (MaterialCard click) and `MATERIAL_SECTION_VIEW` (LessonMaterials) — both fire on material interactions and are **unchanged** by the План/Избранное split.
- **There are NO `pa_*` / CarrotQuest / `reachGoal` events tied to the add-to-track / rebuild-track / plan flow** (`learning.ts` router has zero `trackEvent`/`reachGoal`; the plan/library/solutions pages fire none on track add/remove). Therefore the split could not regress any track/plan-flow CQ event — there were none to keep or drop.

## Verification

| Gate | Result |
|------|--------|
| `vitest run migrate-track-to-favorites` (api harness) | 6/6 pass |
| `vitest run` (api) | 142/142 pass (incl. 8 favorite + 6 migrate) |
| `vitest run` (web) | 208/208 pass (incl. 7 AgentSearch scope) |
| `pnpm typecheck` (turbo) | 6/6 packages clean, no `error TS` |
| migration: `grep -c skipDuplicates / createMany` | 3 / 3 |
| migration: `s.id === 'custom'` marker | 1 |
| migration: `lessonProgress.(create\|update\|delete\|upsert)` | 0 (count-only) |
| plan page: `addedJobs\|'custom'\|"custom"` | 0 |

## CHECKPOINT PENDING — Task 4 (blocking human-action)

The track→favorites DATA migration must run against the **shared live prod Supabase DB `saecuecevicwjkpmaoot`** (~170 users with manual track additions, 158 paying). The executor did NOT run it (PROD DATABASE SAFETY). The `Favorite` table already exists on prod (61-06 schema migration applied 2026-06-03).

**Script:** `scripts/migrate-track-to-favorites.ts`
**Idempotency:** `createMany({ skipDuplicates: true })` on `@@unique([userId,itemType,itemId])` — re-run inserts 0 new rows.
**LessonProgress:** count-only (read); the script aborts if the count changes (hard rule D-03/D-07).

Owner / orchestrator steps (prod `DATABASE_URL` required):
1. PRE-FLIGHT: confirm PITR backup enabled on `saecuecevicwjkpmaoot`.
2. Snapshot: `SELECT count(*) FROM "LessonProgress";` and `SELECT count(*) FROM "Favorite";` — record both.
3. `DATABASE_URL=<prod> npx tsx scripts/migrate-track-to-favorites.ts --dry-run` — review printed `Favorite(LESSON)` / `Favorite(JOB)` / total counts for sanity.
4. `DATABASE_URL=<prod> npx tsx scripts/migrate-track-to-favorites.ts --apply`.
5. Re-run `--apply` once more → `Inserted (new rows): 0` (idempotency on real data).
6. `SELECT count(*) FROM "LessonProgress";` MUST equal step-2 value (untouched).
7. Spot-check a known user at `/learn/favorites` — their former «Мои уроки» + добавленные решения appear; `/learn/plan` shows only diagnostic sections.
**Rollback:** the migration is additive (only inserts `Favorite` rows). To undo, `DELETE FROM "Favorite"` for the migrated rows (or PITR). `LessonProgress` and `LearningPath` are never mutated.
**Resume signal:** "migrated".

## Deviations from Plan

**1. [Rule 1 — Test correctness] 61-00 stub fixture used a non-real data shape**
- **Found during:** Task 1 GREEN.
- **Issue:** The 61-00 `it.skip` stub mocked `learningPath.findMany` returning `{ sections: [{ id:'custom', lessons:[{lessonId}] }], addedJobs:[{id}] }` — but the REAL prod shape is `lessons` = `SectionedLearningPath { version:2, sections:[{ id, lessonIds:string[] }] }` and `addedJobs` = `string[]` (verified in `learning.ts:317` + `@mpstats/shared` `parseLearningPath`).
- **Fix:** Wrote the script against the real shapes (the only prod-safe choice) and realigned the test fixture + un-skipped the bodies to call the real `migrate()`/`collectFavoriteRows()`. The stub body was an `it.skip` scaffold, not a frozen contract (same precedent as 61-04's useMutation→fetch).
- **Files:** `scripts/migrate-track-to-favorites.ts`, `scripts/__tests__/migrate-track-to-favorites.test.ts`. **Commit:** `00e8a32`.

**2. [Rule 3 — Blocking] `@prisma/client` top-level import broke the test harness**
- **Found during:** Task 1 first test run.
- **Issue:** The api vitest harness (which collects the repo-root `scripts/__tests__/`) could not resolve `@prisma/client` imported at the script's module top-level → collection error, 0 tests.
- **Fix:** Removed the top-level import; `PrismaClient` is lazy-`require`d inside `main()` (CLI-only). The test imports `migrate`/`collectFavoriteRows` with no Prisma in the module graph; `tsx` still loads the client at runtime.
- **Files:** `scripts/migrate-track-to-favorites.ts`. **Commit:** `00e8a32`.

**3. [Rule 1 — Test correctness] AgentSearch test mock missing `favorite.*`**
- **Found during:** Task 2 web test run.
- **Issue:** Mounting `FavoriteButton` inside `LessonResultCard`/`MaterialCard` made the library-scope AgentSearch test render the heart, which calls `trpc.favorite.add/remove/isFavorited` + `useUtils().favorite.*` — absent from the test's trpc mock → render crash.
- **Fix:** Added `favorite.{add,remove,isFavorited}` mutation/query stubs + `useUtils().favorite.{isFavorited,list}.invalidate` to the mock. No behavior change to the search assertions.
- **Files:** `apps/web/src/components/learning/__tests__/AgentSearch.test.tsx`. **Commit:** `280e555`.

## Known Stubs

None. Search-result lesson/material cards default their heart to `initialFavorited=false` when no catalog-level batch seed is available (AgentSearch results) — the toggle still works correctly against the idempotent backend; this is graceful degradation, not a stub.

## Self-Check: PASSED

- FOUND: scripts/migrate-track-to-favorites.ts
- FOUND: apps/web/src/components/learning/FavoriteButton.tsx
- FOUND (modified): apps/web/src/app/(main)/learn/favorites/page.tsx (favorite.list listing)
- FOUND (modified): apps/web/src/components/learning/{JobCard,JobCatalog,MaterialCard,LessonResultCard}.tsx (heart mounted)
- FOUND commit: 00e8a32 (Task 1 — migration script + tests)
- FOUND commit: 280e555 (Task 2 — FavoriteButton + Избранное)
- NOT RUN (by design): prod track→favorites DATA migration — pending owner checkpoint (Task 4)
