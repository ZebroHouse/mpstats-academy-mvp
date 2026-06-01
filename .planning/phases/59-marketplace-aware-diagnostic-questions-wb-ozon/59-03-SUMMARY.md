---
phase: 59-marketplace-aware-diagnostic-questions-wb-ozon
plan: 03
subsystem: diagnostic
tags: [phase-59, static-deck, methodology, pure-functions]
requires:
  - .planning/phases/59-marketplace-aware-diagnostic-questions-wb-ozon/59-CONTEXT-v2.md (D-V2-01..04 methodology pivot)
  - .planning/phases/59-marketplace-aware-diagnostic-questions-wb-ozon/methodology-decks/doc-1-wb.md (15 WB questions)
  - .planning/phases/59-marketplace-aware-diagnostic-questions-wb-ozon/methodology-decks/doc-2-ozon.md (15 Ozon questions)
  - packages/api/src/utils/job-matcher.ts (computeEffectiveMarketplaces — Phase 58 helper, reused)
provides:
  - STATIC_DECK constant + StaticQuestion type — 30 hand-crafted questions (15 WB + 15 Ozon), 5×3 (axis, level) matrix per deck
  - pickDeckForUser(userMarketplaces, sessionSeed) — deterministic seeded selector; single-MP → full deck; BOTH → balanced 7-8 mix, one per (axis, level) slot
  - shuffleOptions(question, sessionSeed) — seeded Fisher-Yates on 4 options, returns new index of the originally-correct option (input options[0])
affects:
  - packages/api/src/diagnostic/static-deck.ts (new)
  - packages/api/src/diagnostic/static-deck.test.ts (new)
  - packages/api/src/diagnostic/deck-picker.ts (new)
  - packages/api/src/diagnostic/deck-picker.test.ts (new)
  - packages/api/src/diagnostic/option-shuffler.ts (new)
  - packages/api/src/diagnostic/option-shuffler.test.ts (new)
tech-stack:
  added: []
  patterns: [mulberry32-rng, fnv1a-hash, fisher-yates-seeded, pure-function]
key-files:
  created:
    - packages/api/src/diagnostic/static-deck.ts
    - packages/api/src/diagnostic/static-deck.test.ts
    - packages/api/src/diagnostic/deck-picker.ts
    - packages/api/src/diagnostic/deck-picker.test.ts
    - packages/api/src/diagnostic/option-shuffler.ts
    - packages/api/src/diagnostic/option-shuffler.test.ts
  modified: []
decisions:
  - D-V2-03 honored: STATIC_DECK has no LLM generation, no Prisma access — pure constants + pure functions
  - Test files co-located next to sources (`src/diagnostic/*.test.ts`) instead of plan-spec'd `__tests__/` subfolder — vitest's `include: src/**/*.test.ts` only matches co-located pattern; matches existing precedent (`utils/job-matcher.test.ts`)
  - `computeEffectiveMarketplaces` imported from `utils/job-matcher.ts` (Phase 58) — NOT duplicated
  - Single-MP path skips RNG entirely (deterministic full deck, sorted by axis/level)
  - BOTH path: initial coin-flip per (axis,level) slot → if marketplace counts diverge from {7,8}, deterministically flip slots in seeded-shuffled order until balanced
  - shuffleOptions seed = `${sessionSeed}::${questionId}` — same session always shows same shuffle for same question (idempotent on resume), but different questions in same session shuffle independently
metrics:
  duration: ~30min (single uninterrupted session)
  completed: 2026-06-01
---

# Phase 59 Plan 03: Static Deck + Picker + Shuffler — Summary

3 pure utilities ready for Plan 59-04 to wire into `diagnostic.startSession`. Static deck (30 questions transcribed verbatim from methodology docs), seeded balanced picker, seeded option shuffler. No DB, no LLM, no Date.now(), no Math.random().

## What shipped

