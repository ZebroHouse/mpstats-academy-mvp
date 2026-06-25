# Phase C · Feature 1 — Checkpoint Analytics Dashboard (admin)

**Date:** 2026-06-25
**Status:** spec
**Builds on:** Phase B interactive lessons (merge `11a611f`). Data already persists in `LessonProgress.progressState.checkpointChoices`. **No migration.**

## Goal

A methodologist can see, per interactive lesson, the distribution of student answers at each checkpoint (branch) — how many students chose each option, as counts + percentages. Read-only. Test users excluded.

## Why

Phase B lets methodologists author checkpoint branches but gives zero feedback on how students actually navigate them. This closes the loop: which option is most chosen, which branch is dead, where students split.

## Data (already there)

- `LessonProgress.progressState` (`Json?`) = `{ version: 1, revealedGateIds: string[], checkpointChoices: Record<checkpointId, optionId> }` — written by `learning.saveInteractiveProgress` (`learning.ts:770`).
- `Lesson.body` (`Json?`) = TipTap doc. Interactive nodes (`interactive-nodes.ts`):
  - `checkpoint` — attrs `{ id }` (NO question text on the node itself).
  - `checkpointOption` — attrs `{ id, label }` (label = methodologist's human text, e.g. "Вариант 1").
- Test exclusion: `UserProfile.isTest` via `LessonProgress.path.user`. Helper `isExcludedFromRevenue` (`utils/test-exclusion.ts`).

## Scope

### IN
1. **Pure tally util** (`packages/api/src/utils/checkpoint-analytics.ts`) — given a `Lesson.body` doc + an array of `checkpointChoices` maps (one per non-test student), produce per-checkpoint distributions. Fully unit-tested, no Prisma/React.
2. **Server walker** for the lesson body: extract ordered checkpoints with their options `{checkpointId, contextLabel, options:[{optionId, label}]}`. The `contextLabel` = nearest preceding heading/paragraph plain-text snippet (best-effort, for human orientation); falls back to `Чекпоинт N`.
3. **Admin query** `admin.analytics.getCheckpointAnalytics({ lessonId })` (`adminProcedure`, in `admin-analytics.ts`):
   - Load lesson (`id, title, body, course.title`).
   - Load `LessonProgress` rows for the lesson whose `progressState` is non-null, including `path.user.isTest`.
   - Filter out test users.
   - Run the pure tally → return `{ lessonId, lessonTitle, courseTitle, totalRespondents, checkpoints: [{ checkpointId, contextLabel, totalAnswered, options: [{ optionId, label, count, percent }] }] }`.
   - Unknown/removed optionIds (in choices but not in current body) bucket into a synthetic option `{ optionId, label: "(удалённый вариант)", count }` so totals stay honest.
4. **Admin list query** `admin.analytics.listInteractiveLessons()` (`adminProcedure`):
   - Lessons with `contentType IN (TEXT, INTERACTIVE)` whose body actually `hasInteractiveBlocks` (checkpoint present), with `{ lessonId, title, courseTitle, isHidden, respondentCount }` (respondentCount = non-test progress rows with ≥1 checkpoint choice). Sorted by respondentCount desc.
5. **UI** — new analytics tab **"Чекпоинты"** at `/admin/analytics/checkpoints`:
   - Left: list of interactive lessons (title, course, respondent count). Click selects.
   - Right: per selected lesson, one card per checkpoint → horizontal bars (option label + count + percent), total respondents. Empty state when no responses yet.
   - Add tab to `AnalyticsTabs.tsx` (`Обзор / Выручка / Воронка / Контент / Чекпоинты`).
   - Reuse the existing Card + simple bar pattern from the Content tab (no new chart lib needed; CSS bars or existing recharts — prefer plain CSS bars for percent distributions, lighter).

### OUT (do not build)
- No migration, no schema change.
- No per-student drill-down (who chose what) — aggregate only.
- No time filtering / period selector (counts are cumulative; cheap, matches data).
- No editing from this view.
- Reveal-gate analytics (how many passed each gate) — possible later; checkpoints are the ask.

## Edge cases
- Lesson has interactive blocks but zero non-test responses → checkpoint structure still shown, all counts 0, "Пока нет ответов".
- Checkpoint reached by 0 students but exists in body → shown with 0.
- optionId in choices not in body (edited after answers) → "(удалённый вариант)" bucket.
- A checkpoint nested after a reveal gate → still walked (recurse whole tree). Nested-in-option checkpoints are forbidden by Phase B authoring, but the walker recurses anyway (defensive).
- `progressState` malformed / wrong version → skip that row safely (guard parse).

## Acceptance
- Pure tally util: unit tests cover normal distribution, percent rounding (sum≈100), unknown option bucket, empty, malformed-skip.
- Walker util: extracts checkpoints+options in document order, contextLabel best-effort, handles gate-nested checkpoint.
- Query: excludes test users (test with isTest mix), returns shape above.
- UI: tab renders, selecting a lesson shows bars; empty states correct.
- `pnpm typecheck` + `pnpm test` green (api + web).

## Placement decision
New analytics tab (not a panel in the lesson editor) — consistent with existing analytics IA, discoverable, lets the methodologist browse all interactive lessons in one place. A deep-link from the lesson editor can be added later if asked.

## Files (anticipated)
- NEW `packages/api/src/utils/checkpoint-analytics.ts` (+ `__tests__`).
- NEW `packages/api/src/utils/checkpoint-walker.ts` (or fold into above) (+ tests).
- EDIT `packages/api/src/routers/admin-analytics.ts` — 2 procedures.
- EDIT `apps/web/src/components/admin/AnalyticsTabs.tsx` — add tab.
- NEW `apps/web/src/app/(admin)/admin/analytics/checkpoints/page.tsx`.
- NEW `apps/web/src/components/admin/CheckpointAnalytics.tsx` (list + bars).
- Tests mirror `__tests__/admin-*.test.ts` + `utils/*.test.ts`.
