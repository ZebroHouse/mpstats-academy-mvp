---
phase: 58-diagnostic-on-jobs
plan: 04
wave: 4
status: complete
commits:
  - 27cf0ce
  - 8bf293b
files:
  - packages/api/src/utils/legacy-path-rebuild.ts (184 lines, new)
  - packages/api/src/utils/legacy-path-rebuild.test.ts (268 lines, new)
  - packages/api/src/routers/learning.ts (1279 lines total, +21 / -3 net)
  - packages/api/src/routers/diagnostic.ts (931 lines total, +36 / -6 net)
---

## Acceptance Results

### Task 1 — `rebuildLegacyLearningPath` util + tests (commit `27cf0ce`)

| Criterion | Result |
|---|---|
| File exists | `packages/api/src/utils/legacy-path-rebuild.ts` ✓ |
| `grep -c "prisma.\$transaction"` ≥ 1 | **3** (declaration + nested call site + comment) ✓ |
| `grep -c "lessonProgress"` == 0 (D-07) | **0** ✓ |
| `grep -c "getRecommendedJobsFromGaps"` ≥ 1 (D-16) | **3** ✓ |
| `grep -c "generateSectionedPath"` ≥ 1 | **3** ✓ |
| Contains `id: 'custom'` (D-08) | **1** ✓ |
| Test count ≥ 8 incl. T1 return-shape + T8 LessonProgress | **8 / 8 passed** ✓ |
| `pnpm --filter @mpstats/api typecheck` exits 0 | ✓ |

Test output:
```
✓ src/utils/legacy-path-rebuild.test.ts (8 tests) 10ms
  ✓ Test 1: happy path — rebuilds flat to sectioned, writes addedJobs, returns rebuilt:true
  ✓ Test 2: custom-section preserves manually-added lessons (D-08)
  ✓ Test 3: fallback — generateSectionedPath throws → ALL flat ids land in custom (D-08 safe)
  ✓ Test 4: no completed DiagnosticSession → no rewrite (D-09)
  ✓ Test 5: rebuild write is wrapped in prisma.$transaction
  ✓ Test 6: marketplace filter (D-16) — user.marketplaces is passed into matcher
  ✓ Test 7: idempotent — already-sectioned path is no-op
  ✓ Test 8: LessonProgress is NEVER touched (D-07 hard rule)
```

### Task 2 — wire-up + union-merge inside $transaction (commit `8bf293b`)

| Criterion | Result |
|---|---|
| `rebuildLegacyLearningPath` in learning.ts ≥ 2 | **3** (import + 2 lookups) ✓ |
| Import path relative `../utils/legacy-path-rebuild` | ✓ |
| Post-rebuild path returns sectioned shape | ✓ (see structural note below) |
| Union-merge of `addedJobs` (`Set([...])` pattern in diagnostic.ts) | **1 match** at line 811 ✓ |
| `\$transaction` in diagnostic.ts ≥ 1 | **2** (one new in completion path) ✓ |
| `addedJobs:` write inside `$transaction` block | ✓ (lines 803-825, verified below) |
| `pnpm --filter @mpstats/api typecheck` exits 0 | ✓ |
| Full `pnpm test` no regressions | **67 api + 188 web = 255 tests passing** ✓ |
| Full `pnpm typecheck` 0 errors | ✓ |

## Structural decisions

### (a) learning.ts wiring — pre-sectioned mutable-handle pattern (not helper extraction)

Initial implementation extracted the sectioned-branch body into a local
`renderSectioned` async helper called from both the original sectioned branch
and the post-rebuild path. That broke TS inference in the web package:
multiple downstream files (`apps/web/src/app/(main)/learn/track/page.tsx`
and `apps/web/src/components/diagnostic/DiagnosticSummary.tsx`) access
`recommendedPath.sections` / `.sections!` without first narrowing on
`isSectioned`. The pre-change inline returns produced a TS-inferred return
type that allowed those accesses; routing through an extracted helper
collapsed it into a stricter discriminated union and surfaced ~6 TS2339
errors.

Final pattern: keep the sectioned branch inline (byte-identical to the
original), introduce `let activeParsed = parsed; let activeGeneratedAt = path.generatedAt;`
BEFORE the sectioned check, call `rebuildLegacyLearningPath` only when
`Array.isArray(activeParsed)`, and on `rebuilt: true` re-fetch + reassign
the locals. The existing sectioned `if (!Array.isArray(activeParsed) && activeParsed.version === 2)`
block now naturally handles both the originally-sectioned cohort AND
just-rebuilt legacy cohorts, returning the same `{ isSectioned: true, sections, totalLessons, ... }`
shape to the client in both cases. No helper, no code duplication, no
TS-inference regression.

