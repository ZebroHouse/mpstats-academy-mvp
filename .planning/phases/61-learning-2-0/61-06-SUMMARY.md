---
phase: 61
plan: "06"
subsystem: favorites
tags: [wave-7, favorite, polymorphic, idor, migration, checkpoint-pending]
requires:
  - "favorite.test.ts RED stub (61-00)"
provides:
  - "Favorite polymorphic model + FavoriteItemType enum (D-06)"
  - "additive migration 20260603000000_add_favorite (NOT YET applied to prod)"
  - "favorite.{add,remove,list,isFavorited} IDOR-safe router mounted in root.ts"
affects:
  - packages/db/prisma/schema.prisma
  - packages/api/src/root.ts
tech-stack:
  added: []
  patterns:
    - "polymorphic Favorite (itemType/itemId, no FK on itemId — app-level integrity)"
    - "IDOR-safe: userId ALWAYS ctx.user.id, zod input carries only {itemType,itemId}"
    - "list resolves itemId→entity with isHidden:false (+ course.isHidden:false / isPublished:true), drops dangling/hidden refs"
    - "isFavorited batch keyed by itemType:itemId (no N+1)"
key-files:
  created:
    - packages/db/prisma/migrations/20260603000000_add_favorite/migration.sql
    - packages/api/src/routers/favorite.ts
  modified:
    - packages/db/prisma/schema.prisma
    - packages/api/src/root.ts
    - packages/api/src/routers/__tests__/favorite.test.ts
decisions:
  - "Favorite.itemId has NO FK (polymorphic across Lesson/Job/Material) — integrity enforced in favorite.list resolution, not DB"
  - "add uses upsert on @@unique([userId,itemType,itemId]) with empty update — idempotent no-op on duplicate"
  - "Job filtered by isPublished:true (Job has no isHidden field); Lesson/Material by isHidden:false"
  - "isFavorited returns string[] of `itemType:itemId` keys (serializable, vs Set) — frontend builds its own membership lookup"
  - "PROD migration NOT applied by executor — blocking human-action checkpoint (shared live DB, 158 paying users)"
metrics:
  duration: ~10min
  completed: 2026-06-03
status: PARTIAL — prod migration pending owner approval (Task 2 checkpoint)
---

# Phase 61 Plan 06: Favorite Model + IDOR-safe Router Summary

Landed the polymorphic `Favorite` model (D-06), wrote the additive migration (D-07), and built the IDOR-safe `favorite.{add,remove,list,isFavorited}` router — the backend foundation for the heart UI + track→favorites data-migration in 61-07. **Plan is PARTIAL:** the additive migration is written and committed but NOT applied to the live prod Supabase DB — that step is a blocking human-action checkpoint (Task 2) handled by the owner.

## What Was Built

**Task 1 — schema + migration** (commit `4ca4be6`):
- `schema.prisma`: `enum FavoriteItemType { LESSON JOB MATERIAL }` + `model Favorite` (cuid id, userId, itemType, itemId, createdAt, `@@unique([userId,itemType,itemId])`, `@@index([userId,itemType])`, `user UserProfile` relation `onDelete: Cascade`) + `favorites Favorite[]` back-relation on `UserProfile`. Schema validates with `prisma@5.22.0 validate`; client generated.
- `migrations/20260603000000_add_favorite/migration.sql`: additive-only — `CREATE TYPE "FavoriteItemType"`, `CREATE TABLE "Favorite"`, unique index `Favorite_userId_itemType_itemId_key`, index `Favorite_userId_itemType_idx`, FK to `UserProfile` `ON DELETE CASCADE`. Pre-flight `grep -E 'DROP|TRUNCATE|ALTER COLUMN.*TYPE'` = 0.

**Task 1 — router + tests** (commit `9c7b764`):
- `favorite.ts`: 4 `protectedProcedure`s. `add` upserts (idempotent no-op) with `userId: ctx.user.id`. `remove` deleteMany scoped to user. `list` batch-resolves itemIds per type with `isHidden:false` (Lesson + `course.isHidden:false`), `isPublished:true` (Job), `isHidden:false` (Material), preserving `createdAt desc` order and silently dropping dangling/hidden refs (D-10). `isFavorited` runs one `OR` query, returns `string[]` of `itemType:itemId` keys (no N+1). Every proc wrapped in `try{}catch(e){ if(e instanceof TRPCError) throw e; handleDatabaseError(e) }`.
- `root.ts`: `favorite: favoriteRouter` mounted alongside `material`/`referral`.
- `favorite.test.ts`: un-skipped all RED bodies; 8 assertions green covering IDOR scope (attacker-supplied `input.userId` ignored in add/remove), idempotency, optional itemType filter, isHidden resolution + dangling-ref drop, isFavorited batching + empty-input short-circuit.

