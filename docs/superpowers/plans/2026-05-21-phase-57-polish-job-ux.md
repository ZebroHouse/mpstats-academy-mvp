# Phase 57 Polish — Job Catalog UX Fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close three UX gaps in Phase 57 before merging PR #8: (1) playbooks become actionable, (2) «Мой трек» is always discoverable, (3) playbooks integrate cleanly into the track view.

**Architecture:** Single additive field on `LearningPath` (`addedJobs Json`) records which playbooks a user added. Two new tRPC procedures (`learning.addJobToTrack`, `learning.removeJobFromTrack`) wrap the existing `addLessonsToTrack` API and maintain the jobId list with consistent lesson dedup. UI: «+ В трек» on job page, persistent track banner on `/learn` (with empty-state CTA), new «Мои плейбуки» section on `/learn/track` rendering playbook-grouped lessons that exclude themselves from the legacy `custom` section.

**Tech Stack:** Prisma 5.22, PostgreSQL (Supabase), Next.js 14, TypeScript, tRPC, Tailwind, shadcn/ui, Vitest.

**Base branch:** `worktree-phase-57-library-redesign` (continue Phase 57 — these fixes land in PR #8 before merge).

**Resume context (read first):**
- Phase 57 ship state: spec `docs/superpowers/specs/2026-05-18-library-redesign-design.md`, plans `2026-05-18-job-foundation-and-mapping.md` + `2026-05-18-library-ui.md`.
- 29 provisional jobs already seeded on prod (content team approved the approach 2026-05-21 — no playbook-content changes expected).
- Open issue independent of this plan: stray commit `79036f1` on master must be removed before PR #8 merges (`packages/shared/src/types/index.ts` conflict). Not in scope here.

---

## Контекст и предупреждения

- **PROD DB SAFETY** (`MAAL/CLAUDE.md`): Task 1 is an **additive** migration (single `ADD COLUMN ... NOT NULL DEFAULT '[]'` on `LearningPath`). Apply via `prisma migrate deploy` from this repo. Mandatory STOP before applying.
- **Subagent dispatch**: each implementer subagent MUST `cd` to the worktree (`D:/GpT_docs/MPSTATS ACADEMY ADAPTIVE LEARNING/MAAL/.claude/worktrees/phase-57-library-redesign`) and verify `git rev-parse --show-toplevel` + `git branch --show-current` before any git operation. The Phase 57 main session had an incident where a haiku subagent committed to `master` because it didn't `cd` into the worktree. **Do not use haiku for tasks that commit.**
- **Backward compatibility:** `LearningPath.addedJobs` defaults to `'[]'` — existing users (158 prod) get an empty array on first read. No backfill needed.
- **Dedup semantics on remove:** removing a playbook removes its lessons from `LearningPath.lessons` **except** lessons present in any other still-added playbook. Avoids orphan lessons referenced by other playbooks.

---

## Task 1: Schema — `LearningPath.addedJobs` + additive migration

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/20260521000000_learning_path_added_jobs/migration.sql`

- [ ] **Step 1: Add field to `LearningPath` model in `schema.prisma`**

Locate the `LearningPath` model. Add (alongside existing fields):

```prisma
  addedJobs    Json     @default("[]") // string[] — slugs/IDs of jobs the user manually added to track via "+ В трек"
```

- [ ] **Step 2: Validate schema and generate client**

```bash
cd packages/db && npx prisma@5.22.0 validate
pnpm db:generate
```

Expected: schema valid, client generated.

- [ ] **Step 3: Create migration**

Create `packages/db/prisma/migrations/20260521000000_learning_path_added_jobs/migration.sql`:

```sql
-- Phase 57 polish: LearningPath.addedJobs — list of job slugs the user added to their track.
-- ADDITIVE: single ADD COLUMN, default '[]', no rewrite of existing rows.

ALTER TABLE "LearningPath" ADD COLUMN "addedJobs" JSONB NOT NULL DEFAULT '[]';
```

- [ ] **Step 4: 🛑 MANDATORY STOP — pre-flight before applying to prod Supabase**

Show the owner:
1. `DATABASE_URL` resolves to project `saecuecevicwjkpmaoot` (expected — additive).
2. Migration is single `ADD COLUMN` on existing `LearningPath` — no DROP, no ALTER COLUMN, no data rewrite.
3. Confirm L2 backup ran today (cron @ 03:00 UTC on VPS) OR rely on Supabase PITR (always on).
4. `npx prisma@5.22.0 migrate status` from `packages/db/` — confirm only `20260521000000_learning_path_added_jobs` is pending.

Wait for explicit **«применяй»**.

- [ ] **Step 5: Apply migration**

```bash
cd packages/db && npx prisma@5.22.0 migrate deploy
```

Verify:

```bash
npx tsx -e "import{PrismaClient}from'@prisma/client';import*as d from'dotenv';d.config({path:'.env'});const p=new PrismaClient();(async()=>{const lp=await p.learningPath.findFirst({select:{addedJobs:true}});console.log('sample addedJobs:',lp?.addedJobs);console.log('total LearningPath rows (should be ~140):',await p.learningPath.count());await p.\$disconnect();})()"
```

Expected: `addedJobs: []`, row count unchanged.

- [ ] **Step 6: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/20260521000000_learning_path_added_jobs/
git commit -m "feat(db): LearningPath.addedJobs for tracking added playbooks"
```

---

## Task 2: Backend — `learning.addJobToTrack` / `removeJobToTrack` + `job.getJob` returns `isInTrack`

**Files:**
- Modify: `packages/api/src/routers/learning.ts`
- Modify: `packages/api/src/routers/job.ts`
- Modify: `packages/shared/src/types/index.ts` (extend `JobDetail`)
- Test: `packages/api/src/routers/__tests__/learning-jobs.test.ts` (new file, pure helpers)

- [ ] **Step 1: Add helper for "lessons to retain on remove"**

Pure function deciding which of a removed job's lessons must stay (because they're in other still-added jobs). Write the failing test first.

