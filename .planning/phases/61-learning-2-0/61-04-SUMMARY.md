---
phase: 61
plan: "04"
subsystem: learning-search
tags: [wave-5, learning-2.0, scoped-search, material-catalog, D-04, D-05, isHidden-filter]
requires:
  - "61-00 (AgentSearch.test.tsx scope RED stub)"
  - "61-02 (solutions/library pages + hero/search slots)"
  - "61-03 (material.listForUser + standalone MaterialCard)"
provides:
  - "AgentSearch scope prop — 'solutions' (intent.resolve) | 'library' (ai.searchLessons + material.listForUser grouped «Уроки»/«Материалы»)"
  - "LessonResultCard — lesson search-result card (title → /learn/[id], course, snippet, progress, lock); FavoriteButton slot reserved for 61-07"
  - "Library material catalog with single-select type-filter chip row (5 MaterialType + «Уроки» toggle)"
affects:
  - apps/web/src/components/learning/AgentSearch.tsx
  - apps/web/src/components/learning/LessonResultCard.tsx
  - apps/web/src/app/(main)/learn/solutions/page.tsx
  - apps/web/src/app/(main)/learn/library/page.tsx
tech-stack:
  added: []
  patterns:
    - "On-submit reads of .query procedures via trpc.useUtils().<proc>.fetch (not useQuery) — search fires imperatively on form submit, parallel via Promise.all"
    - "scope-branched render: solutions keeps intent.resolve modes (clarify/recommend/fallback/empty); library renders grouped lesson + material sections"
    - "material catalog query gated with { enabled: showMaterials } so «Уроки» view costs no material fetch"
key-files:
  created:
    - apps/web/src/components/learning/LessonResultCard.tsx
  modified:
    - apps/web/src/components/learning/AgentSearch.tsx
    - apps/web/src/components/learning/__tests__/AgentSearch.test.tsx
    - apps/web/tests/unit/AgentSearch.test.tsx
    - apps/web/src/app/(main)/learn/solutions/page.tsx
    - apps/web/src/app/(main)/learn/library/page.tsx
decisions:
  - "[61-04]: library-scope search calls ai.searchLessons / material.listForUser via useUtils().fetch (imperative on submit), NOT useMutation — these are .query procedures and have no generated useMutation. The 61-00 RED stub drafted useMutation mocks; GREEN fill switched them to the real .fetch shape (stub body was it.skip scaffold, not a frozen contract)"
  - "[61-04]: terminology canon applied to AgentSearch CTA/toast — «В треке ✓»→«В плане ✓», «Плейбук в треке»→«Решение в плане», placeholders per UI-SPEC (solutions «Опишите задачу — подберём решение», library «Найдите урок или материал по теме»)"
  - "[61-04]: material catalog type filter is single-select; «Уроки» chip toggles back to the existing courses accordion (default view). 5 MaterialType chips + «Уроки» = 6 total"
  - "[61-04]: no FavoriteButton added (heart slot reserved in LessonResultCard + MaterialCard) — owned by 61-07 per plan"
metrics:
  duration: ~10min
  completed: 2026-06-03
---

# Phase 61 Plan 04: Scope-Aware AgentSearch + Library Material Catalog Summary

Context-scoped search (D-04): `AgentSearch` now takes a required `scope` prop. «Решения под задачу» (solutions) keeps the existing `intent.resolve` playbook search; «База знаний» (library) runs parallel `ai.searchLessons` + `material.listForUser` and renders grouped «Уроки»/«Материалы». The library page gains a material catalog with a single-select type-filter chip row (D-05 UI). No query bypasses the `isHidden` filter (T-61-04-01).

## What Was Built

**Task 1 — scope prop + grouped library results + LessonResultCard** (commit `f7097a9`):
- `AgentSearch.tsx` — added required `scope: 'solutions' | 'library'`.
  - `scope='solutions'` → `intent.resolve` mutation (unchanged clarify/recommend/fallback/empty render). Placeholder «Опишите задачу — подберём решение».
  - `scope='library'` → on submit, `Promise.all([utils.ai.searchLessons.fetch({query}), utils.material.listForUser.fetch({search:query})])`, mapped to lesson + material card data, rendered grouped «Уроки» then «Материалы». Empty → «Ничего не нашли». Placeholder «Найдите урок или материал по теме».
  - Canon CTA/toast: «В плане ✓» / «Решение в плане» (was «В треке ✓» / «Плейбук в треке»).
  - `trackedJobIds` subscription kept (semantics unchanged; Pitfall 3 — 61-07 updates consumers together).
