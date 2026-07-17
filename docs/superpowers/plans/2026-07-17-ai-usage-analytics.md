# Cross-cutting AI-Usage Analytics — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist in-lesson AI chat (`ai.chat`) going forward into the dormant `ChatMessage` table and extend the analytics tab into "AI-запросы" — a cross-cutting view of both AI surfaces (drawer assistant + in-lesson chat) with lesson-chat quality signals (no-answer rate).

**Architecture:** `ai.chat` best-effort writes two `ChatMessage` rows per turn (user + assistant, the assistant row carrying model/sourceCount/noAnswer). Pure functions in `packages/api/src/utils/lesson-chat-analytics.ts` build the rows and compute quality (unit-tested). New thin tRPC procedures do raw-SQL aggregation over `ChatMessage` (MSK-day buckets, test-users excluded). The existing assistant page gains a cross-cutting top-line + a "Чат в уроках" section, reusing the assistant-analytics utils and UI components.

**Tech Stack:** Next.js 14, tRPC, Prisma `$queryRawUnsafe` (Postgres/Supabase), Vitest, recharts.

**Spec:** `docs/superpowers/specs/2026-07-17-ai-usage-analytics-design.md`

---

## Ground rules (read before any task)

- **`ChatMessage.role` is the `MessageRole` ENUM → values are UPPERCASE `'USER'` / `'ASSISTANT'`.** This is DIFFERENT from `AssistantMessage.role` which is a lowercase `String` (`'user'`/`'assistant'`). Every ChatMessage SQL filter uses uppercase; every AssistantMessage filter (in cross-cutting) uses lowercase. Getting this wrong silently returns zero rows.
- **ChatMessage has NO `conversationId`.** A "dialog" is grouped by `(userId, lessonId)`. The unanswered-list pairing joins the preceding `role='USER'` row of the same `(userId, lessonId)`.
- **Test users excluded** everywhere: join `ChatMessage.userId → UserProfile` + `up."isTest" = false`.
- **MSK-day bucketing:** `to_char((m."createdAt" + interval '3 hours'), 'YYYY-MM-DD')` — same as assistant analytics; reuse `enumerateMskDays`/`fillDaySeries`.
- **Persistence is best-effort:** wrap the write in `try/catch`; a failed write must NEVER break or delay the chat response. Do NOT change the `ai.chat` return shape (`{ content, sources, model }`) — the frontend depends on it.
- **Additive migration only:** 3 nullable/default columns + 1 index on the EMPTY dormant `ChatMessage`. Applied to prod via Supabase Mgmt API (additive, invisible to old code), BEFORE deploying the persist code. NEVER `prisma db push` / `--accept-data-loss`.
- **Reuse** the assistant-analytics pure utils (`packages/api/src/utils/assistant-analytics.ts`): `enumerateMskDays`, `fillDaySeries`, `mskDayKey`, `computeQuality` (for shape reference), `RawProblemRow`/`labelProblem` pattern.
- **Working dir for all paths:** the worktree `.claude/worktrees/ai-usage-analytics/` (branch `feature/ai-usage-analytics`).

---

## File Structure

- **Modify** `packages/db/prisma/schema.prisma` — add `model`/`sourceCount`/`noAnswer` + `@@index([createdAt])` to `ChatMessage`.
- **Create** `packages/db/prisma/migrations/20260717000000_chatmessage_analytics/migration.sql` — the additive ALTERs + index.
- **Create** `packages/api/src/utils/lesson-chat-analytics.ts` — `isRefusalAnswer`, `buildChatMessageRows`, `computeLessonChatQuality` + types.
- **Create** `packages/api/src/utils/lesson-chat-analytics.test.ts` — unit tests.
- **Modify** `packages/api/src/routers/ai.ts` — persist two rows in the `chat` mutation.
- **Modify** `packages/api/src/routers/admin-analytics-assistant.ts` — add 4 lesson-chat / cross-cutting procedures.
- **Modify** `apps/web/src/components/admin/AnalyticsTabs.tsx` — rename tab label to "AI-запросы".
- **Modify** `apps/web/src/app/(admin)/admin/analytics/assistant/page.tsx` — add cross-cutting top-line + "Чат в уроках" section.

---

## Task 1: Schema + additive migration

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (the `ChatMessage` model, currently at ~line 449)
- Create: `packages/db/prisma/migrations/20260717000000_chatmessage_analytics/migration.sql`

