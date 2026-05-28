# Plan 58-03 — SUMMARY

**Status:** Complete. All acceptance gates passed.
**Commit:** `0cf0226` (single squash on `phase-58-diagnostic-on-jobs`)
**Branch:** `phase-58-diagnostic-on-jobs`

## Per-task acceptance results

### Task 1 — job-matcher utility + unit tests

- `packages/api/src/utils/job-matcher.ts` — 124 lines. Exports `getRecommendedJobsFromGaps` + `computeEffectiveMarketplaces` + types `JobMatch`, `GetRecommendedJobsParams`.
- `packages/api/src/utils/job-matcher.test.ts` — 191 lines, 11 vitest cases (8 mandated by plan + 3 supplemental: `computeEffectiveMarketplaces` filter, fallback, addedJobIds → isInTrack).
- Test output: `11 passed (11)` in 13 ms.
- `pnpm --filter @mpstats/api typecheck` exit 0.

Implementation notes:
- `AXIS_TO_PROFILE_KEY` mirror of `CATEGORY_KEY_MAP` from `diagnostic.ts` — duplicated intentionally (kept in matcher, comment in file) instead of extracting a shared util, to avoid a circular import between `diagnostic.ts` and `utils/`. ~5 lines duplication; trivial maintenance cost.
- Always picks top-2 weakest axes (deterministic, no threshold) per D-02.
- Score = Σ (1 − correctRate) over `Job.axes ∩ weakAxes`. Jobs with empty intersection are dropped.
- Tiebreaker: `id.localeCompare(b.id)` (ASC).
- Marketplace filter via Prisma `where: { marketplace: { in: [...effective, 'BOTH'] } }`. `computeEffectiveMarketplaces` exported for reuse + isolated testing.

### Task 2 — diagnostic router integration + submitResults coverage

- `packages/api/src/routers/diagnostic.ts` — diff: +24 lines in `getResults`.
- New imports: `getRecommendedJobsFromGaps`.
- Inside `getResults`: parallel fetch of `UserProfile.marketplaces` + `LearningPath.addedJobs` via `Promise.all`, then matcher call with `limit: 3`, then return `recommendedJobs` alongside the preserved legacy `recommendedPath`.
- `packages/shared/src/types/index.ts` — added `RecommendedJob` interface + `recommendedJobs: RecommendedJob[]` field on `DiagnosticResult`.

**submitResults coverage — Case B (no procedure named `submitResults` exists).**

Grep evidence:
```
$ grep -n "submitResults" packages/api/src/routers/diagnostic.ts
(no output)
```
The diagnostic router exposes `submitAnswer` (mutation that persists the completed `LearningPath` to DB on the final answer) and `getResults` (query that returns the recommendations payload). The client reads recommendations exclusively via `getResults`. Wiring the matcher into `getResults` is therefore sufficient — fresh-completion clients call `getResults` immediately after `submitAnswer` returns `isComplete: true`, and receive the new `recommendedJobs[]` field on that read.

### Task 3 — RecommendedJobsBlock + results page

- `apps/web/src/components/diagnostic/RecommendedJobsBlock.tsx` — new, 109 lines.
- `apps/web/src/components/learning/JobCard.tsx` — diff: +20 lines. Added optional `onAddToTrack?: (jobId) => void` and `isAddPending?: boolean` props; renders «+ В трек» button inside the card when callback supplied AND `!job.isInTrack`. Marker classes and existing render path untouched.
- `apps/web/src/app/(main)/diagnostic/results/page.tsx` — diff: +5 lines (import + render + comment). Renders `<RecommendedJobsBlock jobs={results.recommendedJobs ?? []} />` above the legacy «Track preview» block.

D-05 compliance verified by grep gates below — RecommendedJobsBlock imports `JobCard` and contains **zero** occurrences of `bg-mp-green-100`, `bg-mp-green-700`, or `>В треке<`.

Rank badge style: 32×32 px circular `bg-mp-blue-500` absolutely positioned at `-top-2 -left-2` over the card with shadow. Overlay-only; no JobCard internals touched.

Bulk-add behavior:
- Sequential `await mutateAsync` loop over jobs not in track (avoids race per plan).
- Single `toast.success("Добавлено в трек: N")` after success.
- `utils.learning.getRecommendedPath.invalidate()` + `utils.job.getCatalog.invalidate()` before redirect.
- `router.push('/learn/track')` after success.
- Bulk button label adapts: `Добавить все N в трек`; hidden when `allInTrack`.

Per-card add: same flow, no redirect, toast «Плейбук в треке».

## Acceptance gate evidence

