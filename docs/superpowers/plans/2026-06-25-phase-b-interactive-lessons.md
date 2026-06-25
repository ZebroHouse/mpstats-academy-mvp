# Phase B — Interactive Lessons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add interactive lesson authoring (reveal gates «читать дальше» + re-merging checkpoint branches) and a student reveal runtime that persists position + choices, on top of the shipped Phase A text-lesson engine.

**Architecture:** Three shared TipTap v3 custom nodes (`revealGate`, `checkpoint`, `checkpointOption`) defined once in `lessonEditorExtensions`. In the **editor** they render React node-views (authoring chrome + nested `NodeViewContent`). The **student renderer** never renders those nodes through TipTap — a pure walker (`buildRevealPlan`) slices the doc into reveal items; plain-block segments render through the existing read-only `LessonBodyRenderer` (visual parity for free), gates/checkpoints render as React controls. Reveal position + checkpoint choices live in a new `LessonProgress.progressState` JSONB column.

**Tech Stack:** Next.js 14 App Router (client components), TipTap v3.27.1 (`@tiptap/react`, `@tiptap/core`, new `@tiptap/suggestion`), tRPC, Prisma + Supabase, Vitest.

---

## Reference: source-of-truth spec

`docs/superpowers/specs/2026-06-25-phase-b-interactive-lessons-design.md`. Decisions locked: inline-reveal; analytics = persist-only; checkpoint = mandatory + fixed choice; WYSIWYG nested branch authoring; insert via toolbar + slash.

## Carry-over gotchas from Phase A (apply throughout)

- **TipTap v3.** Every `useEditor` passes `immediatelyRender: false`. Link is bundled in StarterKit. Table extensions are named exports.
- **Migrations to prod Supabase:** additive only, via Management API; watch for zombie `idle in transaction` sessions blocking `ALTER` (`pg_terminate_backend` stale ones). For local dev the migration runs through Prisma.
- **`publishLesson` reads body from DB** → editor must save (`updateLessonBody`) before publish. (Already wired; unchanged.)
- **`overflow-x: clip` (not `hidden`)** on html/body is already fixed; do not regress.
- **Scoped `.lesson-content`** typography (NOT `@tailwindcss/typography`).

## File structure

**New files:**
| File | Responsibility |
|------|----------------|
| `packages/db/prisma/migrations/20260625000000_add_lesson_progress_state/migration.sql` | Additive `progressState JSONB` on `LessonProgress` |
| `packages/shared/src/types/index.ts` (modify) | `InteractiveProgressState` type + `progressState` on `LessonWithProgress` |
| `apps/web/src/components/admin/lesson-editor/interactive-nodes.ts` | The 3 TipTap node definitions + insert commands |
| `apps/web/src/components/admin/lesson-editor/RevealGateNodeView.tsx` | Editor node-view for the gate |
| `apps/web/src/components/admin/lesson-editor/CheckpointNodeView.tsx` | Editor node-view for the checkpoint container |
| `apps/web/src/components/admin/lesson-editor/CheckpointOptionNodeView.tsx` | Editor node-view for one option |
| `apps/web/src/components/admin/lesson-editor/InteractiveToolbar.tsx` | Toolbar buttons: insert gate / checkpoint |
| `apps/web/src/components/admin/lesson-editor/slash-menu.ts` | `@tiptap/suggestion` plugin config |
| `apps/web/src/components/admin/lesson-editor/SlashMenuList.tsx` | React popup list for slash menu |
| `apps/web/src/components/learning/interactive-reveal.ts` | Pure walker `buildRevealPlan` |
| `apps/web/src/components/learning/InteractiveLessonRenderer.tsx` | Student reveal runtime |
| Test files alongside each (see tasks) | |

**Modified files:**
| File | Change |
|------|--------|
| `packages/db/prisma/schema.prisma` | `LessonProgress.progressState Json?` |
| `packages/api/src/routers/learning.ts` | `saveInteractiveProgress` + `getLesson` returns `progressState` |
| `packages/ai/src/text-index.ts` | `extractPlainText` surfaces `checkpointOption.label` |
| `apps/web/src/components/admin/lesson-editor/extensions.ts` | Register the 3 nodes |
| `apps/web/src/components/admin/lesson-editor/LessonEditor.tsx` | Mount `InteractiveToolbar` + slash menu |
| `apps/web/src/app/(main)/learn/[id]/page.tsx` | Branch `INTERACTIVE` → renderer + progress save + completion gating |
| `apps/web/package.json` | Add `@tiptap/suggestion` |

## Waves

- **Wave 1 (backend foundation):** Tasks 1–5 — schema/migration, shared types, API, indexing. Independent of UI.
- **Wave 2 (shared TipTap nodes):** Tasks 6–8 — node definitions + register. Foundation for both editor and (schema-only) renderer.
- **Wave 3 (editor authoring):** Tasks 9–13 — node-views, toolbar, slash menu.
- **Wave 4 (student runtime):** Tasks 14–16 — pure walker, renderer, page wiring.
- **Wave 5 (verify):** Task 17 — full typecheck/tests + manual QA checklist.

---

## Task 1: DB migration — `LessonProgress.progressState`

**Files:**
- Create: `packages/db/prisma/migrations/20260625000000_add_lesson_progress_state/migration.sql`
- Modify: `packages/db/prisma/schema.prisma` (model `LessonProgress`, after `completedAt DateTime?`)

- [ ] **Step 1: Write the migration SQL**

Create `packages/db/prisma/migrations/20260625000000_add_lesson_progress_state/migration.sql`:

```sql
-- Additive: nullable JSONB holding interactive-lesson reveal state
-- ({ version, revealedGateIds[], checkpointChoices{} }). No data loss; existing
-- video/text progress rows keep progressState = NULL.
ALTER TABLE "LessonProgress" ADD COLUMN "progressState" JSONB;
```

- [ ] **Step 2: Add the field to the Prisma schema**

In `packages/db/prisma/schema.prisma`, model `LessonProgress`, add after `completedAt DateTime?`:

```prisma
  completedAt    DateTime?
  progressState  Json? // interactive lessons: reveal position + checkpoint choices (resume + analytics)
```

- [ ] **Step 3: Regenerate the Prisma client**

Run: `pnpm --filter @mpstats/db db:generate`
Expected: "Generated Prisma Client" with no errors. (Local dev DB only; prod migration is applied via Mgmt API at deploy — see Task 17 / spec §12.)

- [ ] **Step 4: Commit**

```bash
git add packages/db/prisma/migrations/20260625000000_add_lesson_progress_state/migration.sql packages/db/prisma/schema.prisma
git commit -m "feat(db): add LessonProgress.progressState for interactive lessons"
```

---

## Task 2: Shared type — `InteractiveProgressState`

**Files:**
- Modify: `packages/shared/src/types/index.ts` (near `LessonContentType` ~line 350, and `LessonWithProgress` ~line 105)

- [ ] **Step 1: Add the progress-state type**

In `packages/shared/src/types/index.ts`, after the `LESSON_CONTENT_TYPE_LABELS` block (~line 362), add:

```ts
/**
 * Persisted reveal state for an INTERACTIVE lesson. `revealedGateIds` are the
 * gate node ids the student has clicked through; `checkpointChoices` maps a
 * checkpoint node id → the chosen option id (fixed once chosen).
 */
export interface InteractiveProgressState {
  version: 1;
  revealedGateIds: string[];
  checkpointChoices: Record<string, string>;
}
```

- [ ] **Step 2: Surface it on `LessonWithProgress`**

In the `LessonWithProgress` interface (~line 105), add a field after `body?: unknown;`:

