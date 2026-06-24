# Phase A — Text Lessons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Methodologists can create, edit, publish, and students can read rich text lessons (TipTap WYSIWYG) inside courses, with the lesson body indexed for AI chat.

**Architecture:** A lesson body is a TipTap JSON document stored in `Lesson.body`. New `Lesson.contentType` (VIDEO/TEXT/INTERACTIVE) and `Lesson.contentStatus` (DRAFT/PUBLISHED) drive rendering and visibility. Admin creates a TEXT lesson from `CourseManager`, edits it in a new full-page TipTap editor, and publishes — which flips status to PUBLISHED and indexes the extracted plain text into `content_chunk` (`source_type="academy_text"`). Students see published text lessons on the existing lesson page and mark them complete via the existing `learning.completeLesson` mutation.

**Tech Stack:** Next.js 14 App Router, tRPC, Prisma (Supabase Postgres + pgvector), TipTap (new dep, MIT), Supabase Storage, Vitest + React Testing Library.

**Reference spec:** `docs/superpowers/specs/2026-06-23-text-interactive-lessons-design.md`

---

## Contracts (locked names used across tasks)

| Name | Where | Shape |
|------|-------|-------|
| `LessonContentType` | `@mpstats/shared` enum + Prisma enum | `VIDEO \| TEXT \| INTERACTIVE` |
| `LessonContentStatus` | `@mpstats/shared` enum + Prisma enum | `DRAFT \| PUBLISHED` |
| `Lesson.body` | Prisma `Json?` | TipTap doc (`{ type: 'doc', content: [...] }`) |
| `admin.createLesson` | `packages/api/src/routers/admin.ts` | `{ courseId, title, contentType } → { id }` |
| `admin.getLessonForEdit` | admin.ts | `{ lessonId } → { id, title, courseId, contentType, contentStatus, body }` |
| `admin.updateLessonBody` | admin.ts | `{ lessonId, title, body } → { id }` |
| `admin.publishLesson` | admin.ts | `{ lessonId } → { id, contentStatus, chunks }` |
| `admin.requestLessonImageUploadUrl` | admin.ts | `{ filename, mimeType, fileSize } → { uploadUrl, publicUrl }` |
| `extractPlainText(doc)` | `packages/ai/src/text-index.ts` | `(JSONContent) → string` |
| `chunkText(text, maxLen?)` | `packages/ai/src/text-index.ts` | `(string, number) → string[]` |
| `indexLessonText(args)` | `packages/ai/src/text-index.ts` | `{ prisma, lessonId, skillCategory, doc } → { chunks }` |
| `lessonEditorExtensions` | `apps/web/src/components/admin/lesson-editor/extensions.ts` | TipTap extension array |
| `LessonEditor` | `apps/web/src/components/admin/lesson-editor/LessonEditor.tsx` | full editor |
| `LessonBodyRenderer` | `apps/web/src/components/learning/LessonBodyRenderer.tsx` | read-only renderer |
| Storage bucket | Supabase | `lesson-images` (PUBLIC) |
| Lesson id mint | admin.createLesson | `${courseId}_text_${crypto.randomUUID()}` |

---

## Area 1 — Data model & shared types

### Task 1: Shared enums + Prisma schema fields

**Files:**
- Modify: `packages/shared/src/types/index.ts`
- Modify: `packages/db/prisma/schema.prisma:152-192` (Lesson model) + add two enums
- Create: `packages/db/prisma/migrations/20260623000000_add_lesson_content/migration.sql`

- [ ] **Step 1: Add shared constants**

In `packages/shared/src/types/index.ts`, after the `SkillCategory` block, add:

```typescript
export const LessonContentType = {
  VIDEO: 'VIDEO',
  TEXT: 'TEXT',
  INTERACTIVE: 'INTERACTIVE',
} as const;
export type LessonContentType =
  (typeof LessonContentType)[keyof typeof LessonContentType];

export const LESSON_CONTENT_TYPE_LABELS: Record<LessonContentType, string> = {
  VIDEO: 'Видео',
  TEXT: 'Текст',
  INTERACTIVE: 'Интерактивный',
};

export const LessonContentStatus = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
} as const;
export type LessonContentStatus =
  (typeof LessonContentStatus)[keyof typeof LessonContentStatus];

// TipTap image uploads for lesson bodies (public bucket, image MIME only)
export const LESSON_IMAGE_ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;
export const LESSON_IMAGE_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
export const LESSON_IMAGE_STORAGE_BUCKET = 'lesson-images';
```

- [ ] **Step 2: Add Prisma enums + Lesson fields**

In `packages/db/prisma/schema.prisma`, add two enums near `enum LessonStatus` (after line 198):

```prisma
enum LessonContentType {
  VIDEO
  TEXT
  INTERACTIVE
}

enum LessonContentStatus {
  DRAFT
  PUBLISHED
}
```

In `model Lesson` (after the `metadata Json?` line, ~line 174) add:

```prisma
  contentType   LessonContentType   @default(VIDEO)
  contentStatus LessonContentStatus @default(PUBLISHED)
  body          Json? // TipTap document for TEXT/INTERACTIVE lessons
```

- [ ] **Step 3: Write the additive migration SQL**

Create `packages/db/prisma/migrations/20260623000000_add_lesson_content/migration.sql`:

```sql
-- Additive: new enums + nullable/defaulted columns. No data loss.
CREATE TYPE "LessonContentType" AS ENUM ('VIDEO', 'TEXT', 'INTERACTIVE');
CREATE TYPE "LessonContentStatus" AS ENUM ('DRAFT', 'PUBLISHED');

ALTER TABLE "Lesson"
  ADD COLUMN "contentType" "LessonContentType" NOT NULL DEFAULT 'VIDEO',
  ADD COLUMN "contentStatus" "LessonContentStatus" NOT NULL DEFAULT 'PUBLISHED',
  ADD COLUMN "body" JSONB;
```

- [ ] **Step 4: Generate the Prisma client (does NOT touch the DB)**

Run: `pnpm --filter @mpstats/db db:generate`
Expected: "Generated Prisma Client" — new `LessonContentType` / `LessonContentStatus` types available. **Do NOT run `prisma db push` — prod DB is shared (incident 2026-05-12).**

- [ ] **Step 5: Apply migration to the database via Supabase Management API**

Follow `~/.claude/projects/D--GpT-docs-MPSTATS-ACADEMY-ADAPTIVE-LEARNING-MAAL/memory/reference_supabase_migration_via_mgmt_api.md`:
1. POST the `CREATE TYPE` + `ALTER TABLE` SQL above to `/database/query` (project ref `saecuecevicwjkpmaoot`).
2. Compute sha256 of `migration.sql`, INSERT a row into `_prisma_migrations` (migration_name `20260623000000_add_lesson_content`, the checksum, `finished_at = now()`).

