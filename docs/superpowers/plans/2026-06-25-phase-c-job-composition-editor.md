# Plan · Phase C Feature 2 — Job Composition Editor

Spec: `docs/superpowers/specs/2026-06-25-phase-c-job-composition-editor-design.md`
Branch: `feature/phase-c-content-tools` (continues Feature 1). Subagent-driven TDD. NEVER prisma migrate/push (localhost = PROD DB). No migration needed.

Grounding (file:line):
- `Job`/`JobLesson` schema.prisma:652-682 (JobLesson NO unique order).
- `seed-jobs.ts buildJobUpsert` lines 18-30 (canonical row shape `lessonIds.map((id,order)=>({lessonId,order}))`).
- `embedQuery` from `@mpstats/ai` (embeddings.ts:19, 1536 dims), `buildJobText` (embed-jobs.ts:12 — title+desc+lesson titles), raw SQL write `UPDATE "Job" SET "embedding"='[...]'::vector WHERE "id"='<cuid>'` (embed-jobs.ts:23).
- Axes: `AXIS_ORDER`/`axisTitle` job.ts:10-15 (`ANALYTICS,MARKETING,CONTENT,OPERATIONS,FINANCE`).
- adminProcedure trpc.ts:82. CourseManager.tsx (UI mirror). admin.ts getCourseLessons:433 / moveLessonToPosition:582 (reorder model — simpler here, no park). admin-create-lesson.test.ts (test pattern; `vi.mock('server-only')`, `vi.mock('@mpstats/ai')`).
- User-facing job.test.ts must keep passing.

## Task 1 — admin.job sub-router: reads + scaffold (TDD)
**Files:** NEW `packages/api/src/routers/admin-jobs.ts`; EDIT `packages/api/src/routers/admin.ts` (mount `job: adminJobsRouter`); NEW `packages/api/src/routers/__tests__/admin-jobs-reads.test.ts`.

Create `adminJobsRouter = router({ ... })` with three `adminProcedure` reads:
- `getJobs` (no input): `prisma.job.findMany({ orderBy: [{displayOrder:'asc'},{title:'asc'}], select: { id, slug, title, marketplace, displayOrder, isPublished, _count: { select: { lessons: true } } } })`. Then `hasEmbedding`: a single `prisma.$queryRaw<{id:string;has_embedding:boolean}[]>\`SELECT id, embedding IS NOT NULL AS has_embedding FROM "Job"\`` → map by id. Return `{ id, slug, title, marketplace, displayOrder, isPublished, lessonCount, hasEmbedding }[]`.
- `getJobLessons` (input `{ jobId: z.string() }`): `prisma.jobLesson.findMany({ where: { jobId }, orderBy: { order: 'asc' }, select: { lessonId, order, lesson: { select: { title, isHidden, contentType, course: { select: { title } } } } } })` → flatten to `{ lessonId, title, order, courseTitle, isHidden, contentType }[]`.
- `searchLessons` (input `{ query: z.string().min(1).max(200) }`): `prisma.lesson.findMany({ where: { title: { contains: query, mode: 'insensitive' } }, take: 30, orderBy: [{ courseId: 'asc' }, { order: 'asc' }], select: { id, title, isHidden, contentType, course: { select: { title } } } })` → `{ lessonId, title, courseTitle, isHidden, contentType }[]`. Includes hidden (no isHidden filter).

Mount in admin.ts: add `job: adminJobsRouter` to the adminRouter object (next to `analytics:`). Import at top.

**Tests** (mock prisma; mirror admin-create-lesson.test.ts makeCtx with userProfile.findUnique role check; caller `adminRouter.createCaller(ctx).job.*`):
- getJobs merges hasEmbedding from raw query + lessonCount from _count; orders.
- getJobLessons returns flattened rows ordered by order.
- searchLessons includes hidden lessons + filters by title contains.

Run: `pnpm --filter @mpstats/api test -- admin-jobs` + `pnpm --filter @mpstats/api typecheck`.