```ts
  contentType?: LessonContentType;  // TEXT/INTERACTIVE lessons
  body?: unknown;                    // TipTap document, gated behind `locked`
  progressState?: InteractiveProgressState | null; // INTERACTIVE: reveal/choice state
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @mpstats/shared typecheck`
Expected: PASS (no errors).

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types/index.ts
git commit -m "feat(shared): InteractiveProgressState type + LessonWithProgress.progressState"
```

---

## Task 3: API — `learning.saveInteractiveProgress` (TDD)

**Files:**
- Test: `packages/api/src/routers/__tests__/learning-interactive-progress.test.ts`
- Modify: `packages/api/src/routers/learning.ts` (add mutation near `saveWatchProgress` ~line 686)

- [ ] **Step 1: Write the failing test**

Create `packages/api/src/routers/__tests__/learning-interactive-progress.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@mpstats/ai', () => ({}));
import { learningRouter } from '../learning';

function makeCtx() {
  const upsertProgress = vi.fn().mockResolvedValue({ id: 'p1', status: 'IN_PROGRESS' });
  return {
    ctx: {
      user: { id: 'u1' },
      prisma: {
        userProfile: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn().mockResolvedValue({ id: 'u1' }), update: vi.fn() },
        userActivityDay: { upsert: vi.fn().mockResolvedValue({}) },
        learningPath: { upsert: vi.fn().mockResolvedValue({ id: 'path1' }) },
        lessonProgress: {
          findUnique: vi.fn().mockResolvedValue(null),
          upsert: upsertProgress,
        },
      },
    } as never,
    upsertProgress,
  };
}

const validState = { version: 1 as const, revealedGateIds: ['g1'], checkpointChoices: { cp1: 'o2' } };

describe('learning.saveInteractiveProgress', () => {
  beforeEach(() => vi.clearAllMocks());

  it('upserts LessonProgress with the given progressState (status IN_PROGRESS)', async () => {
    const { ctx, upsertProgress } = makeCtx();
    const caller = learningRouter.createCaller(ctx);
    const res = await caller.saveInteractiveProgress({ lessonId: 'l1', progressState: validState });
    expect(res).toEqual({ ok: true });
    expect(upsertProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { pathId_lessonId: { pathId: 'path1', lessonId: 'l1' } },
        update: expect.objectContaining({ progressState: validState, status: 'IN_PROGRESS' }),
        create: expect.objectContaining({ pathId: 'path1', lessonId: 'l1', progressState: validState, status: 'IN_PROGRESS' }),
      }),
    );
  });

  it('does not downgrade a COMPLETED lesson back to IN_PROGRESS', async () => {
    const { ctx, upsertProgress } = makeCtx();
    (ctx as never as { prisma: { lessonProgress: { findUnique: ReturnType<typeof vi.fn> } } }).prisma.lessonProgress.findUnique.mockResolvedValue({ status: 'COMPLETED' });
    const caller = learningRouter.createCaller(ctx);
    await caller.saveInteractiveProgress({ lessonId: 'l1', progressState: validState });
    expect(upsertProgress).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ status: 'COMPLETED' }) }),
    );
  });

  it('rejects malformed progressState (wrong version)', async () => {
    const { ctx } = makeCtx();
    const caller = learningRouter.createCaller(ctx);
    await expect(
      caller.saveInteractiveProgress({ lessonId: 'l1', progressState: { version: 2, revealedGateIds: [], checkpointChoices: {} } as never }),
    ).rejects.toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @mpstats/api test -- learning-interactive-progress`
Expected: FAIL — `caller.saveInteractiveProgress is not a function`.

- [ ] **Step 3: Implement the mutation**

In `packages/api/src/routers/learning.ts`, add this procedure right after `saveWatchProgress` (it ends ~line 763). Use the exact same `ensureUserProfile` + `learningPath.upsert` + `handleDatabaseError` patterns already in the file:

```ts
  // Save interactive-lesson reveal state (gate reveals + checkpoint choices).
  // Mirrors saveWatchProgress: ensures profile + path, upserts LessonProgress.
  // Never downgrades a COMPLETED lesson; completion is a separate mutation.
  saveInteractiveProgress: protectedProcedure
    .input(
      z.object({
        lessonId: z.string(),
        progressState: z.object({
          version: z.literal(1),
          revealedGateIds: z.array(z.string()),
          checkpointChoices: z.record(z.string()),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await ensureUserProfile(ctx.prisma, ctx.user);
        const path = await ctx.prisma.learningPath.upsert({
          where: { userId: ctx.user.id },
          update: {},
          create: { userId: ctx.user.id, lessons: [] },
        });
        const existing = await ctx.prisma.lessonProgress.findUnique({
          where: { pathId_lessonId: { pathId: path.id, lessonId: input.lessonId } },
          select: { status: true },
        });
        const status = existing?.status === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS';
        await ctx.prisma.lessonProgress.upsert({
          where: { pathId_lessonId: { pathId: path.id, lessonId: input.lessonId } },
          update: { progressState: input.progressState, status },
          create: {
            pathId: path.id,
            lessonId: input.lessonId,
            progressState: input.progressState,
            status: 'IN_PROGRESS',
          },
        });
        return { ok: true as const };
      } catch (error) {
        handleDatabaseError(error);
      }
    }),
```

> Note: `z.record(z.string())` validates a `Record<string,string>` (keys are strings by default). If the repo's zod version requires two args, use `z.record(z.string(), z.string())` — check `pnpm --filter @mpstats/api test` output.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @mpstats/api test -- learning-interactive-progress`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routers/learning.ts packages/api/src/routers/__tests__/learning-interactive-progress.test.ts
git commit -m "feat(api): learning.saveInteractiveProgress mutation"
```

---

## Task 4: API — `getLesson` returns `progressState` (TDD)

**Files:**
- Test: `packages/api/src/routers/__tests__/learning-interactive-getlesson.test.ts`
- Modify: `packages/api/src/routers/learning.ts` (`getLesson` return object, ~line 528)

- [ ] **Step 1: Write the failing test**

Create `packages/api/src/routers/__tests__/learning-interactive-getlesson.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@mpstats/ai', () => ({}));
vi.mock('../../utils/access', () => ({
  checkLessonAccess: vi.fn().mockResolvedValue({ hasAccess: true, hasPlatformSubscription: true }),
}));
import { learningRouter } from '../learning';

const state = { version: 1, revealedGateIds: ['g1'], checkpointChoices: { cp1: 'o2' } };
const base = {
  id: 'l1', courseId: 'c1', title: 'T', order: 1, isHidden: false,
  videoId: null, videoUrl: null, duration: null, description: null,
  skillCategory: 'ANALYTICS', skillLevel: 'MEDIUM',
  course: { id: 'c1', title: 'C', slug: 'c', lessons: [{ id: 'l1', title: 'T', order: 1 }] },
  materials: [],
};

function makeCtx(lesson: unknown) {
  return {
    user: { id: 'u1' },
    prisma: {
      userProfile: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() },
      userActivityDay: { upsert: vi.fn().mockResolvedValue({}) },
      lesson: { findUnique: vi.fn().mockResolvedValue(lesson) },
    },
  } as never;
}

describe('learning.getLesson — interactive progressState', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns progressState from the student progress row', async () => {
    const lesson = { ...base, contentType: 'INTERACTIVE', contentStatus: 'PUBLISHED', body: { type: 'doc', content: [] },
      progress: [{ status: 'IN_PROGRESS', watchedPercent: 0, progressState: state }] };
    const caller = learningRouter.createCaller(makeCtx(lesson));
    const res = await caller.getLesson({ lessonId: 'l1' });
    expect(res?.lesson.contentType).toBe('INTERACTIVE');
    expect(res?.lesson.progressState).toEqual(state);
  });

  it('returns null progressState when there is no progress row', async () => {
    const lesson = { ...base, contentType: 'INTERACTIVE', contentStatus: 'PUBLISHED', body: { type: 'doc', content: [] }, progress: [] };
    const caller = learningRouter.createCaller(makeCtx(lesson));
    const res = await caller.getLesson({ lessonId: 'l1' });
    expect(res?.lesson.progressState).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @mpstats/api test -- learning-interactive-getlesson`
Expected: FAIL — `progressState` is `undefined` (not in return).

- [ ] **Step 3: Add `progressState` to the `getLesson` return**

In `packages/api/src/routers/learning.ts`, in the `getLesson` return object (the `lesson: { ... }` block ~lines 512–529), add after the `body:` line:

```ts
        contentType: lesson.contentType,
        body: locked ? null : (lesson.body ?? null),
        progressState: locked ? null : ((lesson.progress[0]?.progressState as never) ?? null),
```

(The `progress` include already selects all columns, so `progressState` is present once the column exists.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @mpstats/api test -- learning-interactive-getlesson`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routers/learning.ts packages/api/src/routers/__tests__/learning-interactive-getlesson.test.ts
git commit -m "feat(api): getLesson returns interactive progressState"
```

---

## Task 5: Indexing — surface `checkpointOption.label` (TDD)

Nested branch *body* text is already extracted (the existing `extractPlainText` recurses through `node.content`, so paragraphs inside a `checkpointOption` are picked up as paragraph blocks). The only gap is the option **label** (lives in `attrs`, not in a text node). Surface it so the answer options are searchable.

**Files:**
- Test: `packages/ai/src/__tests__/text-index-interactive.test.ts`
- Modify: `packages/ai/src/text-index.ts` (`JSONNode` type ~line 4, `walk` in `extractPlainText` ~line 20)

- [ ] **Step 1: Write the failing test**

Create `packages/ai/src/__tests__/text-index-interactive.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('../embeddings', () => ({ embedQuery: vi.fn() }));
import { extractPlainText } from '../text-index';

describe('extractPlainText — interactive nodes', () => {
  it('extracts nested branch paragraphs AND option labels', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Кем стать?' }] },
        {
          type: 'checkpoint',
          attrs: { id: 'cp1' },
          content: [
            {
              type: 'checkpointOption',
              attrs: { id: 'o1', label: 'Космонавт' },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Космонавты много зарабатывают.' }] }],
            },
            {
              type: 'checkpointOption',
              attrs: { id: 'o2', label: 'Водолаз' },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Водолазы работают под водой.' }] }],
            },
          ],
        },
      ],
    };
    const out = extractPlainText(doc);
    expect(out).toContain('Кем стать?');
    expect(out).toContain('Космонавт'); // label
    expect(out).toContain('Космонавты много зарабатывают.'); // branch body
    expect(out).toContain('Водолаз');
    expect(out).toContain('Водолазы работают под водой.');
  });

  it('ignores revealGate (no extractable text)', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'до гейта' }] },
        { type: 'revealGate', attrs: { id: 'g1', buttonLabel: 'Читать дальше' } },
        { type: 'paragraph', content: [{ type: 'text', text: 'после гейта' }] },
      ],
    };
    expect(extractPlainText(doc)).toBe('до гейта\nпосле гейта');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @mpstats/ai test -- text-index-interactive`
Expected: FAIL — output does not contain `Космонавт` (label not surfaced).

- [ ] **Step 3: Add label extraction**

In `packages/ai/src/text-index.ts`:

(a) Extend the `JSONNode` type (~line 4) to include attrs:

```ts
type JSONNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: JSONNode[];
};
```

(b) In `extractPlainText`'s `walk` function, before the `if (node.content)` loop, add:

```ts
  const walk = (node: JSONNode): string => {
    if (node.type === 'text') return node.text ?? '';
    // Surface a checkpoint option's button label as its own block so the
    // branch answers are searchable / visible to the AI chat.
    if (node.type === 'checkpointOption' && typeof node.attrs?.label === 'string') {
      const label = (node.attrs.label as string).trim();
      if (label) blocks.push(label);
    }
    let inline = '';
    if (node.content) for (const child of node.content) inline += walk(child);
    if (node.type && BLOCK_TYPES.has(node.type)) {
      const trimmed = inline.trim();
      if (trimmed) blocks.push(trimmed);
      return '';
    }
    return inline;
  };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @mpstats/ai test -- text-index-interactive`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/text-index.ts packages/ai/src/__tests__/text-index-interactive.test.ts
git commit -m "feat(ai): index checkpoint option labels for interactive lessons"
```

