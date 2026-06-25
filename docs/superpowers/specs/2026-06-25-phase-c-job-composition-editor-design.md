# Phase C · Feature 2 — Job Composition Editor (admin)

**Date:** 2026-06-25
**Status:** spec
**Builds on:** Phase 57 jobs (`Job`/`JobLesson`), Track B intent embeddings.

## Goal

Methodologists manage «решения под задачу» (jobs) from the admin without running `seed-jobs.ts`: add/remove/reorder a job's lessons, toggle publish, **create new jobs** (incl. embedding so the job is findable in intent search), and reindex a job's embedding on demand.

## Owner decisions (2026-06-25)
- **Lesson picker:** new `admin.searchLessons` — cross-course text search by lesson title, **including hidden** lessons.
- **Meta editing of EXISTING jobs:** publish toggle + lesson composition only. Title/description/axes/outcomes of an existing job are NOT edited from admin (stay in `seed-jobs.ts`) → no re-embed needed for edits.
- **Create new jobs from admin:** YES. Creation collects the fields a job needs + generates the embedding server-side.

## Background facts (from code)
- `Job` (`schema.prisma:652`): `slug @unique`, `title`, `description`, `outcomes/axes/skillBlocks` (Json string[]), `marketplace` (`JobMarketplace` WB|OZON|BOTH), `displayOrder`, `isPublished @default(false)`, `embedding Unsupported("vector(1536)")?`.
- `JobLesson` (`schema.prisma:671`): `{ jobId, lessonId, order }`, `@@id([jobId, lessonId])`, `@@index([lessonId])`. **NO `@@unique` on order** → reorder is simple renumber, no temp-park.
- User-facing `job.ts` `getCatalog`/`getJob` filter `isPublished=true` + `lesson.isHidden=false` + `course.isHidden=false`, order lessons by `JobLesson.order asc`. **Admin mutations must keep orders contiguous & unique per job** so this ordering is deterministic.
- Canonical 5 axes (`job.ts:13` `AXIS_ORDER`): `ANALYTICS, MARKETING, CONTENT, OPERATIONS, FINANCE`. `axes[0]` = primaryAxis (catalog placement). `axisTitle()` maps to RU.
- Embedding: `embedQuery(text)` from `@mpstats/ai` (`text-embedding-3-small`, 1536 dims) — **works server-side inside tRPC** (already imported in packages/api). `buildJobText(job)` = `title + description + lesson titles` (one per line). Vector written via raw SQL `UPDATE "Job" SET "embedding" = '[...]'::vector WHERE "id" = '<cuid>'` (numbers + server cuid only — no user strings in raw SQL).
- Canonical write shape `seed-jobs.ts buildJobUpsert`: `lessonIds.map((lessonId, order) => ({lessonId, order}))`. Admin row writes must produce the same shape.

## Scope

### IN — new `admin.job.*` sub-router (`packages/api/src/routers/admin-jobs.ts`, mounted `job:` in adminRouter), all `adminProcedure`:

