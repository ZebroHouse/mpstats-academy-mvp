---
phase: 61
plan: "05"
subsystem: learning-ui
tags: [wave-6, learning-2.0, hero-search, dashboard-entries, D-08, D-09, pure-ui]
requires:
  - "61-04 (scoped AgentSearch on solutions/library + hero-slot comments)"
  - "61-02 (4 routed sub-pages /learn/{plan,solutions,library,favorites})"
provides:
  - "LearningHero — gradient hero wrapper (display headline + large search slot + data-tour=learn-search) wrapping scoped AgentSearch"
  - "AgentSearch size='hero' variant (h-14, rounded-xl, solid-pill submit) — no fork, opt-in via prop"
  - "Dashboard 3 accent entry cards (plan/library/solutions) + condensed stats strip with all-zero hint"
affects:
  - apps/web/src/components/learning/LearningHero.tsx
  - apps/web/src/components/learning/AgentSearch.tsx
  - apps/web/src/app/(main)/learn/solutions/page.tsx
  - apps/web/src/app/(main)/learn/library/page.tsx
  - apps/web/src/app/(main)/dashboard/page.tsx
tech-stack:
  added: []
  patterns:
    - "Hero owns visual chrome (bg-mp-hero-gradient, text-display-sm, data-tour anchor); scoped AgentSearch passed as children — no component fork"
    - "AgentSearch grows via opt-in size prop ('default'|'hero'), conditional classes only — existing default callers untouched"
    - "Dashboard entry cards built from a single ENTRY_CARDS config array (DRY) using Card variant+interactive + lucide icons"
    - "Condensed stats: IIFE all-zero guard renders a hint for new users instead of 4×0 dead tiles"
key-files:
  created:
    - apps/web/src/components/learning/LearningHero.tsx
  modified:
    - apps/web/src/components/learning/AgentSearch.tsx
    - apps/web/src/app/(main)/learn/solutions/page.tsx
    - apps/web/src/app/(main)/learn/library/page.tsx
    - apps/web/src/app/(main)/dashboard/page.tsx
decisions:
  - "[61-05]: AgentSearch larger hero treatment via opt-in size='hero' prop (h-14 rounded-xl shadow-mp-card + solid-pill blue submit) — NOT a fork; default callers keep the h-12 inline form. data-tour=learn-search moved from the page wrapper onto LearningHero's search slot (single owner)"
  - "[61-05]: solutions hero headline «Решите задачу за минуту» (UI-SPEC §2 example) + subline «Готовые инструкции…»; library hero headline «База знаний» + «Все курсы, уроки и материалы платформы». Hero chips: solutions = MarketplaceSwitch + progress filter; library = material-type chip row (moved under the input). Inactive chips switched to bg-white/70 (UI-SPEC §2 on-gradient contrast)"
  - "[61-05]: dashboard entry cards from one ENTRY_CARDS config — plan→soft-blue, library→soft-green, solutions→gradient (UI-SPEC §3 mapping), Card interactive p-6 wrapped in Link, lucide CalendarCheck/Search/Target. 2 legacy quick-action CTA cards (diagnostic/learn) left unchanged per plan (Radar/next-lesson/activity remain below)"
  - "[61-05]: stats condensed from 4 Card tiles → single flex strip of label:value pairs (text-body-sm); all-zero new-user guard renders «Начните с диагностики — и здесь появится ваша статистика» hint instead of zeros"
metrics:
  duration: ~12min
  completed: 2026-06-03
---

# Phase 61 Plan 05: Hero Search Block + Dashboard 3 Entries Summary

Pure UI/layout (D-08 + D-09) reusing existing brand tokens and the 61-04 scoped `AgentSearch` — no new search logic, no favorite/heart UI (that is 61-07). A new `LearningHero` gradient wrapper surfaces search prominently at the top of «Решения под задачу» and «База знаний»; the dashboard now leads with 3 large accent entry cards routing to plan/library/solutions, with the old 4 stat tiles condensed into a compact strip (all-zero new users see a hint, not dead zeros).

## What Was Built