### STATIC_DECK — `packages/api/src/diagnostic/static-deck.ts`

- `interface StaticQuestion { id, axis, level, prompt, options: [s,s,s,s], explanation, marketplace }`
- `STATIC_DECK.wb` — 15 entries `q-wb-01` .. `q-wb-15`, all `marketplace: 'WB'`
- `STATIC_DECK.ozon` — 15 entries `q-ozon-16` .. `q-ozon-30`, all `marketplace: 'OZON'`
- Each deck covers the 5×3 matrix: every `{ANALYTICS, MARKETING, CONTENT, OPERATIONS, FINANCE}` has exactly one question at each level (1, 2, 3)
- Prompts / options / explanations transcribed byte-faithfully from `methodology-decks/doc-1-wb.md` and `doc-2-ozon.md` — Russian UTF-8 preserved (formulas, special chars like `÷`, `×`, `≈`, `₽`, bullet points)
- Convention: `options[0]` is always the correct answer (methodology format); runtime shuffles it via `shuffleOptions`

### pickDeckForUser — `packages/api/src/diagnostic/deck-picker.ts`

- Imports `computeEffectiveMarketplaces` from `../utils/job-matcher` (Phase 58, NOT duplicated)
- Empty array → BOTH (defensive default, matches Phase 58 semantics)
- Single-MP user → full 15-question deck for that marketplace, sorted by `(axis, level)` — deterministic, RNG skipped
- BOTH user → seeded balanced mix:
  1. `mulberry32(fnv1aHash(sessionSeed))` drives initial coin-flip per `(axis, level)` slot
  2. If marketplace counts diverge from {7, 8}, re-balance: shuffle slot indices deterministically with the same RNG, walk and flip slot pick until split is exactly 7-8 or 8-7
  3. Sort final 15 questions by `(axis ASC, level ASC)` for predictable UI order
- Returns `StaticQuestion[15]` with exactly one entry per (axis, level) slot

### shuffleOptions — `packages/api/src/diagnostic/option-shuffler.ts`