### (b) diagnostic.ts $transaction co-location — Case C

The diagnostic-completion path (`submitAnswer` procedure, around the
`if (isComplete)` block) did NOT previously have a `$transaction` around
the `learningPath.upsert` (lines ~788 in master before this wave). This is
Case C from the plan. Resolution: introduced a new `ctx.prisma.$transaction`
that wraps both the read of existing `addedJobs` AND the upsert of
`{ lessons, addedJobs, generatedAt }`. Reads and writes use the `tx`
handle, never `ctx.prisma`, so the union-merge cannot observe a torn
state under concurrent diagnostics.

#### Co-location proof — `diagnostic.ts:803-825`

```ts
// Co-locate lessons + addedJobs writes inside a single $transaction so a
// partial failure can never leave LearningPath half-updated (Wave 4 Case C).
await ctx.prisma.$transaction(async (tx) => {
  const existing = await tx.learningPath.findUnique({
    where: { userId: ctx.user.id },
    select: { addedJobs: true },
  });
  const existingIds = Array.isArray(existing?.addedJobs)
    ? (existing!.addedJobs as string[])
    : [];
  const mergedAddedJobs = Array.from(new Set([...existingIds, ...newRecommendedJobIds]));

  await tx.learningPath.upsert({
    where: { userId: ctx.user.id },
    update: {
      lessons: pathData as any,
      addedJobs: mergedAddedJobs as any,
      generatedAt: new Date(),
    },
    create: {
      userId: ctx.user.id,
      lessons: pathData as any,
      addedJobs: mergedAddedJobs as any,
    },
  });
});
```

Both `lessons` and `addedJobs` belong to the same `tx.learningPath.upsert`
call — they commit together or not at all.

## D-06 return-shape verification

Verified at the contract/integration boundary inside the unit test (Test 1):
after `rebuilt: true`, the value persisted to `LearningPath.lessons` has
`version: 2` and `Array.isArray(sections)` — the exact shape that the
existing sectioned branch in `learning.getRecommendedPath` recognises via
`parseLearningPath` + `if (!Array.isArray(activeParsed) && activeParsed.version === 2)`.
The branch then returns `{ isSectioned: true as const, sections: sectionsWithData,
totalLessons, completedLessons, hasPlatformSubscription, addedJobs, generatedAt }`
— the same response shape the client already consumes for new sectioned users.

Staging smoke (deferred to a deploy session; no code-level deviation expected):
1. Find legacy user: `SELECT "userId" FROM "LearningPath" WHERE jsonb_typeof(lessons::jsonb) = 'array' LIMIT 1;`
2. Snapshot `SELECT count(*) FROM "LessonProgress" WHERE "userId" = $u;`
3. Hit `/learn/track` as that user.
4. Re-check count — must equal snapshot (D-07).
5. Inspect tRPC response — must contain `isSectioned: true` + `sections: [...]` (D-06).
6. `SELECT "addedJobs" FROM "LearningPath" WHERE "userId" = $u;` — non-empty array of jobIds.

## Deviations

None of consequence. One micro-deviation from the plan's prescribed
implementation style: chose the `activeParsed` mutable-handle pattern over
the `renderSectioned` helper-extraction pattern. Both satisfy D-06 (client
sees sectioned response after rebuild). The chosen pattern additionally
preserves byte-identical TS inference behaviour for the existing client
code, which the helper version unexpectedly broke. Functional behaviour
and acceptance criteria are unchanged.

## Verification command bundle

```bash
cd "D:/GpT_docs/MPSTATS ACADEMY ADAPTIVE LEARNING/MAAL"
pnpm typecheck                                       # 6 tasks successful
pnpm --filter @mpstats/api test                      # 67 / 67
pnpm test                                            # 67 api + 188 web = 255 / 255
grep -c "lessonProgress" packages/api/src/utils/legacy-path-rebuild.ts   # 0
grep -c "\$transaction" packages/api/src/routers/diagnostic.ts           # 2
grep -c "rebuildLegacyLearningPath" packages/api/src/routers/learning.ts # 3
git branch --show-current                            # phase-58-diagnostic-on-jobs
```

## Phase 58 status

Wave 4 closes Phase 58. All four waves landed on `phase-58-diagnostic-on-jobs`:

- 58-01 `2b74976` — wizard collapsed to 2 marketplaces (D-12/D-13)
- 58-02 `5c48ad4` — backfill executed on shared MAAL Supabase
- 58-03 `0cf0226` + `2bb1796` — job-matcher util, marketplace filter, top-3 job recommendations on diagnostic results
- 58-04 `27cf0ce` + `8bf293b` — legacy auto-rebuild util + wire-up + union-merge in transaction

Branch ready for review / merge to master.