---

## Task 6: TipTap node — `revealGate` (TDD)

**Files:**
- Create: `apps/web/src/components/admin/lesson-editor/interactive-nodes.ts`
- Test: `apps/web/tests/unit/interactive-nodes.test.ts`

> Node-view components are imported here but built in Wave 3. To keep this task self-contained, create **thin placeholder node-view modules** now (Step 0) and flesh them out in Tasks 9–11. The placeholders must be valid React so the schema tests run.

- [ ] **Step 0: Create placeholder node-view files (replaced in Wave 3)**

Create these three files with minimal valid content (Wave 3 replaces the bodies):

`apps/web/src/components/admin/lesson-editor/RevealGateNodeView.tsx`:
```tsx
import { NodeViewWrapper } from '@tiptap/react';
export function RevealGateNodeView() {
  return <NodeViewWrapper className="reveal-gate-editor" />;
}
```

`apps/web/src/components/admin/lesson-editor/CheckpointOptionNodeView.tsx`:
```tsx
import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';
export function CheckpointOptionNodeView() {
  return (
    <NodeViewWrapper className="checkpoint-option-editor">
      <NodeViewContent />
    </NodeViewWrapper>
  );
}
```

`apps/web/src/components/admin/lesson-editor/CheckpointNodeView.tsx`:
```tsx
import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';
export function CheckpointNodeView() {
  return (
    <NodeViewWrapper className="checkpoint-editor">
      <NodeViewContent />
    </NodeViewWrapper>
  );
}
```

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/unit/interactive-nodes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { generateJSON } from '@tiptap/html';
import { lessonEditorExtensions } from '@/components/admin/lesson-editor/extensions';

// Round-trip: serialize a doc containing interactive nodes to HTML and back,
// confirming the schema accepts revealGate / checkpoint / checkpointOption.
describe('interactive node schema', () => {
  it('parses a doc with a revealGate and a checkpoint', () => {
    const html =
      '<p>intro</p>' +
      '<div data-type="reveal-gate" data-id="g1" data-label="Дальше"></div>' +
      '<div data-type="checkpoint" data-id="cp1">' +
        '<div data-type="checkpoint-option" data-id="o1" data-label="A"><p>branch a</p></div>' +
        '<div data-type="checkpoint-option" data-id="o2" data-label="B"><p>branch b</p></div>' +
      '</div>';
    const json = generateJSON(html, lessonEditorExtensions);
    const types = (json.content ?? []).map((n: { type: string }) => n.type);
    expect(types).toContain('revealGate');
    expect(types).toContain('checkpoint');
    const gate = (json.content ?? []).find((n: { type: string }) => n.type === 'revealGate');
    expect(gate.attrs.id).toBe('g1');
    expect(gate.attrs.buttonLabel).toBe('Дальше');
  });
});
```

> `@tiptap/html` ships with TipTap v3 (transitive via `@tiptap/core`). If the import fails, add `@tiptap/html@^3.27.1` to `apps/web/package.json` devDependencies.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web test -- interactive-nodes`
Expected: FAIL — `revealGate`/`checkpoint` not in schema (extensions don't define them yet — they get added in Task 8, but this test imports `lessonEditorExtensions`; until Task 8 it fails on missing node types).

- [ ] **Step 3: Implement the node definitions**

Create `apps/web/src/components/admin/lesson-editor/interactive-nodes.ts`:

```ts
import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { RevealGateNodeView } from './RevealGateNodeView';
import { CheckpointNodeView } from './CheckpointNodeView';
import { CheckpointOptionNodeView } from './CheckpointOptionNodeView';

export function interactiveUid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2)}`;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    interactiveLessons: {
      insertRevealGate: () => ReturnType;
      insertCheckpoint: () => ReturnType;
    };
  }
}