**Task 2 — [BLOCKING] apply migration to PROD: NOT EXECUTED.** Halted at checkpoint (see below).

## Verification

| Gate | Result |
|------|--------|
| `prisma@5.22.0 validate` | valid |
| `prisma@5.22.0 generate` | client generated (Favorite/FavoriteItemType types exist) |
| `vitest run favorite` | 8 favorite tests pass (3 migrate-track skips belong to 61-07) |
| `tsc --noEmit` (packages/api) | clean (0 errors) |
| Destructive-SQL grep on migration.sql | 0 matches |
| `input.userId` code reads in favorite.ts | 0 (only 2 doc-comment mentions) |
| `ctx.user.id` uses in favorite.ts | 10 |
| `favorite: favoriteRouter` in root.ts | 1 |

## CHECKPOINT PENDING — Task 2 (blocking human-action)

The additive migration must be applied to the **shared live prod Supabase DB `saecuecevicwjkpmaoot`** (158 paying users, 24+ prod tables) via the Supabase Management API. The executor did NOT apply it (PROD DATABASE SAFETY). Approval payload for the owner is in the checkpoint return message and below.

**Migration file:** `packages/db/prisma/migrations/20260603000000_add_favorite/migration.sql`
**sha256 (LF):** `2e08b0ad4f28bbb9c9aa70c3fb8c6e1c3f496a24f7db724d9bbaaafdbc09d865`

Owner steps (per `reference_supabase_migration_via_mgmt_api.md`):
1. PRE-FLIGHT: confirm PITR backup enabled on `saecuecevicwjkpmaoot`.
2. POST the DDL (CREATE TYPE + CREATE TABLE + 2 indexes + FK) to `https://api.supabase.com/v1/projects/saecuecevicwjkpmaoot/database/query`.
3. INSERT `_prisma_migrations` row: `migration_name='20260603000000_add_favorite'`, `checksum='2e08b0ad...d865'`, `applied_steps_count=1`.
4. VERIFY: `SELECT to_regclass('public."Favorite"')` non-null.

## Deviations from Plan

**1. [Rule 1 — correctness] Job resolution uses isPublished, not isHidden**
- **Found during:** Task 1 (list resolution)
- **Issue:** The plan/threat-model says "resolve with isHidden:false", but the `Job` model has no `isHidden` field — it uses `isPublished` for visibility (schema.prisma:643).
- **Fix:** `favorite.list` filters jobs by `isPublished: true`; lessons/materials by `isHidden: false`. Same intent (hide non-visible entities), correct per-entity field.
- **Files modified:** `packages/api/src/routers/favorite.ts`
- **Commit:** `9c7b764`

**2. [Test-harness] userProfile mock required in makeCtx**
- The 61-00 RED stub's `makeCtx` lacked `prisma.userProfile`, but `protectedProcedure` middleware fire-and-forgets a `userProfile.findUnique` (lastActiveAt debounce). Added a `userProfile` mock placed AFTER the override spread so test-specific `prisma` overrides can't wipe it. Not a behavior change to the router — same pattern as the 56-02 onboarding test note.

## Known Stubs

None in production code. The 3 skipped tests in `scripts/__tests__/migrate-track-to-favorites.test.ts` are the 61-07 target (track→favorites migration script), out of scope for 61-06.

## Self-Check: PASSED

- FOUND: packages/db/prisma/migrations/20260603000000_add_favorite/migration.sql
- FOUND: packages/api/src/routers/favorite.ts
- FOUND (modified): packages/db/prisma/schema.prisma (Favorite model + back-relation)
- FOUND (modified): packages/api/src/root.ts (favorite mounted)
- FOUND commit: 4ca4be6 (schema + migration)
- FOUND commit: 9c7b764 (router + tests)
- NOT APPLIED (by design): prod migration — pending owner checkpoint
