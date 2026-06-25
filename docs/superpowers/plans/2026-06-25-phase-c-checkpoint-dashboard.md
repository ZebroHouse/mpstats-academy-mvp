# Plan · Phase C Feature 1 — Checkpoint Analytics Dashboard

Spec: `docs/superpowers/specs/2026-06-25-phase-c-checkpoint-dashboard-design.md`
Branch: `feature/phase-c-checkpoint-dashboard` (from master).
Execution: subagent-driven TDD (test first → implement → green). No migration. localhost = PROD DB — never run prisma migrate/push; these features are read-only anyway.

## Task 1 — Pure checkpoint walker + tally util (TDD)
**Files:** NEW `packages/api/src/utils/checkpoint-analytics.ts`, NEW `packages/api/src/utils/__tests__/checkpoint-analytics.test.ts`.

Export two pure functions:

```ts
// Walk a TipTap doc, return checkpoints in document order.
export interface CheckpointSpec {
  checkpointId: string;
  contextLabel: string;            // nearest preceding heading/paragraph plain-text snippet (<=80 chars) OR "Чекпоинт N"
  options: { optionId: string; label: string }[];
}
export function extractCheckpoints(body: unknown): CheckpointSpec[];

// Tally choices across many students into distributions.
export interface CheckpointDistribution {
  checkpointId: string;
  contextLabel: string;
  totalAnswered: number;
  options: { optionId: string; label: string; count: number; percent: number }[];
}
export function tallyCheckpoints(
  body: unknown,
  choiceMaps: Record<string, string>[],   // one checkpointChoices map per student
): CheckpointDistribution[];
```

Rules:
- `extractCheckpoints`: recurse whole tree; collect nodes `type==='checkpoint'`. For each, options = child nodes `type==='checkpointOption'` mapped to `{id, label}`. `contextLabel`: track the last seen heading/paragraph plain text while walking siblings before the checkpoint; trim to ≤80 chars; if none, `Чекпоинт ${n}` (1-based among checkpoints).
- `tallyCheckpoints`: for each checkpoint, count how many choiceMaps have `map[checkpointId] === optionId`. `percent = round(count / totalAnswered * 100)` (totalAnswered = students who answered THIS checkpoint, i.e. have the key). Unknown optionIds present in choiceMaps but not in body options → append synthetic option `{ optionId, label: '(удалённый вариант)', count }`. If `totalAnswered === 0`, percents are 0.
- Defensive: non-object body / missing content → `[]`. Malformed choiceMap entries skipped.

**Tests (write first, must fail then pass):**
- extracts checkpoints in order with options + labels.
- contextLabel uses preceding paragraph text; falls back to "Чекпоинт N".
- checkpoint nested after a revealGate is still found.
- tally: normal split → counts + percents sum ≈100.
- unknown option bucket "(удалённый вариант)".
- empty choiceMaps → structure with zeros.
- malformed body → [].

## Task 2 — Admin queries (TDD)
**Files:** EDIT `packages/api/src/routers/admin-analytics.ts`, NEW `packages/api/src/routers/__tests__/admin-checkpoint-analytics.test.ts`.

Add to the `admin.analytics` sub-router:

`listInteractiveLessons` (`adminProcedure`, no input):
- `prisma.lesson.findMany({ where: { contentType: { in: ['TEXT','INTERACTIVE'] } }, select: { id, title, isHidden, body, course: { select: { title } } } })`.
- Keep only those whose body yields ≥1 checkpoint (`extractCheckpoints(body).length > 0`).
- For respondentCount: query progress rows (see below) OR a cheaper count — acceptable to compute respondentCount in the same pass as a second query grouped by lessonId. Simplest correct approach: for the filtered lesson ids, `prisma.lessonProgress.findMany({ where: { lessonId: { in }, progressState: { not: Prisma.DbNull } }, select: { lessonId, path: { select: { user: { select: { isTest } } } }, progressState } })`, then count non-test rows that have ≥1 checkpoint key. Return `{ lessonId, title, courseTitle, isHidden, respondentCount }[]` sorted by respondentCount desc, then title.

`getCheckpointAnalytics` (`adminProcedure`, input `{ lessonId: z.string() }`):
- Load lesson (`id, title, body, course.title`); if not found → `TRPCError NOT_FOUND`.
- Load `lessonProgress.findMany({ where: { lessonId, progressState: { not: Prisma.DbNull } }, select: { progressState, path: { select: { user: { select: { isTest } } } } } })`.
- Filter out test users (`isExcludedFromRevenue({ user: row.path.user })` or direct `!isTest`).
- Extract `checkpointChoices` from each `progressState` (guard `version===1` + shape; skip malformed).
- `tallyCheckpoints(body, choiceMaps)`.
- Return `{ lessonId, lessonTitle, courseTitle, totalRespondents, checkpoints }`.

**Tests:** mock prisma (mirror `admin-create-lesson.test.ts` makeCtx). Cover: test users excluded from tally; NOT_FOUND on missing lesson; correct distribution passthrough; malformed progressState skipped; lesson with no responses → zeros.

## Task 3 — UI tab + component (TDD where feasible)
**Files:** EDIT `apps/web/src/components/admin/AnalyticsTabs.tsx`; NEW `apps/web/src/app/(admin)/admin/analytics/checkpoints/page.tsx`; NEW `apps/web/src/components/admin/CheckpointAnalytics.tsx`; NEW unit test `apps/web/tests/unit/checkpoint-analytics-view.test.tsx` (render with mocked trpc data → bars + empty states).

- `AnalyticsTabs`: append `{ label: 'Чекпоинты', href: '/admin/analytics/checkpoints' }`.
- `page.tsx`: `'use client'`; renders `<CheckpointAnalytics />`.
- `CheckpointAnalytics.tsx`:
  - `trpc.admin.analytics.listInteractiveLessons.useQuery()` → left list (title, course, «N ответов»). Selected lessonId in `useState`; default to first lesson with respondentCount>0 (or first).
  - `trpc.admin.analytics.getCheckpointAnalytics.useQuery({ lessonId }, { enabled: !!lessonId })` → right panel: one `Card` per checkpoint with `contextLabel` heading, total answered, and a CSS bar per option (label, `count` + `percent%`, bar width = percent). Reuse Card from existing admin UI. Plain CSS bars (`bg-primary/15` track + `bg-primary` fill), no chart lib.
  - States: loading skeleton; no interactive lessons → "Пока нет интерактивных уроков с чекпоинтами"; lesson selected but 0 respondents → "Пока нет ответов учеников"; hidden lesson → small «скрыт» note (hidden lessons still collect/keep data).
- Match existing admin visual language (the Content tab). Backend-task UX → functionality-first, clean but not bespoke.

## Verify
- `pnpm --filter @mpstats/api test` + `pnpm --filter @mpstats/api typecheck`.
- `pnpm --filter web test` (or root) + `pnpm typecheck` (all packages).
- Manual: `pnpm dev`, log in as admin, open `/admin/analytics/checkpoints`, confirm the Phase-B example lesson `skill_analytics_interactive_24291578` shows checkpoints (it's hidden but should appear; may have 0/low responses). Reading prod DB is fine (read-only).

## Deploy (after all 3 Phase C features OR per-feature — owner decides)
Per Phase B runbook: staging `docker compose -p maal-staging -f docker-compose.staging.yml build --no-cache web` → `up -d` → node-fetch health + **tRPC probe** `getCheckpointAnalytics` unauth → expect `UNAUTHORIZED` (deployed). Then prod. Verify FUNCTIONALLY, never bundle-grep.