## Task 2 — admin.job mutations (TDD)
**Files:** EDIT `packages/api/src/routers/admin-jobs.ts`; NEW `packages/api/src/routers/__tests__/admin-jobs-mutations.test.ts`. Mock `@mpstats/ai` (`vi.mock('@mpstats/ai', () => ({ embedQuery: vi.fn().mockResolvedValue(Array(1536).fill(0)) }))`) and `server-only`.

Add `adminProcedure` mutations:
- `addJobLesson({ jobId, lessonId })`: verify lesson exists (`prisma.lesson.findUnique`); `const agg = prisma.jobLesson.aggregate({ where:{jobId}, _max:{order:true} })`; `order = (agg._max.order ?? -1) + 1`; `prisma.jobLesson.create({ data:{ jobId, lessonId, order } })`. Catch Prisma P2002/unique → `TRPCError CONFLICT` «Урок уже в задаче». Return `{ ok:true, order }`.
- `removeJobLesson({ jobId, lessonId })`: `$transaction`: delete the row; fetch remaining `findMany({where:{jobId},orderBy:{order:'asc'},select:{lessonId:true}})`; renumber each to its index (only updating rows whose order changed). Return `{ ok:true }`.
- `reorderJobLesson({ jobId, lessonId, targetOrder })` (targetOrder `z.number().int().min(0)`): `$transaction`: load all rows ordered; find current index; clamp targetOrder to [0, len-1]; if same → return; remove from array, splice into target; write back each row's new order (only changed). Return `{ ok:true }`. (Array-rebuild approach — simplest correct, no park; small N.)
- `setJobPublished({ jobId, isPublished: z.boolean() })`: `prisma.job.update({ where:{id:jobId}, data:{ isPublished } })`. Return `{ ok:true, isPublished }`.
- `createJob(input)`: zod `{ slug: z.string().min(1).regex(/^[a-z0-9-]+$/), title: z.string().min(1), description: z.string().min(1), marketplace: z.enum(['WB','OZON','BOTH']), axes: z.array(z.enum(['ANALYTICS','MARKETING','CONTENT','OPERATIONS','FINANCE'])).min(1), outcomes: z.array(z.string()).default([]), skillBlocks: z.array(z.string()).default([]), displayOrder: z.number().int().default(0), isPublished: z.boolean().default(false) }`. Check slug free (`prisma.job.findUnique({where:{slug}})` → CONFLICT if taken). `const job = prisma.job.create({ data:{ slug, title, description, marketplace, axes, skillBlocks, outcomes, displayOrder, isPublished } })` (parameterized — NO raw SQL with these strings). Then embed: `try { const vec = await embedQuery(buildJobText({title, description, lessons:[]})); await prisma.$executeRawUnsafe(\`UPDATE "Job" SET "embedding"='[\${vec.join(',')}]'::vector WHERE "id"='\${job.id}'\`); return { id: job.id, embedded:true } } catch { return { id: job.id, embedded:false } }`. (Import `embedQuery` from `@mpstats/ai`; replicate `buildJobText` locally OR import if exported — check; if not exported, inline `[title, description].join('\n')`.)
- `reembedJob({ jobId })`: load job `{ title, description }` + lessons `prisma.jobLesson.findMany({where:{jobId},orderBy:{order:'asc'},select:{lesson:{select:{title:true}}}})`; `text = [title, description, ...lessonTitles].join('\n')`; `vec = await embedQuery(text)`; raw SQL write; return `{ ok:true }`. Surface embedding errors as `TRPCError INTERNAL_SERVER_ERROR` (so UI shows a toast).

**Tests:** add appends at max+1 (empty job → 0); duplicate add → CONFLICT (simulate P2002); remove renumbers contiguous (assert update calls); reorder up and down produce correct final orders; setJobPublished; createJob: slug-dup CONFLICT, success calls create with right data + embedQuery + raw write (embedded:true), embed throw → embedded:false (job still created); reembedJob builds text incl lesson titles + writes. Use a `$transaction` mock that runs the callback with the same tx-shaped prisma mock.