Create `packages/api/src/routers/__tests__/learning-jobs.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { lessonsToRemoveOnJobRemove } from '../learning-jobs-utils';

describe('lessonsToRemoveOnJobRemove', () => {
  it('removes job lessons not present in other still-added jobs', () => {
    const result = lessonsToRemoveOnJobRemove(
      ['L1', 'L2', 'L3'],                          // lessons of the job being removed
      [{ id: 'JOB_OTHER', lessonIds: ['L2', 'L4'] }], // other still-added jobs
    );
    expect(result.sort()).toEqual(['L1', 'L3']); // L2 retained (in JOB_OTHER)
  });
  it('returns all lessons when no other jobs added', () => {
    expect(lessonsToRemoveOnJobRemove(['L1', 'L2'], [])).toEqual(['L1', 'L2']);
  });
  it('handles overlapping lessons across multiple other jobs', () => {
    const result = lessonsToRemoveOnJobRemove(
      ['L1', 'L2', 'L3'],
      [{ id: 'JA', lessonIds: ['L1'] }, { id: 'JB', lessonIds: ['L3'] }],
    );
    expect(result).toEqual(['L2']);
  });
});
```

Run: `npx vitest run packages/api/src/routers/__tests__/learning-jobs.test.ts` → FAIL (module not found).

- [ ] **Step 2: Implement the helper**

Create `packages/api/src/routers/learning-jobs-utils.ts`:

```ts
/**
 * Decide which lessons of a removed job to actually remove from LearningPath.lessons.
 * Retain any lesson still present in another added job (no orphan references).
 */
export function lessonsToRemoveOnJobRemove(
  removedJobLessonIds: string[],
  otherAddedJobs: { id: string; lessonIds: string[] }[],
): string[] {
  const retained = new Set<string>();
  for (const job of otherAddedJobs) {
    for (const id of job.lessonIds) retained.add(id);
  }
  return removedJobLessonIds.filter((id) => !retained.has(id));
}
```

Run vitest again → PASS (3 tests).

- [ ] **Step 3: Add `learning.addJobToTrack` procedure**

In `packages/api/src/routers/learning.ts`, add (next to the existing `addLessonsToTrack`):

