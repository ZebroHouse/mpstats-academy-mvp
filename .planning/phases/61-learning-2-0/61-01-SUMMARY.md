---
phase: 61
plan: "01"
subsystem: navigation
tags: [wave-2, learning-2.0, sidebar, mobile-nav, route-alias, server-redirect]
requires:
  - "61-00 (learn-redirect.spec.ts RED stub — /learn/track case un-skipped here)"
provides:
  - "Expandable «Обучение» sidebar group with 4 sub-routes (D-01)"
  - "Mobile «Обучение» bottom-bar item → /learn/plan default + LearningTabs pill-strip for 61-02 to mount"
  - "/learn/track → /learn/plan server redirect (legacy alias preserved)"
  - "learnSubItems export (canon labels + hrefs) reusable by downstream waves"
affects:
  - apps/web/src/components/shared/sidebar.tsx
  - apps/web/src/components/shared/mobile-nav.tsx
tech-stack:
  added: []
  patterns:
    - "Hand-rolled expandable nav group (useState + chevron rotate-180), no radix Collapsible — matches toggleSection/toggleCourseExpanded idiom"
    - "Server Component redirect() for route aliases (never client router.push — router-cache loop guard)"
key-files:
  created:
    - apps/web/src/components/learning/LearningTabs.tsx
  modified:
    - apps/web/src/components/shared/sidebar.tsx
    - apps/web/src/components/shared/mobile-nav.tsx
    - apps/web/src/app/(main)/learn/track/page.tsx
    - apps/web/tests/e2e/learn-redirect.spec.ts
decisions:
  - "Sidebar group injected after «Диагностика» in the navItems.map (preserves Главная→Диагностика→Обучение→Тарифы→Профиль order) rather than a separate render block"
  - "Mobile bottom-bar «Обучение» active state special-cased to pathname.startsWith('/learn') so it stays lit on /learn/library etc. (its href is /learn/plan)"
  - "Only the /learn/track e2e assertion un-skipped; /learn default-redirect stays test.fixme until 61-02 builds the sub-pages"
metrics:
  duration: ~12min
  completed: 2026-06-03
---

# Phase 61 Plan 01: Navigation Chassis (Обучение 2.0) Summary

Built the navigation skeleton for Обучение 2.0: the flat «Обучение → /learn» sidebar entry becomes a hand-rolled expandable group exposing the 4 canon sub-routes (D-01), mobile gets a single bottom-bar item routing to the default sub-section plus a reusable horizontal pill-tab strip (A3), and `/learn/track` now server-redirects to `/learn/plan` to preserve legacy bookmarks. The 4 sub-route content pages do not exist yet (61-02 builds them) — this plan only wires the nav links and the redirect.

## What Was Built

**Task 1 — Expandable nav group + mobile pattern** (commit `fb693d8`):
- `sidebar.tsx` — removed the flat «Обучение → /learn» item; added an exported `learnSubItems` const (4 sub-routes with canon labels: «Персональный план» `/learn/plan`, «Решения под задачу» `/learn/solutions`, «База знаний» `/learn/library`, «Избранное» `/learn/favorites»). The group renders inline after «Диагностика» as a header `<button data-tour="learn-submenu">` (book icon + «Обучение» + chevron) with local `useState(open)` defaulting to `pathname.startsWith('/learn')`. Chevron animates `rotate-180` when open; 4 sub-`<Link>`s indent `pl-10`, `text-body-sm`, reusing the exact active class strings. Group header lit when `pathname.startsWith('/learn')`; sub-item active via `pathname === href || pathname.startsWith(href + '/')`. No radix Collapsible.
- `mobile-nav.tsx` — single «Обучение» (label «Уроки») bottom-bar item now points to `/learn/plan`; its active state is special-cased to `pathname.startsWith('/learn')` so it stays lit on any sub-route (a plain `===`/`startsWith(href+'/')` check would miss `/learn/library`).
- `LearningTabs.tsx` (NEW, `'use client'`) — `md:hidden` `overflow-x-auto` horizontal pill-tab strip rendering the 4 sub-sections; active pill `bg-mp-blue-50 text-mp-blue-600`, inactive `text-mp-gray-600`. Exported for 61-02 to mount at the top of each `/learn/*` page.

**Task 2 — /learn/track server redirect** (commit `2f39ee6`):
- Replaced the entire client `TrackPage` (661 lines) with a 12-line Server Component calling `redirect('/learn/plan')` from `next/navigation`. No `'use client'`, no `useEffect`, no `router.push` (router-cache loop guard, incident 2026-05-19).
- Un-skipped the `/learn/track`→`/learn/plan` e2e assertion in `learn-redirect.spec.ts` (the case this plan owns). The `/learn` default-redirect case stays `test.fixme` until 61-02.

## Verification

| Gate | Result |
|------|--------|
| `pnpm typecheck` (Task 1) | PASS (exit 0, no `error TS`) |
| `pnpm typecheck` (Task 2) | PASS (exit 0, no `error TS`) |
| `track/page.tsx` static checks | `redirect('/learn/plan')` ✓ · imported from `next/navigation` ✓ · no `'use client'`/`useEffect`/`router.push` in code ✓ |
| `pnpm test:e2e learn-redirect` (track case) | BLOCKED — login step failed `invalid_credentials` (see Deferred) |

## Deviations from Plan

None to the implementation. One verification deferral (below).

## Deferred Verification

**1. [Out-of-scope — test harness credentials] `/learn/track` e2e could not execute**
- **Found during:** Task 2 `<automated>` verify.
- **Issue:** The e2e dev server started and the spec ran, but `login()` failed at `page.waitForURL` because Supabase returned `invalid_credentials` for the hardcoded `tester@mpstats.academy` / `TestUser2024` in the Wave-0 spec (`learn-redirect.spec.ts:21-22`, authored by 61-00). The test never reached the redirect assertion.
- **Why not auto-fixed:** Guessing/rotating account passwords is a credential gate, not a code defect, and is outside this plan's scope (the spec credentials belong to 61-00). The redirect implementation is the exact prescribed Server Component pattern (`redirect('/learn/plan')`, identical to `(main)/layout.tsx`), typecheck is green, and static checks confirm all acceptance criteria.
- **To verify on staging/CI:** ensure the tester account password matches the spec (or fix the spec to the live credential), then `npx playwright test learn-redirect --grep "track lands"` — the assertion checks final URL only and will pass against the server redirect.
- **Files involved:** `apps/web/tests/e2e/learn-redirect.spec.ts` (61-00-owned credentials).

## Known Stubs

None introduced. The 4 sub-route hrefs (`/learn/{plan,solutions,library,favorites}`) point at pages that do not exist yet — this is expected per the plan (61-02 builds them). `/learn/track` redirects to `/learn/plan`, which 404s until 61-02; the redirect itself is correct and the e2e contract asserts URL only.

## Self-Check: PASSED

- FOUND: apps/web/src/components/learning/LearningTabs.tsx
- FOUND (modified): apps/web/src/components/shared/sidebar.tsx
- FOUND (modified): apps/web/src/components/shared/mobile-nav.tsx
- FOUND (modified): apps/web/src/app/(main)/learn/track/page.tsx
- FOUND commit: fb693d8 (Task 1)
- FOUND commit: 2f39ee6 (Task 2)