const idAttr = {
  default: null as string | null,
  parseHTML: (el: HTMLElement) => el.getAttribute('data-id'),
  renderHTML: (attrs: { id?: string | null }) => (attrs.id ? { 'data-id': attrs.id } : {}),
};

export const RevealGate = Node.create({
  name: 'revealGate',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      id: idAttr,
      buttonLabel: {
        default: 'Читать дальше',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-label') ?? 'Читать дальше',
        renderHTML: (attrs: { buttonLabel?: string }) => ({ 'data-label': attrs.buttonLabel ?? 'Читать дальше' }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="reveal-gate"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'reveal-gate' })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(RevealGateNodeView);
  },
  addCommands() {
    return {
      insertRevealGate:
        () =>
        ({ commands, editor }) => {
          // Forbid nothing for gates — allowed at any level (incl. inside branches).
          void editor;
          return commands.insertContent({
            type: 'revealGate',
            attrs: { id: interactiveUid(), buttonLabel: 'Читать дальше' },
          });
        },
    };
  },
});

export const CheckpointOption = Node.create({
  name: 'checkpointOption',
  content: 'block+',
  defining: true,
  isolating: true,
  addAttributes() {
    return {
      id: idAttr,
      label: {
        default: 'Вариант',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-label') ?? 'Вариант',
        renderHTML: (attrs: { label?: string }) => ({ 'data-label': attrs.label ?? 'Вариант' }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="checkpoint-option"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'checkpoint-option' }), 0];
  },
  addNodeView() {
    return ReactNodeViewRenderer(CheckpointOptionNodeView);
  },
});

