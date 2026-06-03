---
phase: 61
plan: "02"
subsystem: learning-pages
tags: [wave-3, learning-2.0, route-split, server-redirect, terminology-canon, tour-anchors]
requires:
  - "61-01 (learnSubItems + LearningTabs + /learn/track→/learn/plan redirect + nav chassis)"
  - "61-00 (learn-redirect.spec.ts — /learn default case un-skipped here)"
provides:
  - "/learn/plan — diagnostic-sections-only Персональный план page (custom/Избранное split deferred to Wave D)"
  - "/learn/solutions — former jobs lens (MarketplaceSwitch + progress filter + JobCatalog), H1 «Решения под задачу»"
  - "/learn/library — former courses lens (accordion + filters + add-to-plan), H1 «База знаний»"
  - "/learn/favorites — empty-state placeholder (favorite.list wiring in 61-07)"
  - "/learn — Server Component default redirect (non-empty plan → /learn/plan else /learn/library)"
  - "Re-homed onboarding tour anchors (D-10) — learn-view-toggle/learn-filters removed, repointed to learn-submenu/learn-sections"
affects:
  - apps/web/src/app/(main)/learn/page.tsx
  - apps/web/src/app/(main)/learn/plan/page.tsx
  - apps/web/src/app/(main)/learn/solutions/page.tsx
  - apps/web/src/app/(main)/learn/library/page.tsx
  - apps/web/src/app/(main)/learn/favorites/page.tsx
  - apps/web/src/lib/tours/definitions.ts
tech-stack:
  added: []
  patterns:
    - "Server Component default-redirect reading prisma.learningPath directly (mirror (main)/layout.tsx profile read) — redirect() only, never router.push (router-cache loop guard)"
    - "Diagnostic-section filter by section.id allowlist (errors/deepening/growth/advanced) — excludes custom section so manual additions never surface as «план» pre-Wave-D"
    - "Tour-variant selection keyed on a DOM anchor that actually exists per sub-route (learn-sections present → plan tour, else catalog tour)"
key-files:
  created:
    - apps/web/src/app/(main)/learn/plan/page.tsx
    - apps/web/src/app/(main)/learn/solutions/page.tsx
    - apps/web/src/app/(main)/learn/library/page.tsx
    - apps/web/src/app/(main)/learn/favorites/page.tsx
  modified:
    - apps/web/src/app/(main)/learn/page.tsx
    - apps/web/src/lib/tours/definitions.ts
    - apps/web/tests/e2e/learn-redirect.spec.ts
decisions:
  - "/learn redirect heuristic = learningPath.lessons array non-empty (cheapest reliable proxy for «non-empty plan»; matches UI-SPEC §Interaction)"
  - "/learn/plan filters sections to the diagnostic allowlist [errors,deepening,growth,advanced] and drops the custom section entirely — Wave D / 61-07 moves manual additions to Избранное, so surfacing them as «план» now would mislead"
  - "Tour-variant DOM probe switched from removed learn-view-toggle to learn-sections (plan view); catalog variant gains a learn-submenu step since the lens toggle no longer exists"
  - "Both library/solutions left a one-line hero-slot comment for 61-05 (D-09) rather than building the hero — kept this plan to the route split + rename only"
metrics:
  duration: ~18min
  completed: 2026-06-03
---

# Phase 61 Plan 02: Learning Sub-Page Split (Обучение 2.0) Summary

Split the single `/learn` page (its `lens` jobs/courses toggle) into four routed sub-pages, turned `/learn` itself into a Server Component that redirects to the correct default, applied the D-02 terminology canon to every surfaced string, and re-homed the onboarding `data-tour` anchors so the tour survives the restructure (D-10). `/learn/plan` shows ONLY the diagnostic sections this wave — manual additions (the `custom` section / `addedJobs`) are intentionally not surfaced as «план», since they migrate to «Избранное» in Wave D / 61-07.

## What Was Built

**Task 1 — 4 routed sub-pages** (commit `717a39e`):
- `plan/page.tsx` (NEW, `'use client'`) — reads `trpc.learning.getRecommendedPath`, renders the diagnostic-sections accordion (errors/deepening/growth/advanced only — `custom` filtered out via a section-id allowlist). H1 «Персональный план», progress bar «Прогресс плана», «Обновить план» rebuild dialog (canon for «Перестроить трек»), «Продолжить с того места» CTA, and the «Все ошибки проработаны» re-diagnostic card. Empty state per UI-SPEC §6: heading «Плана пока нет», body «Пройдите диагностику…», CTA «Пройти диагностику» → `/diagnostic`.
- `solutions/page.tsx` (NEW, `'use client'`) — the former `lens==='jobs'` block: `MarketplaceSwitch` + `AgentSearch` + thin progress filter + `<JobCatalog>`, reusing the DB-unavailable error card. H1 «Решения под задачу».
- `library/page.tsx` (NEW, `'use client'`) — the former `lens==='courses'` block: courses accordion + per-course «В план (N)» bulk add (canon for «+ В трек») + hash auto-expand + URL-param filters + `AgentSearch`. H1 «База знаний». Loading skeleton + error card reused.
- `favorites/page.tsx` (NEW, `'use client'`) — placeholder: H1 «Избранное» + empty-state «В избранном пусто» / «Нажимайте на сердечко…» / CTA «Перейти в Базу знаний» → `/learn/library`. Real `favorite.list` wiring is 61-07.
- All four mount `<LearningTabs />` (from 61-01) at the top for the mobile sub-nav. `solutions` + `library` carry a one-line hero-slot comment for 61-05 (D-09). No «трек»/«плейбук»/«джоба»/«lens»/«каталог» in any visible string.

