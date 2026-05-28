---
phase: 60-ambassador-codes
plan: 01
subsystem: referral
tags: [schema, migration, referral, ambassador]
requires:
  - Phase 53A referral models (Referral, UserProfile.referralCode, ReferralBonusPackage)
provides:
  - ReferralCode model + AMBASSADOR enum value + Referral.codeId FK
  - resolveReferralCode() + resolveReferralCodeRaw() + ResolvedReferralCode type
  - generateAmbassadorCode() — AMB-XXXXXX Crockford-alphabet generator
affects:
  - packages/db/prisma/schema.prisma
  - packages/db/prisma/migrations/20260528000000_add_referral_code_table/migration.sql
  - packages/api/src/services/referral/code-resolver.ts (new)
  - packages/api/src/services/referral/code-resolver.test.ts (new)
  - packages/api/src/services/referral/code-generator.ts (new)
  - packages/api/src/index.ts
tech-stack:
  added: []
  patterns:
    - Discriminated union return type for polymorphic lookup
    - Crypto.randomInt for uniform random code generation
key-files:
  created:
    - packages/db/prisma/migrations/20260528000000_add_referral_code_table/migration.sql
    - packages/api/src/services/referral/code-resolver.ts
    - packages/api/src/services/referral/code-resolver.test.ts
    - packages/api/src/services/referral/code-generator.ts
  modified:
    - packages/db/prisma/schema.prisma
    - packages/api/src/index.ts
decisions:
  - Reused isValidRefCodeShape regex from attribution.ts — AMB-XXXXXX matches Phase 53A shape
  - Imported ReferralCode type via @mpstats/db re-export, not @prisma/client (consistent with rest of api package)
  - Exposed resolveReferralCodeRaw separately so Plan 60-02 orchestrator can log specific rejection reasons (expired vs max-uses vs disabled) to Sentry without re-querying
metrics:
  duration_minutes: ~25
  completed_date: 2026-05-28
  tasks_completed: 4
  files_created: 4
  files_modified: 2
  tests_passing: "6/6"
---

# Phase 60 Plan 01: Schema + Resolver Foundation Summary

Adds ReferralCode table + AMBASSADOR enum + Referral.codeId FK via additive migration; exposes resolveReferralCode() unified lookup utility from @mpstats/api.

## Tasks Completed

| Task | Commit | Files |
|------|--------|-------|
| 1 — Extend Prisma schema | `d3dcfd1` | packages/db/prisma/schema.prisma |
| 2 — Additive migration SQL | `5cfdaa6` | packages/db/prisma/migrations/20260528000000_add_referral_code_table/migration.sql |
| 3 — Human-verify checkpoint | (approved by owner) | — |
| 4 — code-resolver + code-generator + tests + exports | `cabc1bf` | packages/api/src/services/referral/{code-resolver.ts, code-resolver.test.ts, code-generator.ts}, packages/api/src/index.ts |

## Verification

- `pnpm --filter @mpstats/api test -- code-resolver` → **6/6 PASS** (3ms)
- `pnpm --filter @mpstats/api typecheck` → exit 0
- `pnpm lint` → exit 0 (only pre-existing `no-img-element` warnings in unrelated files)
- Migration SQL audited by owner: 0 destructive statements, `Referral.codeId` nullable, additive-only — approved.

## Deviations from Plan

**[Rule 3 — Blocking issue] Import path for ReferralCode type**
- **Found during:** Task 4 typecheck
- **Issue:** `import type { ReferralCode } from '@prisma/client'` failed — `@prisma/client` is not a direct dependency of `@mpstats/api`.
- **Fix:** Changed to `import type { ReferralCode } from '@mpstats/db'` (which re-exports `@prisma/client` types). Consistent with rest of the api package.
- **Files modified:** `packages/api/src/services/referral/code-resolver.ts`
- **Commit:** `cabc1bf` (single commit for whole task)

No other deviations.

## Migration Status

Migration `20260528000000_add_referral_code_table/migration.sql` is **committed but NOT applied to prod**. Application happens in Plan 60-04 deploy task with explicit owner-gated step. Prisma client regenerated locally to compile types.

## Self-Check: PASSED

- [x] `packages/api/src/services/referral/code-resolver.ts` — FOUND
- [x] `packages/api/src/services/referral/code-resolver.test.ts` — FOUND
- [x] `packages/api/src/services/referral/code-generator.ts` — FOUND
- [x] Commits `d3dcfd1`, `5cfdaa6`, `cabc1bf` — all present in `git log`
- [x] Tests 6/6 passing
- [x] Typecheck clean