export const Checkpoint = Node.create({
  name: 'checkpoint',
  group: 'block',
  content: 'checkpointOption+',
  defining: true,
  isolating: true,
  addAttributes() {
    return { id: idAttr };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="checkpoint"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'checkpoint' }), 0];
  },
  addNodeView() {
    return ReactNodeViewRenderer(CheckpointNodeView);
  },
  addCommands() {
    return {
      insertCheckpoint:
        () =>
        ({ commands, state }) => {
          // Model A: forbid nested checkpoints. If the cursor is already inside a
          // checkpoint, no-op (StarterKit groups can't express "block except
          // checkpoint" in the schema, so we guard at the command level).
          const { $from } = state.selection;
          for (let d = $from.depth; d > 0; d--) {
            if ($from.node(d).type.name === 'checkpoint') return false;
          }
          return commands.insertContent({
            type: 'checkpoint',
            attrs: { id: interactiveUid() },
            content: [
              { type: 'checkpointOption', attrs: { id: interactiveUid(), label: 'Вариант 1' }, content: [{ type: 'paragraph' }] },
              { type: 'checkpointOption', attrs: { id: interactiveUid(), label: 'Вариант 2' }, content: [{ type: 'paragraph' }] },
            ],
          });
        },
    };
  },
});
```

> The test still fails until Task 8 wires these into `lessonEditorExtensions`. That's expected — keep going; this is one logical unit split across Tasks 6 & 8. Commit them together at Task 8.

- [ ] **Step 4: Commit (definitions + placeholders, test stays red until Task 8)**

```bash
git add apps/web/src/components/admin/lesson-editor/interactive-nodes.ts apps/web/src/components/admin/lesson-editor/RevealGateNodeView.tsx apps/web/src/components/admin/lesson-editor/CheckpointNodeView.tsx apps/web/src/components/admin/lesson-editor/CheckpointOptionNodeView.tsx apps/web/tests/unit/interactive-nodes.test.ts
git commit -m "feat(editor): define revealGate/checkpoint/checkpointOption TipTap nodes"
```

---

## Task 7: Install `@tiptap/suggestion`

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: Add the dependency**

In `apps/web/package.json`, in `dependencies`, add (alphabetically near the other `@tiptap/*` entries):

```json
    "@tiptap/suggestion": "^3.27.1",
```

- [ ] **Step 2: Install**

Run: `pnpm install`
Expected: lockfile updates, `@tiptap/suggestion` resolved at ^3.27.1.

- [ ] **Step 3: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml
git commit -m "chore(web): add @tiptap/suggestion for slash menu"
```

---

## Task 8: Register interactive nodes in `lessonEditorExtensions` (makes Task 6 test green)

**Files:**
- Modify: `apps/web/src/components/admin/lesson-editor/extensions.ts`

- [ ] **Step 1: Import and register the nodes**

In `apps/web/src/components/admin/lesson-editor/extensions.ts`, add the import after the table import:

```ts
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';
import { RevealGate, Checkpoint, CheckpointOption } from './interactive-nodes';
```

And append the three nodes to the `lessonEditorExtensions` array (after `TableCell`):

```ts
export const lessonEditorExtensions: Extensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    link: {
      openOnClick: false,
      autolink: true,
      HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer nofollow' },
    },
  }),
  LessonImage.configure({ inline: false, allowBase64: false }),
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
  RevealGate,
  Checkpoint,
  CheckpointOption,
];
```

- [ ] **Step 2: Run the Task 6 schema test to verify it passes**

Run: `pnpm --filter web test -- interactive-nodes`
Expected: PASS.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/admin/lesson-editor/extensions.ts
git commit -m "feat(editor): register interactive nodes in shared extensions"
```

---

## Task 9: `RevealGateNodeView` (editor authoring)

**Files:**
- Modify: `apps/web/src/components/admin/lesson-editor/RevealGateNodeView.tsx`

> Manual UI; verify in Step 2 by typecheck + the Task 17 smoke. No unit test (node-views need a live editor; covered by manual QA).

- [ ] **Step 1: Implement the node-view**

Replace the placeholder `RevealGateNodeView.tsx` with:

```tsx
import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';

export function RevealGateNodeView({ node, updateAttributes, deleteNode }: NodeViewProps) {
  const label = (node.attrs.buttonLabel as string) ?? 'Читать дальше';
  return (
    <NodeViewWrapper className="reveal-gate-editor my-4">
      <div
        className="flex items-center gap-2 rounded-lg border-2 border-dashed border-mp-blue-300 bg-mp-blue-50 px-3 py-2"
        contentEditable={false}
      >
        <span className="whitespace-nowrap text-sm text-mp-gray-500">📖 Читать дальше — текст кнопки:</span>
        <input
          className="min-w-0 flex-1 rounded border border-mp-gray-200 px-2 py-1 text-sm"
          value={label}
          onChange={(e) => updateAttributes({ buttonLabel: e.target.value })}
          placeholder="Читать дальше"
        />
        <button type="button" className="whitespace-nowrap text-sm text-red-500" onClick={() => deleteNode()}>
          Удалить
        </button>
      </div>
    </NodeViewWrapper>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/admin/lesson-editor/RevealGateNodeView.tsx
git commit -m "feat(editor): RevealGate node-view (editable label + delete)"
```

---

## Task 10: `CheckpointOptionNodeView` (editor authoring)

**Files:**
- Modify: `apps/web/src/components/admin/lesson-editor/CheckpointOptionNodeView.tsx`

- [ ] **Step 1: Implement the node-view**

Replace the placeholder with:

```tsx
import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';

export function CheckpointOptionNodeView({ node, updateAttributes, deleteNode }: NodeViewProps) {
  const label = (node.attrs.label as string) ?? '';
  return (
    <NodeViewWrapper className="checkpoint-option-editor mt-3 rounded-lg border border-mp-gray-200 bg-white p-3">
      <div className="mb-2 flex items-center gap-2" contentEditable={false}>
        <span className="whitespace-nowrap text-xs font-medium text-mp-gray-500">Текст кнопки варианта:</span>
        <input
          className="min-w-0 flex-1 rounded border border-mp-gray-200 px-2 py-1 text-sm"
          value={label}
          onChange={(e) => updateAttributes({ label: e.target.value })}
          placeholder="Например: Космонавт"
        />
        <button type="button" className="whitespace-nowrap text-xs text-red-500" onClick={() => deleteNode()}>
          Убрать вариант
        </button>
      </div>
      <NodeViewContent className="checkpoint-option-content" />
    </NodeViewWrapper>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/admin/lesson-editor/CheckpointOptionNodeView.tsx
git commit -m "feat(editor): CheckpointOption node-view (label + nested content)"
```

---

## Task 11: `CheckpointNodeView` (editor authoring)

**Files:**
- Modify: `apps/web/src/components/admin/lesson-editor/CheckpointNodeView.tsx`

- [ ] **Step 1: Implement the node-view**

Replace the placeholder with:

```tsx
import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { interactiveUid } from './interactive-nodes';

export function CheckpointNodeView({ node, editor, getPos }: NodeViewProps) {
  const addOption = () => {
    const pos = typeof getPos === 'function' ? getPos() : null;
    if (typeof pos !== 'number') return;
    // Insert a new option just before the checkpoint's closing token.
    const insertAt = pos + node.nodeSize - 1;
    editor
      .chain()
      .focus()
      .insertContentAt(insertAt, {
        type: 'checkpointOption',
        attrs: { id: interactiveUid(), label: 'Новый вариант' },
        content: [{ type: 'paragraph' }],
      })
      .run();
  };

  return (
    <NodeViewWrapper className="checkpoint-editor my-4 rounded-xl border-2 border-mp-blue-200 bg-mp-blue-50/40 p-4">
      <div className="mb-2 flex items-center justify-between" contentEditable={false}>
        <span className="text-sm font-semibold text-mp-blue-700">🔀 Развилка</span>
        <button type="button" className="text-sm text-mp-blue-600" onClick={addOption}>
          + Вариант
        </button>
      </div>
      <NodeViewContent className="checkpoint-options" />
    </NodeViewWrapper>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/admin/lesson-editor/CheckpointNodeView.tsx
git commit -m "feat(editor): Checkpoint node-view (options container + add option)"
```

---

## Task 12: Insert toolbar buttons

**Files:**
- Create: `apps/web/src/components/admin/lesson-editor/InteractiveToolbar.tsx`
- Modify: `apps/web/src/components/admin/lesson-editor/LessonEditor.tsx` (mount it in the sticky toolbar stack ~lines 75–92)

- [ ] **Step 1: Implement the toolbar**

Create `apps/web/src/components/admin/lesson-editor/InteractiveToolbar.tsx`:

```tsx
import type { Editor } from '@tiptap/react';
import { Button } from '@/components/ui/button';

export function InteractiveToolbar({ editor }: { editor: Editor }) {
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-mp-gray-200 bg-mp-gray-50 p-2">
      <span className="mx-1 text-sm text-mp-gray-600">Интерактив:</span>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => editor.chain().focus().insertRevealGate().run()}
      >
        📖 Читать дальше
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => editor.chain().focus().insertCheckpoint().run()}
      >
        🔀 Развилка
      </Button>
    </div>
  );
}
```

> The `Button` import path matches the existing toolbars (`ImageToolbar.tsx` imports `@/components/ui/button`). Confirm the exact path used by `ImageToolbar.tsx` and match it.

- [ ] **Step 2: Mount it in `LessonEditor`**

In `apps/web/src/components/admin/lesson-editor/LessonEditor.tsx`, add the import:

```ts
import { InteractiveToolbar } from './InteractiveToolbar';
```

And add it to the sticky toolbar stack (after `<ImageToolbar editor={editor} />`):

```tsx
<div className="sticky top-[72px] md:top-16 z-20 bg-white rounded-t-xl border-b border-mp-gray-200">
  <LessonEditorToolbar editor={editor} onInsertImage={...} showMarks={...} />
  <TableToolbar editor={editor} />
  <ImageToolbar editor={editor} />
  <InteractiveToolbar editor={editor} />
</div>
```

(Keep the existing `onInsertImage`/`showMarks` props exactly as they are; only add the `InteractiveToolbar` line.)

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: PASS. The `insertRevealGate`/`insertCheckpoint` commands are typed via the `declare module` augmentation in `interactive-nodes.ts`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/admin/lesson-editor/InteractiveToolbar.tsx apps/web/src/components/admin/lesson-editor/LessonEditor.tsx
git commit -m "feat(editor): toolbar buttons to insert gate / checkpoint"
```

---

## Task 13: Slash menu (`/`)

**Files:**
- Create: `apps/web/src/components/admin/lesson-editor/SlashMenuList.tsx`
- Create: `apps/web/src/components/admin/lesson-editor/slash-menu.ts`
- Modify: `apps/web/src/components/admin/lesson-editor/extensions.ts` (add the slash extension)

- [ ] **Step 1: Implement the popup list**

Create `apps/web/src/components/admin/lesson-editor/SlashMenuList.tsx`:

```tsx
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';

export type SlashItem = { title: string; run: () => void };

export const SlashMenuList = forwardRef(function SlashMenuList(
  { items }: { items: SlashItem[] },
  ref,
) {
  const [selected, setSelected] = useState(0);
  useEffect(() => setSelected(0), [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === 'ArrowDown') { setSelected((s) => (s + 1) % items.length); return true; }
      if (event.key === 'ArrowUp') { setSelected((s) => (s - 1 + items.length) % items.length); return true; }
      if (event.key === 'Enter') { items[selected]?.run(); return true; }
      return false;
    },
  }));

  if (items.length === 0) return null;
  return (
    <div className="z-50 w-56 overflow-hidden rounded-lg border border-mp-gray-200 bg-white shadow-lg">
      {items.map((item, i) => (
        <button
          key={item.title}
          type="button"
          className={`block w-full px-3 py-2 text-left text-sm ${i === selected ? 'bg-mp-blue-50' : ''}`}
          onClick={() => item.run()}
        >
          {item.title}
        </button>
      ))}
    </div>
  );
});
```

- [ ] **Step 2: Implement the suggestion extension**

Create `apps/web/src/components/admin/lesson-editor/slash-menu.ts`:

```ts
import { Extension } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { ReactRenderer } from '@tiptap/react';
import type { Editor, Range } from '@tiptap/core';
import { SlashMenuList, type SlashItem } from './SlashMenuList';

// Minimal slash menu: only the two interactive blocks (the novel inserts).
// Typing "/" opens it; arrows + Enter or click insert.
export const SlashCommands = Extension.create({
  name: 'slashCommands',
  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: '/',
        startOfLine: false,
        command: ({ editor, range, props }: { editor: Editor; range: Range; props: SlashItem }) => {
          editor.chain().focus().deleteRange(range).run();
          props.run();
        },
        items: ({ editor, query }: { editor: Editor; query: string }): SlashItem[] => {
          const all: SlashItem[] = [
            { title: '📖 Читать дальше (гейт)', run: () => editor.chain().focus().insertRevealGate().run() },
            { title: '🔀 Развилка (чекпоинт)', run: () => editor.chain().focus().insertCheckpoint().run() },
          ];
          const q = query.toLowerCase();
          return all.filter((i) => i.title.toLowerCase().includes(q));
        },
        render: () => {
          let component: ReactRenderer | null = null;
          let popup: HTMLDivElement | null = null;
          const position = (clientRect: (() => DOMRect | null) | null | undefined) => {
            if (!popup || !clientRect) return;
            const rect = clientRect();
            if (!rect) return;
            popup.style.left = `${rect.left}px`;
            popup.style.top = `${rect.bottom + 4}px`;
          };
          return {
            onStart: (props: { editor: Editor; clientRect?: (() => DOMRect | null) | null }) => {
              component = new ReactRenderer(SlashMenuList, { props, editor: props.editor });
              popup = document.createElement('div');
              popup.style.position = 'fixed';
              popup.appendChild(component.element);
              document.body.appendChild(popup);
              position(props.clientRect);
            },
            onUpdate: (props: { clientRect?: (() => DOMRect | null) | null }) => {
              component?.updateProps(props);
              position(props.clientRect);
            },
            onKeyDown: (props: { event: KeyboardEvent }) => {
              if (props.event.key === 'Escape') return true;
              return (component?.ref as { onKeyDown?: (p: { event: KeyboardEvent }) => boolean })?.onKeyDown?.(props) ?? false;
            },
            onExit: () => {
              popup?.remove();
              component?.destroy();
              popup = null;
              component = null;
            },
          };
        },
      }),
    ];
  },
});
```

- [ ] **Step 3: Register the slash extension**

In `extensions.ts`, import and append `SlashCommands`:

```ts
import { RevealGate, Checkpoint, CheckpointOption } from './interactive-nodes';
import { SlashCommands } from './slash-menu';
```

Append to the array (after `CheckpointOption`):

```ts
  RevealGate,
  Checkpoint,
  CheckpointOption,
  SlashCommands,
```

> `SlashCommands` references `document`/`window` only inside `render` callbacks (runtime, client-only). It is safe in the shared extensions array because the read-only renderer never triggers suggestion (no typing). But to be safe with SSR, the extension does no DOM work at module load.

- [ ] **Step 4: Typecheck + run the schema test (slash must not break parsing)**

Run: `pnpm --filter web typecheck && pnpm --filter web test -- interactive-nodes`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/admin/lesson-editor/SlashMenuList.tsx apps/web/src/components/admin/lesson-editor/slash-menu.ts apps/web/src/components/admin/lesson-editor/extensions.ts
git commit -m "feat(editor): slash menu to insert gate / checkpoint"
```

---

## Task 14: Pure reveal walker `buildRevealPlan` (TDD)

**Files:**
- Create: `apps/web/src/components/learning/interactive-reveal.ts`
- Test: `apps/web/tests/unit/interactive-reveal.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/unit/interactive-reveal.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildRevealPlan, type InteractiveProgressState } from '@/components/learning/interactive-reveal';

const empty: InteractiveProgressState = { version: 1, revealedGateIds: [], checkpointChoices: {} };
const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const gate = (id: string) => ({ type: 'revealGate', attrs: { id, buttonLabel: 'Дальше' } });
const checkpoint = (id: string, opts: [string, string][]) => ({
  type: 'checkpoint',
  attrs: { id },
  content: opts.map(([oid, label]) => ({
    type: 'checkpointOption',
    attrs: { id: oid, label },
    content: [p(`branch ${oid}`)],
  })),
});

describe('buildRevealPlan', () => {
  it('a plain doc with no gates is complete and one segment', () => {
    const plan = buildRevealPlan([p('a'), p('b')], empty);
    expect(plan.complete).toBe(true);
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]).toMatchObject({ kind: 'segment' });
  });

  it('stops at the first unpassed gate (not complete)', () => {
    const plan = buildRevealPlan([p('a'), gate('g1'), p('b')], empty);
    expect(plan.complete).toBe(false);
    const kinds = plan.items.map((i) => i.kind);
    expect(kinds).toEqual(['segment', 'gate']);
    expect(plan.items[1]).toMatchObject({ kind: 'gate', id: 'g1', passed: false });
  });

  it('reveals past a passed gate and completes', () => {
    const state: InteractiveProgressState = { ...empty, revealedGateIds: ['g1'] };
    const plan = buildRevealPlan([p('a'), gate('g1'), p('b')], state);
    expect(plan.complete).toBe(true);
    expect(plan.items.map((i) => i.kind)).toEqual(['segment', 'gate', 'segment']);
  });

  it('stops at an unanswered checkpoint with options but no branch', () => {
    const plan = buildRevealPlan([p('a'), checkpoint('cp1', [['o1', 'A'], ['o2', 'B']]), p('after')], empty);
    expect(plan.complete).toBe(false);
    const cp = plan.items.find((i) => i.kind === 'checkpoint') as Extract<typeof plan.items[number], { kind: 'checkpoint' }>;
    expect(cp.chosenOptionId).toBeNull();
    expect(cp.options).toEqual([{ id: 'o1', label: 'A' }, { id: 'o2', label: 'B' }]);
    expect(cp.branch).toHaveLength(0);
    // main line after checkpoint must NOT appear yet
    expect(plan.items.some((i) => i.kind === 'segment' && JSON.stringify(i).includes('after'))).toBe(false);
  });

  it('renders the chosen branch then resumes the main line', () => {
    const state: InteractiveProgressState = { ...empty, checkpointChoices: { cp1: 'o2' } };
    const plan = buildRevealPlan([p('a'), checkpoint('cp1', [['o1', 'A'], ['o2', 'B']]), p('after')], state);
    expect(plan.complete).toBe(true);
    const cp = plan.items.find((i) => i.kind === 'checkpoint') as Extract<typeof plan.items[number], { kind: 'checkpoint' }>;
    expect(cp.chosenOptionId).toBe('o2');
    expect(cp.branch).toHaveLength(1); // branch o2 segment
    expect(JSON.stringify(cp.branch)).toContain('branch o2');
    // main line resumes: a segment containing "after" exists at top level
    expect(plan.items.some((i) => i.kind === 'segment' && JSON.stringify(i).includes('after'))).toBe(true);
  });

  it('a gate inside the chosen branch blocks the main line until passed', () => {
    const cp = {
      type: 'checkpoint',
      attrs: { id: 'cp1' },
      content: [
        { type: 'checkpointOption', attrs: { id: 'o1', label: 'A' }, content: [p('intro'), gate('gIn'), p('more')] },
      ],
    };
    const state: InteractiveProgressState = { ...empty, checkpointChoices: { cp1: 'o1' } };
    const plan = buildRevealPlan([cp, p('after')], state);
    expect(plan.complete).toBe(false);
    // main line "after" not revealed because the in-branch gate is unpassed
    expect(plan.items.some((i) => i.kind === 'segment' && JSON.stringify(i).includes('after'))).toBe(false);

    const state2: InteractiveProgressState = { ...empty, checkpointChoices: { cp1: 'o1' }, revealedGateIds: ['gIn'] };
    const plan2 = buildRevealPlan([cp, p('after')], state2);
    expect(plan2.complete).toBe(true);
    expect(plan2.items.some((i) => i.kind === 'segment' && JSON.stringify(i).includes('after'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web test -- interactive-reveal`
Expected: FAIL — module not found / `buildRevealPlan` undefined.

- [ ] **Step 3: Implement the walker**

Create `apps/web/src/components/learning/interactive-reveal.ts`:

```ts
import type { JSONContent } from '@tiptap/react';
import type { InteractiveProgressState } from '@mpstats/shared';

export type { InteractiveProgressState };

export type RevealItem =
  | { kind: 'segment'; key: string; blocks: JSONContent[] }
  | { kind: 'gate'; key: string; id: string; label: string; passed: boolean }
  | {
      kind: 'checkpoint';
      key: string;
      id: string;
      options: { id: string; label: string }[];
      chosenOptionId: string | null;
      branch: RevealItem[];
    };

export interface RevealPlan {
  items: RevealItem[];
  complete: boolean;
}

const INTERACTIVE_TYPES = new Set(['revealGate', 'checkpoint']);

/**
 * Walk a flat block list and produce the ordered list of reveal items the
 * student should currently see, plus whether the (sub-)line is fully revealed.
 * Recurses into the chosen checkpoint branch; an unpassed gate or unanswered
 * checkpoint stops the line (complete = false). Pure — no React, fully testable.
 */