```ts
addJobToTrack: protectedProcedure
  .input(z.object({ jobId: z.string() }))
  .mutation(async ({ ctx, input }) => {
    try {
      const job = await ctx.prisma.job.findUnique({
        where: { id: input.jobId },
        include: { lessons: { select: { lessonId: true }, orderBy: { order: 'asc' } } },
      });
      if (!job || !job.isPublished) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Джоба не найдена' });
      }
      const lessonIds = job.lessons.map((jl) => jl.lessonId);

      const existing = await ctx.prisma.learningPath.findUnique({
        where: { userId: ctx.user.id },
        select: { lessons: true, addedJobs: true },
      });

      const currentLessons: string[] = extractLessonIds(existing?.lessons ?? []);
      const currentAddedJobs: string[] = Array.isArray(existing?.addedJobs) ? (existing!.addedJobs as string[]) : [];
      const nextLessons = Array.from(new Set([...currentLessons, ...lessonIds]));
      const nextAddedJobs = currentAddedJobs.includes(input.jobId)
        ? currentAddedJobs
        : [...currentAddedJobs, input.jobId];

      await ctx.prisma.learningPath.upsert({
        where: { userId: ctx.user.id },
        create: { userId: ctx.user.id, lessons: nextLessons as any, addedJobs: nextAddedJobs as any },
        update: { lessons: nextLessons as any, addedJobs: nextAddedJobs as any },
      });
      return { added: lessonIds.length, jobId: input.jobId };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      handleDatabaseError(error);
    }
  }),
```

> Use the existing `extractLessonIds` helper (already in `learning.ts` per Phase 57 — handles both flat and sectioned `LearningPath.lessons`). If `extractLessonIds` lives only in `job.ts`, move it to a shared utility file. Verify before writing.

- [ ] **Step 4: Add `learning.removeJobFromTrack` procedure**

```ts
removeJobFromTrack: protectedProcedure
  .input(z.object({ jobId: z.string() }))
  .mutation(async ({ ctx, input }) => {
    try {
      const lp = await ctx.prisma.learningPath.findUnique({
        where: { userId: ctx.user.id },
        select: { lessons: true, addedJobs: true },
      });
      if (!lp) return { removed: 0 };

      const addedJobs: string[] = Array.isArray(lp.addedJobs) ? (lp.addedJobs as string[]) : [];
      if (!addedJobs.includes(input.jobId)) return { removed: 0 };

      const remainingJobIds = addedJobs.filter((id) => id !== input.jobId);
      const jobsLessons = await ctx.prisma.job.findMany({
        where: { id: { in: [input.jobId, ...remainingJobIds] } },
        include: { lessons: { select: { lessonId: true } } },
      });
      const targetJob = jobsLessons.find((j) => j.id === input.jobId);
      const otherJobs = jobsLessons.filter((j) => j.id !== input.jobId)
        .map((j) => ({ id: j.id, lessonIds: j.lessons.map((l) => l.lessonId) }));
      const toRemove = lessonsToRemoveOnJobRemove(
        targetJob?.lessons.map((l) => l.lessonId) ?? [],
        otherJobs,
      );

      const currentLessons: string[] = extractLessonIds(lp.lessons ?? []);
      const nextLessons = currentLessons.filter((id) => !toRemove.includes(id));

      await ctx.prisma.learningPath.update({
        where: { userId: ctx.user.id },
        data: { lessons: nextLessons as any, addedJobs: remainingJobIds as any },
      });
      return { removed: toRemove.length };
    } catch (error) {
      handleDatabaseError(error);
    }
  }),
```

- [ ] **Step 5: Extend `JobDetail` type and `job.getJob` to return `isInTrack`**

In `packages/shared/src/types/index.ts`, add to `JobDetail`:

```ts
export interface JobDetail extends JobSummary {
  outcomes: string[];
  skillBlocks: string[];
  lessons: JobLessonItem[];
  isInTrack: boolean;   // ← new
}
```

In `packages/api/src/routers/job.ts` `getJob` — fetch the user's `addedJobs` and compute `isInTrack`:

```ts
const lp = await ctx.prisma.learningPath.findUnique({
  where: { userId: ctx.user.id },
  select: { addedJobs: true },
});
const addedJobs: string[] = Array.isArray(lp?.addedJobs) ? (lp!.addedJobs as string[]) : [];
const isInTrack = addedJobs.includes(job.id);

return { /* existing fields */, isInTrack };
```

Bundle the `lp` fetch into the existing `Promise.all` to avoid an extra round-trip.

- [ ] **Step 6: Typecheck + tests**

```bash
pnpm typecheck
pnpm test
```