**Reads**
1. `getJobs()` → all jobs (incl. unpublished) `{ id, slug, title, marketplace, displayOrder, isPublished, lessonCount, hasEmbedding }`, ordered `displayOrder asc, title asc`. `hasEmbedding` via a raw `SELECT id, embedding IS NOT NULL AS has_embedding` (Prisma can't select the Unsupported vector) merged in.
2. `getJobLessons({ jobId })` → the job's lessons by `order asc`: `{ lessonId, title, order, courseTitle, isHidden, contentType }`. (Includes hidden — admin needs to see/manage them; note hidden ones are invisible to students.)
3. `searchLessons({ query })` (admin lesson picker) → cross-course prisma search `title contains query` (case-insensitive), **including hidden**, capped ~30, `{ lessonId, title, courseTitle, isHidden, contentType }`, ordered by course then order. Lightweight (no vector/billing/path logic — unlike `ai.searchLessons`).

**Mutations**
4. `addJobLesson({ jobId, lessonId })` → create `JobLesson` at `max(order)+1` for that job (0 if none). Composite PK `@@id([jobId,lessonId])` rejects duplicates → catch → `CONFLICT` "урок уже в задаче". Validate the lesson exists.
5. `removeJobLesson({ jobId, lessonId })` → delete the row, then **renumber remaining rows contiguous** (`order` 0..n-1 by current order). In one `$transaction`.
6. `reorderJobLesson({ jobId, lessonId, targetOrder })` → move the lesson to `targetOrder` (0-based, clamped), shift the others (decrement/increment range), in a `$transaction`. No temp-park (no unique constraint). Result: contiguous unique orders.
7. `toggleJobPublished({ jobId, isPublished })` → set `isPublished`.
8. `createJob(input)` → input `{ slug, title, description, marketplace, axes: string[] (≥1, subset of the 5), outcomes?: string[], skillBlocks?: string[], displayOrder?, isPublished? }`. Validate slug unique (cross-check `Job.slug`; friendly CONFLICT). `prisma.job.create` (parameterized) with `lessons: { create: [] }` empty. Then generate embedding from `buildJobText({title, description, lessons: []})` (title+description) and write via raw SQL. If embedding fails → job still created, return `{ id, embedded: false }` (don't lose the job); else `{ id, embedded: true }`.
9. `reembedJob({ jobId })` → load job (title, description) + its lesson titles (by order) → `embedQuery(buildJobText(...))` → raw SQL write. Returns `{ ok: true }`. (Manual reindex for when composition/desc meaningfully changed.)

### IN — UI
- `apps/web/src/components/admin/JobManager.tsx` — mirror `CourseManager.tsx`: accordion per job. Header: title, marketplace badge, «N уроков», published toggle (switch), «без эмбеддинга» warning badge when `!hasEmbedding`, «Переиндексировать» button (calls reembedJob, toast). Body: lesson rows (order, title, course, hidden tag) with up/down or inline order edit + remove (confirm) + an «+ Добавить урок» control that opens the search picker (debounced `admin.job.searchLessons`, click result → addJobLesson; rows already in the job marked/disabled).
- «Создать задачу» dialog (`CreateJobDialog`): slug, title, description (textarea), marketplace (select WB/OZON/BOTH), axes (multi-select of the 5, ≥1, first = primary), optional outcomes/skillBlocks left empty (editable later via seed) — keep the form pragmatic. On submit → createJob → toast (incl. «эмбеддинг создан»/«создать не удалось — нажмите Переиндексировать»).
- New page `apps/web/src/app/(admin)/admin/jobs/page.tsx` (model on `…/admin/content/page.tsx`) hosting `JobManager`.
- `AdminSidebar.tsx` navItems: add `{ title: 'Jobs', href: '/admin/jobs', icon: <Target/ListChecks>, superadminOnly: false }` (after Content).

### OUT
- No editing of existing job title/description/axes/outcomes (owner: stays in seed). Only publish + composition + reindex.
- No job deletion from admin (use publish=false to retire). Avoids destructive ops; revisit if asked.
- No migration, no schema change.
- No auto re-embed on add/remove/reorder (manual «Переиндексировать» covers it; keeps mutations OpenRouter-decoupled & fast).
- No bulk import.

## Edge cases
- Add a lesson already in the job → CONFLICT, friendly message, no dup row.
- Add a hidden lesson → allowed; row created; UI notes it's hidden (invisible to students until unhidden — Phase 57 auto-sync).
- Remove the only lesson / remove from middle → renumber keeps 0..n-1.
- Reorder targetOrder out of range → clamp to [0, n-1].
- Create with duplicate slug → CONFLICT before create.
- Create with empty axes → zod rejects (≥1).
- Embedding/OpenRouter failure on create → job persisted, `embedded:false`, surfaced in UI (warning badge + reindex CTA). On reembed failure → error toast, job unchanged.
- createJob must NOT interpolate user strings (slug/title/description) into raw SQL — only the embedding numeric literal + server cuid go through `$executeRawUnsafe`; the row itself via parameterized `prisma.job.create`.

## Acceptance
- Router unit tests (mocked prisma + mocked `@mpstats/ai` embedQuery): add appends at max+1; remove renumbers contiguous; reorder shifts correctly (up & down); duplicate add → CONFLICT; createJob calls create with correct shape + writes embedding (assert embedQuery called, raw SQL invoked) + slug-dup CONFLICT + embed-failure path returns embedded:false; reembedJob builds text from title+desc+lesson titles; searchLessons includes hidden + filters by title.
- getJobs returns lessonCount + hasEmbedding; getJobLessons ordered.
- UI unit test (mocked trpc): job list renders, expand shows lessons, add-picker calls mutation, publish toggle, create dialog validation.
- `pnpm typecheck` (all) + `pnpm test` (api+web) green. No regressions in `job.test.ts`.
- Manual: `/admin/jobs` lists 41 jobs; add/remove/reorder a lesson on a test job; create a throwaway job → appears, has embedding; intent search `intent.resolve` can surface a freshly created+published job (smoke, optional).

## Files (anticipated)
- NEW `packages/api/src/routers/admin-jobs.ts` (+ `__tests__/admin-jobs.test.ts`).
- EDIT `packages/api/src/routers/admin.ts` — mount `job: adminJobsRouter`.
- Maybe EDIT `packages/api/src/routers/job.ts` — export `AXIS_ORDER`/`axisTitle` for reuse (or a shared const in shared pkg).
- NEW `apps/web/src/components/admin/JobManager.tsx`, `CreateJobDialog.tsx`.
- NEW `apps/web/src/app/(admin)/admin/jobs/page.tsx`.
- EDIT `apps/web/src/components/admin/AdminSidebar.tsx` — nav item.
- Tests mirror `__tests__/admin-*.test.ts` + `job.test.ts` + a web component test.