export function buildRevealPlan(
  blocks: JSONContent[],
  state: InteractiveProgressState,
  keyPrefix = '',
): RevealPlan {
  const items: RevealItem[] = [];
  let segment: JSONContent[] = [];

  const flush = (i: number) => {
    if (segment.length) {
      items.push({ kind: 'segment', key: `${keyPrefix}seg${i}`, blocks: segment });
      segment = [];
    }
  };

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const type = block.type ?? '';

    if (!INTERACTIVE_TYPES.has(type)) {
      segment.push(block);
      continue;
    }

    if (type === 'revealGate') {
      flush(i);
      const id = String(block.attrs?.id ?? '');
      const label = String(block.attrs?.buttonLabel ?? 'Читать дальше');
      const passed = state.revealedGateIds.includes(id);
      items.push({ kind: 'gate', key: `${keyPrefix}gate${i}`, id, label, passed });
      if (!passed) return { items, complete: false };
      continue;
    }

    // checkpoint
    flush(i);
    const id = String(block.attrs?.id ?? '');
    const optionNodes = (block.content ?? []).filter((n) => n.type === 'checkpointOption');
    const options = optionNodes.map((o) => ({
      id: String(o.attrs?.id ?? ''),
      label: String(o.attrs?.label ?? ''),
    }));
    const chosenOptionId = state.checkpointChoices[id] ?? null;

    if (!chosenOptionId) {
      items.push({ kind: 'checkpoint', key: `${keyPrefix}cp${i}`, id, options, chosenOptionId: null, branch: [] });
      return { items, complete: false };
    }

    const chosen = optionNodes.find((o) => String(o.attrs?.id ?? '') === chosenOptionId);
    const branchBlocks = (chosen?.content ?? []) as JSONContent[];
    const branchPlan = buildRevealPlan(branchBlocks, state, `${keyPrefix}cp${i}_`);
    items.push({
      kind: 'checkpoint',
      key: `${keyPrefix}cp${i}`,
      id,
      options,
      chosenOptionId,
      branch: branchPlan.items,
    });
    if (!branchPlan.complete) return { items, complete: false };
    continue;
  }

  flush(blocks.length);
  return { items, complete: true };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter web test -- interactive-reveal`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/learning/interactive-reveal.ts apps/web/tests/unit/interactive-reveal.test.ts
git commit -m "feat(learning): pure buildRevealPlan walker for interactive lessons"
```