Expected: all green. The new helper is covered; the new procedures get integration coverage at manual QA in Task 6.

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/routers/learning.ts packages/api/src/routers/learning-jobs-utils.ts packages/api/src/routers/__tests__/learning-jobs.test.ts packages/api/src/routers/job.ts packages/shared/src/types/index.ts
git commit -m "feat(api): addJobToTrack/removeJobFromTrack + JobDetail.isInTrack"
```

---

## Task 3: Job page UX — «+ В трек» + chevron affordance

**Files:**
- Modify: `apps/web/src/app/(main)/learn/job/[slug]/page.tsx`

- [ ] **Step 1: Wire the toggle**

Add `addJobToTrack` / `removeJobFromTrack` mutations. Replace the single-button block with:

```tsx
const utils = trpc.useUtils();
const addToTrack = trpc.learning.addJobToTrack.useMutation({
  onSuccess: () => { utils.job.getJob.invalidate({ slug }); utils.learning.getRecommendedPath.invalidate(); toast.success('Джоба добавлена в трек'); },
  onError: () => toast.error('Не удалось добавить в трек'),
});
const removeFromTrack = trpc.learning.removeJobFromTrack.useMutation({
  onSuccess: () => { utils.job.getJob.invalidate({ slug }); utils.learning.getRecommendedPath.invalidate(); toast.success('Джоба убрана из трека'); },
  onError: () => toast.error('Не удалось убрать из трека'),
});
```

In the header actions area (where `nextLesson` button lives), render two buttons:

```tsx
<div className="flex flex-col gap-2 shrink-0">
  {nextLesson && (
    <Link href={`/learn/${nextLesson.id}`}>
      <Button className="w-full">Продолжить джобу →</Button>
    </Link>
  )}
  {job.isInTrack ? (
    <Button
      variant="outline"
      className="w-full"
      onClick={() => removeFromTrack.mutate({ jobId: job.id })}
      disabled={removeFromTrack.isPending}
    >
      В треке ✓ · убрать
    </Button>
  ) : (
    <Button
      variant="secondary"
      className="w-full"
      onClick={() => addToTrack.mutate({ jobId: job.id })}
      disabled={addToTrack.isPending}
    >
      + В трек
    </Button>
  )}
</div>
```

- [ ] **Step 2: Chevron affordance on lesson rows**

Replace the lesson row template (currently the `{job.lessons.map((l, i) => ...)}` block). Add a chevron icon at the right edge for unlocked lessons:

```tsx
<Link
  key={l.id}
  href={l.locked ? '#' : `/learn/${l.id}`}
  className={`flex items-center gap-3 px-4 py-2.5 border-t border-mp-gray-100 first:border-t-0 ${l.locked ? 'opacity-50 pointer-events-none' : 'hover:bg-mp-gray-50 group'}`}
>
  <span className="text-caption text-mp-gray-400 w-5 font-semibold">{i + 1}</span>
  <span className={`w-3.5 h-3.5 rounded-full shrink-0 ${l.status === 'COMPLETED' ? 'bg-mp-green-500' : l.status === 'IN_PROGRESS' ? 'border-2 border-mp-blue-500' : 'border-2 border-mp-gray-300'}`} />
  <span className="text-body-sm text-mp-gray-900 flex-1">{l.title}</span>
  <span className="text-caption text-mp-gray-400">{l.durationMin} мин</span>
  {!l.locked && <ChevronRight className="w-4 h-4 text-mp-gray-300 group-hover:text-mp-gray-600 transition-colors" />}
</Link>
```

Import `ChevronRight` from `lucide-react` (used elsewhere in the codebase — verify before importing).

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm --filter web typecheck
git add "apps/web/src/app/(main)/learn/job/[slug]/page.tsx"
git commit -m "feat(learn): + В трек button + chevron affordance on job page"
```

---

## Task 4: Learn page — persistent track banner with empty state

**Files:**
- Modify: `apps/web/src/app/(main)/learn/page.tsx`

- [ ] **Step 1: Drop the `totalLessons > 0` gate; render banner in two variants**

Locate the track banner (currently `{searchQuery.length === 0 && recommendedPath && recommendedPath.totalLessons > 0 && (...)}`). Replace with:

```tsx
{/* Track banner — always visible (outside search), with empty state for new users */}
{searchQuery.length === 0 && (
  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl border border-mp-gray-200 bg-white shadow-mp-card animate-slide-up">
    {recommendedPath && recommendedPath.totalLessons > 0 ? (
      <>
        <span className="text-body-sm font-semibold text-mp-gray-700">
          Мой трек · {recommendedPath.completedLessons}/{recommendedPath.totalLessons}
        </span>
        <div className="flex gap-2">
          <Link href="/learn/track">
            <Button variant="outline" size="sm">Открыть трек</Button>
          </Link>
          {nextLesson && (
            <Link href={`/learn/${nextLesson.id}`}>
              <Button size="sm">Продолжить</Button>
            </Link>
          )}
        </div>
      </>
    ) : (
      <>
        <div className="flex flex-col gap-0.5">
          <span className="text-body-sm font-semibold text-mp-gray-700">Мой трек пустой</span>
          <span className="text-caption text-mp-gray-500">Пройди диагностику, и мы соберём программу под тебя</span>
        </div>
        <Link href="/diagnostic">
          <Button size="sm">Пройти диагностику</Button>
        </Link>
      </>
    )}
  </div>
)}
```

