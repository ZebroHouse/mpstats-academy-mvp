---
phase: 61
plan: "03"
subsystem: materials
tags: [wave-4, material, listForUser, library, tdd, protected-read, optional-lessonId]
requires:
  - "material.test.ts RED stub (61-00) — material.listForUser assertions to satisfy"
provides:
  - "material.listForUser — protectedProcedure user-facing material read (isHidden forced false, type+search filters, standalone+attached, hasFile-only payload) — consumed by 61-04 library search + library catalog + 61-07 Избранное"
  - "MaterialCard.lessonId optional — standalone (externalUrl-only) materials render without a lessonId"
affects:
  - packages/api/src/routers/material.ts
  - apps/web/src/components/learning/MaterialCard.tsx
tech-stack:
  added: []
  patterns:
    - "protected read forces where.isHidden=false (no includeHidden escape) — T-61-03-01 mitigation"
    - "storagePath never sent to client — server-side map to hasFile boolean (State 49-02)"
    - "download ACL (getSignedUrl) read-only-frozen; standalone = externalUrl-only (A8)"
key-files:
  created: []
  modified:
    - packages/api/src/routers/material.ts
    - packages/api/src/routers/__tests__/material.test.ts
    - apps/web/src/components/learning/MaterialCard.tsx
decisions:
  - "[61-03]: listForUser select запрашивает storagePath из БД, но маппит его в hasFile boolean до возврата — storagePath НИКОГДА не уходит клиенту (payload-level guarantee, не select-level)"
  - "[61-03]: 61-00 RED-стаб assertion про select.storagePath !== true снят — реальная T-61-03-02 защита на уровне payload (mapped-out), а не select; тест-ассерция переведена на проверку финального item.hasFile/storagePath"
  - "[61-03]: MaterialCard.lessonId required→optional — расширение API безопасно (единственный caller LessonMaterials передаёт lessonId); standalone-карточка без lessonId = externalUrl-only, file download-путь gated на Boolean(lessonId)"
  - "[61-03]: getSignedUrl ACL frozen — diff к material.ts чисто additive (+65 строк listForUser), FORBIDDEN-ветка на :437 нетронута"
metrics:
  duration: ~9min
  completed: 2026-06-03
---

# Phase 61 Plan 03: material.listForUser + standalone MaterialCard Summary

User-facing `material.listForUser` read endpoint (D-05) so materials surface in the «База знаний» catalog, plus `MaterialCard.lessonId` made optional so standalone (externalUrl-only) materials render. Download ACL (`getSignedUrl`) frozen per A8 — the standalone-no-lesson gap never triggers because standalone materials are externalUrl-only this pass.

## What Was Built

**Task 1 — `material.listForUser` (protectedProcedure) + TDD test fill** (commit `0e283a9`):
- New `listForUser: protectedProcedure` in `materialRouter` (after `getById`). Input zod `{ type: z.nativeEnum(MaterialType).optional(), search: z.string().optional(), limit: 1..100 default 50, cursor }`.
- `where` always sets `isHidden = false` (no `includeHidden` escape — T-61-03-01); optional `type` filter; optional `title { contains, mode:'insensitive' }` search.
- Returns standalone (`isStandalone=true`) AND lesson-attached materials — no `lessons: { some }` constraint that would hide standalone rows.
- `select` reads `storagePath` server-side but maps it to a `hasFile` boolean before returning — `storagePath` is never in the client payload (State 49-02 / T-61-03-02).
- Wrapped in `try { } catch (e) { handleDatabaseError(e) }`. No `root.ts` change (materialRouter already mounted).
- Filled the 61-00 `material.test.ts` `it.skip` stubs → real assertions (isHidden forced, includeHidden ignored, type+search filters, standalone inclusion, hasFile-only payload, getSignedUrl FORBIDDEN-on-standalone regression). 12/12 green.

**Task 2 — `MaterialCard.lessonId` optional** (commit `076ba79`):
- `lessonId?: string` (was required). When absent (standalone card): `reachGoal` omits `lessonId`; the `getSignedUrl` file-download path is gated on `Boolean(lessonId)` so it is never invoked for standalone (A8 — externalUrl-only).
- `canDownloadFile = hasFile && Boolean(lessonId)` drives the disabled state; externalUrl «Открыть» path unchanged. Existing error copy («Доступ к материалу ограничен» / «Материал больше недоступен») preserved.
- Placeholder slot noted for `FavoriteButton` (mounted in 61-07) — heart NOT added yet, per plan.

## Verification

| Gate | Result |
|------|--------|
| api: `vitest run material` | 1 file, 12/12 tests pass |
| api: `pnpm typecheck` | exit 0 |
| web: `pnpm typecheck` | exit 0 |
| getSignedUrl ACL frozen | diff to material.ts is +65 additive lines; FORBIDDEN branch (:437) untouched (grep) |

## Deviations from Plan

**1. [Rule 1 — Test correctness] 61-00 stub select-level assertion adjusted to payload-level**
- **Found during:** Task 1 GREEN
- **Issue:** The reasonable GREEN implementation reads `storagePath` in the Prisma `select` to derive `hasFile`, then maps it out before returning. The 61-00 stub draft implied a `select.storagePath !== true` check, which conflicts with deriving `hasFile` from the field. The real T-61-03-02 mitigation is that `storagePath` never reaches the client payload — a payload-level guarantee, not a select-level one.
- **Fix:** Test now asserts `res.items[0].storagePath === undefined` and `hasFile === true` (the actual security property). Behavior unchanged; the 61-00 stub was a RED scaffold (its body was a `it.skip` placeholder, not a frozen contract).
- **Files modified:** `packages/api/src/routers/__tests__/material.test.ts`
- **Commit:** `0e283a9`

## Known Stubs

None. `listForUser` is fully wired; MaterialCard renders both attached and standalone paths. The `FavoriteButton` slot is an intentional documented placeholder owned by 61-07 (heart not yet mounted — per plan).

## Self-Check: PASSED

- FOUND: packages/api/src/routers/material.ts
- FOUND: apps/web/src/components/learning/MaterialCard.tsx
- FOUND (modified): packages/api/src/routers/__tests__/material.test.ts
- FOUND commit: 0e283a9 (Task 1)
- FOUND commit: 076ba79 (Task 2)