---

## Task 15: `InteractiveLessonRenderer` (student runtime)

**Files:**
- Create: `apps/web/src/components/learning/InteractiveLessonRenderer.tsx`

- [ ] **Step 1: Implement the renderer**

Create `apps/web/src/components/learning/InteractiveLessonRenderer.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useState, Fragment } from 'react';
import type { JSONContent } from '@tiptap/react';
import { Button } from '@/components/ui/button';
import { LessonBodyRenderer } from './LessonBodyRenderer';
import { buildRevealPlan, type InteractiveProgressState, type RevealItem } from './interactive-reveal';

const EMPTY_STATE: InteractiveProgressState = { version: 1, revealedGateIds: [], checkpointChoices: {} };

interface Handlers {
  passGate: (id: string) => void;
  chooseOption: (checkpointId: string, optionId: string) => void;
}

function RenderItem({ item, handlers }: { item: RevealItem; handlers: Handlers }) {
  if (item.kind === 'segment') {
    return <LessonBodyRenderer doc={{ type: 'doc', content: item.blocks }} />;
  }
  if (item.kind === 'gate') {
    if (item.passed) return <hr className="my-6 border-mp-gray-100" />;
    return (
      <div className="my-6 flex justify-center">
        <Button size="lg" onClick={() => handlers.passGate(item.id)}>
          {item.label}
        </Button>
      </div>
    );
  }
  // checkpoint
  return (
    <div className="my-6">
      <div className="flex flex-wrap gap-2">
        {item.options.map((o) => (
          <Button
            key={o.id}
            variant={item.chosenOptionId === o.id ? 'secondary' : 'outline'}
            disabled={item.chosenOptionId !== null}
            onClick={() => handlers.chooseOption(item.id, o.id)}
          >
            {o.label}
          </Button>
        ))}
      </div>
      {item.branch.length > 0 && (
        <div className="mt-4 space-y-2">
          {item.branch.map((b) => (
            <RenderItem key={b.key} item={b} handlers={handlers} />
          ))}
        </div>
      )}
    </div>
  );
}

export function InteractiveLessonRenderer({
  doc,
  initialProgressState,
  onProgress,
  onReachedEnd,
}: {
  doc: JSONContent | null;
  initialProgressState: InteractiveProgressState | null;
  onProgress: (state: InteractiveProgressState) => void;
  onReachedEnd: (reached: boolean) => void;
}) {
  const [state, setState] = useState<InteractiveProgressState>(initialProgressState ?? EMPTY_STATE);

  const update = useCallback(
    (next: InteractiveProgressState) => {
      setState(next);
      onProgress(next);
    },
    [onProgress],
  );

  const handlers: Handlers = {
    passGate: (id) => {
      if (state.revealedGateIds.includes(id)) return;
      update({ ...state, revealedGateIds: [...state.revealedGateIds, id] });
    },
    chooseOption: (checkpointId, optionId) => {
      if (state.checkpointChoices[checkpointId]) return; // fixed once chosen
      update({ ...state, checkpointChoices: { ...state.checkpointChoices, [checkpointId]: optionId } });
    },
  };

  const blocks = (doc?.content ?? []) as JSONContent[];
  const plan = buildRevealPlan(blocks, state);

  useEffect(() => {
    onReachedEnd(plan.complete);
  }, [plan.complete, onReachedEnd]);

  return (
    <div className="interactive-lesson lesson-content max-w-none">
      {plan.items.map((item) => (
        <Fragment key={item.key}>
          <RenderItem item={item} handlers={handlers} />
        </Fragment>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/learning/InteractiveLessonRenderer.tsx
git commit -m "feat(learning): InteractiveLessonRenderer student runtime"
```

---

## Task 16: Wire the lesson page — `INTERACTIVE` branch + progress + completion

**Files:**
- Modify: `apps/web/src/app/(main)/learn/[id]/page.tsx`

- [ ] **Step 1: Add imports + state + mutation**

Near the other imports at the top of `page.tsx`:

```ts
import { InteractiveLessonRenderer } from '@/components/learning/InteractiveLessonRenderer';
import type { InteractiveProgressState } from '@mpstats/shared';
```