- `LessonResultCard.tsx` (NEW) — mirrors `JobCard` layout: title → `/learn/[lesson.id]`, course name, snippet, progress bar, `Lock` icon if gated. FavoriteButton (LESSON) slot reserved (heart not added — 61-07).
- Filled the 61-00 `__tests__/AgentSearch.test.tsx`: solutions→`intent.resolve` invoked (and searchLessons/listForUser NOT), library→both endpoints invoked + grouped «Уроки»/«Материалы» rendered. Updated the existing `tests/unit/AgentSearch.test.tsx` to pass `scope="solutions"`, new placeholder matcher, and the «В плане ✓» label. 7/7 green.

**Task 2 — wire scoped search into pages + material catalog** (commit `50e99d0`):
- `solutions/page.tsx` — `<AgentSearch scope="solutions" />`. Marketplace + progress chips unchanged.
- `library/page.tsx` — `<AgentSearch scope="library" />`. Added a single-select material-type chip row (`CATALOG_CHIPS`: «Уроки» + 5 MaterialType values «Презентация»/«Таблица расчётов»/«Внешний сервис»/«Чек-лист»/«Памятка»). Selecting a material type renders a `MaterialCard` grid via `trpc.material.listForUser.useQuery({ type }, { enabled })`; empty → «Материалов этого типа пока нет» / «Снимите фильтр…» + «Показать уроки» CTA. «Уроки» chip (default) renders the existing courses accordion.

## Verification

| Gate | Result |
|------|--------|
| web: `vitest run AgentSearch` | 2 files, 7/7 tests pass (scope test + existing unit test) |
| `pnpm typecheck` | PASS (6/6 packages, no `error TS`) |
| isHidden bypass check | library reuses `ai.searchLessons` (filters `isHidden:false`, ai.ts:237) + `material.listForUser` (forces it, 61-03) — no new query |
| tour anchor `learn-search` | present on both solutions + library (unchanged) |

## Deviations from Plan

**1. [Rule 1 — Test correctness] 61-00 scope stub mocked `useMutation`, runtime uses `useUtils().fetch`**
- **Found during:** Task 1 GREEN.
- **Issue:** `ai.searchLessons` and `material.listForUser` are tRPC `.query` procedures — they have no generated `useMutation`. The cleanest on-submit-fetch pattern is `trpc.useUtils().<proc>.fetch(...)`. The 61-00 RED stub drafted `ai.searchLessons.useMutation` / `material.listForUser.useMutation` mocks (commented GREEN recipe), which do not exist at runtime.
- **Fix:** GREEN fill switched the mocks to the real `.fetch` shape (`useUtils().ai.searchLessons.fetch` / `.material.listForUser.fetch`) and asserts those are invoked. Behavior asserted is identical (solutions→intent.resolve, library→both + grouped sections). The stub body was an `it.skip` scaffold, not a frozen contract — same precedent as 61-03's select→payload adjustment.
- **Files modified:** `apps/web/src/components/learning/__tests__/AgentSearch.test.tsx`
- **Commit:** `f7097a9`

**2. [Rule 1 — Canon] existing unit test updated for required scope + canon label**
- **Found during:** Task 1.
- **Issue:** `tests/unit/AgentSearch.test.tsx` rendered `<AgentSearch />` (no scope) with the old placeholder `/тему/i` and asserted «В треке ✓». Making `scope` required + applying D-02 canon broke it.
- **Fix:** Updated to `<AgentSearch scope="solutions" />`, placeholder matcher `/задачу/i`, and «В плане ✓». No behavior change beyond the rename/prop.
- **Files modified:** `apps/web/tests/unit/AgentSearch.test.tsx`
- **Commit:** `f7097a9`

## Known Stubs

- `FavoriteButton` (LESSON / MATERIAL) slots are intentional reserved placeholders in `LessonResultCard` and `MaterialCard` — the heart toggle lands in 61-07 per plan. Not a blocking stub.

## Threat Flags

None. No new network endpoints, auth paths, or schema changes — both library queries reuse existing `isHidden`-filtered read procedures (`ai.searchLessons`, `material.listForUser`).

## Self-Check: PASSED

- FOUND: apps/web/src/components/learning/LessonResultCard.tsx
- FOUND (modified): apps/web/src/components/learning/AgentSearch.tsx
- FOUND (modified): apps/web/src/app/(main)/learn/solutions/page.tsx
- FOUND (modified): apps/web/src/app/(main)/learn/library/page.tsx
- FOUND commit: f7097a9 (Task 1)
- FOUND commit: 50e99d0 (Task 2)