> Note: this keeps the same `searchQuery.length === 0` gate (banner hides in search results, by design).

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm --filter web typecheck
git add "apps/web/src/app/(main)/learn/page.tsx"
git commit -m "feat(learn): always-visible track banner with empty-state CTA"
```

---

## Task 5: Track page — «Мои плейбуки» section + dedup vs `custom`

**Files:**
- Modify: `apps/web/src/app/(main)/learn/track/page.tsx`
- Modify: `packages/api/src/routers/learning.ts` (extend `getRecommendedPath` to expose `addedJobs` payload — minimal change)

- [ ] **Step 1: Extend `getRecommendedPath` to return added-job payloads**

`getRecommendedPath` currently returns sections + flat lessons. Add an `addedJobs` array of `{ id, slug, title, lessons: LessonWithProgress[] }` so the UI can render playbook groups without a second round-trip.

Sketch (place inside the existing return shapes — both `isSectioned: true` and `false` branches):

```ts
// Inside getRecommendedPath query, before computing return value:
const addedJobIds: string[] = Array.isArray(path?.addedJobs) ? (path!.addedJobs as string[]) : [];
const addedJobsPayload = addedJobIds.length > 0
  ? await ctx.prisma.job.findMany({
      where: { id: { in: addedJobIds }, isPublished: true },
      include: {
        lessons: {
          orderBy: { order: 'asc' },
          include: { lesson: { include: { progress: { where: { path: { userId: ctx.user.id } } } } } },
        },
      },
    })
  : [];