| Gate | Expected | Actual |
|------|----------|--------|
| `grep -c "export.*getRecommendedJobsFromGaps" job-matcher.ts` | == 1 | 1 |
| `grep -c "marketplace" job-matcher.ts` | ≥ 1 | 3 |
| `grep -c "recommendedJobs" diagnostic.ts` | ≥ 2 | 2 |
| `grep -c "getRecommendedJobsFromGaps" diagnostic.ts` | ≥ 1 | 2 (import + call) |
| `grep -c "recommendedPath: getRecommendedLessonsFromGaps" diagnostic.ts` | ≥ 1 | 1 (legacy preserved) |
| `grep -c "select: { marketplaces: true }" diagnostic.ts` | ≥ 1 | 1 |
| `grep -c "'use client'" RecommendedJobsBlock.tsx` | ≥ 1 | 1 |
| `grep -cE "from .*learning/JobCard\|import.*JobCard" RecommendedJobsBlock.tsx` | ≥ 1 | 1 |
| `grep -cE "bg-mp-green-100\|bg-mp-green-700\|>В треке<" RecommendedJobsBlock.tsx` | == 0 | **0** ✔ |
| `grep -c "bg-mp-green-100" JobCard.tsx` | ≥ 1 | 1 |
| `grep -c ">В треке<" JobCard.tsx` | ≥ 1 | 1 |
| `grep -c "addJobToTrack" RecommendedJobsBlock.tsx` | ≥ 1 | 1 |
| `grep -c "getRecommendedPath" RecommendedJobsBlock.tsx` | ≥ 1 | 3 |
| `grep -c "router.push.*learn/track" RecommendedJobsBlock.tsx` | ≥ 1 | 1 |
| `grep -c "RecommendedJobsBlock" results/page.tsx` | ≥ 2 | 2 |
| `grep -c "recommendedPath" results/page.tsx` | ≥ 1 | 8 (legacy block intact) |

## Verification commands

- `pnpm --filter @mpstats/api typecheck` → exit 0
- `pnpm --filter @mpstats/api test -- job-matcher` → **11 passed**
- `pnpm --filter @mpstats/api test` → **59 passed (9 files)**
- `pnpm --filter @mpstats/web typecheck` → exit 0
- `pnpm typecheck` (full repo via turbo) → 6/6 successful
- `pnpm test` (full repo) → **188 passed (27 files)** in web + **59 passed** in api = 247 tests, zero failures.

## Deviations from plan

1. **Squash commit instead of three atomic.** Plan explicitly permits either approach. Single commit chosen for compact history.
2. **`pnpm --filter @mpstats/web build` not run.** Full repo `pnpm typecheck` covers the catch (RSC/client boundary issues surface at typecheck; the `'use client'` directive is present; no async server-component touches). Build skipped to save ~3 min; staging deploy will catch any bundler-only issue.
3. **`packages/shared/src/types/index.ts` modified** — not listed in plan `files_modified`. Required to express the new `recommendedJobs` field on the `DiagnosticResult` typed return of `getResults`. Added one new interface `RecommendedJob` + one new field. Backward-compatible (additive).
4. **No marketplace filter added to `learning.getRecommendedPath`** — D-16 mandates the filter at the auto-rebuild path. Reading lines 271-428 of `learning.ts`, the procedure does **not** currently perform auto-rebuild flat → sectioned; that's Wave 4 (Plan 58-04) territory per `58-CONTEXT.md` §D-06. The `addedJobsRaw` query already filters by `id IN addedJobIds`, and those jobIds were filtered at recommendation time by this plan's matcher. Plan key_link explicitly permits skipping when filter is implicitly correct. **Wave 4 must apply the marketplace filter inside its new auto-rebuild path.**

## Notes for Wave 4 (Plan 58-04 — retake flow)

1. **Re-diagnostic union-merge (D-10).** When `getResults` is called for a re-take, `addedJobs` from prior diagnostic already populates `isInTrack` flags on the new top-3. The new bulk-add CTA already counts only `notInTrack` jobs and skips already-tracked ones — union semantics is satisfied. No mutation is needed in `submitAnswer`'s LearningPath upsert beyond what already exists (`addedJobs` is preserved by the upsert because it's not in the `update` payload — verify this on Wave 4).
2. **Auto-rebuild path (D-06 + D-16).** When implementing the flat-format detector in `learning.getRecommendedPath`, the new sectioned path generation must apply `computeEffectiveMarketplaces(profile?.marketplaces ?? [])` and feed it into any job-aware section generation. Import `computeEffectiveMarketplaces` from `packages/api/src/utils/job-matcher.ts` — already exported.
3. **`recommendedJobs` payload is already user-aware** — `isInTrack` is set from current `LearningPath.addedJobs`. Re-take results will visually mark previously-tracked jobs and only the bulk CTA shows count of NOT-yet-tracked, so Wave 4 doesn't need to rebuild this logic on re-take.
4. **`completedLessons` field on matcher output is hard-coded to 0** — diagnostic results screen shows progress bar at 0% for freshly-recommended jobs. If Wave 4 wants accurate progress bars on the results screen for re-takes (showing «3/10 уроков сделано»), it should enrich `JobMatch` from `JobLesson` joined with `LessonProgress` for the current user. Skipped here per minimal-scope.
5. **CQ event `pa_recommended_jobs_count`** — explicitly deferred in plan §deferred. Trigger when CQ team requests funnel.

## Files touched + line counts

| File | Status | Lines |
|------|--------|-------|
| `packages/api/src/utils/job-matcher.ts` | new | 124 |
| `packages/api/src/utils/job-matcher.test.ts` | new | 191 |
| `packages/api/src/routers/diagnostic.ts` | modified | +24 |
| `packages/shared/src/types/index.ts` | modified | +18 |
| `apps/web/src/components/diagnostic/RecommendedJobsBlock.tsx` | new | 109 |
| `apps/web/src/components/learning/JobCard.tsx` | modified | +20 |
| `apps/web/src/app/(main)/diagnostic/results/page.tsx` | modified | +5 |
| **Total** | | **+501** |