- [ ] **Step 1: Edit the `ChatMessage` model** — add three columns and a createdAt index. Replace the existing model with:

```prisma
model ChatMessage {
  id          String      @id @default(cuid())
  userId      String
  lessonId    String
  role        MessageRole
  content     String
  model       String? // модель ответа (assistant-строка); null для user-строки
  sourceCount Int? // число RAG-цитат (assistant-строка); 0 = нет грундинга
  noAnswer    Boolean     @default(false) // assistant не нашёл ответ (эвристика)
  createdAt   DateTime    @default(now())

  user UserProfile @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, lessonId])
  @@index([createdAt])
}
```

- [ ] **Step 2: Create the migration SQL** at `packages/db/prisma/migrations/20260717000000_chatmessage_analytics/migration.sql`:

```sql
-- Additive: quality columns + createdAt index on the dormant (empty) ChatMessage.
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "model" TEXT;
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "sourceCount" INTEGER;
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "noAnswer" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "ChatMessage_createdAt_idx" ON "ChatMessage"("createdAt");
```

- [ ] **Step 3: Regenerate the Prisma client**

Run: `pnpm --filter @mpstats/db db:generate`
Expected: completes without error (client now knows the 3 new fields).

> NOTE: Do NOT run `prisma migrate` / `db push` against the DB. The prod ALTER is applied separately via Supabase Mgmt API at deploy time (controller step — see Deploy section). These columns are additive and invisible to currently-running prod code.

- [ ] **Step 4: Typecheck db package**

Run: `pnpm --filter @mpstats/db typecheck` (if the package has a typecheck script; otherwise skip)
Expected: PASS. If no typecheck script, verify `pnpm --filter @mpstats/api typecheck` still passes (it consumes the client).

- [ ] **Step 5: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/20260717000000_chatmessage_analytics/migration.sql
git commit -m "feat(db): ChatMessage analytics columns (model/sourceCount/noAnswer) + createdAt index"
```

---

## Task 2: Pure utils — refusal detection, row builder, quality

**Files:**
- Create: `packages/api/src/utils/lesson-chat-analytics.ts`
- Test: `packages/api/src/utils/lesson-chat-analytics.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/src/utils/lesson-chat-analytics.test.ts
import { describe, it, expect } from 'vitest';
import { isRefusalAnswer, buildChatMessageRows, computeLessonChatQuality } from './lesson-chat-analytics';

describe('isRefusalAnswer', () => {
  it('flags known refusal phrases (case-insensitive)', () => {
    expect(isRefusalAnswer('В этом фрагменте урока ответа нет.')).toBe(true);
    expect(isRefusalAnswer('Извините, не удалось сгенерировать ответ.')).toBe(true);
    expect(isRefusalAnswer('Ответа нет в контексте урока.')).toBe(true);
  });
  it('does not flag a normal grounded answer', () => {
    expect(isRefusalAnswer('Юнит-экономика — это анализ доходов и расходов на единицу товара [1].')).toBe(false);
  });
});

describe('buildChatMessageRows', () => {
  it('builds a user row and an assistant row; assistant carries metadata', () => {
    const rows = buildChatMessageRows({
      userId: 'u1', lessonId: 'l1', message: 'что такое ДРР?',
      answer: 'ДРР — доля рекламных расходов [1].', model: 'gpt-4.1-mini', sourceCount: 2,
    });
    expect(rows).toEqual([
      { userId: 'u1', lessonId: 'l1', role: 'USER', content: 'что такое ДРР?', model: null, sourceCount: null, noAnswer: false },
      { userId: 'u1', lessonId: 'l1', role: 'ASSISTANT', content: 'ДРР — доля рекламных расходов [1].', model: 'gpt-4.1-mini', sourceCount: 2, noAnswer: false },
    ]);
  });
  it('marks noAnswer when there are no sources', () => {
    const rows = buildChatMessageRows({ userId: 'u1', lessonId: 'l1', message: 'q', answer: 'любой ответ', model: 'm', sourceCount: 0 });
    expect(rows[1].noAnswer).toBe(true);
  });
  it('marks noAnswer when the answer is a refusal even with sources', () => {
    const rows = buildChatMessageRows({ userId: 'u1', lessonId: 'l1', message: 'q', answer: 'в этом фрагменте урока ответа нет', model: 'm', sourceCount: 3 });
    expect(rows[1].noAnswer).toBe(true);
  });
});