// Map to LessonWithProgress[] per job — reuse existing lesson→LessonWithProgress mapping helper if present.
```

Return `addedJobs: addedJobsPayload.map(j => ({ id: j.id, slug: j.slug, title: j.title, marketplace: j.marketplace, lessons: <mapped LessonWithProgress[]> }))`.

> If `getRecommendedPath` has many code paths, place the new fetch once at the top and add the field to all return branches.

- [ ] **Step 2: Render «Мои плейбуки» on track page**

In `track/page.tsx`, **before** the sectioned accordion (Cases A/A2/B/C/D) and before the flat-list fallback, add:

```tsx
{recommendedPath.addedJobs && recommendedPath.addedJobs.length > 0 && (
  <section className="space-y-4">
    <h2 className="text-heading font-bold text-mp-gray-900">Мои плейбуки</h2>
    <div className="space-y-3">
      {recommendedPath.addedJobs.map((pb) => {
        const total = pb.lessons.length;
        const completed = pb.lessons.filter(l => l.progress?.[0]?.status === 'COMPLETED').length;
        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
        return (
          <div key={pb.id} className="bg-white border border-mp-gray-200 rounded-xl p-4 shadow-mp-card">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h3 className="text-body font-semibold text-mp-gray-900">{pb.title}</h3>
                <span className="text-caption text-mp-gray-400">{completed}/{total} уроков</span>
              </div>
              <Link href={`/learn/job/${pb.slug}`} className="text-body-sm text-mp-blue-500 hover:underline shrink-0">
                Открыть плейбук →
              </Link>
            </div>
            <div className="h-1.5 bg-mp-gray-200 rounded-full overflow-hidden mb-3">
              <div className={pct === 100 ? 'h-full bg-mp-green-500' : 'h-full bg-mp-blue-500'} style={{ width: `${pct}%` }} />
            </div>
            <div className="space-y-1">
              {pb.lessons.map((l) => (
                <LessonCard
                  key={l.id}
                  lesson={l}
                  locked={l.locked}
                  // reuse the existing LessonCard from the project — same props as elsewhere on the track page
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  </section>
)}
```

- [ ] **Step 3: Dedup — exclude playbook lessons from `custom` and from the sectioned/flat lists below**

Build a set of lesson IDs covered by any added playbook:

```ts
const playbookLessonIds = new Set(
  (recommendedPath.addedJobs ?? []).flatMap(pb => pb.lessons.map(l => l.id))
);
```

In every render branch that lists lessons (the `custom` section in the sectioned accordion, the flat-list fallback), filter out `lesson.id ∈ playbookLessonIds` before rendering — those lessons are now rendered inside «Мои плейбуки».

- [ ] **Step 4: Typecheck + commit**

```bash
pnpm typecheck
git add packages/api/src/routers/learning.ts "apps/web/src/app/(main)/learn/track/page.tsx"
git commit -m "feat(learn): Мои плейбуки section on /learn/track with dedup"
```

---

## Task 6: Manual E2E QA + staging redeploy

**Files:** none (operational)

- [ ] **Step 1: Push branch**

```bash
git push origin worktree-phase-57-library-redesign
```

- [ ] **Step 2: 🛑 MANDATORY STOP — staging redeploy**

Same staging-deploy procedure as Phase 57 Task 10 (`scripts/vps-ops` agent or per `.claude/memory/staging-workflow.md`). Wait for owner approval before deploying.

- [ ] **Step 3: Manual QA checklist on staging**

Login on staging with a test account that has a PLATFORM subscription (so lessons aren't paywalled).

- [ ] Open `/learn` as a brand-new account (no diagnostic, no track) — track banner shows **empty state** with «Пройти диагностику» CTA.
- [ ] Click the CTA — lands on `/diagnostic`.
- [ ] Open a job (`/learn/job/<slug>`) — «+ В трек» button visible, chevron `→` on each lesson row, hover affordance works.
- [ ] Click «+ В трек» — toast «Джоба добавлена в трек», button switches to «В треке ✓ · убрать», `/learn` banner now shows track count.
- [ ] Open `/learn/track` — new «Мои плейбуки» section at the top with the added playbook, progress bar, lesson list.
- [ ] Lessons from that playbook do NOT appear in `custom` section below.
- [ ] Click «Открыть плейбук →» — lands on the job page.
- [ ] Click «В треке ✓ · убрать» — toast «Джоба убрана из трека», banner/track empty again, button reverts to «+ В трек».
- [ ] Add two overlapping playbooks (if any share a lesson) — remove one — confirm the shared lesson is RETAINED in the other playbook.
- [ ] No regressions on courses lens, search, FilterPanel, MarketplaceSwitch.

- [ ] **Step 4: Update PR #8**

After staging QA passes, update PR #8 body with: «Polish round added: + В трек, persistent track banner, Мои плейбуки section. Staging QA pass <date>.»

---

## Self-Review

**Spec coverage:**
- Q1 (job actions + lesson affordance) → Task 2 (`addJobToTrack`/`isInTrack`) + Task 3 (button + chevron) ✅
- Q2 (track always discoverable) → Task 4 (always-visible banner with empty state + CTA to diagnostic) ✅
- Q3 (playbook → track integration) → Task 1 (schema) + Task 2 (server) + Task 5 (UI section + dedup) ✅

**Out of scope (Phase 58):**
- Diagnostic recommending whole jobs instead of lessons (`diagnostic.ts` untouched).
- Sectioned-track view replaced by jobs (we keep sections; add «Мои плейбуки» as a NEW top section).
- Per-lesson provenance tracking (which job added a lesson) — not needed; conservative dedup-on-remove handles it.

**Type consistency:**
- `LearningPath.addedJobs Json` (Task 1) ↔ `addedJobs: string[]` casts in routers (Task 2) ↔ `RecommendedPath.addedJobs: { id, slug, title, marketplace, lessons }[]` (Task 5 server) ↔ track page consumption (Task 5 UI).
- `JobDetail.isInTrack: boolean` (Task 2) ↔ job page (Task 3).

**Placeholder scan:** Step 5 of Task 5 says «reuse the existing LessonCard … same props as elsewhere on the track page» — this is intentional; the LessonCard import and prop shape are already used in the current `track/page.tsx`. The implementer reads the existing usage and matches.

**Известные ограничения:**
- A lesson currently in `LearningPath.lessons` (manually added before this plan) — if it happens to also be in an added playbook, the playbook section will render it; the flat-list dedup keeps it from doubling. If the user later removes the playbook, the lesson is removed (not retained by the "added manually" semantics — we don't track that). Acceptable trade-off: the user can re-add the single lesson if needed.

**Estimated effort:** ~4-6 hours total, 1-2 subagent rounds per task with reviews.