Run: `pnpm --filter @mpstats/api test -- admin-jobs` + full `pnpm --filter @mpstats/api test` (no regressions) + typecheck.

## Task 3 — UI: JobManager + CreateJobDialog + page + nav (TDD where feasible)
**Files:** NEW `apps/web/src/components/admin/JobManager.tsx`, `CreateJobDialog.tsx`; NEW `apps/web/src/app/(admin)/admin/jobs/page.tsx`; EDIT `apps/web/src/components/admin/AdminSidebar.tsx`; NEW `apps/web/tests/unit/job-manager.test.tsx`.

Study `CourseManager.tsx` + `admin/content/page.tsx` + `AnalyticsTabs`/existing admin look + the trpc-mock test pattern (`AgentSearch.test.tsx`, `checkpoint-analytics-view.test.tsx`).

- `JobManager.tsx` (`'use client'`): `trpc.admin.job.getJobs.useQuery()`. Accordion per job (reuse the accordion/expand pattern from CourseManager). Header row: title, marketplace badge, «N уроков», a published `Switch` (calls `setJobPublished` mutation + invalidate getJobs), «без эмбеддинга» amber badge if `!hasEmbedding`, «Переиндексировать» button (calls `reembedJob`, loading + toast). Expanded body: `trpc.admin.job.getJobLessons.useQuery({jobId},{enabled:expanded})` → ordered lesson rows: order number, title (truncate), course (muted), «скрыт» tag if hidden, up/down arrows (call `reorderJobLesson` with computed targetOrder) + remove button (confirm dialog → `removeJobLesson`). An «+ Добавить урок» button reveals a search box → debounced `admin.job.searchLessons` → results list; clicking a result calls `addJobLesson` (rows already in job shown disabled/«уже в задаче»); CONFLICT → toast.
- Top of page: «+ Создать задачу» button → `CreateJobDialog` (modal): fields slug/title/description(textarea)/marketplace(select)/axes(checkbox group of the 5 RU-labelled, ≥1) → submit `createJob` → on success toast («Задача создана» + embedding note), invalidate getJobs, close. Validation inline (disable submit until required filled; show slug-conflict error from server).
- `page.tsx`: `'use client'`, renders `<JobManager />` (+ page heading like content page).
- `AdminSidebar.tsx`: add nav item `{ title: 'Jobs', href: '/admin/jobs', icon: ListChecks (from lucide-react), superadminOnly: false }` after Content. Import the icon.
- Invalidations: after each mutation invalidate the relevant `trpc.admin.job.*` query via `utils`.
- Visual: match existing admin language (CourseManager). Backend surface → functionality-first.

**Test** (`job-manager.test.tsx`, mock trpc like checkpoint-analytics-view.test.tsx): job list renders with «N уроков» + marketplace; expanding triggers getJobLessons and shows ordered lessons; clicking publish toggle calls setJobPublished; add-lesson search calls searchLessons and selecting calls addJobLesson; CreateJobDialog disables submit until valid then calls createJob. If full render is awkward, at minimum test a small pure helper (e.g. axes validation / targetOrder computation) + a smoke render.

Run: `pnpm --filter @mpstats/web test -- job-manager` + `pnpm --filter @mpstats/web typecheck` + full web test (no regressions, ignore known yandex-oauth flake).

## Verify (whole feature)
- `pnpm --filter @mpstats/api test`, `pnpm --filter @mpstats/web test`, `pnpm typecheck` (root) all green.
- `git diff` review; ensure `job.test.ts` (user-facing) untouched & green.
- Manual (read/write PROD DB — careful, but these are normal app writes, not DDL): `pnpm dev`, `/admin/jobs`: list, add/remove/reorder a lesson on a **throwaway** job, create a throwaway job, reindex. Avoid mutating real published jobs during testing; clean up test rows after.

## Deploy
Part of the single Phase C staging→prod deploy after Feature 3. tRPC probe a new admin proc unauth → `UNAUTHORIZED` = deployed.