Inside the component, near the other `trpc.*.useMutation`/`useState` declarations (e.g. by `completeLesson` ~line 490):

```ts
const [interactiveReachedEnd, setInteractiveReachedEnd] = useState(false);
const saveInteractiveProgress = trpc.learning.saveInteractiveProgress.useMutation();
const handleInteractiveProgress = useCallback(
  (progressState: InteractiveProgressState) => {
    saveInteractiveProgress.mutate({ lessonId, progressState });
  },
  [lessonId, saveInteractiveProgress],
);
```

> `useCallback` and `useState` are already imported in this file (it's a large client component). If not, add them to the existing `react` import.

- [ ] **Step 2: Replace the content branch**

Find the content branch (~lines 676–713) that currently reads:

```tsx
{lesson.contentType === 'VIDEO' ? (
  <Card ...>{/* VideoPlayer */}</Card>
) : (
  <Card ...>
    <CardContent className="p-6">
      <LessonBodyRenderer doc={lesson.body as never} />
      <div className="mt-8 flex justify-center">
        <Button size="lg" disabled={completeLesson.isPending || lesson.status === 'COMPLETED'} onClick={() => completeLesson.mutate({ lessonId })}>
          {lesson.status === 'COMPLETED' ? 'Урок завершён ✓' : 'Завершить урок'}
        </Button>
      </div>
    </CardContent>
  </Card>
)}
```

Replace the **`: (` else branch** (the non-VIDEO part) with a three-way branch. Keep the VIDEO `<Card>` exactly as is; only change the else:

```tsx
{lesson.contentType === 'VIDEO' ? (
  <Card data-tour="lesson-video" id="video-player" className="overflow-hidden shadow-mp-card">
    {/* ...existing VideoPlayer unchanged... */}
  </Card>
) : lesson.contentType === 'INTERACTIVE' ? (
  <Card className="overflow-hidden shadow-mp-card">
    <CardContent className="p-6">
      <InteractiveLessonRenderer
        doc={lesson.body as never}
        initialProgressState={(lesson.progressState as InteractiveProgressState | null) ?? null}
        onProgress={handleInteractiveProgress}
        onReachedEnd={setInteractiveReachedEnd}
      />
      <div className="mt-8 flex justify-center">
        <Button
          size="lg"
          disabled={completeLesson.isPending || lesson.status === 'COMPLETED' || !interactiveReachedEnd}
          onClick={() => completeLesson.mutate({ lessonId })}
        >
          {lesson.status === 'COMPLETED'
            ? 'Урок завершён ✓'
            : interactiveReachedEnd
              ? 'Завершить урок'
              : 'Пройдите урок до конца'}
        </Button>
      </div>
    </CardContent>
  </Card>
) : (
  <Card className="overflow-hidden shadow-mp-card">
    <CardContent className="p-6">
      <LessonBodyRenderer doc={lesson.body as never} />
      <div className="mt-8 flex justify-center">
        <Button
          size="lg"
          disabled={completeLesson.isPending || lesson.status === 'COMPLETED'}
          onClick={() => completeLesson.mutate({ lessonId })}
        >
          {lesson.status === 'COMPLETED' ? 'Урок завершён ✓' : 'Завершить урок'}
        </Button>
      </div>
    </CardContent>
  </Card>
)}
```

> A COMPLETED interactive lesson should still show all revealed content. `initialProgressState` restores the student's last reveal/choices; if they completed it, `progressState` holds the final state, so the renderer shows everything they had unlocked. (Completion does not auto-reveal un-clicked gates — that matches "completion = reached end of the main line".)

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(main)/learn/[id]/page.tsx"
git commit -m "feat(learning): render INTERACTIVE lessons + save progress + gate completion"
```

---

## Task 17: Full verification + manual QA

**Files:** none (verification only)

- [ ] **Step 1: Typecheck all packages**

Run: `pnpm typecheck`
Expected: PASS across web + api + ai + shared + db (6 packages, as in Phase A).

- [ ] **Step 2: Run all unit tests**

Run: `pnpm test`
Expected: PASS. New suites green: `learning-interactive-progress`, `learning-interactive-getlesson`, `text-index-interactive`, `interactive-nodes`, `interactive-reveal`. No regressions in existing suites (web/api/ai). (Pre-existing `yandex-oauth` flake — ignore if it appears; it predates this work.)

- [ ] **Step 3: Local dev — apply the migration**

Run: `pnpm --filter @mpstats/db db:migrate dev` (or the repo's migrate command) against the **local/dev** DB only.
Expected: `20260625000000_add_lesson_progress_state` applied; `LessonProgress.progressState` column exists.

> **Prod migration is NOT run by Prisma.** Apply `migration.sql` to prod Supabase via Management API at deploy time (spec §12 + `reference_supabase_migration_via_mgmt_api`). Watch for zombie idle-in-tx sessions blocking the `ALTER`.

- [ ] **Step 4: Manual QA checklist (dev server)**

Run: `pnpm dev`, then in the browser:

1. Admin → create an INTERACTIVE lesson → open `/admin/content/lessons/[id]`.
2. Type intro text. Toolbar «📖 Читать дальше» inserts a gate; everything you type after it is the hidden chunk. Edit the button label inline.
3. Type «/» → slash menu shows the two interactive items; pick «🔀 Развилка». A checkpoint with 2 options appears; type branch content into each option (incl. a nested «Читать дальше» in one). «+ Вариант» adds a third option; «Убрать вариант» removes one.
4. Confirm «/» → «🔀 Развилка» is a **no-op when the cursor is inside a checkpoint option** (nested checkpoints forbidden).
5. Save draft, then Publish. Toast shows chunk count > 0.
6. Open the lesson as a student (`/learn/[id]`): only the intro shows + a «Читать дальше» button. Click → next chunk reveals. At the checkpoint, the «Завершить урок» button reads «Пройдите урок до конца» and is disabled. Pick an option → its branch reveals (nested gate works) → main line resumes.
7. Reach the end → «Завершить урок» enables → click → lesson marks COMPLETED.
8. Reload mid-lesson (before finishing) → revealed chunks + the chosen branch are restored (resume via `progressState`); the chosen option stays fixed.

- [ ] **Step 5: Commit (if any QA-driven fixes were needed)**

```bash
git add -A
git commit -m "fix(learning): interactive lesson QA polish"
```

(Skip if no fixes needed.)

---

## Self-review notes (addressed)

- **Spec coverage:** B1 nodes → Tasks 6/8–13; B2 model-A (re-merge + recursion + no nested checkpoint) → Task 6 command guard + Task 14 walker; B3 runtime → Tasks 14–16; B4 completion → Task 16 (`reachedEnd` gates the button); B5 analytics persist-only → Tasks 3/16 (`checkpointChoices` in `progressState`, no dashboard); B6 presentation inline-reveal → Task 15; §3.3 migration → Task 1; §8 indexing → Task 5.
- **Deviation (documented):** "forbid nested checkpoint at schema level" (spec §4.3) is enforced at the **command level** (`insertCheckpoint` no-ops inside a checkpoint) because StarterKit block groups can't express "block except checkpoint". Functionally equivalent for authoring; gates inside options remain allowed.
- **Type consistency:** `InteractiveProgressState` defined once in `@mpstats/shared` (Task 2), re-exported from `interactive-reveal.ts` (Task 14), consumed by API (Task 3), renderer (Task 15), page (Task 16). `buildRevealPlan` signature stable across Tasks 14–15. Commands `insertRevealGate`/`insertCheckpoint` typed via `declare module` (Task 6), used in Tasks 12–13.
- **No placeholders:** every code step contains the actual content.
```