Expected: `Lesson` has 3 new columns; existing rows get `contentType='VIDEO'`, `contentStatus='PUBLISHED'`.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/types/index.ts packages/db/prisma/schema.prisma packages/db/prisma/migrations/20260623000000_add_lesson_content/
git commit -m "feat(lessons): add contentType/contentStatus/body to Lesson + shared enums"
```

---

## Area 2 — Text indexing utility (pure, TDD)

### Task 2: `extractPlainText` + `chunkText`

**Files:**
- Create: `packages/ai/src/text-index.ts`
- Test: `packages/ai/src/__tests__/text-index.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { extractPlainText, chunkText } from '../text-index';

describe('extractPlainText', () => {
  it('joins text from nested TipTap nodes with block breaks', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Заголовок' }] },
        { type: 'paragraph', content: [
          { type: 'text', text: 'Привет ' },
          { type: 'text', marks: [{ type: 'bold' }], text: 'мир' },
        ] },
        { type: 'bulletList', content: [
          { type: 'listItem', content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'пункт' }] },
          ] },
        ] },
      ],
    };
    expect(extractPlainText(doc)).toBe('Заголовок\nПривет мир\nпункт');
  });

  it('returns empty string for null/empty doc', () => {
    expect(extractPlainText(null)).toBe('');
    expect(extractPlainText({ type: 'doc', content: [] })).toBe('');
  });
});

