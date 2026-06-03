---
phase: 61
plan: "00"
subsystem: testing
tags: [wave-0, test-scaffold, nyquist, vitest, playwright, red-state]
requires: []
provides:
  - "favorite.test.ts — RED stub for favorite CRUD + isFavorited batch + IDOR scope (target of 61-06)"
  - "migrate-track-to-favorites.test.ts — RED stub for idempotency + LessonProgress snapshot (target of 61-06)"
  - "material.listForUser tests — RED stub for isHidden filter + type/search + standalone (target of 61-04)"
  - "AgentSearch.test.tsx — RED stub for scope routing solutions/library (target of 61-03)"
  - "learn-redirect.spec.ts — RED stub for /learn + /learn/track server redirects (target of 61-01)"
affects:
  - packages/api/vitest.config.ts
tech-stack:
  added: []
  patterns:
    - "RED-state scaffold: it.skip / test.fixme bodies with GREEN-step recipe in comments"
    - "no top-level import of not-yet-existing modules (favoriteRouter / migrate script) → avoids collection error"
    - "api vitest include extended to collect root scripts/__tests__/"
key-files:
  created:
    - packages/api/src/routers/__tests__/favorite.test.ts
    - scripts/__tests__/migrate-track-to-favorites.test.ts
    - apps/web/src/components/learning/__tests__/AgentSearch.test.tsx
    - apps/web/tests/e2e/learn-redirect.spec.ts
  modified:
    - packages/api/src/routers/__tests__/material.test.ts
    - packages/api/vitest.config.ts
decisions:
  - "FavoriteItemType NOT imported from @mpstats/db (enum lands 61-06) — string literals 'LESSON'|'JOB'|'MATERIAL' used instead so suites collect green"
  - "migration test lives in root scripts/__tests__/; api vitest include extended with ../../scripts/__tests__/**/*.test.ts so it runs under the node harness (no separate package)"
  - "behavioral assertions authored as commented GREEN recipes inside it.skip bodies — downstream waves flip skip→it + un-comment the real import"
metrics:
  duration: ~7min
  completed: 2026-06-03
---

# Phase 61 Plan 00: Wave 0 Test Scaffolds Summary

Authored the 5 Wave-0 RED test scaffolds required by 61-VALIDATION.md so every downstream behavior with an `<automated>` verify has a test target that already exists — satisfying Nyquist Dimension 8 (no Wave A–E task can claim `<automated>MISSING`). All assertion shells exist; behavioral bodies are `it.skip`/`test.fixme` pending the implementation they target, so all suites collect green today.

## What Was Built

**Task 1 — Backend stubs** (commit `9a7868e`):
- `packages/api/src/routers/__tests__/favorite.test.ts` — `describe('favorite router')` covering `add`/`remove`/`list`/`isFavorited`, each asserting `ctx.user.id` is the only userId source (IDOR guard, T-IDOR-fav). `favoriteRouter` + `FavoriteItemType` are NOT imported at top level (land in 61-06); item types are string literals.
- `scripts/__tests__/migrate-track-to-favorites.test.ts` — idempotency contract via `skipDuplicates`, custom-section→`Favorite(LESSON)` / `addedJobs[]`→`Favorite(JOB)`, and the hard rule **`LessonProgress` count before == after** (D-03/D-07). Self-contained prisma stub records `createMany` calls.
- `packages/api/src/routers/__tests__/material.test.ts` (extended) — new `describe('material.listForUser')` block: forces `where.isHidden=false` with no `includeHidden` escape, honors `type` + title `contains` search, includes `isStandalone:true` rows, and freezes the `getSignedUrl` download ACL (D-05).
- `packages/api/vitest.config.ts` — `include` extended with `../../scripts/__tests__/**/*.test.ts` so the root migration test runs under the api node harness.

**Task 2 — Frontend stubs** (commit `69a0c88`):
- `apps/web/src/components/learning/__tests__/AgentSearch.test.tsx` — `describe('AgentSearch scope')`: `scope='solutions'`→`intent.resolve`, `scope='library'`→`ai.searchLessons` + `material.listForUser` with grouped «Уроки»/«Материалы». trpc-mock harness mirrors the existing `tests/unit/AgentSearch.test.tsx`. The `scope` prop lands in 61-03.
- `apps/web/tests/e2e/learn-redirect.spec.ts` — Playwright `test.describe('learn redirects')`: `/learn/track`→`/learn/plan` and `/learn`→default (`/learn/plan` or `/learn/library`). Asserts **final URL only** (server redirect, never `router.push` — incident 2026-05-19 guard). Routes land in 61-01.

## Verification

| Gate | Result |
|------|--------|
| api: `vitest run favorite migrate-track material` | 3 files pass, 9 run + 12 skipped, no collection error |
| web: `vitest run AgentSearch` | 2 files pass (new + existing), 5 run + 2 skipped, no collection error |
| e2e: `playwright test learn-redirect --list` | 1 file, 2 specs (×4 projects) collect, no syntax/import error |

All 5 Wave-0 VALIDATION rows now have a corresponding file. Collection-clean; RED behavioral assertions deferred via skip/fixme as specified by the plan.

## Deviations from Plan

**1. [Rule 3 — Blocking] Migration test placement vs test runner**
- **Found during:** Task 1
- **Issue:** The plan path `scripts/__tests__/migrate-track-to-favorites.test.ts` is in the repo root `scripts/` dir, which belongs to no package; with `turbo run test` running per-package vitest, nothing would collect it.
- **Fix:** Extended `packages/api/vitest.config.ts` `include` with `../../scripts/__tests__/**/*.test.ts` (node environment, same harness). File stays at the plan-specified path.
- **Files modified:** `packages/api/vitest.config.ts`
- **Commit:** `9a7868e`

**2. [Plan-honoring] No `@mpstats/db` enum import**
- The plan interface notes `FavoriteItemType` from `@mpstats/db`, but that enum lands in 61-06. Importing it now would be a hard collection error (violating the acceptance gate). Used string literals `'LESSON'|'JOB'|'MATERIAL'` and documented the enum swap in the GREEN-step recipe. Not a behavior change — the assertion shells are identical.

## Known Stubs

All 5 files are intentional Wave-0 RED scaffolds (the entire purpose of plan 61-00). Behavioral bodies are `it.skip` / `test.fixme` and will be turned GREEN by the waves that implement their targets: 61-01 (redirects), 61-03 (AgentSearch scope), 61-04 (material.listForUser), 61-06 (favorite router + migration script). No production code was stubbed into existence.

## Self-Check: PASSED

- FOUND: packages/api/src/routers/__tests__/favorite.test.ts
- FOUND: scripts/__tests__/migrate-track-to-favorites.test.ts
- FOUND: apps/web/src/components/learning/__tests__/AgentSearch.test.tsx
- FOUND: apps/web/tests/e2e/learn-redirect.spec.ts
- FOUND (modified): packages/api/src/routers/__tests__/material.test.ts
- FOUND commit: 9a7868e (Task 1)
- FOUND commit: 69a0c88 (Task 2)