- Seeds RNG with `mulberry32(fnv1aHash(${sessionSeed}::${question.id}))`
- Fisher-Yates on `[0, 1, 2, 3]` → permutation array
- Returns `{ options: string[4] (shuffled), correctIndex: number (where original index 0 landed) }`
- Same `(sessionSeed, questionId)` → identical output (idempotent on page refresh / resume)
- Different `questionId` with same `sessionSeed` → independent shuffles (correct answer doesn't always land at the same slot in a session)

## Acceptance evidence

### Test counts
```
$ pnpm --filter @mpstats/api test src/diagnostic/

✓ src/diagnostic/option-shuffler.test.ts (6 tests)
✓ src/diagnostic/static-deck.test.ts    (7 tests)
✓ src/diagnostic/deck-picker.test.ts    (7 tests)

Test Files  3 passed (3)
     Tests  20 passed (20)
```

### Typecheck
```
$ pnpm --filter @mpstats/api typecheck
> tsc --noEmit
(clean — 0 errors)
```
(Prisma client regenerated via `pnpm --filter @mpstats/db exec prisma generate` to clear pre-existing tooling errors from `@mpstats/db` exports; those errors were not introduced by this plan.)

### Coverage matrix — STATIC_DECK
| Axis        | WB Lv1 | WB Lv2 | WB Lv3 | OZON Lv1 | OZON Lv2 | OZON Lv3 |
| ----------- | ------ | ------ | ------ | -------- | -------- | -------- |
| ANALYTICS   | q-wb-01| q-wb-02| q-wb-03| q-ozon-16| q-ozon-17| q-ozon-18|
| MARKETING   | q-wb-04| q-wb-05| q-wb-06| q-ozon-19| q-ozon-20| q-ozon-21|
| CONTENT     | q-wb-07| q-wb-08| q-wb-09| q-ozon-22| q-ozon-23| q-ozon-24|
| OPERATIONS  | q-wb-10| q-wb-11| q-wb-12| q-ozon-25| q-ozon-26| q-ozon-27|
| FINANCE     | q-wb-13| q-wb-14| q-wb-15| q-ozon-28| q-ozon-29| q-ozon-30|

Asserted by `static-deck.test.ts` `covers the 5×3 (axis, level) matrix for each deck`.

### Determinism — pickDeckForUser
- Asserted: `pickDeckForUser(['WB','OZON'], 'seed-X')` × 2 calls → identical id sequence (`is deterministic for the same seed`)
- Asserted: across 5 different seeds → ≥2 distinct selection sets (`different seeds produce different selections`)
- Asserted: BOTH split is always {7, 8} or {8, 7} for arbitrary seed (`split 7-8 or 8-7`)

### Determinism — shuffleOptions
- Asserted: same `(sessionSeed, questionId)` → identical options + correctIndex
- Asserted: 10 different seeds for same question → ≥2 distinct correctIndex positions
- Asserted: 5 different questionIds with shared sessionSeed → ≥2 distinct correctIndex positions (rules out "all correct answers at slot 0" failure mode)
- Asserted: returned options set == input options set (no loss/duplication)

## Deviations from Plan

**1. [Rule 3 — Tooling] Test files co-located instead of `__tests__/` subfolder**
- Plan specified: `packages/api/src/diagnostic/__tests__/*.test.ts`
- Shipped: `packages/api/src/diagnostic/*.test.ts`
- Reason: `packages/api/vitest.config.ts` has `include: ['src/**/*.test.ts']` — only matches co-located pattern. The `__tests__/` subfolder would silently not run.
- Precedent: existing `packages/api/src/utils/job-matcher.test.ts` is co-located.
- Tests run and pass; no functional impact.

**2. [Rule 3 — Tooling] Regenerated Prisma client to clear pre-existing typecheck errors**
- After install, `pnpm --filter @mpstats/api typecheck` had ~15 pre-existing errors from `utils/*.ts` files (no `PrismaClient` export from `@mpstats/db`).
- Fixed by running `pnpm --filter @mpstats/db exec prisma generate` — first-time-in-worktree setup.
- Not a code change. No commits affected.

No CONTEXT/PLAN violations. No architectural changes (Rule 4 not triggered).

## What this enables for Plan 59-04

Plan 59-04 wires these into `diagnostic.startSession`:
- Read `UserProfile.marketplaces` → pass to `pickDeckForUser(marketplaces, session.id)` → store the 15 selected `StaticQuestion`s in `DiagnosticSession.questions` (or hold in cache) instead of calling LLM
- On render, call `shuffleOptions(staticQ, session.id)` → expose `{ options, correctIndex }` to the UI via `DiagnosticQuestion` shape
- On answer-submit, compare submitted index to `correctIndex` (from shuffle)
- 59-01's `marketplace` field on `DiagnosticQuestion` carries through unchanged

## Self-Check: PASSED

Files verified to exist:
- `packages/api/src/diagnostic/static-deck.ts` ✓
- `packages/api/src/diagnostic/static-deck.test.ts` ✓
- `packages/api/src/diagnostic/deck-picker.ts` ✓
- `packages/api/src/diagnostic/deck-picker.test.ts` ✓
- `packages/api/src/diagnostic/option-shuffler.ts` ✓
- `packages/api/src/diagnostic/option-shuffler.test.ts` ✓

Commits on worktree:
- `6c68c3d` test(59-03): add failing tests for static deck shape
- `da9db2d` feat(59-03): transcribe 30 methodology questions into STATIC_DECK
- `5ddbf04` test(59-03): add failing tests for balanced deck picker
- `7875654` feat(59-03): implement seeded balanced deck picker
- `776e8e7` test(59-03): add failing tests for seeded option shuffler
- `cd70899` feat(59-03): implement seeded option shuffler