**Task 1 — LearningHero wrapper + hero-mounted search on Solutions & Library** (commit `771225d`):
- `LearningHero.tsx` (NEW, `'use client'`) — full-width `bg-mp-hero-gradient rounded-xl px-4 py-6 md:px-6 md:py-8` block. `text-display-sm` headline (per-scope), optional `text-body text-mp-gray-700` subline, and a `{children}` search slot carrying `data-tour="learn-search"` (D-10). Props: `scope`, `headline`, optional `subline`. Owns the chrome only — does not fork `AgentSearch`.
- `AgentSearch.tsx` — added opt-in `size?: 'default' | 'hero'`. `hero` → `h-14 rounded-xl shadow-mp-card` form + `text-body` input + a solid blue pill submit (`bg-mp-blue-500 text-white rounded-lg`) and a focus ring on the field. `default` (all existing callers) unchanged. Imported `cn` for the conditional classes.
- `solutions/page.tsx` — replaced the bare header + marketplace + `<AgentSearch scope="solutions" />` mount with `<LearningHero scope="solutions" headline="Решите задачу за минуту" …>` wrapping `<AgentSearch scope="solutions" size="hero" />` + the `MarketplaceSwitch` and progress chips moved under the input (inactive chips → `bg-white/70`). The job-catalog render below is unchanged; the old page-level `data-tour="learn-search"` wrapper is gone (hero owns it now).
- `library/page.tsx` — same wrap: `<LearningHero scope="library" headline="База знаний" …>` around `<AgentSearch scope="library" size="hero" />` + the existing `CATALOG_CHIPS` material-type row moved under the input. All 61-04 query wiring (material catalog, courses accordion, add-to-plan) preserved.

**Task 2 — Dashboard 3 entry cards + condensed stats strip** (commit `0ec90dc`):
- `dashboard/page.tsx` — added an `ENTRY_CARDS` config (plan→soft-blue, library→soft-green, solutions→gradient) and rendered a `grid grid-cols-1 md:grid-cols-3 gap-6` of `Card interactive p-6` links at the very top (above stats), each with a lucide icon, `text-heading-lg` title, `text-body-sm text-mp-gray-600` sub-line. Canon titles «Продолжить мой план» / «Найти быстрый ответ» / «Решить задачу».
- Condensed the 4 stat tiles into a single `flex flex-wrap gap-x-6` strip of inline `label: value` pairs (`text-body-sm`) below the entry cards. An IIFE all-zero guard renders the hint «Начните с диагностики — и здесь появится ваша статистика обучения.» for brand-new users instead of four `0`s.
- Radar, «Продолжить урок», activity feed, and the 2 legacy quick-action CTA cards remain unchanged below.

## Verification

| Gate | Result |
|------|--------|
| `pnpm typecheck` | PASS (6/6 packages, no `error TS`) — after both tasks |
| `pnpm test` (full suite) | PASS — api 130/130 (8 skipped), ai 58/58, web 208/208 |
| LearningHero contains `bg-mp-hero-gradient` + `text-display-sm` + `data-tour="learn-search"` | yes |
| solutions & library wrap AgentSearch in `<LearningHero` | yes |
| dashboard has `/learn/plan` `/learn/library` `/learn/solutions` in 3 entry cards w/ canon titles | yes |
| entry cards use `Card interactive` + soft-blue/soft-green/gradient | yes |
| stat all-zero guard present | yes (IIFE hint branch) |
| no raw `text-[Npx]` introduced | yes — semantic tokens only |

## Deviations from Plan

None — plan executed as written. Two within-spec choices worth noting (both pre-authorized by UI-SPEC, not deviations):
- AgentSearch `h-14` treatment delivered via an opt-in `size` prop (plan explicitly allowed "a class or boolean… do NOT fork AgentSearch").
- Inactive hero chips use `bg-white/70` per UI-SPEC §2 (on-gradient contrast) rather than the page-default `bg-white`.

## Known Stubs

None introduced. FavoriteButton/heart UI remains owned by 61-07 (untouched here, as scoped).

## Threat Flags

None. Pure presentational/layout change — no new network endpoints, auth paths, or schema changes. Reuses existing `AgentSearch` (61-04, already `isHidden`-filtered) and dashboard read queries.

## Self-Check: PASSED

- FOUND: apps/web/src/components/learning/LearningHero.tsx
- FOUND (modified): apps/web/src/components/learning/AgentSearch.tsx
- FOUND (modified): apps/web/src/app/(main)/learn/solutions/page.tsx
- FOUND (modified): apps/web/src/app/(main)/learn/library/page.tsx
- FOUND (modified): apps/web/src/app/(main)/dashboard/page.tsx
- FOUND commit: 771225d (Task 1)
- FOUND commit: 0ec90dc (Task 2)
