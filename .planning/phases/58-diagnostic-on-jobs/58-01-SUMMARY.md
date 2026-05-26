---
phase: 58-diagnostic-on-jobs
plan: 01
status: complete — all 3 tasks executed 2026-05-26
---

# 58-01 Summary — Collapse Wizard Marketplace Step to WB/OZON

## Resume-signal from 58-02

Plan 58-02 backfill (Task 2) executed against MAAL Supabase prod (`saecuecevicwjkpmaoot`) on 2026-05-26 by orchestrator. Post-flight distribution confirms every `UserProfile.marketplaces` row is a subset of `{WB, OZON}` (legacy_after = 0, escapes = 0; idempotency verified across two runs). Restrictive `z.enum(['WB','OZON'])` introduced in this plan is therefore safe — no existing row will be rejected on next re-validation.

## Task 1 — Reduce MARKETPLACE_OPTIONS + tighten StepMarketplaces grid (✅ complete)

- **`apps/web/src/components/welcome/options.ts`** — `MARKETPLACE_OPTIONS` shrunk from 7 to 2 entries (`WB`/Wildberries/ShoppingBag, `OZON`/Ozon/Package). `MarketplaceOption.key` literal narrowed to `'WB' | 'OZON'`. Unused lucide imports removed: `Store`, `Globe`, `Boxes`, `MoreHorizontal`. `ShoppingBag`+`Package` preserved.
- **`apps/web/src/components/welcome/StepMarketplaces.tsx`** — grid container changed from `grid grid-cols-2 gap-3 sm:grid-cols-3` → `grid grid-cols-2 gap-3`. Selection state, toggle logic, and validation untouched. Header comment updated from "7 multi-select" → "multi-select".
- **Acceptance criteria** (all green):
  - 2 marketplace key lines remain ✓
  - No legacy literal (`YANDEX|ALIEXPRESS|MEGAMARKET|OWN_SHOP|OTHER`) in options.ts ✓
  - `grid-cols-2` present, `sm:grid-cols-3` absent ✓
  - `pnpm --filter @mpstats/web typecheck` exits 0 ✓

## Task 2 — Tighten onboarding.complete z.enum whitelist + regression test (✅ complete)

- **`packages/api/src/routers/onboarding.ts`** — `const MARKETPLACES` tuple narrowed from 7 to `['WB', 'OZON'] as const`. `z.enum(MARKETPLACES)` in the `complete` mutation now rejects tampered keys (`YANDEX` etc.) before DB write. GOALS, EXPERIENCE, CQ mirror logic untouched.
- **`apps/web/src/components/welcome/__tests__/StepMarketplaces.test.tsx`** — new test file (3 tests):
  1. Renders exactly 2 marketplace cards (WB + Ozon) — regression guard against future re-expansion.
  2. `MARKETPLACE_OPTIONS` length === 2 with keys `['WB', 'OZON']`.
  3. Click toggles selection (smoke test for unchanged behaviour).
- **Acceptance criteria** (all green):
  - `const MARKETPLACES = ['WB', 'OZON'] as const;` literal present in onboarding.ts ✓
  - `pnpm --filter @mpstats/web test -- StepMarketplaces` → 3/3 pass in 159ms ✓
  - `pnpm --filter @mpstats/api typecheck` exits 0 ✓

## Task 3 — Synchronize /profile page (D-13) — Case B (✅ verified)

**Outcome: Case B — no edit form for marketplaces exists in `apps/web/src/app/(main)/profile/page.tsx`.**

Grep evidence (run from MAAL root):

```
$ grep -nE 'marketplaces|MARKETPLACE|Wildberries|Ozon|YANDEX|ALIEXPRESS|MEGAMARKET|OWN_SHOP' \
    apps/web/src/app/\(main\)/profile/page.tsx
# (no matches)
```

The profile page (836 lines) ships Phase 56 qualification fields for goals/experience/goalText but does not expose a marketplaces edit form. No code change required. Per plan, the file remains listed in `files_modified` for the audit trail as verified-no-change.

- **Acceptance criteria** (all green):
  - Zero legacy marketplace literals in profile/page.tsx (never-was) ✓
  - Case B path documented with grep evidence ✓
  - `pnpm --filter @mpstats/web typecheck` exits 0 ✓

## Files changed

| File | Δ |
|------|---|
| `apps/web/src/components/welcome/options.ts` | -10 lines (7→2 options, dropped 4 lucide imports) |
| `apps/web/src/components/welcome/StepMarketplaces.tsx` | 2 lines (header comment + grid class) |
| `packages/api/src/routers/onboarding.ts` | 1 line (MARKETPLACES tuple) |
| `apps/web/src/components/welcome/__tests__/StepMarketplaces.test.tsx` | new, +35 lines |
| `apps/web/src/app/(main)/profile/page.tsx` | no change (Case B verified) |

## Verification summary

| Check | Result |
|-------|--------|
| `pnpm --filter @mpstats/web typecheck` | 0 errors |
| `pnpm --filter @mpstats/api typecheck` | 0 errors |
| `pnpm --filter @mpstats/web test -- StepMarketplaces` | 3/3 pass |
| Legacy literals in options.ts | 0 |
| Legacy literals in onboarding.ts | 0 |
| Legacy literals in profile/page.tsx | 0 |
| MARKETPLACE_OPTIONS length | 2 |
| MARKETPLACES tuple length | 2 |

## Commit

Single atomic commit on `phase-58-diagnostic-on-jobs`: `feat(58-01): collapse wizard marketplace step to WB/OZON (D-12/D-13)` — includes this summary file.

## Notes for orchestrator

- No DB writes by this plan (per hard constraint). All DML happened in Plan 58-02 already.
- Staging-deploy is unblocked. Prod cut remains gated by the joint Phase 58/59 release decision per owner.
- Wave 3 (job recommendation marketplace filter, D-15/D-16) can proceed against the now-canonical 2-element `MARKETPLACES` tuple — no shim or transitional code left behind.
