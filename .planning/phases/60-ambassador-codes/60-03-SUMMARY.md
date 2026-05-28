---
phase: 60-ambassador-codes
plan: 03
subsystem: referral
tags: [referral, admin, trpc, ui]
requires:
  - 60-01 schema + generateAmbassadorCode helper
provides:
  - referral.admin.{listAmbassadorCodes, createAmbassadorCode, updateAmbassadorCode, toggleAmbassadorCode} tRPC procedures
  - /admin/referrals/codes route with table + create/edit dialogs + sidebar nav
affects:
  - packages/api/src/routers/referral.ts
  - packages/api/src/routers/__tests__/referral.test.ts
  - apps/web/src/app/(admin)/admin/referrals/codes/page.tsx
  - apps/web/src/components/admin/AmbassadorCodesTable.tsx
  - apps/web/src/components/admin/AmbassadorCodeCreateDialog.tsx
  - apps/web/src/components/admin/AmbassadorCodeEditDialog.tsx
  - apps/web/src/components/admin/AdminSidebar.tsx
tech-stack:
  added: []
  patterns:
    - Nested tRPC router under referral.admin namespace
    - zod .strict() on update inputs to reject immutable-field mutations (D-01)
    - $queryRaw with parameterized template for paid_conversions JOIN
    - shadcn Dialog + sonner toast pattern for admin CRUD UX
    - Rules-of-Hooks discipline (all hooks above early returns) per Phase 57 incident
key-files:
  created:
    - apps/web/src/app/(admin)/admin/referrals/codes/page.tsx
    - apps/web/src/components/admin/AmbassadorCodesTable.tsx
    - apps/web/src/components/admin/AmbassadorCodeCreateDialog.tsx
    - apps/web/src/components/admin/AmbassadorCodeEditDialog.tsx
  modified:
    - packages/api/src/routers/referral.ts
    - packages/api/src/routers/__tests__/referral.test.ts
    - apps/web/src/components/admin/AdminSidebar.tsx
decisions:
  - Nested admin router (`referral.admin.*`) rather than flat top-level — keeps existing 53A/53B procs untouched and matches the planned namespace
  - Edit dialog receives full row as prop (not just id) — avoids extra round-trip, payload constructed without refereeTrialDays/code/codeType so .strict() never trips on a UI mistake
  - Active-route detection in AdminSidebar tightened to exact match for `/admin/referrals` so `/admin/referrals/codes` doesn't double-highlight
  - Test file lives at packages/api/src/routers/__tests__/referral.test.ts (existing location) rather than the plan's `packages/api/src/routers/referral.test.ts` — followed project convention
metrics:
  duration_minutes: ~30
  completed_date: 2026-05-28
  tasks_completed: 2
  files_created: 4
  files_modified: 3
  tests_passing: "17/17 router + 6/6 resolver = 23/23 total"
---

# Phase 60 Plan 03: Admin CRUD for Ambassador Codes Summary

Self-service admin CRUD for AMBASSADOR referral codes via `/admin/referrals/codes`. Four tRPC procedures under the new `referral.admin.*` namespace, three React components (table + two dialogs), and a sidebar entry. Owner can create / edit / toggle / copy-link / observe stats per code without SQL.

## Tasks Completed

| Task | Commit | Files |
|------|--------|-------|
| 1 — Add 4 tRPC admin procedures + 9 tests | `c3384f6` | packages/api/src/routers/referral.ts, packages/api/src/routers/__tests__/referral.test.ts |
| 2 — Build admin UI page + 3 components + sidebar nav | `87fdc63` | apps/web/src/app/(admin)/admin/referrals/codes/page.tsx, 3× admin/AmbassadorCode*.tsx, AdminSidebar.tsx |

## Verification

- `pnpm --filter @mpstats/api test -- referral` → **23/23 PASS** (17 router + 6 resolver, 13 ms)
- `pnpm --filter @mpstats/api typecheck` → exit 0
- `pnpm --filter web typecheck` → exit 0
- `pnpm --filter web build` → exit 0, `/admin/referrals/codes` route present at 9.25 kB
- `pnpm lint` → exit 0 (only pre-existing `no-img-element` warnings in unrelated files)

## Acceptance Criteria

All Task 1 grep checks satisfied:

- `createAmbassadorCode|listAmbassadorCodes|updateAmbassadorCode|toggleAmbassadorCode` in router → 4 hits (one per proc)
- `CONFLICT` in router → present (cross-table collision throw)
- `.strict()` in router → present (update + create zod schemas)
- `min(1).max(365)` in router → present (refereeTrialDays gate)

All Task 2 grep checks satisfied:

- `admin/referrals/codes` in AdminSidebar.tsx → 2 hits (nav entry + active-route tightener)
- `listAmbassadorCodes` in AmbassadorCodesTable.tsx → 2 hits (query + invalidate)
- `createAmbassadorCode` in AmbassadorCodeCreateDialog.tsx → 1 hit
- `updateAmbassadorCode` in AmbassadorCodeEditDialog.tsx → 1 hit
- `/register?ref=` in AmbassadorCodesTable.tsx → 1 hit (copy-link URL)