describe('chunkText', () => {
  it('splits long text into chunks under maxLen, never mid-word', () => {
    const para = 'слово '.repeat(400).trim(); // ~2400 chars
    const chunks = chunkText(para, 1500);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(1500);
  });

  it('keeps short text as a single chunk', () => {
    expect(chunkText('короткий текст', 1500)).toEqual(['короткий текст']);
  });

  it('drops empty/whitespace input', () => {
    expect(chunkText('   ', 1500)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mpstats/ai test text-index`
Expected: FAIL — `extractPlainText is not a function`.

- [ ] **Step 3: Implement the pure functions**

Create `packages/ai/src/text-index.ts`:

```typescript
// Plain-text extraction + chunking for indexing TEXT/INTERACTIVE lesson bodies.
type JSONNode = {
  type?: string;
  text?: string;
  content?: JSONNode[];
};

// Block-level nodes whose extracted text should be separated by a newline.
const BLOCK_TYPES = new Set([
  'paragraph', 'heading', 'listItem', 'blockquote',
  'tableCell', 'tableHeader', 'callout',
]);

export function extractPlainText(doc: JSONNode | null | undefined): string {
  if (!doc) return '';
  const blocks: string[] = [];

  const walk = (node: JSONNode): string => {
    if (node.type === 'text') return node.text ?? '';
    let inline = '';
    if (node.content) for (const child of node.content) inline += walk(child);
    if (node.type && BLOCK_TYPES.has(node.type)) {
      const trimmed = inline.trim();
      if (trimmed) blocks.push(trimmed);
      return '';
    }
    return inline;
  };

  walk(doc);
  return blocks.join('\n');
}

export function chunkText(text: string, maxLen = 1500): string[] {
  const clean = text.trim();
  if (!clean) return [];
  if (clean.length <= maxLen) return [clean];

  const words = clean.split(/\s+/);
  const chunks: string[] = [];
  let current = '';
  for (const word of words) {
    if (current && current.length + 1 + word.length > maxLen) {
      chunks.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mpstats/ai test text-index`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/text-index.ts packages/ai/src/__tests__/text-index.test.ts
git commit -m "feat(ai): pure text extraction + chunking for lesson indexing"
```

### Task 3: `indexLessonText` (embeds + upserts content_chunk)

**Files:**
- Modify: `packages/ai/src/text-index.ts`
- Modify: `packages/ai/src/index.ts` (export)
- Test: `packages/ai/src/__tests__/index-lesson-text.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../embeddings', () => ({
  embedQuery: vi.fn().mockResolvedValue(new Array(1536).fill(0.01)),
}));

import { indexLessonText } from '../text-index';
import { embedQuery } from '../embeddings';

function makePrisma() {
  return {
    $executeRaw: vi.fn().mockResolvedValue(1),
    $executeRawUnsafe: vi.fn().mockResolvedValue(1),
  } as any;
}

const doc = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Юнит-экономика — это про маржу.' }] },
  ],
};

describe('indexLessonText', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes old text chunks then inserts one chunk per segment', async () => {
    const prisma = makePrisma();
    const res = await indexLessonText({ prisma, lessonId: 'c1_text_x', skillCategory: 'ANALYTICS', doc });
    expect(res.chunks).toBe(1);
    expect(embedQuery).toHaveBeenCalledTimes(1);
    // 1 delete + 1 insert
    expect(prisma.$executeRawUnsafe).toHaveBeenCalled();
  });

  it('only deletes (no embed) when body has no text', async () => {
    const prisma = makePrisma();
    const res = await indexLessonText({ prisma, lessonId: 'c1_text_x', skillCategory: null, doc: { type: 'doc', content: [] } });
    expect(res.chunks).toBe(0);
    expect(embedQuery).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mpstats/ai test index-lesson-text`
Expected: FAIL — `indexLessonText is not a function`.

- [ ] **Step 3: Implement `indexLessonText`**

Append to `packages/ai/src/text-index.ts`:

```typescript
import { embedQuery } from './embeddings';

type IndexArgs = {
  prisma: {
    $executeRawUnsafe: (sql: string, ...args: unknown[]) => Promise<number>;
  };
  lessonId: string;
  skillCategory: string | null;
  doc: JSONNode | null;
};

const TEXT_SOURCE_TYPE = 'academy_text';

export async function indexLessonText(args: IndexArgs): Promise<{ chunks: number }> {
  const { prisma, lessonId, skillCategory, doc } = args;

  // Idempotent: clear this lesson's existing text chunks first.
  await prisma.$executeRawUnsafe(
    `DELETE FROM content_chunk WHERE lesson_id = $1 AND source_type = $2`,
    lessonId,
    TEXT_SOURCE_TYPE,
  );

  const chunks = chunkText(extractPlainText(doc));
  if (chunks.length === 0) return { chunks: 0 };

  for (let i = 0; i < chunks.length; i++) {
    const content = chunks[i];
    const embedding = await embedQuery(content);
    const vectorLiteral = `[${embedding.join(',')}]`;
    const chunkId = `${lessonId}_text_chunk_${String(i).padStart(3, '0')}`;
    const skillSql = skillCategory ? `$6::"SkillCategory"` : `NULL`;
    const params: unknown[] = [
      chunkId, lessonId, content, vectorLiteral, content.length,
    ];
    if (skillCategory) params.push(skillCategory);

    await prisma.$executeRawUnsafe(
      `INSERT INTO content_chunk
         (id, lesson_id, content, embedding, timecode_start, timecode_end,
          token_count, source_type, trust_tier, ${skillCategory ? 'skill_category, ' : ''}created_at)
       VALUES
         ($1, $2, $3, $4::vector(1536), 0, 0, $5, '${TEXT_SOURCE_TYPE}', 1, ${skillCategory ? skillSql + ', ' : ''}now())
       ON CONFLICT (id) DO UPDATE SET
         content = EXCLUDED.content,
         embedding = EXCLUDED.embedding,
         token_count = EXCLUDED.token_count`,
      ...params,
    );
  }

  return { chunks: chunks.length };
}
```

In `packages/ai/src/index.ts`, add:

```typescript
export { extractPlainText, chunkText, indexLessonText } from './text-index';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mpstats/ai test index-lesson-text`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/text-index.ts packages/ai/src/index.ts packages/ai/src/__tests__/index-lesson-text.test.ts
git commit -m "feat(ai): indexLessonText embeds + upserts lesson text into content_chunk"
```

---

## Area 3 — Admin backend (lesson CRUD + image upload + publish)

### Task 4: `admin.createLesson`

**Files:**
- Modify: `packages/api/src/routers/admin.ts`
- Test: `packages/api/src/routers/__tests__/admin-create-lesson.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@mpstats/ai', () => ({ indexLessonText: vi.fn() }));
import { adminRouter } from '../admin';

function makeCtx() {
  const create = vi.fn().mockResolvedValue({ id: 'c1_text_uuid' });
  const aggregate = vi.fn().mockResolvedValue({ _max: { order: 7 } });
  const findUnique = vi
    .fn()
    .mockResolvedValueOnce(null) // protectedProcedure lastActiveAt debounce
    .mockResolvedValueOnce({ role: 'ADMIN' }); // adminProcedure role check
  return {
    ctx: {
      user: { id: 'admin1' },
      prisma: {
        userProfile: { findUnique },
        userActivityDay: { upsert: vi.fn().mockResolvedValue({}) },
        lesson: { create, aggregate },
      },
    },
    create, aggregate,
  };
}

describe('admin.createLesson', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a DRAFT TEXT lesson at end of course order', async () => {
    const { ctx, create, aggregate } = makeCtx();
    const caller = adminRouter.createCaller(ctx as never);
    const res = await caller.createLesson({ courseId: 'c1', title: 'Новый урок', contentType: 'TEXT' });

    expect(aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: { courseId: 'c1' } }));
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          courseId: 'c1', title: 'Новый урок', contentType: 'TEXT',
          contentStatus: 'DRAFT', order: 8, isHidden: true,
        }),
      }),
    );
    expect(res.id).toMatch(/^c1_text_/);
  });

  it('rejects VIDEO contentType', async () => {
    const { ctx } = makeCtx();
    const caller = adminRouter.createCaller(ctx as never);
    await expect(
      caller.createLesson({ courseId: 'c1', title: 'x', contentType: 'VIDEO' as never }),
    ).rejects.toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mpstats/api test admin-create-lesson`
Expected: FAIL — `createLesson` is not a function.

- [ ] **Step 3: Implement `createLesson`**

In `packages/api/src/routers/admin.ts`, add this procedure inside the router object (near `updateLessonTitle`). Ensure `import { z } from 'zod'` and `randomUUID` from `'node:crypto'` are present (add the crypto import at top):

```typescript
createLesson: adminProcedure
  .input(
    z.object({
      courseId: z.string().min(1),
      title: z.string().min(1).max(300),
      contentType: z.enum(['TEXT', 'INTERACTIVE']),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    const agg = await ctx.prisma.lesson.aggregate({
      where: { courseId: input.courseId },
      _max: { order: true },
    });
    const nextOrder = (agg._max.order ?? 0) + 1;
    const id = `${input.courseId}_text_${randomUUID()}`;

    const created = await ctx.prisma.lesson.create({
      data: {
        id,
        courseId: input.courseId,
        title: input.title,
        contentType: input.contentType,
        contentStatus: 'DRAFT',
        isHidden: true, // drafts are hidden from students + RAG until publish
        order: nextOrder,
        skillCategory: 'ANALYTICS', // default; methodologist refines later
      },
    });
    return { id: created.id };
  }),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mpstats/api test admin-create-lesson`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routers/admin.ts packages/api/src/routers/__tests__/admin-create-lesson.test.ts
git commit -m "feat(admin): createLesson mutation for DRAFT text/interactive lessons"
```

### Task 5: `admin.getLessonForEdit` + `admin.updateLessonBody`

**Files:**
- Modify: `packages/api/src/routers/admin.ts`
- Test: `packages/api/src/routers/__tests__/admin-lesson-body.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@mpstats/ai', () => ({ indexLessonText: vi.fn() }));
import { adminRouter } from '../admin';

function makeCtx(lesson: any) {
  const findUniqueProfile = vi
    .fn()
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ role: 'ADMIN' });
  return {
    ctx: {
      user: { id: 'admin1' },
      prisma: {
        userProfile: { findUnique: findUniqueProfile },
        userActivityDay: { upsert: vi.fn().mockResolvedValue({}) },
        lesson: {
          findUnique: vi.fn().mockResolvedValue(lesson),
          update: vi.fn().mockResolvedValue({ id: lesson?.id }),
        },
      },
    },
  };
}

describe('admin.getLessonForEdit', () => {
  beforeEach(() => vi.clearAllMocks());
  it('returns editable fields', async () => {
    const lesson = { id: 'l1', title: 'T', courseId: 'c1', contentType: 'TEXT', contentStatus: 'DRAFT', body: { type: 'doc', content: [] } };
    const { ctx } = makeCtx(lesson);
    const caller = adminRouter.createCaller(ctx as never);
    const res = await caller.getLessonForEdit({ lessonId: 'l1' });
    expect(res).toMatchObject({ id: 'l1', contentType: 'TEXT', contentStatus: 'DRAFT' });
  });
});

describe('admin.updateLessonBody', () => {
  beforeEach(() => vi.clearAllMocks());
  it('saves title + body without touching contentStatus (stays DRAFT, no indexing)', async () => {
    const lesson = { id: 'l1', title: 'T', courseId: 'c1', contentType: 'TEXT', contentStatus: 'DRAFT' };
    const { ctx } = makeCtx(lesson);
    const caller = adminRouter.createCaller(ctx as never);
    await caller.updateLessonBody({ lessonId: 'l1', title: 'New', body: { type: 'doc', content: [] } });
    expect(ctx.prisma.lesson.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'l1' },
        data: expect.objectContaining({ title: 'New', body: { type: 'doc', content: [] } }),
      }),
    );
    // contentStatus must NOT be in the update payload
    const call = (ctx.prisma.lesson.update as any).mock.calls[0][0];
    expect(call.data.contentStatus).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mpstats/api test admin-lesson-body`
Expected: FAIL — procedures not defined.

- [ ] **Step 3: Implement both procedures**

In `packages/api/src/routers/admin.ts`:

```typescript
getLessonForEdit: adminProcedure
  .input(z.object({ lessonId: z.string() }))
  .query(async ({ ctx, input }) => {
    const lesson = await ctx.prisma.lesson.findUnique({
      where: { id: input.lessonId },
      select: {
        id: true, title: true, courseId: true,
        contentType: true, contentStatus: true, body: true,
      },
    });
    if (!lesson) throw new TRPCError({ code: 'NOT_FOUND' });
    return lesson;
  }),

updateLessonBody: adminProcedure
  .input(
    z.object({
      lessonId: z.string(),
      title: z.string().min(1).max(300),
      body: z.any(), // TipTap JSON document
    }),
  )
  .mutation(async ({ ctx, input }) => {
    // Plain save: persists draft content. Never indexes, never publishes.
    const updated = await ctx.prisma.lesson.update({
      where: { id: input.lessonId },
      data: { title: input.title, body: input.body },
      select: { id: true },
    });
    return updated;
  }),
```

(`TRPCError` is already imported in admin.ts.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mpstats/api test admin-lesson-body`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routers/admin.ts packages/api/src/routers/__tests__/admin-lesson-body.test.ts
git commit -m "feat(admin): getLessonForEdit + updateLessonBody (draft save, no index)"
```

### Task 6: `admin.publishLesson` (index then flip status)

**Files:**
- Modify: `packages/api/src/routers/admin.ts`
- Test: `packages/api/src/routers/__tests__/admin-publish-lesson.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('server-only', () => ({}));
const indexLessonText = vi.fn().mockResolvedValue({ chunks: 3 });
vi.mock('@mpstats/ai', () => ({ indexLessonText }));
import { adminRouter } from '../admin';

function makeCtx(lesson: any) {
  const findUniqueProfile = vi
    .fn()
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ role: 'ADMIN' });
  return {
    ctx: {
      user: { id: 'admin1' },
      prisma: {
        userProfile: { findUnique: findUniqueProfile },
        userActivityDay: { upsert: vi.fn().mockResolvedValue({}) },
        lesson: {
          findUnique: vi.fn().mockResolvedValue(lesson),
          update: vi.fn().mockResolvedValue({ id: lesson.id, contentStatus: 'PUBLISHED' }),
        },
      },
    },
  };
}

describe('admin.publishLesson', () => {
  beforeEach(() => vi.clearAllMocks());

  it('indexes body then sets PUBLISHED + isHidden=false', async () => {
    const lesson = { id: 'l1', courseId: 'c1', contentType: 'TEXT', skillCategory: 'ANALYTICS', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }] } };
    const { ctx } = makeCtx(lesson);
    const caller = adminRouter.createCaller(ctx as never);
    const res = await caller.publishLesson({ lessonId: 'l1' });

    expect(indexLessonText).toHaveBeenCalledWith(
      expect.objectContaining({ lessonId: 'l1', skillCategory: 'ANALYTICS' }),
    );
    expect(ctx.prisma.lesson.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'l1' },
        data: expect.objectContaining({ contentStatus: 'PUBLISHED', isHidden: false }),
      }),
    );
    expect(res).toMatchObject({ contentStatus: 'PUBLISHED', chunks: 3 });
  });

  it('does not publish if indexing throws', async () => {
    indexLessonText.mockRejectedValueOnce(new Error('embed down'));
    const lesson = { id: 'l1', courseId: 'c1', contentType: 'TEXT', skillCategory: 'ANALYTICS', body: { type: 'doc', content: [] } };
    const { ctx } = makeCtx(lesson);
    const caller = adminRouter.createCaller(ctx as never);
    await expect(caller.publishLesson({ lessonId: 'l1' })).rejects.toBeTruthy();
    expect(ctx.prisma.lesson.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mpstats/api test admin-publish-lesson`
Expected: FAIL — `publishLesson` not defined.

- [ ] **Step 3: Implement `publishLesson`**

At the top of `packages/api/src/routers/admin.ts` add the import:

```typescript
import { indexLessonText } from '@mpstats/ai';
```

Add the procedure:

```typescript
publishLesson: adminProcedure
  .input(z.object({ lessonId: z.string() }))
  .mutation(async ({ ctx, input }) => {
    const lesson = await ctx.prisma.lesson.findUnique({
      where: { id: input.lessonId },
      select: { id: true, body: true, skillCategory: true },
    });
    if (!lesson) throw new TRPCError({ code: 'NOT_FOUND' });

    // Index first; if it fails, abort — never publish unindexed content.
    const { chunks } = await indexLessonText({
      prisma: ctx.prisma,
      lessonId: lesson.id,
      skillCategory: lesson.skillCategory ?? null,
      doc: lesson.body as never,
    });

    const updated = await ctx.prisma.lesson.update({
      where: { id: lesson.id },
      data: { contentStatus: 'PUBLISHED', isHidden: false },
      select: { id: true, contentStatus: true },
    });

    return { id: updated.id, contentStatus: updated.contentStatus, chunks };
  }),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mpstats/api test admin-publish-lesson`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routers/admin.ts packages/api/src/routers/__tests__/admin-publish-lesson.test.ts
git commit -m "feat(admin): publishLesson indexes body then flips to PUBLISHED"
```

### Task 7: `admin.requestLessonImageUploadUrl` + create public bucket

**Files:**
- Modify: `packages/api/src/routers/admin.ts`
- Test: `packages/api/src/routers/__tests__/admin-image-upload.test.ts`

- [ ] **Step 1: Create the public Storage bucket (one-time, manual)**

In Supabase dashboard → Storage → New bucket: name `lesson-images`, **Public = ON**. (Images are embedded in lesson bodies and must be readable without a signed URL.)

- [ ] **Step 2: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@mpstats/ai', () => ({ indexLessonText: vi.fn() }));

const createSignedUploadUrl = vi.fn().mockResolvedValue({
  data: { signedUrl: 'https://upload.example/xyz', token: 'tok' }, error: null,
});
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ storage: { from: vi.fn(() => ({ createSignedUploadUrl })) } })),
}));
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'test-secret';

import { adminRouter } from '../admin';

function makeCtx() {
  const findUnique = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ role: 'ADMIN' });
  return { ctx: { user: { id: 'a1' }, prisma: { userProfile: { findUnique }, userActivityDay: { upsert: vi.fn().mockResolvedValue({}) } } } };
}

describe('admin.requestLessonImageUploadUrl', () => {
  beforeEach(() => vi.clearAllMocks());
  it('returns uploadUrl + public URL for an allowed image', async () => {
    const { ctx } = makeCtx();
    const caller = adminRouter.createCaller(ctx as never);
    const res = await caller.requestLessonImageUploadUrl({ filename: 'pic.png', mimeType: 'image/png', fileSize: 1000 });
    expect(res.uploadUrl).toBe('https://upload.example/xyz');
    expect(res.publicUrl).toContain('/storage/v1/object/public/lesson-images/');
  });
  it('rejects non-image MIME', async () => {
    const { ctx } = makeCtx();
    const caller = adminRouter.createCaller(ctx as never);
    await expect(
      caller.requestLessonImageUploadUrl({ filename: 'x.pdf', mimeType: 'application/pdf' as never, fileSize: 10 }),
    ).rejects.toBeTruthy();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @mpstats/api test admin-image-upload`
Expected: FAIL — procedure not defined.

- [ ] **Step 4: Implement the procedure**

In `packages/api/src/routers/admin.ts`, add imports if missing:

```typescript
import { randomUUID } from 'node:crypto';
import {
  LESSON_IMAGE_ALLOWED_MIME_TYPES,
  LESSON_IMAGE_MAX_FILE_SIZE,
  LESSON_IMAGE_STORAGE_BUCKET,
} from '@mpstats/shared';
```

Reuse the same admin Supabase client helper used by the material router (`getSupabaseAdmin`). If not already importable in admin.ts, import it from its module (`packages/api/src/routers/material.ts` exports it, or copy the helper into `packages/api/src/utils/supabase-admin.ts` and import in both). Then:

```typescript
requestLessonImageUploadUrl: adminProcedure
  .input(
    z.object({
      filename: z.string().min(1).max(200),
      mimeType: z.enum(LESSON_IMAGE_ALLOWED_MIME_TYPES),
      fileSize: z.number().int().positive().max(LESSON_IMAGE_MAX_FILE_SIZE),
    }),
  )
  .mutation(async ({ input }) => {
    const sb = getSupabaseAdmin();
    const tmpId = `${randomUUID()}`;
    const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${tmpId}/${safeName}`;
    const { data, error } = await sb.storage
      .from(LESSON_IMAGE_STORAGE_BUCKET)
      .createSignedUploadUrl(storagePath);
    if (error || !data) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error?.message ?? 'upload url failed' });
    }
    const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${LESSON_IMAGE_STORAGE_BUCKET}/${storagePath}`;
    return { uploadUrl: data.signedUrl, publicUrl };
  }),
```

> If `getSupabaseAdmin` is not currently exported from material.ts, extract it to `packages/api/src/utils/supabase-admin.ts` first (move the function, update material.ts to import it), commit that refactor separately, then add the import here.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @mpstats/api test admin-image-upload`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/routers/admin.ts packages/api/src/routers/__tests__/admin-image-upload.test.ts
git commit -m "feat(admin): requestLessonImageUploadUrl (public lesson-images bucket)"
```

---

## Area 4 — Reader (student-facing) backend wiring

### Task 8: Expose body/contentType and hide drafts in `learning.getLesson`

**Files:**
- Modify: `packages/api/src/routers/learning.ts:452-548`
- Test: `packages/api/src/routers/__tests__/learning-text-lesson.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@mpstats/ai', () => ({}));
vi.mock('../../utils/access', () => ({ checkLessonAccess: vi.fn().mockResolvedValue({ hasAccess: true, hasPlatformSubscription: true }) }));
import { learningRouter } from '../learning';

function makeCtx(lesson: any) {
  return {
    user: { id: 'u1' },
    prisma: {
      userProfile: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() },
      userActivityDay: { upsert: vi.fn().mockResolvedValue({}) },
      lesson: { findUnique: vi.fn().mockResolvedValue(lesson) },
    },
  } as any;
}

const base = {
  id: 'l1', courseId: 'c1', title: 'T', order: 1, isHidden: false,
  videoId: null, duration: null, description: null,
  course: { id: 'c1', title: 'C', slug: 'c', lessons: [{ id: 'l1', title: 'T', order: 1 }] },
  progress: [], materials: [],
};

describe('learning.getLesson — text lessons', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns body + contentType for a PUBLISHED text lesson', async () => {
    const lesson = { ...base, contentType: 'TEXT', contentStatus: 'PUBLISHED', body: { type: 'doc', content: [] } };
    const caller = learningRouter.createCaller(makeCtx(lesson));
    const res = await caller.getLesson({ lessonId: 'l1' });
    expect(res?.lesson.contentType).toBe('TEXT');
    expect(res?.lesson.body).toEqual({ type: 'doc', content: [] });
  });

  it('returns null for a DRAFT lesson (not visible to students)', async () => {
    const lesson = { ...base, contentType: 'TEXT', contentStatus: 'DRAFT', body: { type: 'doc', content: [] } };
    const caller = learningRouter.createCaller(makeCtx(lesson));
    const res = await caller.getLesson({ lessonId: 'l1' });
    expect(res).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mpstats/api test learning-text-lesson`
Expected: FAIL — `body`/`contentType` undefined on result, draft not filtered.

- [ ] **Step 3: Implement the changes**

In `learning.ts` `getLesson`:

1. Add `contentType`, `contentStatus`, `body` to the `findUnique` select/include (the lesson scalar fields).
2. After the existing null/hidden guard, add draft filtering:

```typescript
    if (!lesson || lesson.isHidden) return null;
    if (lesson.contentStatus === 'DRAFT') return null; // drafts: admin-only via getLessonForEdit
```

3. In the returned `lesson` object mapping, add:

```typescript
      contentType: lesson.contentType,
      body: locked ? null : (lesson.body ?? null),
```

(Keep `body` gated behind `locked` exactly like `videoId`/materials.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mpstats/api test learning-text-lesson`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routers/learning.ts packages/api/src/routers/__tests__/learning-text-lesson.test.ts
git commit -m "feat(learning): getLesson exposes text body + contentType, hides drafts"
```

### Task 8b: Ensure retrieval surfaces `academy_text` chunks

**Files:**
- Read: `packages/ai/src/retrieval.ts`
- Modify (only if needed): `packages/ai/src/retrieval.ts`
- Test: `packages/ai/src/__tests__/retrieval-source-type.test.ts` (only if a filter change is made)

The spec requires the AI chat to "see" text lessons. The retrieval query (`retrieval.ts:84-104`) builds a `sourceTypeFilter`. If it restricts to `academy_audio` (or any allow-list that excludes `academy_text`), text chunks will never surface.

- [ ] **Step 1: Inspect the source-type filter**

Read `packages/ai/src/retrieval.ts` and find how `sourceTypeFilter` is computed and what the default `sourceTypes` argument is for the lesson-chat retrieval call (trace the caller in `packages/api/src/routers/ai.ts`).

- [ ] **Step 2: Decide**

- If there is **no** source-type restriction by default (filter empty unless explicitly passed) → text chunks already surface. **No code change.** Note this in the commit message of Task 16 and skip steps 3-5.
- If the default **excludes** `academy_text` → proceed to add it.

- [ ] **Step 3 (only if needed): Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { buildSourceTypeFilter } from '../retrieval'; // export the helper if it is inline

describe('retrieval source-type default', () => {
  it('includes academy_text when no explicit sourceTypes are given', () => {
    const sql = buildSourceTypeFilter(undefined);
    // empty filter (allows all) OR an allow-list containing academy_text
    expect(sql === '' || sql.includes('academy_text')).toBe(true);
  });
});
```

- [ ] **Step 4 (only if needed): Adjust the default**

Make the lesson-chat retrieval default include `academy_text` (e.g. extend the default allow-list to `['academy_audio', 'academy_text']`, or leave the filter empty by default). Keep `isHidden` filtering intact — DRAFT lessons are `isHidden=true` so their chunks (if any) stay out.

- [ ] **Step 5 (only if needed): Run test + commit**

```bash
pnpm --filter @mpstats/ai test retrieval-source-type
git add packages/ai/src/retrieval.ts packages/ai/src/__tests__/retrieval-source-type.test.ts
git commit -m "fix(ai): retrieval default includes academy_text chunks"
```

---

## Area 5 — TipTap editor (admin frontend)

### Task 9: Install TipTap + shared extension config

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/src/components/admin/lesson-editor/extensions.ts`

- [ ] **Step 1: Install dependencies**

Run:
```bash
pnpm --filter web add @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-image @tiptap/extension-link @tiptap/extension-table @tiptap/extension-table-row @tiptap/extension-table-cell @tiptap/extension-table-header
```
Expected: packages added to `apps/web/package.json`.

- [ ] **Step 2: Create the shared extension list**

`apps/web/src/components/admin/lesson-editor/extensions.ts`:

```typescript
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import type { Extensions } from '@tiptap/react';

// Single source of truth for block set — used by both editor and read-only renderer.
export const lessonEditorExtensions: Extensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
  }),
  Image.configure({ inline: false, allowBase64: false }),
  Link.configure({ openOnClick: false, autolink: true }),
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
];

export const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: PASS (no type errors from the new module).

- [ ] **Step 4: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/src/components/admin/lesson-editor/extensions.ts
git commit -m "chore(web): add TipTap deps + shared lesson editor extensions"
```

### Task 10: Editor toolbar

**Files:**
- Create: `apps/web/src/components/admin/lesson-editor/LessonEditorToolbar.tsx`
- Test: `apps/web/tests/unit/lesson-editor-toolbar.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { LessonEditorToolbar } from '@/components/admin/lesson-editor/LessonEditorToolbar';

afterEach(cleanup);

function makeEditor() {
  const chain = {
    focus: () => chain,
    toggleBold: () => chain,
    toggleHeading: () => chain,
    toggleBulletList: () => chain,
    run: vi.fn(),
  };
  return {
    chain: () => chain,
    isActive: vi.fn().mockReturnValue(false),
    _chain: chain,
  } as any;
}

describe('LessonEditorToolbar', () => {
  it('toggles bold on click', () => {
    const editor = makeEditor();
    const { getByLabelText } = render(<LessonEditorToolbar editor={editor} onInsertImage={vi.fn()} />);
    fireEvent.click(getByLabelText('Жирный'));
    expect(editor._chain.run).toHaveBeenCalled();
  });

  it('calls onInsertImage when image button clicked', () => {
    const editor = makeEditor();
    const onInsertImage = vi.fn();
    const { getByLabelText } = render(<LessonEditorToolbar editor={editor} onInsertImage={onInsertImage} />);
    fireEvent.click(getByLabelText('Картинка'));
    expect(onInsertImage).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test lesson-editor-toolbar`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement the toolbar**

`apps/web/src/components/admin/lesson-editor/LessonEditorToolbar.tsx`:

```tsx
'use client';

import type { Editor } from '@tiptap/react';
import { Button } from '@/components/ui/button';
import {
  Bold, Italic, Heading1, Heading2, Heading3, List, ListOrdered,
  Image as ImageIcon, Table as TableIcon, Quote, Minus, Link as LinkIcon,
} from 'lucide-react';

type Props = { editor: Editor; onInsertImage: () => void };

export function LessonEditorToolbar({ editor, onInsertImage }: Props) {
  const btn = (label: string, active: boolean, onClick: () => void, Icon: React.ElementType) => (
    <Button
      type="button"
      size="sm"
      variant={active ? 'secondary' : 'ghost'}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <Icon className="w-4 h-4" />
    </Button>
  );

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-mp-gray-200 bg-white p-2 sticky top-0 z-10">
      {btn('Жирный', editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), Bold)}
      {btn('Курсив', editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), Italic)}
      <span className="mx-1 w-px h-5 bg-mp-gray-200" />
      {btn('Заголовок 1', editor.isActive('heading', { level: 1 }), () => editor.chain().focus().toggleHeading({ level: 1 }).run(), Heading1)}
      {btn('Заголовок 2', editor.isActive('heading', { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), Heading2)}
      {btn('Заголовок 3', editor.isActive('heading', { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), Heading3)}
      <span className="mx-1 w-px h-5 bg-mp-gray-200" />
      {btn('Маркированный список', editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run(), List)}
      {btn('Нумерованный список', editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), ListOrdered)}
      {btn('Цитата', editor.isActive('blockquote'), () => editor.chain().focus().toggleBlockquote().run(), Quote)}
      {btn('Разделитель', false, () => editor.chain().focus().setHorizontalRule().run(), Minus)}
      <span className="mx-1 w-px h-5 bg-mp-gray-200" />
      {btn('Картинка', false, onInsertImage, ImageIcon)}
      {btn('Таблица', false, () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), TableIcon)}
      {btn('Ссылка', editor.isActive('link'), () => {
        const url = window.prompt('URL ссылки:');
        if (url) editor.chain().focus().setLink({ href: url }).run();
      }, LinkIcon)}
    </div>
  );
}
```

> Note: `window.prompt` for the link URL is acceptable for admin-only MVP. Replace with a popover later if methodologists ask.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test lesson-editor-toolbar`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/admin/lesson-editor/LessonEditorToolbar.tsx apps/web/tests/unit/lesson-editor-toolbar.test.tsx
git commit -m "feat(web): lesson editor toolbar"
```

### Task 11: `LessonEditor` (editor + image upload)

**Files:**
- Create: `apps/web/src/components/admin/lesson-editor/LessonEditor.tsx`

- [ ] **Step 1: Implement the editor component**

`apps/web/src/components/admin/lesson-editor/LessonEditor.tsx`:

```tsx
'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import type { JSONContent } from '@tiptap/react';
import { useRef } from 'react';
import { trpc } from '@/lib/trpc/client';
import { toast } from 'sonner';
import { lessonEditorExtensions, EMPTY_DOC } from './extensions';
import { LessonEditorToolbar } from './LessonEditorToolbar';

type Props = {
  initialBody: JSONContent | null;
  onChange: (doc: JSONContent) => void;
};

export function LessonEditor({ initialBody, onChange }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const requestUpload = trpc.admin.requestLessonImageUploadUrl.useMutation();

  const editor = useEditor({
    extensions: lessonEditorExtensions,
    content: initialBody ?? EMPTY_DOC,
    onUpdate: ({ editor }) => onChange(editor.getJSON()),
    editorProps: {
      attributes: { class: 'prose prose-sm max-w-none focus:outline-none min-h-[400px] p-4' },
    },
  });

  const handleFile = async (file: File) => {
    try {
      const { uploadUrl, publicUrl } = await requestUpload.mutateAsync({
        filename: file.name, mimeType: file.type as never, fileSize: file.size,
      });
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`)));
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.send(file);
      });
      editor?.chain().focus().setImage({ src: publicUrl }).run();
      toast.success('Картинка загружена');
    } catch (e) {
      toast.error('Ошибка загрузки картинки: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  if (!editor) return null;

  return (
    <div className="border border-mp-gray-200 rounded-xl overflow-hidden bg-white">
      <LessonEditorToolbar editor={editor} onInsertImage={() => fileInputRef.current?.click()} />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
      />
      <EditorContent editor={editor} />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/admin/lesson-editor/LessonEditor.tsx
git commit -m "feat(web): LessonEditor with TipTap + image upload"
```

### Task 12: Admin lesson editor page (route)

**Files:**
- Create: `apps/web/src/app/(admin)/admin/content/lessons/[id]/page.tsx`

- [ ] **Step 1: Implement the page**

```tsx
'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { JSONContent } from '@tiptap/react';
import { trpc } from '@/lib/trpc/client';
import { LessonEditor } from '@/components/admin/lesson-editor/LessonEditor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Loader2, ArrowLeft } from 'lucide-react';

export default function AdminLessonEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const utils = trpc.useUtils();

  const lessonQuery = trpc.admin.getLessonForEdit.useQuery({ lessonId: id });
  const [title, setTitle] = useState<string | null>(null);
  const [body, setBody] = useState<JSONContent | null>(null);

  const save = trpc.admin.updateLessonBody.useMutation({
    onSuccess: () => toast.success('Черновик сохранён'),
    onError: (e) => toast.error('Ошибка сохранения: ' + e.message),
  });
  const publish = trpc.admin.publishLesson.useMutation({
    onSuccess: (r) => {
      toast.success(`Опубликовано (${r.chunks} фрагментов в индексе)`);
      utils.admin.getLessonForEdit.invalidate({ lessonId: id });
    },
    onError: (e) => toast.error('Ошибка публикации: ' + e.message),
  });

  if (lessonQuery.isLoading) return <div className="p-8"><Loader2 className="animate-spin" /></div>;
  if (!lessonQuery.data) return <div className="p-8">Урок не найден</div>;

  const lesson = lessonQuery.data;
  const currentTitle = title ?? lesson.title;

  const doSave = () => save.mutate({ lessonId: id, title: currentTitle, body: body ?? lesson.body ?? { type: 'doc', content: [] } });

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <button onClick={() => router.back()} className="flex items-center gap-1 text-mp-gray-500 text-body-sm">
        <ArrowLeft className="w-4 h-4" /> Назад
      </button>

      <div className="flex items-center justify-between gap-3">
        <Input value={currentTitle} onChange={(e) => setTitle(e.target.value)} className="text-heading font-semibold" />
        <span className="text-caption text-mp-gray-500 whitespace-nowrap">
          {lesson.contentStatus === 'PUBLISHED' ? 'Опубликован' : 'Черновик'}
        </span>
      </div>

      <LessonEditor initialBody={lesson.body as JSONContent | null} onChange={setBody} />

      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={doSave} disabled={save.isPending}>
          {save.isPending ? 'Сохранение…' : 'Сохранить черновик'}
        </Button>
        <Button
          onClick={() => { doSave(); publish.mutate({ lessonId: id }); }}
          disabled={publish.isPending}
        >
          {publish.isPending ? 'Публикация…' : lesson.contentStatus === 'PUBLISHED' ? 'Опубликовать изменения' : 'Опубликовать'}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + manual smoke**

Run: `pnpm --filter web typecheck`
Expected: PASS. (Manual UAT covered later; route renders at `/admin/content/lessons/<id>`.)

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(admin)/admin/content/lessons/[id]/page.tsx"
git commit -m "feat(web): admin lesson editor page"
```

### Task 13: "Создать урок" button + dialog in CourseManager

**Files:**
- Modify: `apps/web/src/components/admin/CourseManager.tsx`
- Test: `apps/web/tests/unit/course-manager-create-lesson.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';

const createMutate = vi.fn();
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));
vi.mock('@/lib/trpc/client', () => ({
  trpc: {
    useUtils: () => ({ admin: { getCourseLessons: { invalidate: vi.fn() }, getCourses: { invalidate: vi.fn() } } }),
    admin: {
      getCourseLessons: { useQuery: () => ({ data: [] }) },
      createLesson: { useMutation: (opts: any) => ({ mutate: (v: any) => { createMutate(v); opts?.onSuccess?.({ id: 'c1_text_x' }); }, isPending: false }) },
      moveLessonToPosition: { useMutation: () => ({ mutate: vi.fn() }) },
      updateLessonTitle: { useMutation: () => ({ mutate: vi.fn() }) },
      toggleLessonHidden: { useMutation: () => ({ mutate: vi.fn() }) },
    },
  },
}));

import { CreateLessonDialog } from '@/components/admin/CreateLessonDialog';

afterEach(cleanup);
beforeEach(() => { createMutate.mockReset(); pushMock.mockReset(); });

describe('CreateLessonDialog', () => {
  it('creates a TEXT lesson and navigates to its editor', () => {
    const { getByPlaceholderText, getByRole } = render(<CreateLessonDialog courseId="c1" onClose={vi.fn()} />);
    fireEvent.change(getByPlaceholderText('Название урока'), { target: { value: 'Мой урок' } });
    fireEvent.click(getByRole('button', { name: 'Создать' }));
    expect(createMutate).toHaveBeenCalledWith({ courseId: 'c1', title: 'Мой урок', contentType: 'TEXT' });
    expect(pushMock).toHaveBeenCalledWith('/admin/content/lessons/c1_text_x');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test course-manager-create-lesson`
Expected: FAIL — `CreateLessonDialog` not found.

- [ ] **Step 3: Implement the dialog as a focused component**

Create `apps/web/src/components/admin/CreateLessonDialog.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LESSON_CONTENT_TYPE_LABELS } from '@mpstats/shared';

type ContentType = 'TEXT' | 'INTERACTIVE';

export function CreateLessonDialog({ courseId, onClose }: { courseId: string; onClose: () => void }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [title, setTitle] = useState('');
  const [contentType, setContentType] = useState<ContentType>('TEXT');

  const create = trpc.admin.createLesson.useMutation({
    onSuccess: (r) => {
      utils.admin.getCourseLessons.invalidate({ courseId });
      utils.admin.getCourses.invalidate();
      router.push(`/admin/content/lessons/${r.id}`);
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-heading font-semibold">Создать урок</h3>
        <Input placeholder="Название урока" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="flex gap-2">
          {(['TEXT', 'INTERACTIVE'] as ContentType[]).map((t) => (
            <Button key={t} type="button" variant={contentType === t ? 'secondary' : 'outline'} size="sm" onClick={() => setContentType(t)}>
              {LESSON_CONTENT_TYPE_LABELS[t]}
            </Button>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button disabled={!title.trim() || create.isPending} onClick={() => create.mutate({ courseId, title: title.trim(), contentType })}>
            Создать
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test course-manager-create-lesson`
Expected: PASS.

- [ ] **Step 5: Wire the dialog into CourseManager**

In `apps/web/src/components/admin/CourseManager.tsx`, inside `CourseAccordion`, add state and a footer button below the lesson list (after the lessons container, ~line 611):

```tsx
// near other useState in CourseAccordion:
const [createOpen, setCreateOpen] = useState(false);
```

```tsx
{/* after the lesson list, inside the expanded block */}
<div className="border-t border-mp-gray-100 p-3 bg-mp-gray-50">
  <Button variant="outline" size="sm" className="w-full" onClick={() => setCreateOpen(true)}>
    <Plus className="w-4 h-4 mr-1" /> Создать урок
  </Button>
</div>
{createOpen && <CreateLessonDialog courseId={course.id} onClose={() => setCreateOpen(false)} />}
```

Add imports at top of CourseManager.tsx: `import { Plus } from 'lucide-react';` (if missing) and `import { CreateLessonDialog } from './CreateLessonDialog';`.

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm --filter web typecheck` → PASS.

```bash
git add apps/web/src/components/admin/CreateLessonDialog.tsx apps/web/src/components/admin/CourseManager.tsx apps/web/tests/unit/course-manager-create-lesson.test.tsx
git commit -m "feat(web): create-lesson dialog in CourseManager"
```

---

## Area 6 — Reader rendering (student frontend)

### Task 14: `LessonBodyRenderer` (read-only TipTap)

**Files:**
- Create: `apps/web/src/components/learning/LessonBodyRenderer.tsx`
- Test: `apps/web/tests/unit/lesson-body-renderer.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { LessonBodyRenderer } from '@/components/learning/LessonBodyRenderer';

afterEach(cleanup);

describe('LessonBodyRenderer', () => {
  it('renders heading and paragraph text from a TipTap doc', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Заголовок' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Тело урока' }] },
      ],
    };
    const { getByText } = render(<LessonBodyRenderer doc={doc} />);
    expect(getByText('Заголовок')).toBeTruthy();
    expect(getByText('Тело урока')).toBeTruthy();
  });

  it('renders nothing for null doc', () => {
    const { container } = render(<LessonBodyRenderer doc={null} />);
    expect(container.textContent).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test lesson-body-renderer`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement the read-only renderer**

`apps/web/src/components/learning/LessonBodyRenderer.tsx`:

```tsx
'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import type { JSONContent } from '@tiptap/react';
import { lessonEditorExtensions } from '@/components/admin/lesson-editor/extensions';

// Read-only render of a lesson body. Same extensions as the editor → one source of truth.
// Phase B adds interactive node views here without changing the call site.
export function LessonBodyRenderer({ doc }: { doc: JSONContent | null }) {
  const editor = useEditor(
    {
      extensions: lessonEditorExtensions,
      content: doc ?? { type: 'doc', content: [] },
      editable: false,
      editorProps: { attributes: { class: 'prose prose-sm max-w-none' } },
    },
    [doc],
  );

  if (!doc || !editor) return null;
  return <EditorContent editor={editor} />;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test lesson-body-renderer`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/learning/LessonBodyRenderer.tsx apps/web/tests/unit/lesson-body-renderer.test.tsx
git commit -m "feat(web): read-only LessonBodyRenderer (TipTap)"
```

### Task 15: Branch lesson page on contentType + "Завершить урок"

**Files:**
- Modify: `apps/web/src/app/(main)/learn/[id]/page.tsx:673-694`

- [ ] **Step 1: Add the completion mutation + render branch**

Near the top of `LessonPage`, add the mutation hook (above any early return, per Rules-of-Hooks — see `feedback_rules_of_hooks_early_returns`):

```tsx
const utils = trpc.useUtils();
const completeLesson = trpc.learning.completeLesson.useMutation({
  onSuccess: () => {
    toast.success('Урок завершён');
    utils.learning.getLesson.invalidate({ lessonId });
  },
});
```

Replace the video `<Card>` block (lines 673-694) with a content-type branch:

```tsx
{lesson.contentType === 'VIDEO' ? (
  <Card data-tour="lesson-video" id="video-player" className="overflow-hidden shadow-mp-card">
    <VideoPlayer
      ref={playerRef}
      videoId={lesson.videoId}
      onTimeUpdate={handleTimeUpdate}
      onEnded={() => {/* existing handler */}}
      initialTime={hasSearchTimecode ? searchTimecode : watchProgress?.lastPosition}
      durationSeconds={lesson.duration ? lesson.duration * 60 : undefined}
    />
  </Card>
) : (
  <Card className="overflow-hidden shadow-mp-card">
    <CardContent className="p-6">
      <LessonBodyRenderer doc={lesson.body as never} />
      <div className="mt-8 flex justify-center">
        <Button
          size="lg"
          disabled={completeLesson.isPending || watchProgress?.status === 'COMPLETED'}
          onClick={() => completeLesson.mutate({ lessonId })}
        >
          {watchProgress?.status === 'COMPLETED' ? 'Урок завершён ✓' : 'Завершить урок'}
        </Button>
      </div>
    </CardContent>
  </Card>
)}
```

Add imports: `import { LessonBodyRenderer } from '@/components/learning/LessonBodyRenderer';` and ensure `CardContent`, `Button`, `toast` are imported (most already are).

> `watchProgress` is the existing per-lesson progress object already used on this page; if its shape differs, derive completion from `lesson.progress`/the existing progress variable used for the video path. Use the same source the video branch uses for `lastPosition`.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(main)/learn/[id]/page.tsx"
git commit -m "feat(web): render text lesson body + complete button on lesson page"
```

---

## Area 7 — Full verification

### Task 16: Run all suites + typecheck

- [ ] **Step 1: Run the full test + typecheck gate**

```bash
pnpm --filter @mpstats/ai test
pnpm --filter @mpstats/api test
pnpm --filter web test
pnpm typecheck
```
Expected: all green. New suites: `text-index`, `index-lesson-text`, `admin-create-lesson`, `admin-lesson-body`, `admin-publish-lesson`, `admin-image-upload`, `learning-text-lesson`, `lesson-editor-toolbar`, `lesson-body-renderer`, `course-manager-create-lesson`.

- [ ] **Step 2: Manual UAT checklist (local dev `pnpm dev`)**

1. Admin → `/admin/content` → expand a course → «Создать урок» → name + TEXT → редактор открывается.
2. Type text, bold, H2, bullet list, insert image (uploads to `lesson-images`, appears inline), insert table → «Сохранить черновик» → toast.
3. Lesson is NOT visible to a student yet (open as student → not in course list / getLesson returns null).
4. «Опубликовать» → toast with chunk count → lesson visible to student.
5. Student opens the lesson → sees rendered body → «Завершить урок» → marks complete, button flips to «Урок завершён ✓».
6. AI chat on the lesson → ask about the text content → relevant answer (text was indexed).

- [ ] **Step 3: Commit any fixes from UAT, then stop for review**

```bash
git add -A && git commit -m "fix(lessons): phase A UAT adjustments"
```

---

## Out of scope (Phase A)

- Interactive gates / branching (Phase B), callout custom node (Phase B brings custom node-views; for Phase A use blockquote for emphasis).
- Job-content admin editor (Phase C).
- Student answer submission, graded quiz, content versioning.

## Deferred deploy note

Deploy follows the staging-first runbook (`--no-cache web` build + base64 content-check, then prod) per `.claude/memory/staging-workflow.md`. The migration (Task 1, Step 5) must be applied to prod Supabase via Management API **before** the app deploy that reads the new columns.