describe('computeLessonChatQuality', () => {
  it('computes rates with zero-guard', () => {
    expect(computeLessonChatQuality({ total: 0, noAnswer: 0, noGrounding: 0 })).toEqual({
      total: 0, noAnswer: 0, noAnswerRate: 0, noGrounding: 0, noGroundingRate: 0,
    });
    const q = computeLessonChatQuality({ total: 50, noAnswer: 10, noGrounding: 5 });
    expect(q.noAnswerRate).toBeCloseTo(0.2);
    expect(q.noGroundingRate).toBeCloseTo(0.1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mpstats/api test src/utils/lesson-chat-analytics.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the implementation**

```ts
// packages/api/src/utils/lesson-chat-analytics.ts

/**
 * Heuristic: did the in-lesson assistant essentially refuse / say "no answer"?
 * The RAG system prompt instructs the model to say «в этом фрагменте урока
 * ответа нет» when the context lacks the answer; the fallback string on a failed
 * generation is «не удалось сгенерировать ответ». Matched case-insensitively.
 * This is a heuristic (a normal answer could contain these substrings) — the
 * objective signal is sourceCount===0; this catches "had context but declined".
 */
const REFUSAL_SUBSTRINGS = [
  'ответа нет',
  'нет ответа',
  'не удалось сгенерировать',
  'нет в контексте',
  'в контексте нет',
  'не содержится',
];

export function isRefusalAnswer(content: string): boolean {
  const c = content.toLowerCase();
  return REFUSAL_SUBSTRINGS.some((p) => c.includes(p));
}

export interface ChatPersistInput {
  userId: string;
  lessonId: string;
  message: string; // user query
  answer: string; // assistant content
  model: string;
  sourceCount: number;
}

export interface ChatMessageRow {
  userId: string;
  lessonId: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  model: string | null;
  sourceCount: number | null;
  noAnswer: boolean;
}

/** Two rows per turn: the user query, then the assistant reply (carrying metadata). */
export function buildChatMessageRows(i: ChatPersistInput): ChatMessageRow[] {
  const noAnswer = i.sourceCount === 0 || isRefusalAnswer(i.answer);
  return [
    { userId: i.userId, lessonId: i.lessonId, role: 'USER', content: i.message, model: null, sourceCount: null, noAnswer: false },
    { userId: i.userId, lessonId: i.lessonId, role: 'ASSISTANT', content: i.answer, model: i.model, sourceCount: i.sourceCount, noAnswer },
  ];
}

export interface LessonChatQuality {
  total: number;
  noAnswer: number;
  noAnswerRate: number;
  noGrounding: number;
  noGroundingRate: number;
}

export function computeLessonChatQuality(i: {
  total: number | bigint;
  noAnswer: number | bigint;
  noGrounding: number | bigint;
}): LessonChatQuality {
  const total = Number(i.total);
  const noAnswer = Number(i.noAnswer);
  const noGrounding = Number(i.noGrounding);
  const rate = (x: number) => (total === 0 ? 0 : x / total);
  return { total, noAnswer, noAnswerRate: rate(noAnswer), noGrounding, noGroundingRate: rate(noGrounding) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mpstats/api test src/utils/lesson-chat-analytics.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/utils/lesson-chat-analytics.ts packages/api/src/utils/lesson-chat-analytics.test.ts
git commit -m "feat(analytics): lesson-chat pure utils (refusal detection, row builder, quality)"
```

---

## Task 3: Persist chat in `ai.chat`

**Files:**
- Modify: `packages/api/src/routers/ai.ts` (the `chat` procedure, ~line 147-170)

- [ ] **Step 1: Add the import** — at the top import block of `ai.ts`, add:

```ts
import { buildChatMessageRows } from '../utils/lesson-chat-analytics';
```

- [ ] **Step 2: Rewrite the `chat` mutation** to read `ctx` and best-effort persist. Replace the existing `chat: chatProcedure ... })` block with:

```ts
  chat: chatProcedure
    .input(z.object({
      lessonId: z.string().min(1),
      message: z.string().min(1).max(2000),
      history: z.array(z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string(),
      })).optional().default([]),
    }))
    .mutation(async ({ ctx, input }) => {
      const { lessonId, message, history } = input;

      const result = await generateChatResponse(
        lessonId,
        message,
        history as ChatMessage[]
      );

      // Best-effort analytics persistence (forward-only). A write failure must
      // never break or delay the chat response — swallow and log.
      try {
        await ctx.prisma.chatMessage.createMany({
          data: buildChatMessageRows({
            userId: ctx.user.id,
            lessonId,
            message,
            answer: result.content,
            model: result.model,
            sourceCount: result.sources.length,
          }),
        });
      } catch (err) {
        console.error('[ai.chat] ChatMessage persist failed (non-fatal):', err);
      }

      return {
        content: result.content,
        sources: result.sources,
        model: result.model,
      };
    }),
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @mpstats/api typecheck`
Expected: PASS. (`ctx.user.id` is available via `chatProcedure`→`protectedProcedure`; `ctx.prisma.chatMessage.createMany` exists after Task 1's `db:generate`. The `MessageRole` enum accepts the string literals `'USER'`/`'ASSISTANT'` from `buildChatMessageRows` — Prisma's `createMany` types `role` as the enum; the literal union matches. If TS rejects the literal union, cast the array with `satisfies` is not needed — instead import `MessageRole` from `@mpstats/db` and map `role` through it: `role: r.role as MessageRole`. Prefer the plain literals first; only add the cast if the compiler complains.)

- [ ] **Step 4: Run the full api suite** (nothing should regress; persistence is mocked/absent in unit tests)

Run: `pnpm --filter @mpstats/api test`
Expected: PASS (existing suite + Task 2's new tests).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routers/ai.ts
git commit -m "feat(ai): best-effort persist in-lesson chat to ChatMessage (forward-only analytics)"
```

---

## Task 4: Analytics procedures (lesson-chat + cross-cutting)

**Files:**
- Modify: `packages/api/src/routers/admin-analytics-assistant.ts` (add procedures inside the existing `assistantAnalyticsRouter = router({ ... })`)

Add these imports to the top of the file (extend the existing import from `../utils/assistant-analytics` if needed, and add the new one):

```ts
import { computeLessonChatQuality } from '../utils/lesson-chat-analytics';
```

(`enumerateMskDays`, `fillDaySeries`, `mskDayKey` are already imported from `../utils/assistant-analytics` in this file.)

- [ ] **Step 1: Add `getLessonChatPulse`** (inside the router object)

```ts
  /** In-lesson chat pulse: KPI + daily queries + top lessons asked about. */
  getLessonChatPulse: adminProcedure.input(rangeInput).query(async ({ ctx, input }) => {
    try {
      const { from, to } = input;
      assertRange(from, to);
      const dayKeys = enumerateMskDays(from, to);

      const byDay = await ctx.prisma.$queryRawUnsafe<Array<{ date: string; count: number }>>(
        `
        SELECT to_char((m."createdAt" + interval '3 hours'), 'YYYY-MM-DD') AS date,
               COUNT(*)::int AS count
        FROM "ChatMessage" m
        JOIN "UserProfile" up ON up.id = m."userId"
        WHERE m.role = 'USER' AND m."createdAt" BETWEEN $1 AND $2 AND up."isTest" = false
        GROUP BY 1 ORDER BY 1
        `,
        from,
        to,
      );

      const [totals] = await ctx.prisma.$queryRawUnsafe<
        Array<{ queries: number; users: number; lessons: number }>
      >(
        `
        SELECT
          COUNT(*) FILTER (WHERE m.role = 'USER')::int AS queries,
          COUNT(DISTINCT m."userId")::int AS users,
          COUNT(DISTINCT m."lessonId")::int AS lessons
        FROM "ChatMessage" m
        JOIN "UserProfile" up ON up.id = m."userId"
        WHERE m."createdAt" BETWEEN $1 AND $2 AND up."isTest" = false
        `,
        from,
        to,
      );

      const topLessons = await ctx.prisma.$queryRawUnsafe<Array<{ id: string; title: string; count: number }>>(
        `
        SELECT l.id AS id, l.title AS title, COUNT(*)::int AS count
        FROM "ChatMessage" m
        JOIN "UserProfile" up ON up.id = m."userId"
        JOIN "Lesson" l ON l.id = m."lessonId"
        WHERE m.role = 'USER' AND m."createdAt" BETWEEN $1 AND $2 AND up."isTest" = false
        GROUP BY l.id, l.title ORDER BY count DESC LIMIT 10
        `,
        from,
        to,
      );

      const queries = Number(totals?.queries ?? 0);
      const users = Number(totals?.users ?? 0);
      return {
        kpi: {
          queries,
          users,
          lessons: Number(totals?.lessons ?? 0),
          avgPerUser: users === 0 ? 0 : queries / users,
        },
        byDay: fillDaySeries(byDay, dayKeys),
        topLessons: topLessons.map((r) => ({ id: r.id, title: r.title, count: Number(r.count) })),
      };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      handleDatabaseError(error);
    }
  }),
```

- [ ] **Step 2: Add `getLessonChatQuality`**

```ts
  /** In-lesson chat quality: no-answer rate + no-grounding (sourceCount=0) rate. */
  getLessonChatQuality: adminProcedure.input(rangeInput).query(async ({ ctx, input }) => {
    try {
      const { from, to } = input;
      assertRange(from, to);
      const [row] = await ctx.prisma.$queryRawUnsafe<
        Array<{ total: number; no_answer: number; no_grounding: number }>
      >(
        `
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE m."noAnswer" = true)::int AS no_answer,
          COUNT(*) FILTER (WHERE m."sourceCount" = 0)::int AS no_grounding
        FROM "ChatMessage" m
        JOIN "UserProfile" up ON up.id = m."userId"
        WHERE m.role = 'ASSISTANT' AND m."createdAt" BETWEEN $1 AND $2 AND up."isTest" = false
        `,
        from,
        to,
      );
      return computeLessonChatQuality({
        total: row?.total ?? 0,
        noAnswer: row?.no_answer ?? 0,
        noGrounding: row?.no_grounding ?? 0,
      });
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      handleDatabaseError(error);
    }
  }),
```

- [ ] **Step 3: Add `getLessonChatUnanswered`**

```ts
  /** Last N unanswered lesson-chat questions (noAnswer) with the user query + lesson title. */
  getLessonChatUnanswered: adminProcedure
    .input(rangeInput.extend({ limit: z.number().int().min(1).max(200).default(50) }))
    .query(async ({ ctx, input }) => {
      try {
        const { from, to, limit } = input;
        assertRange(from, to);
        const rows = await ctx.prisma.$queryRawUnsafe<
          Array<{ createdAt: Date; query: string | null; lessonTitle: string | null }>
        >(
          `
          SELECT
            m."createdAt" AS "createdAt",
            q.content AS query,
            l.title AS "lessonTitle"
          FROM "ChatMessage" m
          JOIN "UserProfile" up ON up.id = m."userId"
          LEFT JOIN "Lesson" l ON l.id = m."lessonId"
          LEFT JOIN LATERAL (
            SELECT u.content FROM "ChatMessage" u
            WHERE u."userId" = m."userId" AND u."lessonId" = m."lessonId"
              AND u.role = 'USER' AND u."createdAt" <= m."createdAt"
            ORDER BY u."createdAt" DESC
            LIMIT 1
          ) q ON true
          WHERE m.role = 'ASSISTANT' AND m."noAnswer" = true
            AND m."createdAt" BETWEEN $1 AND $2 AND up."isTest" = false
          ORDER BY m."createdAt" DESC
          LIMIT $3
          `,
          from,
          to,
          limit,
        );
        return {
          items: rows.map((r) => ({
            date: mskDayKey(r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt)),
            query: r.query ?? '',
            lessonTitle: r.lessonTitle ?? '—',
          })),
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        handleDatabaseError(error);
      }
    }),
```

- [ ] **Step 4: Add `getCrossCutting`** (combined daily series + totals across both surfaces)

```ts
  /** Cross-cutting AI usage: daily user-queries split by surface (assistant vs lesson chat). */
  getCrossCutting: adminProcedure.input(rangeInput).query(async ({ ctx, input }) => {
    try {
      const { from, to } = input;
      assertRange(from, to);
      const dayKeys = enumerateMskDays(from, to);

      // Assistant drawer: AssistantMessage.role is lowercase 'user'.
      const assistantByDay = await ctx.prisma.$queryRawUnsafe<Array<{ date: string; count: number }>>(
        `
        SELECT to_char((m."createdAt" + interval '3 hours'), 'YYYY-MM-DD') AS date, COUNT(*)::int AS count
        FROM "AssistantMessage" m
        JOIN "AssistantConversation" c ON c.id = m."conversationId"
        JOIN "UserProfile" up ON up.id = c."userId"
        WHERE m.role = 'user' AND m."createdAt" BETWEEN $1 AND $2 AND up."isTest" = false
        GROUP BY 1 ORDER BY 1
        `,
        from,
        to,
      );

      // In-lesson chat: ChatMessage.role is UPPERCASE 'USER'.
      const chatByDay = await ctx.prisma.$queryRawUnsafe<Array<{ date: string; count: number }>>(
        `
        SELECT to_char((m."createdAt" + interval '3 hours'), 'YYYY-MM-DD') AS date, COUNT(*)::int AS count
        FROM "ChatMessage" m
        JOIN "UserProfile" up ON up.id = m."userId"
        WHERE m.role = 'USER' AND m."createdAt" BETWEEN $1 AND $2 AND up."isTest" = false
        GROUP BY 1 ORDER BY 1
        `,
        from,
        to,
      );

      const a = fillDaySeries(assistantByDay, dayKeys);
      const ch = fillDaySeries(chatByDay, dayKeys);
      const byDay = dayKeys.map((date, i) => ({ date, assistant: a[i].count, lessonChat: ch[i].count }));
      const assistantTotal = a.reduce((s, d) => s + d.count, 0);
      const lessonChatTotal = ch.reduce((s, d) => s + d.count, 0);

      return {
        totals: { assistant: assistantTotal, lessonChat: lessonChatTotal, all: assistantTotal + lessonChatTotal },
        byDay,
      };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      handleDatabaseError(error);
    }
  }),
```

- [ ] **Step 5: Typecheck + full suite**

Run: `pnpm --filter @mpstats/api typecheck && pnpm --filter @mpstats/api test`
Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/routers/admin-analytics-assistant.ts
git commit -m "feat(analytics): lesson-chat + cross-cutting AI-usage procedures"
```

---

## Task 5: Frontend — rename tab + cross-cutting top-line + lesson-chat section

**Files:**
- Modify: `apps/web/src/components/admin/AnalyticsTabs.tsx`
- Modify: `apps/web/src/app/(admin)/admin/analytics/assistant/page.tsx`

- [ ] **Step 1: Rename the tab label** in `AnalyticsTabs.tsx` — change the assistant entry's `label` (keep the href):

Find `{ label: 'Ассистент', href: '/admin/analytics/assistant' }` and change it to:

```ts
  { label: 'AI-запросы', href: '/admin/analytics/assistant' },
```

- [ ] **Step 2: Add the new queries** in `page.tsx` (below the existing `upsell` query):

```tsx
  const crossCutting = trpc.admin.analytics.assistant.getCrossCutting.useQuery({ from, to });
  const chatPulse = trpc.admin.analytics.assistant.getLessonChatPulse.useQuery({ from, to });
  const chatQuality = trpc.admin.analytics.assistant.getLessonChatQuality.useQuery({ from, to });
  const chatUnanswered = trpc.admin.analytics.assistant.getLessonChatUnanswered.useQuery({ from, to, limit: 50 });
```

- [ ] **Step 3: Update the page header subtitle** (it currently says the tab is about the assistant). Change the `<p>` under the `<h2>` to:

```tsx
          <p className="text-body-sm text-mp-gray-500 mt-1">
            Сквозные AI-запросы: drawer-ассистент + чат в уроках (без тестовых)
          </p>
```

- [ ] **Step 4: Add the cross-cutting top-line section** — insert it RIGHT AFTER the header `</div>` block and BEFORE the existing `{/* Section 1 — Пульс */}`:

```tsx
      {/* Cross-cutting top-line */}
      <section className="space-y-4">
        <h3 className="text-body font-semibold text-mp-gray-900">Сквозной срез AI-запросов</h3>
        {crossCutting.isLoading ? (
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <Card key={i} className="p-5"><Skeleton className="h-4 w-24 mb-3" /><Skeleton className="h-8 w-16" /></Card>)}
          </div>
        ) : crossCutting.data ? (
          <div className="grid grid-cols-3 gap-4">
            <StatCard title="Все AI-запросы" value={crossCutting.data.totals.all} icon={Sparkles} color="blue" />
            <StatCard title="Ассистент (drawer)" value={crossCutting.data.totals.assistant} icon={MessageSquare} color="green" />
            <StatCard title="Чат в уроках" value={crossCutting.data.totals.lessonChat} icon={MessagesSquare} color="pink" />
          </div>
        ) : null}
        <Card className="p-5">
          {crossCutting.isLoading ? <Skeleton className="h-[250px] w-full" /> : (
            <ActivityChartMulti data={crossCutting.data?.byDay ?? []} />
          )}
        </Card>
      </section>
```

Add `Sparkles` to the existing `lucide-react` import line. `MessageSquare` / `MessagesSquare` are already imported (from the assistant sections). If any icon is missing from the import, add it.

- [ ] **Step 5: Add a small multi-line chart component** for the two-surface daily series. At the top of `page.tsx` (module scope, above the default-exported component), add:

```tsx
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

function ActivityChartMulti({ data }: { data: Array<{ date: string; assistant: number; lessonChat: number }> }) {
  return (
    <div>
      <h3 className="text-body-md font-semibold text-mp-gray-900 mb-4">AI-запросов в день по каналам</h3>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data}>
          <XAxis dataKey="date" tickFormatter={(d: string) => { const p = d.split('-'); return `${p[2]}.${p[1]}`; }} tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="assistant" name="Ассистент" stroke="#16a34a" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="lessonChat" name="Чат в уроках" stroke="#db2777" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 6: Add the "Чат в уроках" section** — insert it AFTER the existing Section 4 (Апселл) `</section>`, before the closing `</div>` of the page:

```tsx
      {/* Section 5 — Чат в уроках */}
      <section className="space-y-4">
        <h3 className="text-body font-semibold text-mp-gray-900">Чат в уроках</h3>
        {chatPulse.isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => <Card key={i} className="p-5"><Skeleton className="h-4 w-24 mb-3" /><Skeleton className="h-8 w-16" /></Card>)}
          </div>
        ) : chatPulse.data ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="Запросов" value={chatPulse.data.kpi.queries} icon={MessageSquare} color="blue" />
            <StatCard title="Уник. юзеров" value={chatPulse.data.kpi.users} icon={Users} color="green" />
            <StatCard title="Уроков затронуто" value={chatPulse.data.kpi.lessons} icon={MessagesSquare} color="gray" />
            <StatCard title="Ср. на юзера" value={chatPulse.data.kpi.avgPerUser.toFixed(1)} icon={Gauge} color="pink" />
          </div>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-5">
            {chatPulse.isLoading ? <Skeleton className="h-[250px] w-full" /> :
              <ActivityChart data={chatPulse.data?.byDay ?? []} title="Запросов в день" color="#db2777" />}
          </Card>
          <div className="grid grid-cols-2 gap-4">
            <StatCard title="«Нет ответа»" value={chatQuality.data ? pct(chatQuality.data.noAnswerRate) : '…'} icon={Gauge} color="pink" trend={chatQuality.data ? `${chatQuality.data.noAnswer} из ${chatQuality.data.total}` : undefined} />
            <StatCard title="Без источников" value={chatQuality.data ? pct(chatQuality.data.noGroundingRate) : '…'} icon={Gauge} color="gray" trend={chatQuality.data ? `${chatQuality.data.noGrounding} из ${chatQuality.data.total}` : undefined} />
          </div>
        </div>

        <TopList title="Топ уроков по вопросам" rows={chatPulse.data?.topLessons ?? []} />

        <Card className="p-5">
          <h4 className="text-body font-semibold text-mp-gray-900 mb-3">Последние «нет ответа»</h4>
          {chatUnanswered.isLoading ? <Skeleton className="h-24 w-full" /> :
            chatUnanswered.data && chatUnanswered.data.items.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-body-sm">
                  <thead><tr className="border-b border-mp-gray-200">
                    <th className="text-left py-2 pr-4 text-mp-gray-500 font-medium">Дата</th>
                    <th className="text-left py-2 px-4 text-mp-gray-500 font-medium">Урок</th>
                    <th className="text-left py-2 pl-4 text-mp-gray-500 font-medium">Вопрос</th>
                  </tr></thead>
                  <tbody>
                    {/* index key: append-only read list, refetched fresh on range change; no stable id from backend */}
                    {chatUnanswered.data.items.map((it, i) => (
                      <tr key={i} className="border-b border-mp-gray-100 last:border-0">
                        <td className="py-2 pr-4 text-mp-gray-600 whitespace-nowrap">{it.date}</td>
                        <td className="py-2 px-4 text-mp-gray-700">{it.lessonTitle}</td>
                        <td className="py-2 pl-4 text-mp-gray-900">{it.query || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-body-sm text-mp-gray-500">Вопросов без ответа за период нет.</p>}
        </Card>
      </section>
```

- [ ] **Step 7: Typecheck web**

Run: `pnpm --filter web typecheck`
Expected: PASS. Ensure all icons used (`Sparkles`, `MessageSquare`, `MessagesSquare`, `Users`, `Gauge`) are in the `lucide-react` import; add any missing. `pct`, `TopList`, `StatCard`, `ActivityChart`, `Card`, `Skeleton` already exist in this file (from the assistant sections).

- [ ] **Step 8: Commit**

```bash
git add "apps/web/src/app/(admin)/admin/analytics/assistant/page.tsx" apps/web/src/components/admin/AnalyticsTabs.tsx
git commit -m "feat(analytics): AI-запросы tab — cross-cutting top-line + lesson-chat section"
```

---

## Task 6: Full verification + production build gate

**Files:** none (verification only)

- [ ] **Step 1: Full api suite**

Run: `pnpm --filter @mpstats/api test`
Expected: PASS (existing + new lesson-chat-analytics tests).

- [ ] **Step 2: Workspace typecheck**

Run: `pnpm --filter @mpstats/api typecheck && pnpm --filter web typecheck`
Expected: both PASS.

- [ ] **Step 3: Production web build** (catches server-only-in-client; mandatory before deploy)

Run: `pnpm --filter web build`
Expected: build succeeds; `/admin/analytics/assistant` route present. If it fails with `Cannot find module .../next/...`, that is the known pnpm-store artifact in this worktree — run `pnpm install --force` then rebuild. If it fails with a "server-only" error, fix the offending import.

- [ ] **Step 4: Manual smoke (localhost reads prod)** — NOTE: the 3 new columns must exist on prod first (Deploy step below). Until the migration is applied, `getLessonChatQuality` (reads `noAnswer`/`sourceCount`) will error and the chat persist will no-op (best-effort catch). For local pre-deploy smoke, either apply the migration first (controller) or verify only the assistant sections + cross-cutting assistant side render. Full lesson-chat data only appears once persistence is live + used.

- [ ] **Step 5: No commit** — verification only.

---

## Deploy (controller steps — NOT a subagent)

**Order matters (additive migration BEFORE code):**

1. **Apply the additive migration to prod via Supabase Mgmt API** (pattern: `reference_supabase_migration_via_mgmt_api.md`). Run the `migration.sql` ALTERs + index against project `saecuecevicwjkpmaoot`, then insert the `_prisma_migrations` bookkeeping row (name `20260717000000_chatmessage_analytics`). Columns are additive + the table is empty → zero risk; invisible to currently-running prod code.
2. **Staging build-gate:** `git checkout feature/ai-usage-analytics` on VPS → `docker compose -p maal-staging -f docker-compose.staging.yml build --no-cache web` → `up -d web` → smoke. Then `git checkout master`.
3. **Merge** `--no-ff` to master → push.
4. **Prod deploy:** VPS `git checkout master && git pull` → `docker compose build --no-cache web` → `up -d web` → smoke (internal health, public 200, tRPC `admin.analytics.assistant.getLessonChatPulse` → 401).
5. **Rollback:** `git revert -m 1 <merge>` + redeploy. The 3 additive columns can stay (harmless); no data touched.

---

## Self-review notes (author)

- **Spec coverage:** Part 1 (persist) → Tasks 1–3; Part 2 analytics → Tasks 4–5 (getLessonChatPulse/Quality/Unanswered/CrossCutting + tab rename + cross-cutting top-line + Чат-в-уроках section). Both open questions resolved: getCrossCutting is a dedicated procedure (combined daily chart); noAnswer = sourceCount=0 OR refusal-phrase.
- **Enum-case correctness:** `ChatMessage.role` uses UPPERCASE `'USER'`/`'ASSISTANT'` in every ChatMessage query and in `buildChatMessageRows`; `getCrossCutting`'s AssistantMessage sub-query uses lowercase `'user'`. Called out at every query.
- **Type consistency:** `ChatMessageRow`, `LessonChatQuality`, `ChatPersistInput` defined in Task 2 and consumed in Tasks 3–4 unchanged. Procedure names identical between router (Task 4) and page (Task 5).
- **Hot-path safety:** persistence is `try/catch` best-effort, `createMany` of 2 rows, return shape unchanged.
- **Migration ordering:** additive columns applied to prod BEFORE code deploy (feedback_schema_migration_order); best-effort catch means even out-of-order is non-fatal for chat.
- **Deferred (spec non-goals):** retro backfill (no history exists), full chat conversation viewer, unified per-user cross-surface graph.