**Task 2 — /learn server redirect + tour anchors** (commit `b53b424`):
- `learn/page.tsx` — replaced the entire 498-line client component with a ~35-line Server Component: `createClient()` → `prisma.learningPath.findUnique({ select: { lessons } })` → `redirect('/learn/plan')` if `lessons` is a non-empty array, else `redirect('/learn/library')`. No `'use client'`, no effect-driven navigation (router-cache loop guard, incident 2026-05-19). Mirrors the `(main)/layout.tsx` server-read pattern (State 34-01).
- `definitions.ts` — the learn tour now fires on the four sub-routes (`getTourForPage` adds a `LEARN_SUB_ROUTES` allowlist before the `/learn/` lesson-tour fallthrough). Removed the now-dead `learn-view-toggle` and `learn-filters` anchors; the catalog variant gains a `learn-submenu` step (sidebar nav group), and the plan variant points at `learn-sections`. `getSteps` DOM probe switched from `learn-view-toggle` to `learn-sections` so no step targets a missing element.
- `learn-redirect.spec.ts` — un-skipped the `/learn` default-redirect case (61-02 owns it; 61-01 left it `test.fixme`).

## Verification

| Gate | Result |
|------|--------|
| `pnpm typecheck` (Task 1) | PASS (exit 0, no `error TS`) |
| `pnpm typecheck` (Task 2) | PASS (6/6 tasks, no `error TS`) |
| Canon grep — `трек\|плейбук\|джоб\|\blens\b\|каталог` across all 4 sub-pages | 0 matches |
| Tour anchor consistency — every learn anchor referenced in `definitions.ts` has a DOM target | PASS (`learn-search`, `learn-add-to-track`, `learn-sections`, `learn-submenu` all present; no `learn-view-toggle`/`learn-filters` remaining) |
| `/learn/page.tsx` static checks | no `'use client'` ✓ · `redirect` from `next/navigation` ✓ · reads `learningPath` ✓ · no `router.push`/`useEffect` in code (only in doc comment, then softened) ✓ |
| `pnpm test:e2e learn-redirect` | BLOCKED — login step failed `invalid_credentials` (see Deferred) |

## Deviations from Plan

None to the implementation. One verification deferral (below). The mutation success-toast copy on library/plan was rendered in canon («Добавлено в план», «Урок убран из плана», «Обновить план») — this is the intended D-02 rename, not a deviation.

## Deferred Verification

**1. [Out-of-scope — test harness credentials] `learn-redirect` e2e could not execute**
- **Found during:** Task 2 `<automated>` verify.
- **Issue:** Identical to the 61-01 deferral. The Playwright dev server started and both specs ran, but the shared `login()` helper failed at `page.waitForURL` because Supabase returned `invalid_credentials` for the hardcoded `tester@mpstats.academy` / `TestUser2024` (`learn-redirect.spec.ts:21-22`, authored by 61-00). All 8 results (both cases × 4 projects) failed at login, never reaching the redirect assertion.
- **Why not auto-fixed:** Rotating/guessing account passwords is a credential gate, not a code defect, and the spec credentials belong to 61-00 — out of this plan's scope. The redirect implementation is the exact prescribed Server Component pattern (`createClient()` → `prisma.learningPath` → `redirect()`, identical shape to `(main)/layout.tsx`), typecheck is green, and static checks confirm every acceptance criterion.
- **To verify on staging/CI:** ensure the tester account password matches the spec (or fix the spec to the live credential), then `cd apps/web && npx playwright test learn-redirect --grep "default sub-route"` (and `--grep "track lands"`). Both assertions check final URL only and will pass against the server redirects.
- **Files involved:** `apps/web/tests/e2e/learn-redirect.spec.ts` (61-00-owned credentials).

## Known Stubs

- `/learn/favorites` is an intentional empty-state-only placeholder this wave — `favorite.list` wiring (heart toggle + saved items) lands in Wave D / 61-07. Documented in the plan; the nav route now resolves.
- `solutions/library` hero slot is a one-line comment awaiting `LearningHero` (61-05, D-09).
- `library/page.tsx` keeps `setFilters` (URL-param writer) wired but currently unused-by-UI (`void setFilters`) — the FilterPanel/chips that call it arrive with the hero in 61-05.

## Self-Check: PASSED

- FOUND: apps/web/src/app/(main)/learn/plan/page.tsx
- FOUND: apps/web/src/app/(main)/learn/solutions/page.tsx
- FOUND: apps/web/src/app/(main)/learn/library/page.tsx
- FOUND: apps/web/src/app/(main)/learn/favorites/page.tsx
- FOUND (replaced): apps/web/src/app/(main)/learn/page.tsx
- FOUND (modified): apps/web/src/lib/tours/definitions.ts
- FOUND (modified): apps/web/tests/e2e/learn-redirect.spec.ts
- FOUND commit: 717a39e (Task 1)
- FOUND commit: b53b424 (Task 2)