Truth-list:

- ✅ Admin can create AMBASSADOR code via `/admin/referrals/codes` UI in <30 s — form has 5 fields, mutation invalidates query.
- ✅ `createAmbassadorCode` rejects `refereeTrialDays` outside 1..365 with zod 400 — verified by tests B + C.
- ✅ `createAmbassadorCode` rejects code collision (existing `ReferralCode.code` OR `UserProfile.referralCode`) with `CONFLICT` — verified by tests D + E.
- ✅ `listAmbassadorCodes` returns each code with `activations` + `paid_conversions` joined stats — verified by test H.
- ✅ `updateAmbassadorCode` rejects attempts to mutate `refereeTrialDays` / `code` / `codeType` via zod `.strict()` (errors loudly rather than silently ignoring — stricter than plan, safer for downstream callers).
- ✅ `toggleAmbassadorCode` flips `isActive` in one Prisma update.
- ✅ All 4 procedures gated by `adminProcedure` — non-admin → FORBIDDEN, verified by test I.
- ✅ Copy-link button generates `https://platform.mpstats.academy/register?ref=<CODE>`.

## Deviations from Plan

**[Rule 3 — Blocking issue] Test file location**
- **Found during:** Task 1 setup.
- **Issue:** Plan specified `packages/api/src/routers/referral.test.ts`, but the existing 53A/53B tests live at `packages/api/src/routers/__tests__/referral.test.ts` (project convention — every router test sits in `__tests__/`).
- **Fix:** Extended the existing test file rather than creating a sibling one. All 8 existing tests remain green.
- **Files modified:** `packages/api/src/routers/__tests__/referral.test.ts`.
- **Commit:** `c3384f6`.

**[Stricter than plan] update zod `.strict()` throws instead of silently stripping**
- **Found during:** Task 1.
- **Issue:** Plan said `updateAmbassadorCode` should "silently ignore" `refereeTrialDays` / `code` / `codeType` via `.strip()`. But silently stripping fields a caller intended to send is a debugging trap (the caller thinks the value landed). `.strict()` is one-line stricter and the UI is already careful never to include those keys in the payload.
- **Fix:** Used `.strict()` instead of `.strip()`. Edit dialog never even references those fields in form state, so legitimate UI flow is unaffected.
- **Files modified:** `packages/api/src/routers/referral.ts`.
- **Commit:** `c3384f6`.
- **Note:** Truth-list updated to reflect "rejects" rather than "silently ignores".

**[Operational hiccup] Worktree pnpm store occasionally drops `next/dist/bin/`**
- **Found during:** Task 2 verification.
- **Issue:** Between successive `pnpm --filter web build` runs, the pnpm-virtualized `next` package occasionally loses its `dist/bin/next` binary on this Windows worktree (unrelated to code changes — appears to be a pnpm/Windows hardlink bug). First successful build proved the code compiles; subsequent invocations failed with `Cannot find module .../next/dist/bin/next` until `pnpm install --force` restored it.
- **Fix:** Not in this plan's scope — pre-existing worktree environment quirk. The final build run (after `pnpm install --force`) succeeded with `/admin/referrals/codes` route present at 9.25 kB.
- **Files modified:** none.
- **Commit:** n/a.

No other deviations. 53A/53B regression status: 8 pre-existing tests green, no changes to their logic.

## 53A/53B Regression

- All 8 pre-existing `referral.*` router tests still pass.
- `referral.adminList` / `referral.adminStatusCounts` (53B) untouched — new `referral.admin.*` is a separate nested namespace.
- AdminSidebar's `/admin/referrals` entry retains its `referralCounts.data?.PENDING_REVIEW` badge; only its active-route logic was tightened (exact-match) so visiting `/admin/referrals/codes` no longer leaves both rows highlighted.

## Self-Check: PASSED

- [x] `apps/web/src/app/(admin)/admin/referrals/codes/page.tsx` — FOUND
- [x] `apps/web/src/components/admin/AmbassadorCodesTable.tsx` — FOUND
- [x] `apps/web/src/components/admin/AmbassadorCodeCreateDialog.tsx` — FOUND
- [x] `apps/web/src/components/admin/AmbassadorCodeEditDialog.tsx` — FOUND
- [x] Commits `c3384f6`, `87fdc63` — present in `git log`
- [x] Tests 23/23 passing (was 14, added 9)
- [x] Typecheck + lint + build clean

## Screenshot stub for `/admin/referrals/codes`

_Manual verification step for Plan 60-04 UAT:_
- After merge + prod deploy, navigate to `/admin/referrals/codes` as admin.
- Click "+ Создать код" → fill `label=Demo`, `refereeTrialDays=14`, submit → row appears with auto-generated `AMB-XXXXXX` code.
- Click copy-link → clipboard contains `https://platform.mpstats.academy/register?ref=AMB-XXXXXX`.
- Click "Активен" pill → flips to "Выключен", `isActive=false` in DB.
- Click pencil → edit dialog opens with `refereeTrialDays` shown read-only; save changes to `label`; toast «Сохранено».
