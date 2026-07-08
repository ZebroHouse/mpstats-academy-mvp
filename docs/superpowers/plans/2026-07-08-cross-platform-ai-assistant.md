# Сквозной AI-ассистент MAAL — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сквозной AI-помощник — правый drawer на всех страницах, который отвечает на селлерские/бизнес-вопросы по RAG-грунту и подмешивает карточки уроков/задач с добавлением в избранное в один клик.

**Architecture:** Детерминированный RAG-пайплайн (домен-гейт → расширение запроса → ретрив уроков+задач → LLM-синтез с whitelist), переиспользующий существующие примитивы `packages/ai` (`searchChunks`, `searchJobsByEmbedding`, `expandSellerQuery`, `embedQuery`). Тонкий tRPC-роутер `assistant` персистит одну нить на юзера и гейтит дневной квотой по тиру. Фронт — client-компонент в топбаре `(main)/layout.tsx`, non-streaming чат (индикатор печати) по образцу лессон-чата.

**Tech Stack:** TypeScript, Next.js 14 App Router, tRPC, Prisma + Supabase Postgres (pgvector), OpenRouter (gpt-4.1-mini), Radix Dialog (Sheet), Vitest.

**Спека:** `docs/superpowers/specs/2026-07-08-cross-platform-ai-assistant-design.md`

**Ветка/worktree:** `feature/ai-assistant` (`.claude/worktrees/ai-assistant`). Все команды запускать из корня worktree.

---

## Файловая структура

**packages/ai** (пайплайн, чистая логика):
- Create `packages/ai/src/assistant/types.ts` — типы результата и кандидатов.
- Create `packages/ai/src/assistant/gate.ts` — доменный классификатор (LLM).
- Create `packages/ai/src/assistant/retrieve.ts` — ретрив уроков+задач (реюз).
- Create `packages/ai/src/assistant/synthesize.ts` — LLM-синтез JSON + whitelist.
- Create `packages/ai/src/assistant/pipeline.ts` — оркестратор gate→retrieve→synth.
- Create `packages/ai/src/assistant/index.ts` — barrel.
- Modify `packages/ai/src/index.ts` — реэкспорт assistant.

**packages/db** (модель данных):
- Modify `packages/db/prisma/schema.prisma` — 2 модели + relation на UserProfile.
- Create `packages/db/prisma/migrations/20260708120000_add_assistant_conversation/migration.sql`.

**packages/api** (API-слой):
- Create `packages/api/src/utils/assistant-quota.ts` — тир + дневная квота + МСК-полночь.
- Create `packages/api/src/routers/assistant.ts` — sendMessage / getConversation / getQuota / resetConversation.
- Modify `packages/api/src/root.ts` — регистрация роутера.

**apps/web** (фронт):
- Create `apps/web/src/components/ui/sheet.tsx` — правый drawer (Radix Dialog).
- Create `apps/web/src/components/assistant/AssistantCards.tsx` — карточки уроков/задач + FavoriteButton.
- Create `apps/web/src/components/assistant/AssistantConversation.tsx` — сообщения + инпут + квота.
- Create `apps/web/src/components/assistant/AssistantLauncher.tsx` — кнопка топбара + Sheet + стейт.
- Modify `apps/web/src/app/(main)/layout.tsx` — вставка `<AssistantLauncher enabled={…} />`.
- Modify `apps/web/src/lib/trpc/provider.tsx` — добавить пути assistant в `AI_PROCEDURES`.

---

## Wave 1 — Данные + RAG-пайплайн (packages/db, packages/ai)

### Task 1: Prisma-модели `AssistantConversation` + `AssistantMessage`

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (модель `UserProfile` — добавить relation; в конец файла — 2 модели)
- Create: `packages/db/prisma/migrations/20260708120000_add_assistant_conversation/migration.sql`

- [ ] **Step 1: Добавить relation в `UserProfile`**

Найди `model UserProfile {` и в блок его relation-полей (рядом с `favorites Favorite[]`) добавь строку:

```prisma
  assistantConversations AssistantConversation[]
```

- [ ] **Step 2: Добавить 2 модели в конец `schema.prisma`**

```prisma
model AssistantConversation {
  id        String   @id @default(cuid())
  userId    String
  status    String   @default("active") // active | archived
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user     UserProfile        @relation(fields: [userId], references: [id], onDelete: Cascade)
  messages AssistantMessage[]

  @@index([userId, status])
}

model AssistantMessage {
  id             String   @id @default(cuid())
  conversationId String
  role           String   // user | assistant
  content        String   @db.Text
  lessonIds      String[] @default([]) // подмешанные карточки уроков (assistant)
  jobIds         String[] @default([]) // подмешанные карточки задач (assistant)
  inDomain       Boolean  @default(true) // false = офф-топик отказ (аналитика + квота)
  createdAt      DateTime @default(now())

  conversation AssistantConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId, createdAt])
}
```

- [ ] **Step 3: Написать migration.sql**

```sql
-- CreateTable
CREATE TABLE IF NOT EXISTS "AssistantConversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AssistantConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AssistantMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "lessonIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "jobIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "inDomain" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssistantMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AssistantConversation_userId_status_idx" ON "AssistantConversation"("userId", "status");
CREATE INDEX IF NOT EXISTS "AssistantMessage_conversationId_createdAt_idx" ON "AssistantMessage"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "AssistantConversation" ADD CONSTRAINT "AssistantConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssistantMessage" ADD CONSTRAINT "AssistantMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AssistantConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 4: Сгенерировать Prisma-клиент и проверить, что схема валидна**

Run: `cd packages/db && npx prisma@5.22.0 generate`
Expected: `Generated Prisma Client` без ошибок. (Локально dev читает ПРОД Supabase — НЕ запускай `prisma migrate dev`/`db push`. Миграция на prod применяется через Mgmt API в Task 17.)

- [ ] **Step 5: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/20260708120000_add_assistant_conversation
git commit -m "feat(db): AssistantConversation + AssistantMessage models"
```

---

### Task 2: Типы пайплайна

**Files:**
- Create: `packages/ai/src/assistant/types.ts`

- [ ] **Step 1: Написать types.ts**

```ts
// Ответ ассистента на один ход диалога.
export interface AssistantTurnResult {
  inDomain: boolean;              // false = офф-топик, карточек нет
  answer: string;                 // markdown-ответ юзеру
  lessons: AssistantLessonRef[];  // подмешанные карточки уроков
  jobs: AssistantJobRef[];        // подмешанные карточки задач
}

export interface AssistantLessonRef {
  lessonId: string;
  title: string;
  durationMin: number | null;
  courseTitle: string | null;
  reason: string;                 // почему релевантно (1 фраза)
}

export interface AssistantJobRef {
  jobId: string;
  title: string;
  slug: string;
  lessonCount: number;
  reason: string;
}

// Одно сообщение истории, передаваемое в LLM-контекст.
export interface AssistantHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Кандидат-урок из ретрива (до whitelist).
export interface LessonCandidate {
  lessonId: string;
  title: string;
  durationMin: number | null;
  courseTitle: string | null;
  snippet: string;
  similarity: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/ai/src/assistant/types.ts
git commit -m "feat(ai): assistant pipeline types"
```

---

### Task 3: Доменный гейт (`gate.ts`)

Дешёвый LLM-классификатор «вопрос про ведение/рост бизнеса продавца?» ПЕРЕД ретривом. Отдельный вход-фильтр надёжнее системного промпта.

**Files:**
- Create: `packages/ai/src/assistant/gate.ts`
- Test: `packages/ai/src/__tests__/assistant-gate.test.ts`

- [ ] **Step 1: Написать падающий тест**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Мокаем openrouter-клиент, чтобы не ходить в сеть.
const createMock = vi.fn();
vi.mock('../openrouter', () => ({
  getOpenRouterClient: () => ({ chat: { completions: { create: createMock } } }),
  MODELS: { chat: 'openai/gpt-4.1-mini' },
}));

import { classifyDomain } from '../assistant/gate';

function mockReply(json: unknown) {
  createMock.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(json) } }] });
}

describe('classifyDomain', () => {
  beforeEach(() => createMock.mockReset());

  it('возвращает inDomain=true для бизнес-вопроса селлера', async () => {
    mockReply({ inDomain: true });
    const r = await classifyDomain('из чего складывается ДРР?');
    expect(r.inDomain).toBe(true);
  });

  it('возвращает inDomain=false для офф-топика', async () => {
    mockReply({ inDomain: false });
    const r = await classifyDomain('напиши код на python');
    expect(r.inDomain).toBe(false);
  });

  it('fail-open: при невалидном JSON пропускает (inDomain=true), чтобы не блокировать реального юзера', async () => {
    createMock.mockResolvedValueOnce({ choices: [{ message: { content: 'не json' } }] });
    const r = await classifyDomain('вопрос');
    expect(r.inDomain).toBe(true);
  });
});
```

- [ ] **Step 2: Прогнать — убедиться, что падает**

Run: `cd packages/ai && npx vitest run src/__tests__/assistant-gate.test.ts`
Expected: FAIL — `Cannot find module '../assistant/gate'`.

- [ ] **Step 3: Реализовать gate.ts**

```ts
import { getOpenRouterClient, MODELS } from '../openrouter';

export interface DomainVerdict {
  inDomain: boolean;
}

const SYSTEM = `Ты — классификатор запросов для обучающей платформы селлеров маркетплейсов (Wildberries, Ozon).
Верни СТРОГО JSON: {"inDomain": true} или {"inDomain": false}.

inDomain=true, если вопрос про ведение или рост бизнеса продавца на маркетплейсах, включая смежные предпринимательские темы:
- механика WB/Ozon: карточки, реклама, аналитика, выкупы, рейтинг, поставки, логистика;
- финансы бизнеса: PnL, юнит-экономика, ДРР, маржа, кэшфлоу, налоги ИП/самозанятого;
- продвижение, маркетинг, внешний трафик, SEO;
- операционка, закупки, найм под этот бизнес.

inDomain=false для всего остального: код, школьные/математические задачи, медицина, политика, творчество, ЛИЧНЫЕ финансы (ипотека, вклады), написание текстов не про бизнес продавца, любые общие вопросы.

При сомнении в сторону бизнеса продавца — ставь true. Личное/общее — false.`;

// Fail-open: любая ошибка/невалидный ответ → пропускаем (true).
// Ошибка «отказал реальному селлеру» дороже ошибки «ответил на пограничное».
export async function classifyDomain(query: string): Promise<DomainVerdict> {
  try {
    const client = getOpenRouterClient();
    const resp = await client.chat.completions.create({
      model: MODELS.chat,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: query },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    });
    const raw = resp.choices[0]?.message?.content ?? '';
    const parsed = JSON.parse(raw) as { inDomain?: unknown };
    return { inDomain: parsed.inDomain === false ? false : true };
  } catch {
    return { inDomain: true };
  }
}
```

- [ ] **Step 4: Прогнать — убедиться, что проходит**

Run: `cd packages/ai && npx vitest run src/__tests__/assistant-gate.test.ts`
Expected: PASS (3 теста).

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/assistant/gate.ts packages/ai/src/__tests__/assistant-gate.test.ts
git commit -m "feat(ai): assistant domain gate classifier"
```

---

### Task 4: Ретрив уроков + задач (`retrieve.ts`)

Переиспользует `searchChunks` (уроки) + `searchJobsByEmbedding`/`aggregateChunksToJobs`/`mergeJobCandidates` (задачи). `expandSellerQuery` применяется к строке для эмбеддинга.

**Files:**
- Create: `packages/ai/src/assistant/retrieve.ts`
- Test: `packages/ai/src/__tests__/assistant-retrieve.test.ts`

- [ ] **Step 1: Написать падающий тест**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const searchChunksMock = vi.fn();
const searchJobsMock = vi.fn();
const aggregateMock = vi.fn();
const mergeMock = vi.fn();
const findManyMock = vi.fn();

vi.mock('../retrieval', () => ({ searchChunks: (...a: unknown[]) => searchChunksMock(...a) }));
vi.mock('../intent/retrieval', () => ({
  searchJobsByEmbedding: (...a: unknown[]) => searchJobsMock(...a),
  aggregateChunksToJobs: (...a: unknown[]) => aggregateMock(...a),
  mergeJobCandidates: (...a: unknown[]) => mergeMock(...a),
}));
vi.mock('../seller-lexicon', () => ({ expandSellerQuery: (q: string) => q + ' [exp]' }));
vi.mock('@mpstats/db', () => ({ prisma: { lesson: { findMany: (...a: unknown[]) => findManyMock(...a) } } }));

import { retrieveForAssistant } from '../assistant/retrieve';

describe('retrieveForAssistant', () => {
  beforeEach(() => { searchChunksMock.mockReset(); searchJobsMock.mockReset(); aggregateMock.mockReset(); mergeMock.mockReset(); findManyMock.mockReset(); });

  it('группирует чанки в уроки и обогащает заголовками', async () => {
    searchChunksMock.mockResolvedValue([
      { lesson_id: 'L1', content: 'про ДРР ...', similarity: 0.8 },
      { lesson_id: 'L1', content: 'ещё ...', similarity: 0.6 },
      { lesson_id: 'L2', content: 'реклама ...', similarity: 0.7 },
    ]);
    searchJobsMock.mockResolvedValue([]); aggregateMock.mockResolvedValue([]); mergeMock.mockResolvedValue([]);
    findManyMock.mockResolvedValue([
      { id: 'L1', title: 'ДРР урок', durationMin: 12, course: { title: 'Реклама' } },
      { id: 'L2', title: 'Ставки', durationMin: 9, course: { title: 'Реклама' } },
    ]);

    const { lessons, jobs } = await retrieveForAssistant('что такое ДРР');

    expect(searchJobsMock).toHaveBeenCalledWith('что такое ДРР', expect.any(Object));
    expect(lessons).toHaveLength(2);
    const l1 = lessons.find((l) => l.lessonId === 'L1')!;
    expect(l1.title).toBe('ДРР урок');
    expect(l1.similarity).toBeCloseTo(0.8); // top-similarity на урок
    expect(jobs).toEqual([]);
  });
});
```

- [ ] **Step 2: Прогнать — убедиться, что падает**

Run: `cd packages/ai && npx vitest run src/__tests__/assistant-retrieve.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать retrieve.ts**

```ts
import { prisma } from '@mpstats/db';
import { searchChunks } from '../retrieval';
import { expandSellerQuery } from '../seller-lexicon';
import { searchJobsByEmbedding, aggregateChunksToJobs, mergeJobCandidates } from '../intent/retrieval';
import type { LessonCandidate } from './types';
import type { JobCandidate } from '../intent/types';

const LESSON_CHUNK_LIMIT = 12;
const LESSON_TOP = 6;
const JOB_EMB_LIMIT = 8;
const JOB_CHUNK_LIMIT = 24;
const JOB_TOP = 4;

export interface AssistantRetrieval {
  lessons: LessonCandidate[];
  jobs: JobCandidate[];
}

// Уроки: чанки → группировка по lesson_id (top-similarity) → обогащение заголовком/курсом.
async function retrieveLessons(query: string): Promise<LessonCandidate[]> {
  const chunks = await searchChunks({
    query,
    limit: LESSON_CHUNK_LIMIT,
    threshold: 0.5,
    sourceTypes: ['academy_audio', 'academy_video_frame', 'academy_text'],
    trustTiers: [1],
  });
  if (chunks.length === 0) return [];

  // top-similarity + первый сниппет на урок
  const byLesson = new Map<string, { sim: number; snippet: string }>();
  for (const c of chunks) {
    const cur = byLesson.get(c.lesson_id);
    if (!cur || c.similarity > cur.sim) {
      byLesson.set(c.lesson_id, { sim: c.similarity, snippet: c.content.slice(0, 200) });
    }
  }
  const lessonIds = Array.from(byLesson.keys());
  const rows = await prisma.lesson.findMany({
    where: { id: { in: lessonIds }, isHidden: false, course: { isHidden: false } },
    select: { id: true, title: true, durationMin: true, course: { select: { title: true } } },
  });
  const meta = new Map(rows.map((r) => [r.id, r]));

  return lessonIds
    .filter((id) => meta.has(id))
    .map((id) => {
      const m = meta.get(id)!;
      const agg = byLesson.get(id)!;
      return {
        lessonId: id,
        title: m.title,
        durationMin: m.durationMin ?? null,
        courseTitle: m.course?.title ?? null,
        snippet: agg.snippet,
        similarity: agg.sim,
      } satisfies LessonCandidate;
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, LESSON_TOP);
}

// Задачи: реюз intent-ретрива (job embedding + chunk aggregation + merge).
async function retrieveJobs(query: string): Promise<JobCandidate[]> {
  const [emb, chunkHits] = await Promise.all([
    searchJobsByEmbedding(query, { limit: JOB_EMB_LIMIT, threshold: 0.2 }),
    aggregateChunksToJobs(query, { chunkLimit: JOB_CHUNK_LIMIT }),
  ]);
  const merged = await mergeJobCandidates(emb, chunkHits);
  return merged.slice(0, JOB_TOP);
}

export async function retrieveForAssistant(query: string): Promise<AssistantRetrieval> {
  const expanded = expandSellerQuery(query);
  const [lessons, jobs] = await Promise.all([
    retrieveLessons(expanded),
    retrieveJobs(query), // intent-функции сами вызывают expandSellerQuery внутри
  ]);
  return { lessons, jobs };
}
```

Примечание: `searchChunks`/intent-функции сами эмбеддят строку (внутри вызывают `embedQuery`). `expandSellerQuery` к уроку применяем на нашем уровне; для задач intent-цепочка расширяет сама (см. `resolveIntent`) — потому передаём сырой `query`.

- [ ] **Step 4: Прогнать — убедиться, что проходит**

Run: `cd packages/ai && npx vitest run src/__tests__/assistant-retrieve.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/assistant/retrieve.ts packages/ai/src/__tests__/assistant-retrieve.test.ts
git commit -m "feat(ai): assistant retrieval (lessons + jobs reuse)"
```

---

### Task 5: LLM-синтез с whitelist (`synthesize.ts`)

**Files:**
- Create: `packages/ai/src/assistant/synthesize.ts`
- Test: `packages/ai/src/__tests__/assistant-synthesize.test.ts`

- [ ] **Step 1: Написать падающий тест**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const createMock = vi.fn();
vi.mock('../openrouter', () => ({
  getOpenRouterClient: () => ({ chat: { completions: { create: createMock } } }),
  MODELS: { chat: 'openai/gpt-4.1-mini' },
}));

import { synthesizeAssistantResponse } from '../assistant/synthesize';
import type { LessonCandidate } from '../assistant/types';
import type { JobCandidate } from '../intent/types';

const lessonCands: LessonCandidate[] = [
  { lessonId: 'L1', title: 'ДРР урок', durationMin: 12, courseTitle: 'Реклама', snippet: '...', similarity: 0.8 },
];
const jobCands = [
  { jobId: 'J1', title: 'Настроить рекламу WB', slug: 'nastroit-reklamu', lessonCount: 7 } as JobCandidate,
];

function mockReply(json: unknown) {
  createMock.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(json) } }] });
}

describe('synthesizeAssistantResponse', () => {
  beforeEach(() => createMock.mockReset());

  it('обогащает whitelisted lessonIds/jobIds метаданными кандидатов', async () => {
    mockReply({
      answer: 'ДРР — доля рекламных расходов ...',
      lessonIds: ['L1'],
      jobIds: ['J1'],
    });
    const r = await synthesizeAssistantResponse({ query: 'ДРР?', history: [], lessonCandidates: lessonCands, jobCandidates: jobCands });
    expect(r.inDomain).toBe(true);
    expect(r.answer).toContain('ДРР');
    expect(r.lessons[0].title).toBe('ДРР урок'); // из кандидата, не из LLM
    expect(r.jobs[0].slug).toBe('nastroit-reklamu');
  });

  it('выбрасывает выдуманные id, которых нет в кандидатах (anti-hallucination)', async () => {
    mockReply({ answer: 'текст', lessonIds: ['GHOST', 'L1'], jobIds: ['FAKE'] });
    const r = await synthesizeAssistantResponse({ query: 'q', history: [], lessonCandidates: lessonCands, jobCandidates: jobCands });
    expect(r.lessons.map((l) => l.lessonId)).toEqual(['L1']);
    expect(r.jobs).toEqual([]);
  });

  it('при невалидном JSON возвращает fallback-ответ без карточек', async () => {
    createMock.mockResolvedValueOnce({ choices: [{ message: { content: 'сломано' } }] });
    const r = await synthesizeAssistantResponse({ query: 'q', history: [], lessonCandidates: lessonCands, jobCandidates: jobCands });
    expect(r.inDomain).toBe(true);
    expect(r.lessons).toEqual([]);
    expect(r.answer.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Прогнать — убедиться, что падает**

Run: `cd packages/ai && npx vitest run src/__tests__/assistant-synthesize.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать synthesize.ts**

```ts
import { z } from 'zod';
import { getOpenRouterClient, MODELS } from '../openrouter';
import { fixBrandNames } from '../generation';
import type { AssistantHistoryMessage, AssistantTurnResult, LessonCandidate } from './types';
import type { JobCandidate } from '../intent/types';

export interface SynthesizeArgs {
  query: string;
  history: AssistantHistoryMessage[];
  lessonCandidates: LessonCandidate[];
  jobCandidates: JobCandidate[];
}

const llmSchema = z.object({
  answer: z.string().min(1),
  lessonIds: z.array(z.string()).default([]),
  jobIds: z.array(z.string()).default([]),
});

const FALLBACK_ANSWER =
  'Кажется, я не смог собрать точный ответ. Переформулируй вопрос — или загляни в Базу знаний, там есть материалы по большинству тем.';

const SYSTEM = `Ты — помощник обучающей платформы для селлеров Wildberries и Ozon. Отвечай по-русски, кратко и по делу.

ПРАВИЛА:
1. Отвечай по существу на вопрос про бизнес продавца (механика МП, финансы бизнеса, реклама, аналитика, операционка). Если в КОНТЕКСТЕ есть релевантные материалы — опирайся на них; если нет — можешь ответить общими знаниями в рамках темы селлера.
2. НЕ выдумывай живые рыночные данные (какие ниши горячи, конкретные цифры спроса) и НЕ давай директивных финсоветов «вложи сюда». На такие вопросы объясняй МЕТОД и предлагай проверить гипотезы в сервисе MPSTATS.
3. Подмешивай к ответу ТОЛЬКО те уроки/задачи, id которых есть в списке КАНДИДАТОВ ниже. Не придумывай id. Если ничего не подходит — верни пустые массивы.

Верни СТРОГО JSON:
{"answer": "<markdown-ответ>", "lessonIds": ["<id из кандидатов>"], "jobIds": ["<id из кандидатов>"]}`;

function buildUserMessage(args: SynthesizeArgs): string {
  const lessons = args.lessonCandidates
    .map((l) => `- УРОК id=${l.lessonId} | ${l.title} | ${l.snippet}`)
    .join('\n');
  const jobs = args.jobCandidates
    .map((j) => `- ЗАДАЧА id=${j.jobId} | ${j.title} (${j.lessonCount} уроков)`)
    .join('\n');
  const hist = args.history
    .slice(-10)
    .map((m) => `${m.role === 'user' ? 'Юзер' : 'Ассистент'}: ${m.content}`)
    .join('\n');

  return `ИСТОРИЯ ДИАЛОГА:\n${hist || '(пусто)'}\n\nВОПРОС: ${args.query}\n\nКАНДИДАТЫ-УРОКИ:\n${lessons || '(нет)'}\n\nКАНДИДАТЫ-ЗАДАЧИ:\n${jobs || '(нет)'}`;
}

export async function synthesizeAssistantResponse(args: SynthesizeArgs): Promise<AssistantTurnResult> {
  let parsed: z.infer<typeof llmSchema> | null = null;
  try {
    const client = getOpenRouterClient();
    const resp = await client.chat.completions.create({
      model: MODELS.chat,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: buildUserMessage(args) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });
    const raw = resp.choices[0]?.message?.content ?? '';
    const json = JSON.parse(raw);
    const result = llmSchema.safeParse(json);
    if (result.success) parsed = result.data;
  } catch {
    parsed = null;
  }

  if (!parsed) {
    return { inDomain: true, answer: FALLBACK_ANSWER, lessons: [], jobs: [] };
  }

  // Whitelist: только id из кандидатов ретрива, метаданные — из кандидатов, не из LLM.
  const lessonById = new Map(args.lessonCandidates.map((l) => [l.lessonId, l]));
  const jobById = new Map(args.jobCandidates.map((j) => [j.jobId, j]));

  const lessons = parsed.lessonIds
    .filter((id) => lessonById.has(id))
    .map((id) => {
      const m = lessonById.get(id)!;
      return { lessonId: id, title: m.title, durationMin: m.durationMin, courseTitle: m.courseTitle, reason: '' };
    });

  const jobs = parsed.jobIds
    .filter((id) => jobById.has(id))
    .map((id) => {
      const m = jobById.get(id)!;
      return { jobId: id, title: m.title, slug: m.slug, lessonCount: m.lessonCount, reason: '' };
    });

  return { inDomain: true, answer: fixBrandNames(parsed.answer), lessons, jobs };
}
```

Примечание: `reason` оставлен пустым (LLM в этой схеме не возвращает per-item причины ради простоты; карточка показывает title+meta). Если позже захотим причины — расширить схему до `lessons: [{lessonId, reason}]` как в intent.

- [ ] **Step 4: Прогнать — убедиться, что проходит**

Run: `cd packages/ai && npx vitest run src/__tests__/assistant-synthesize.test.ts`
Expected: PASS (3 теста).

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/assistant/synthesize.ts packages/ai/src/__tests__/assistant-synthesize.test.ts
git commit -m "feat(ai): assistant LLM synthesis with candidate whitelist"
```

---

### Task 6: Оркестратор пайплайна (`pipeline.ts`)

**Files:**
- Create: `packages/ai/src/assistant/pipeline.ts`
- Test: `packages/ai/src/__tests__/assistant-pipeline.test.ts`

- [ ] **Step 1: Написать падающий тест**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const gateMock = vi.fn();
const retrieveMock = vi.fn();
const synthMock = vi.fn();
vi.mock('../assistant/gate', () => ({ classifyDomain: (...a: unknown[]) => gateMock(...a) }));
vi.mock('../assistant/retrieve', () => ({ retrieveForAssistant: (...a: unknown[]) => retrieveMock(...a) }));
vi.mock('../assistant/synthesize', () => ({ synthesizeAssistantResponse: (...a: unknown[]) => synthMock(...a) }));

import { runAssistantPipeline } from '../assistant/pipeline';

describe('runAssistantPipeline', () => {
  beforeEach(() => { gateMock.mockReset(); retrieveMock.mockReset(); synthMock.mockReset(); });

  it('офф-топик: возвращает inDomain=false без ретрива и синтеза', async () => {
    gateMock.mockResolvedValue({ inDomain: false });
    const r = await runAssistantPipeline({ query: 'напиши стих', history: [] });
    expect(r.inDomain).toBe(false);
    expect(r.lessons).toEqual([]);
    expect(retrieveMock).not.toHaveBeenCalled();
    expect(synthMock).not.toHaveBeenCalled();
    expect(r.answer.length).toBeGreaterThan(0);
  });

  it('in-domain: гоняет ретрив + синтез', async () => {
    gateMock.mockResolvedValue({ inDomain: true });
    retrieveMock.mockResolvedValue({ lessons: [{ lessonId: 'L1' }], jobs: [] });
    synthMock.mockResolvedValue({ inDomain: true, answer: 'ответ', lessons: [], jobs: [] });
    const r = await runAssistantPipeline({ query: 'что такое ДРР', history: [] });
    expect(retrieveMock).toHaveBeenCalledWith('что такое ДРР');
    expect(synthMock).toHaveBeenCalled();
    expect(r.answer).toBe('ответ');
  });
});
```

- [ ] **Step 2: Прогнать — убедиться, что падает**

Run: `cd packages/ai && npx vitest run src/__tests__/assistant-pipeline.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать pipeline.ts**

```ts
import { classifyDomain } from './gate';
import { retrieveForAssistant } from './retrieve';
import { synthesizeAssistantResponse } from './synthesize';
import type { AssistantHistoryMessage, AssistantTurnResult } from './types';

export interface AssistantPipelineArgs {
  query: string;
  history: AssistantHistoryMessage[];
}

const OFF_DOMAIN_REPLY =
  'Я помощник по обучению продажам на маркетплейсах — помогаю разобраться в WB/Ozon, рекламе, аналитике, финансах бизнеса и подобрать уроки. С этим вопросом помочь не смогу, но спроси что-нибудь про твой бизнес на маркетплейсе — с удовольствием разберу.';

export async function runAssistantPipeline(args: AssistantPipelineArgs): Promise<AssistantTurnResult> {
  const gate = await classifyDomain(args.query);
  if (!gate.inDomain) {
    return { inDomain: false, answer: OFF_DOMAIN_REPLY, lessons: [], jobs: [] };
  }

  const { lessons, jobs } = await retrieveForAssistant(args.query);
  return synthesizeAssistantResponse({
    query: args.query,
    history: args.history,
    lessonCandidates: lessons,
    jobCandidates: jobs,
  });
}
```

- [ ] **Step 4: Прогнать — убедиться, что проходит**

Run: `cd packages/ai && npx vitest run src/__tests__/assistant-pipeline.test.ts`
Expected: PASS (2 теста).

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/assistant/pipeline.ts packages/ai/src/__tests__/assistant-pipeline.test.ts
git commit -m "feat(ai): assistant pipeline orchestrator"
```

---

### Task 7: Barrel-экспорты пакета

**Files:**
- Create: `packages/ai/src/assistant/index.ts`
- Modify: `packages/ai/src/index.ts`

- [ ] **Step 1: Написать assistant/index.ts**

```ts
export * from './types';
export { runAssistantPipeline } from './pipeline';
export type { AssistantPipelineArgs } from './pipeline';
```

- [ ] **Step 2: Добавить реэкспорт в packages/ai/src/index.ts**

В конец файла (рядом с `export ... from './intent'`) добавь:

```ts
export {
  runAssistantPipeline,
  type AssistantTurnResult,
  type AssistantLessonRef,
  type AssistantJobRef,
  type AssistantHistoryMessage,
  type AssistantPipelineArgs,
} from './assistant';
```

- [ ] **Step 3: Typecheck пакета**

Run: `cd packages/ai && npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 4: Прогнать все тесты пакета ai**

Run: `cd packages/ai && npx vitest run`
Expected: все зелёные (включая 4 новых assistant-файла).

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/assistant/index.ts packages/ai/src/index.ts
git commit -m "feat(ai): export assistant pipeline from package barrel"
```

---

## Wave 2 — API-слой (packages/api)

### Task 8: Квота ассистента (`assistant-quota.ts`)

Тир (free vs full) + дневной cap + МСК-полночь. Считаем из БД (переживает рестарты; офф-топик не в счёте).

**Files:**
- Create: `packages/api/src/utils/assistant-quota.ts`
- Test: `packages/api/src/__tests__/assistant-quota.test.ts`

- [ ] **Step 1: Написать падающий тест**

```ts
import { describe, it, expect, vi } from 'vitest';
import { startOfMskDay, FREE_DAILY, PAID_DAILY, getAssistantQuota } from '../utils/assistant-quota';

describe('startOfMskDay', () => {
  it('11:00 UTC 8 июля → полночь МСК = 21:00 UTC 7 июля', () => {
    const d = startOfMskDay(new Date('2026-07-08T11:00:00Z'));
    expect(d.toISOString()).toBe('2026-07-07T21:00:00.000Z');
  });
  it('01:00 UTC (04:00 МСК) → полночь МСК = 21:00 UTC предыдущего дня', () => {
    const d = startOfMskDay(new Date('2026-07-08T01:00:00Z'));
    expect(d.toISOString()).toBe('2026-07-07T21:00:00.000Z');
  });
});

describe('getAssistantQuota', () => {
  function fakePrisma(subCount: number, msgCount: number, role = 'ADMIN_NONE') {
    return {
      subscription: { findMany: vi.fn().mockResolvedValue(Array.from({ length: subCount }, () => ({ id: 'x', courseId: null, plan: { type: 'PLATFORM' } }))) },
      userProfile: { findUnique: vi.fn().mockResolvedValue({ role: role === 'ADMIN' ? 'ADMIN' : 'USER' }) },
      assistantMessage: { count: vi.fn().mockResolvedValue(msgCount) },
    } as any;
  }

  it('free-тир: нет активных подписок → лимит 5', async () => {
    const q = await getAssistantQuota('u1', fakePrisma(0, 2), new Date('2026-07-08T11:00:00Z'));
    expect(q.tier).toBe('free');
    expect(q.limit).toBe(FREE_DAILY);
    expect(q.remaining).toBe(3);
  });

  it('full-тир: есть активная подписка → лимит 50', async () => {
    const q = await getAssistantQuota('u1', fakePrisma(1, 10), new Date('2026-07-08T11:00:00Z'));
    expect(q.tier).toBe('full');
    expect(q.limit).toBe(PAID_DAILY);
    expect(q.remaining).toBe(40);
  });

  it('remaining не уходит в минус', async () => {
    const q = await getAssistantQuota('u1', fakePrisma(0, 99), new Date('2026-07-08T11:00:00Z'));
    expect(q.remaining).toBe(0);
  });
});
```

- [ ] **Step 2: Прогнать — убедиться, что падает**

Run: `cd packages/api && npx vitest run src/__tests__/assistant-quota.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать assistant-quota.ts**

```ts
import type { PrismaClient } from '@mpstats/db';
import { getUserActiveSubscriptions, getUserAdminBypass } from './access';

export const FREE_DAILY = 5;
export const PAID_DAILY = 50;
export const BURST_PER_MIN = 6; // enforced отдельно middleware'ом в роутере

const MSK_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC+3, без DST

export type AssistantTier = 'free' | 'full';

export interface AssistantQuota {
  tier: AssistantTier;
  limit: number;
  used: number;
  remaining: number;
  resetsAt: Date; // следующая полночь МСК (в UTC)
}

// Полночь текущего МСК-дня, выраженная как UTC-инстант.
export function startOfMskDay(now: Date): Date {
  const shifted = new Date(now.getTime() + MSK_OFFSET_MS);
  const midnightMsk = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  return new Date(midnightMsk - MSK_OFFSET_MS);
}

function nextMskMidnight(now: Date): Date {
  return new Date(startOfMskDay(now).getTime() + 24 * 60 * 60 * 1000);
}

export async function getAssistantQuota(
  userId: string,
  prisma: PrismaClient,
  now: Date,
): Promise<AssistantQuota> {
  const [subs, isAdmin] = await Promise.all([
    getUserActiveSubscriptions(userId, prisma),
    getUserAdminBypass(userId, prisma),
  ]);
  const full = isAdmin || subs.length > 0;
  const limit = full ? PAID_DAILY : FREE_DAILY;

  const since = startOfMskDay(now);
  const used = await prisma.assistantMessage.count({
    where: {
      role: 'assistant',
      inDomain: true,
      createdAt: { gte: since },
      conversation: { userId },
    },
  });

  return {
    tier: full ? 'full' : 'free',
    limit,
    used,
    remaining: Math.max(0, limit - used),
    resetsAt: nextMskMidnight(now),
  };
}
```

- [ ] **Step 4: Прогнать — убедиться, что проходит**

Run: `cd packages/api && npx vitest run src/__tests__/assistant-quota.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/utils/assistant-quota.ts packages/api/src/__tests__/assistant-quota.test.ts
git commit -m "feat(api): assistant daily quota by tier (MSK reset)"
```

---

### Task 9: Роутер `assistant` — `sendMessage`

**Files:**
- Create: `packages/api/src/routers/assistant.ts`
- Test: `packages/api/src/routers/__tests__/assistant.test.ts`

- [ ] **Step 1: Написать падающий тест**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const pipelineMock = vi.fn();
vi.mock('@mpstats/ai', () => ({ runAssistantPipeline: (...a: unknown[]) => pipelineMock(...a) }));

const quotaMock = vi.fn();
vi.mock('../../utils/assistant-quota', async (orig) => {
  const actual = await (orig as any)();
  return { ...actual, getAssistantQuota: (...a: unknown[]) => quotaMock(...a) };
});

import { assistantRouter } from '../assistant';

function makeCtx() {
  const conversation = { id: 'C1', userId: 'u1' };
  const prisma = {
    assistantConversation: {
      findFirst: vi.fn().mockResolvedValue(conversation),
      create: vi.fn().mockResolvedValue(conversation),
    },
    assistantMessage: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
    },
  };
  return { prisma, user: { id: 'u1' } } as any;
}

describe('assistant.sendMessage', () => {
  beforeEach(() => { pipelineMock.mockReset(); quotaMock.mockReset(); });

  it('блокирует при исчерпанной квоте (FORBIDDEN)', async () => {
    quotaMock.mockResolvedValue({ tier: 'free', limit: 5, used: 5, remaining: 0, resetsAt: new Date() });
    const ctx = makeCtx();
    const caller = assistantRouter.createCaller(ctx);
    await expect(caller.sendMessage({ message: 'привет' })).rejects.toThrow(/quota/);
    expect(pipelineMock).not.toHaveBeenCalled();
  });

  it('гоняет пайплайн, персистит user+assistant сообщения, возвращает ответ+квоту', async () => {
    quotaMock
      .mockResolvedValueOnce({ tier: 'full', limit: 50, used: 0, remaining: 50, resetsAt: new Date() })  // pre-check
      .mockResolvedValueOnce({ tier: 'full', limit: 50, used: 1, remaining: 49, resetsAt: new Date() }); // after
    pipelineMock.mockResolvedValue({ inDomain: true, answer: 'ответ про ДРР', lessons: [{ lessonId: 'L1', title: 'x', durationMin: 5, courseTitle: null, reason: '' }], jobs: [] });
    const ctx = makeCtx();
    const caller = assistantRouter.createCaller(ctx);
    const res = await caller.sendMessage({ message: 'что такое ДРР' });
    expect(res.answer).toBe('ответ про ДРР');
    expect(res.lessons).toHaveLength(1);
    expect(res.quota.remaining).toBe(49);
    // user + assistant сообщения записаны
    expect(ctx.prisma.assistantMessage.create).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Прогнать — убедиться, что падает**

Run: `cd packages/api && npx vitest run src/routers/__tests__/assistant.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать assistant.ts (пока только sendMessage + хелперы)**

```ts
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { runAssistantPipeline } from '@mpstats/ai';
import { router, protectedProcedure } from '../trpc';
import { createRateLimitMiddleware } from '../middleware/rate-limit';
import { getAssistantQuota, BURST_PER_MIN } from '../utils/assistant-quota';
import type { Context } from '../trpc';

// protected + минутный анти-скрипт (6/мин). Дневной cap — в самой процедуре по тиру.
const assistantProcedure = protectedProcedure.use(
  createRateLimitMiddleware(BURST_PER_MIN, 60_000, 'assistant'),
);

const HISTORY_WINDOW = 10;

async function getOrCreateActiveConversation(userId: string, prisma: Context['prisma']) {
  const existing = await prisma.assistantConversation.findFirst({
    where: { userId, status: 'active' },
    orderBy: { updatedAt: 'desc' },
  });
  if (existing) return existing;
  return prisma.assistantConversation.create({ data: { userId, status: 'active' } });
}

export const assistantRouter = router({
  sendMessage: assistantProcedure
    .input(z.object({ message: z.string().min(1).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const message = input.message.trim();

      // 1. Дневная квота (in-domain answers с полуночи МСК).
      const quota = await getAssistantQuota(userId, ctx.prisma, new Date());
      if (quota.remaining <= 0) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: JSON.stringify({ reason: 'quota', resetsAt: quota.resetsAt.toISOString(), tier: quota.tier }),
        });
      }

      // 2. Активная нить + история.
      const convo = await getOrCreateActiveConversation(userId, ctx.prisma);
      const historyRows = await ctx.prisma.assistantMessage.findMany({
        where: { conversationId: convo.id },
        orderBy: { createdAt: 'desc' },
        take: HISTORY_WINDOW,
      });
      const history = historyRows
        .reverse()
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      // 3. Персист user-сообщения.
      await ctx.prisma.assistantMessage.create({
        data: { conversationId: convo.id, role: 'user', content: message },
      });

      // 4. Пайплайн.
      const result = await runAssistantPipeline({ query: message, history });

      // 5. Персист assistant-сообщения (+ bump updatedAt нити).
      await ctx.prisma.assistantMessage.create({
        data: {
          conversationId: convo.id,
          role: 'assistant',
          content: result.answer,
          lessonIds: result.lessons.map((l) => l.lessonId),
          jobIds: result.jobs.map((j) => j.jobId),
          inDomain: result.inDomain,
        },
      });
      await ctx.prisma.assistantConversation.update({
        where: { id: convo.id },
        data: { updatedAt: new Date() },
      });

      // 6. Свежая квота после хода.
      const quotaAfter = await getAssistantQuota(userId, ctx.prisma, new Date());
      return { ...result, quota: quotaAfter };
    }),
});
```

Примечание: если `Context` не экспортируется как type из `../trpc` — замени `Context['prisma']` на импорт `PrismaClient` из `@mpstats/db`.

- [ ] **Step 4: Прогнать — убедиться, что проходит**

Run: `cd packages/api && npx vitest run src/routers/__tests__/assistant.test.ts`
Expected: PASS (2 теста).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routers/assistant.ts packages/api/src/routers/__tests__/assistant.test.ts
git commit -m "feat(api): assistant.sendMessage with quota gate + persistence"
```

---

### Task 10: Роутер `assistant` — `getConversation`, `getQuota`, `resetConversation`

**Files:**
- Modify: `packages/api/src/routers/assistant.ts`
- Test: `packages/api/src/routers/__tests__/assistant.test.ts` (дополнить)

- [ ] **Step 1: Дописать падающие тесты**

Добавь в тот же describe-файл:

```ts
describe('assistant.getConversation', () => {
  it('возвращает сообщения активной нити с обогащёнными карточками', async () => {
    const prisma = {
      assistantConversation: { findFirst: vi.fn().mockResolvedValue({ id: 'C1', userId: 'u1' }) },
      assistantMessage: { findMany: vi.fn().mockResolvedValue([
        { role: 'user', content: 'ДРР?', lessonIds: [], jobIds: [], inDomain: true },
        { role: 'assistant', content: 'ответ', lessonIds: ['L1'], jobIds: [], inDomain: true },
      ]) },
      lesson: { findMany: vi.fn().mockResolvedValue([{ id: 'L1', title: 'ДРР урок', durationMin: 12, course: { title: 'Реклама' } }]) },
      job: { findMany: vi.fn().mockResolvedValue([]) },
    } as any;
    const caller = assistantRouter.createCaller({ prisma, user: { id: 'u1' } } as any);
    const res = await caller.getConversation();
    expect(res.messages).toHaveLength(2);
    expect(res.messages[1].lessons[0].title).toBe('ДРР урок');
  });

  it('пустая нить → пустой массив', async () => {
    const prisma = { assistantConversation: { findFirst: vi.fn().mockResolvedValue(null) } } as any;
    const caller = assistantRouter.createCaller({ prisma, user: { id: 'u1' } } as any);
    const res = await caller.getConversation();
    expect(res.messages).toEqual([]);
  });
});

describe('assistant.resetConversation', () => {
  it('архивирует активную нить', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = { assistantConversation: { updateMany } } as any;
    const caller = assistantRouter.createCaller({ prisma, user: { id: 'u1' } } as any);
    const res = await caller.resetConversation();
    expect(res.ok).toBe(true);
    expect(updateMany).toHaveBeenCalledWith({ where: { userId: 'u1', status: 'active' }, data: { status: 'archived' } });
  });
});
```

- [ ] **Step 2: Прогнать — убедиться, что новые падают**

Run: `cd packages/api && npx vitest run src/routers/__tests__/assistant.test.ts`
Expected: FAIL — `getConversation`/`resetConversation` не существуют.

- [ ] **Step 3: Дописать процедуры в assistantRouter**

Добавь импорт квоты (`getAssistantQuota` уже импортирован) и три процедуры в объект `router({...})` рядом с `sendMessage`:

```ts
  getQuota: protectedProcedure.query(async ({ ctx }) => {
    return getAssistantQuota(ctx.user.id, ctx.prisma, new Date());
  }),

  resetConversation: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.prisma.assistantConversation.updateMany({
      where: { userId: ctx.user.id, status: 'active' },
      data: { status: 'archived' },
    });
    return { ok: true };
  }),

  getConversation: protectedProcedure.query(async ({ ctx }) => {
    const convo = await ctx.prisma.assistantConversation.findFirst({
      where: { userId: ctx.user.id, status: 'active' },
      orderBy: { updatedAt: 'desc' },
    });
    if (!convo) return { messages: [] as EnrichedMessage[] };

    const rows = await ctx.prisma.assistantMessage.findMany({
      where: { conversationId: convo.id },
      orderBy: { createdAt: 'asc' },
    });

    // Батч-обогащение всех упомянутых id → карточки.
    const allLessonIds = Array.from(new Set(rows.flatMap((r) => r.lessonIds)));
    const allJobIds = Array.from(new Set(rows.flatMap((r) => r.jobIds)));
    const [lessons, jobs] = await Promise.all([
      allLessonIds.length
        ? ctx.prisma.lesson.findMany({
            where: { id: { in: allLessonIds }, isHidden: false, course: { isHidden: false } },
            select: { id: true, title: true, durationMin: true, course: { select: { title: true } } },
          })
        : Promise.resolve([]),
      allJobIds.length
        ? ctx.prisma.job.findMany({
            where: { id: { in: allJobIds }, isPublished: true },
            select: { id: true, title: true, slug: true, _count: { select: { lessons: true } } },
          })
        : Promise.resolve([]),
    ]);
    const lessonMap = new Map(lessons.map((l) => [l.id, l]));
    const jobMap = new Map(jobs.map((j) => [j.id, j]));

    const messages: EnrichedMessage[] = rows.map((r) => ({
      role: r.role as 'user' | 'assistant',
      content: r.content,
      inDomain: r.inDomain,
      lessons: r.lessonIds
        .filter((id) => lessonMap.has(id))
        .map((id) => {
          const l = lessonMap.get(id)!;
          return { lessonId: l.id, title: l.title, durationMin: l.durationMin ?? null, courseTitle: l.course?.title ?? null, reason: '' };
        }),
      jobs: r.jobIds
        .filter((id) => jobMap.has(id))
        .map((id) => {
          const j = jobMap.get(id)!;
          return { jobId: j.id, title: j.title, slug: j.slug, lessonCount: j._count.lessons, reason: '' };
        }),
    }));

    return { messages };
  }),
```

И в начало файла добавь тип для обогащённого сообщения:

```ts
import type { AssistantLessonRef, AssistantJobRef } from '@mpstats/ai';

interface EnrichedMessage {
  role: 'user' | 'assistant';
  content: string;
  inDomain: boolean;
  lessons: AssistantLessonRef[];
  jobs: AssistantJobRef[];
}
```

- [ ] **Step 4: Прогнать — убедиться, что все проходят**

Run: `cd packages/api && npx vitest run src/routers/__tests__/assistant.test.ts`
Expected: PASS (все, включая новые).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routers/assistant.ts packages/api/src/routers/__tests__/assistant.test.ts
git commit -m "feat(api): assistant getConversation/getQuota/resetConversation"
```

---

### Task 11: Регистрация роутера

**Files:**
- Modify: `packages/api/src/root.ts`

- [ ] **Step 1: Добавить импорт и регистрацию**

В `packages/api/src/root.ts` добавь импорт рядом с прочими роутерами:

```ts
import { assistantRouter } from './routers/assistant';
```

И строку в объект `router({...})` (рядом с `intent: intentRouter,`):

```ts
  assistant: assistantRouter,
```

- [ ] **Step 2: Typecheck API-пакета**

Run: `cd packages/api && npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 3: Прогнать все тесты API**

Run: `cd packages/api && npx vitest run`
Expected: все зелёные.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/root.ts
git commit -m "feat(api): register assistant router"
```

---

## Wave 3 — Фронтенд (apps/web)

### Task 12: Примитив `Sheet` (правый drawer)

Shadcn Sheet поверх уже установленного `@radix-ui/react-dialog`. Новых пакетов не тянет.

**Files:**
- Create: `apps/web/src/components/ui/sheet.tsx`

- [ ] **Step 1: Написать sheet.tsx**

```tsx
'use client';

import * as React from 'react';
import * as SheetPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

const Sheet = SheetPrimitive.Root;
const SheetTrigger = SheetPrimitive.Trigger;
const SheetClose = SheetPrimitive.Close;
const SheetPortal = SheetPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className,
    )}
    {...props}
  />
));
SheetOverlay.displayName = 'SheetOverlay';

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content> & { hideClose?: boolean }
>(({ className, children, hideClose, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <SheetPrimitive.Content
      ref={ref}
      className={cn(
        'fixed inset-y-0 right-0 z-50 flex h-full w-full flex-col bg-white shadow-xl sm:max-w-[450px]',
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right duration-300',
        className,
      )}
      {...props}
    >
      {children}
      {!hideClose && (
        <SheetPrimitive.Close className="absolute right-4 top-4 rounded-md opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-mp-blue-500">
          <X className="h-5 w-5" />
          <span className="sr-only">Закрыть</span>
        </SheetPrimitive.Close>
      )}
    </SheetPrimitive.Content>
  </SheetPortal>
));
SheetContent.displayName = 'SheetContent';

export { Sheet, SheetTrigger, SheetClose, SheetContent };
```

- [ ] **Step 2: Typecheck web (быстрый)**

Run: `cd apps/web && npx tsc --noEmit`
Expected: без новых ошибок в sheet.tsx (если `lucide-react`/`@radix-ui/react-dialog`/`@/lib/utils` резолвятся — они уже используются в `dialog.tsx`).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/ui/sheet.tsx
git commit -m "feat(web): Sheet primitive (right drawer over Radix Dialog)"
```

---

### Task 13: Карточки уроков/задач в ответе (`AssistantCards.tsx`)

Лёгкие инлайн-строки + готовый `FavoriteButton` (паттерн `AgentSearch`).

**Files:**
- Create: `apps/web/src/components/assistant/AssistantCards.tsx`
- Test: `apps/web/tests/unit/assistant-cards.test.tsx`

- [ ] **Step 1: Написать падающий тест**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AssistantCards } from '@/components/assistant/AssistantCards';

// FavoriteButton дёргает trpc — мокаем на no-op.
vi.mock('@/components/learning/FavoriteButton', () => ({
  FavoriteButton: () => <button aria-label="В избранное" />,
}));

describe('AssistantCards', () => {
  it('рендерит карточки уроков и задач', () => {
    render(
      <AssistantCards
        lessons={[{ lessonId: 'L1', title: 'ДРР урок', durationMin: 12, courseTitle: 'Реклама', reason: '' }]}
        jobs={[{ jobId: 'J1', title: 'Настроить рекламу', slug: 'nastroit', lessonCount: 7, reason: '' }]}
        favoritedKeys={new Set()}
      />,
    );
    expect(screen.getByText('ДРР урок')).toBeInTheDocument();
    expect(screen.getByText('Настроить рекламу')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ДРР урок/ })).toHaveAttribute('href', '/learn/L1?from=assistant');
    expect(screen.getByRole('link', { name: /Настроить рекламу/ })).toHaveAttribute('href', '/learn/job/nastroit');
  });

  it('ничего не рендерит без карточек', () => {
    const { container } = render(<AssistantCards lessons={[]} jobs={[]} favoritedKeys={new Set()} />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Прогнать — убедиться, что падает**

Run: `cd apps/web && npx vitest run tests/unit/assistant-cards.test.tsx`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать AssistantCards.tsx**

```tsx
'use client';

import Link from 'next/link';
import { FavoriteButton } from '@/components/learning/FavoriteButton';
import type { AssistantLessonRef, AssistantJobRef } from '@mpstats/ai';

interface Props {
  lessons: AssistantLessonRef[];
  jobs: AssistantJobRef[];
  favoritedKeys: Set<string>; // ключи вида "LESSON:<id>" / "JOB:<id>"
}

export function AssistantCards({ lessons, jobs, favoritedKeys }: Props) {
  if (lessons.length === 0 && jobs.length === 0) return null;

  return (
    <div className="mt-2 space-y-2">
      {jobs.map((j) => (
        <div key={`J:${j.jobId}`} className="flex items-center gap-3 rounded-lg border-l-2 border-l-[#4338ca] bg-[#f5f6ff] p-2.5">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-wide text-[#4338ca]">Задача</div>
            <Link href={`/learn/job/${j.slug}`} className="block truncate text-sm font-semibold text-mp-gray-900 hover:underline">
              {j.title}
            </Link>
            <div className="text-xs text-mp-gray-500">{j.lessonCount} уроков · собери план</div>
          </div>
          <FavoriteButton itemType="JOB" itemId={j.jobId} initialFavorited={favoritedKeys.has(`JOB:${j.jobId}`)} />
        </div>
      ))}

      {lessons.map((l) => (
        <div key={`L:${l.lessonId}`} className="flex items-center gap-3 rounded-lg border border-mp-gray-200 bg-white p-2.5">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-wide text-mp-gray-400">Урок</div>
            <Link href={`/learn/${l.lessonId}?from=assistant`} className="block truncate text-sm font-semibold text-mp-gray-900 hover:underline">
              {l.title}
            </Link>
            <div className="text-xs text-mp-gray-500">
              {l.durationMin ? `${l.durationMin} мин` : ''}{l.courseTitle ? ` · ${l.courseTitle}` : ''}
            </div>
          </div>
          <FavoriteButton itemType="LESSON" itemId={l.lessonId} initialFavorited={favoritedKeys.has(`LESSON:${l.lessonId}`)} />
        </div>
      ))}
    </div>
  );
}
```

Примечание: перед реализацией проверь точный путь и пропсы `FavoriteButton` (`apps/web/src/components/learning/FavoriteButton.tsx` — пропсы `itemType: 'LESSON'|'JOB'|'MATERIAL'`, `itemId: string`, `initialFavorited?: boolean`). Если путь/имя иное — поправь импорт.

- [ ] **Step 4: Прогнать — убедиться, что проходит**

Run: `cd apps/web && npx vitest run tests/unit/assistant-cards.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/assistant/AssistantCards.tsx apps/web/tests/unit/assistant-cards.test.tsx
git commit -m "feat(web): AssistantCards (lesson/job rows + favorite)"
```

---

### Task 14: Тело диалога (`AssistantConversation.tsx`)

Non-streaming чат по образцу лессон-чата: оптимистичный user-push, ответ в `onSuccess`, индикатор печати, автоскролл, квота, «Новый разговор».

**Files:**
- Create: `apps/web/src/components/assistant/AssistantConversation.tsx`
- Test: `apps/web/tests/unit/assistant-conversation.test.tsx`

- [ ] **Step 1: Написать падающий тест**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const sendMutate = vi.fn();
const resetMutate = vi.fn();
vi.mock('@/lib/trpc/client', () => ({
  trpc: {
    assistant: {
      getConversation: { useQuery: () => ({ data: { messages: [] }, isLoading: false }) },
      getQuota: { useQuery: () => ({ data: { tier: 'free', limit: 5, used: 0, remaining: 5, resetsAt: new Date().toISOString() } }) },
      sendMessage: { useMutation: (opts: any) => ({ mutate: (v: any) => { sendMutate(v); opts.onSuccess?.({ inDomain: true, answer: 'ответ', lessons: [], jobs: [], quota: { tier: 'free', limit: 5, used: 1, remaining: 4 } }); }, isPending: false }) },
      resetConversation: { useMutation: () => ({ mutate: resetMutate }) },
    },
    favorite: { isFavorited: { useQuery: () => ({ data: { favorited: [] } }) } },
    useUtils: () => ({ assistant: { getConversation: { invalidate: vi.fn() }, getQuota: { invalidate: vi.fn() } } }),
  },
}));
vi.mock('@/components/assistant/AssistantCards', () => ({ AssistantCards: () => null }));

import { AssistantConversation } from '@/components/assistant/AssistantConversation';

describe('AssistantConversation', () => {
  beforeEach(() => { sendMutate.mockReset(); resetMutate.mockReset(); });

  it('отправляет сообщение и показывает ответ ассистента', async () => {
    render(<AssistantConversation />);
    const input = screen.getByPlaceholderText(/Спроси про уроки/i);
    fireEvent.change(input, { target: { value: 'что такое ДРР' } });
    fireEvent.click(screen.getByRole('button', { name: /Отправить/i }));
    expect(sendMutate).toHaveBeenCalledWith({ message: 'что такое ДРР' });
    await waitFor(() => expect(screen.getByText('ответ')).toBeInTheDocument());
    expect(screen.getByText('что такое ДРР')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Прогнать — убедиться, что падает**

Run: `cd apps/web && npx vitest run tests/unit/assistant-conversation.test.tsx`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать AssistantConversation.tsx**

```tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { AssistantCards } from '@/components/assistant/AssistantCards';
import type { AssistantLessonRef, AssistantJobRef } from '@mpstats/ai';

interface UiMessage {
  role: 'user' | 'assistant';
  content: string;
  lessons?: AssistantLessonRef[];
  jobs?: AssistantJobRef[];
}

export function AssistantConversation() {
  const utils = trpc.useUtils();
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Гидратация истории при первом открытии.
  const { data: convo } = trpc.assistant.getConversation.useQuery(undefined, { refetchOnMount: true });
  useEffect(() => {
    if (convo?.messages) {
      setMessages(convo.messages.map((m) => ({ role: m.role, content: m.content, lessons: m.lessons, jobs: m.jobs })));
    }
  }, [convo]);

  const { data: quota } = trpc.assistant.getQuota.useQuery();

  // Сид сердечек для всех карточек в истории.
  const favItems = useMemo(() => {
    const items: { itemType: 'LESSON' | 'JOB'; itemId: string }[] = [];
    for (const m of messages) {
      (m.lessons ?? []).forEach((l) => items.push({ itemType: 'LESSON', itemId: l.lessonId }));
      (m.jobs ?? []).forEach((j) => items.push({ itemType: 'JOB', itemId: j.jobId }));
    }
    return items;
  }, [messages]);
  const { data: favData } = trpc.favorite.isFavorited.useQuery({ items: favItems }, { enabled: favItems.length > 0 });
  const favoritedKeys = useMemo(() => new Set(favData?.favorited ?? []), [favData]);

  const sendMutation = trpc.assistant.sendMessage.useMutation({
    onSuccess: (res) => {
      setMessages((prev) => [...prev, { role: 'assistant', content: res.answer, lessons: res.lessons, jobs: res.jobs }]);
      utils.assistant.getQuota.invalidate();
    },
    onError: () => {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Не удалось получить ответ. Попробуй ещё раз.' }]);
    },
  });

  const resetMutation = trpc.assistant.resetConversation.useMutation({
    onSuccess: () => {
      setMessages([]);
      utils.assistant.getConversation.invalidate();
    },
  });

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sendMutation.isPending]);

  const outOfQuota = quota ? quota.remaining <= 0 : false;

  function send() {
    const msg = input.trim();
    if (!msg || sendMutation.isPending || outOfQuota) return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: msg }]);
    sendMutation.mutate({ message: msg });
  }

  return (
    <div className="flex h-full flex-col">
      {/* header */}
      <div className="flex items-center gap-2 border-b border-mp-gray-200 px-4 py-3 pr-12">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-mp-gray-900">AI-ассистент</div>
          <div className="text-xs text-mp-gray-500">Найду уроки и помогу разобраться</div>
        </div>
        <button
          onClick={() => resetMutation.mutate()}
          className="ml-auto text-xs text-mp-gray-500 hover:text-mp-gray-800"
        >
          Новый разговор
        </button>
      </div>

      {/* messages */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-mp-gray-50 p-4">
        {messages.length === 0 && (
          <p className="mt-8 text-center text-sm text-mp-gray-500">
            Спроси про уроки платформы или про твой бизнес на маркетплейсе — например «из чего складывается ДРР?»
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : ''}>
            <div className={m.role === 'user'
              ? 'max-w-[85%] rounded-2xl rounded-br-sm bg-mp-blue-600 px-3 py-2 text-sm text-white'
              : 'max-w-[92%] rounded-2xl rounded-bl-sm border border-mp-gray-200 bg-white px-3 py-2 text-sm text-mp-gray-800'}>
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.role === 'assistant' && (
                <AssistantCards lessons={m.lessons ?? []} jobs={m.jobs ?? []} favoritedKeys={favoritedKeys} />
              )}
            </div>
          </div>
        ))}
        {sendMutation.isPending && (
          <div className="text-xs text-mp-gray-400">Ассистент печатает…</div>
        )}
      </div>

      {/* quota + input */}
      <div className="border-t border-mp-gray-200 p-3">
        {quota && quota.tier === 'free' && (
          outOfQuota ? (
            <div className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Бесплатные вопросы на сегодня закончились. На подписке помощник без ограничений —{' '}
              <a href="/billing" className="font-semibold underline">оформить</a>.
            </div>
          ) : (
            <div className="mb-2 text-center text-xs text-mp-gray-400">
              Осталось {quota.remaining} из {quota.limit} бесплатных вопросов сегодня
            </div>
          )
        )}
        <div className="flex items-center gap-2 rounded-xl border border-mp-gray-200 bg-mp-gray-50 py-1 pl-3 pr-1">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
            disabled={outOfQuota}
            placeholder="Спроси про уроки или маркетплейсы…"
            className="flex-1 bg-transparent text-sm outline-none disabled:opacity-60"
          />
          <button
            onClick={send}
            disabled={sendMutation.isPending || outOfQuota || !input.trim()}
            aria-label="Отправить"
            className="grid h-8 w-8 place-items-center rounded-lg bg-mp-blue-600 text-white disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-mp-gray-400">
          Отвечает по материалам академии. Не финансовый совет.
        </p>
      </div>
    </div>
  );
}
```

Примечание: класс-токены (`bg-mp-blue-600`, `text-mp-gray-*`) — из существующей палитры проекта (см. лессон-чат `bg-mp-blue-50`). Если какого-то оттенка нет — подставь ближайший существующий.

- [ ] **Step 4: Прогнать — убедиться, что проходит**

Run: `cd apps/web && npx vitest run tests/unit/assistant-conversation.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/assistant/AssistantConversation.tsx apps/web/tests/unit/assistant-conversation.test.tsx
git commit -m "feat(web): AssistantConversation chat body (non-streaming + quota)"
```

---

### Task 15: Кнопка-лаунчер + интеграция в layout + env-флаг

**Files:**
- Create: `apps/web/src/components/assistant/AssistantLauncher.tsx`
- Modify: `apps/web/src/app/(main)/layout.tsx`
- Test: `apps/web/tests/unit/assistant-launcher.test.tsx`

- [ ] **Step 1: Написать падающий тест**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AssistantLauncher } from '@/components/assistant/AssistantLauncher';
import { vi } from 'vitest';

vi.mock('@/components/assistant/AssistantConversation', () => ({ AssistantConversation: () => <div>тело чата</div> }));

describe('AssistantLauncher', () => {
  it('не рендерится, когда enabled=false', () => {
    const { container } = render(<AssistantLauncher enabled={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('рендерит кнопку и открывает drawer по клику', () => {
    render(<AssistantLauncher enabled />);
    const btn = screen.getByRole('button', { name: /AI-ассистент/i });
    fireEvent.click(btn);
    expect(screen.getByText('тело чата')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Прогнать — убедиться, что падает**

Run: `cd apps/web && npx vitest run tests/unit/assistant-launcher.test.tsx`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать AssistantLauncher.tsx**

```tsx
'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { AssistantConversation } from '@/components/assistant/AssistantConversation';

export function AssistantLauncher({ enabled }: { enabled: boolean }) {
  const [open, setOpen] = useState(false);
  if (!enabled) return null;

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="AI-ассистент"
        className={`flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition-colors ${
          open ? 'border-mp-blue-600 bg-mp-blue-600 text-white' : 'border-mp-gray-200 bg-white text-mp-gray-900 hover:bg-mp-gray-50'
        }`}
      >
        <Sparkles className="h-4 w-4" />
        <span className="hidden sm:inline">AI-ассистент</span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="p-0">
          <AssistantConversation />
        </SheetContent>
      </Sheet>
    </>
  );
}
```

- [ ] **Step 4: Прогнать — убедиться, что проходит**

Run: `cd apps/web && npx vitest run tests/unit/assistant-launcher.test.tsx`
Expected: PASS.

- [ ] **Step 5: Встроить в layout**

В `apps/web/src/app/(main)/layout.tsx`:

1. Добавь импорт рядом с прочими виджетами шапки:

```tsx
import { AssistantLauncher } from '@/components/assistant/AssistantLauncher';
```

2. Прочитай env-флаг в теле серверного компонента (рядом с `const partnerEnabled = process.env.PARTNER_COURSES_ENABLED === 'true';`):

```tsx
const assistantEnabled = process.env.ASSISTANT_ENABLED === 'true';
```

3. Вставь кнопку в правый флекс-контейнер шапки — первой, слева от `<TrialCountdown />`:

```tsx
    <div className="flex items-center gap-2">
      <AssistantLauncher enabled={assistantEnabled} />
      <TrialCountdown />
      <NotificationBell />
      <HelpCircleButton />
      <UserNav user={{ /* без изменений */ }} />
    </div>
```

- [ ] **Step 6: Typecheck + прогон релевантных тестов**

Run: `cd apps/web && npx tsc --noEmit && npx vitest run tests/unit/assistant-launcher.test.tsx tests/unit/assistant-conversation.test.tsx tests/unit/assistant-cards.test.tsx`
Expected: typecheck чист, 3 файла PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/assistant/AssistantLauncher.tsx "apps/web/src/app/(main)/layout.tsx" apps/web/tests/unit/assistant-launcher.test.tsx
git commit -m "feat(web): AssistantLauncher button + layout integration (env-gated)"
```

---

### Task 16: Развести медленную процедуру в отдельный AI-батч

**Files:**
- Modify: `apps/web/src/lib/trpc/provider.tsx`

- [ ] **Step 1: Добавить пути assistant в `AI_PROCEDURES`**

Найди `const AI_PROCEDURES = new Set([...])` и добавь путь медленной процедуры:

```ts
const AI_PROCEDURES = new Set([
  'ai.getLessonSummary',
  'ai.chat',
  'ai.searchChunks',
  'ai.searchLessons',
  'assistant.sendMessage', // LLM 3-8s — не блокировать быстрый батч
]);
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/trpc/provider.tsx
git commit -m "feat(web): route assistant.sendMessage through slow AI batch"
```

---

## Wave 4 — Прод-миграция + верификация

### Task 17: Применить миграцию к prod-Supabase через Mgmt API

Локальный dev читает ПРОД Supabase — `prisma migrate`/`db push` запрещены. Только Mgmt API, только аддитивно.

**Files:** нет (операция над prod-БД).

- [ ] **Step 1: Посчитать checksum миграции**

Run:
```bash
cd packages/db && node -e "const c=require('crypto');const fs=require('fs');const sql=fs.readFileSync('prisma/migrations/20260708120000_add_assistant_conversation/migration.sql','utf8');console.log(c.createHash('sha256').update(sql).digest('hex'))"
```
Запиши checksum.

- [ ] **Step 2: Применить DDL через Mgmt API**

Токен и project ref — из `~/.claude/projects/D--GpT-docs-MPSTATS-ACADEMY-ADAPTIVE-LEARNING-MAAL/memory/reference_supabase_mgmt.md` (project ref = `saecuecevicwjkpmaoot`). Отправь содержимое `migration.sql` (обе таблицы + индексы + FK — всё аддитивно, транзакционно-безопасно, нет `ALTER TYPE`) одним `POST /v1/projects/{ref}/database/query`. Кириллицы в SQL нет → можно `curl`, но безопаснее `node -e` с `fetch` (паттерн проекта).

- [ ] **Step 3: Записать строку в `_prisma_migrations`**

`POST .../database/query` с:
```sql
INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (gen_random_uuid()::text, '<checksum>', NOW(), '20260708120000_add_assistant_conversation', NULL, NULL, NOW(), 1);
```

- [ ] **Step 4: Верифицировать**

`POST .../database/query`:
```sql
SELECT
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='AssistantConversation') AS conv,
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='AssistantMessage') AS msg;
```
Expected: `conv=true, msg=true`.

- [ ] **Step 5: Коммит-заметка (без файлов, только для истории — пропустить, если нечего коммитить)**

---

### Task 18: Полный typecheck + все тесты + ручная верификация

**Files:** нет.

- [ ] **Step 1: Прогнать все backend-тесты и typecheck**

Run:
```bash
cd packages/ai && npx vitest run && npx tsc --noEmit
cd ../api && npx vitest run && npx tsc --noEmit
cd ../../apps/web && npx vitest run && npx tsc --noEmit
```
Expected: всё зелёное (учитывать известный флейк `yandex-oauth` в web).

- [ ] **Step 2: Локальный прогон приложения**

Run: `ASSISTANT_ENABLED=true pnpm dev` (из корня worktree). Открой любую страницу под `(main)` залогиненным юзером.

- [ ] **Step 3: Ручной чек-лист (UAT)**

Проверь вживую:
- Кнопка «AI-ассистент» видна в шапке; клик → выезжает правый drawer; крестик и повторный клик закрывают.
- Вопрос «из чего складывается ДРР?» → осмысленный ответ + карточки уроков/задач.
- Клик по сердечку на карточке → «Добавлено в избранное» (проверь на `/learn/favorites`).
- Офф-топик «напиши код на python» → вежливый отказ, карточек нет, счётчик бесплатных НЕ уменьшился.
- Клик по карточке урока → переход в урок с `?from=assistant`.
- «Новый разговор» → диалог очищается; перезагрузка страницы → история подтянулась (для не-сброшенной нити).
- (Free-аккаунт) после 5 in-domain вопросов → плашка «Бесплатные вопросы закончились» + инпут заблокирован.

- [ ] **Step 4: Финальный self-review diff**

Run: `git log --oneline origin/master..HEAD`
Expected: ~18 аккуратных коммитов. Проверь `git diff origin/master --stat` — только ожидаемые файлы.

---

## Заметки для деплоя (вне TDD-цикла, по готовности)

- **Env-флаг `ASSISTANT_ENABLED`** — dark-launch. На проде НЕ ставить, пока не пройдёт staging-UAT. Staging и прод делят одну Supabase → миграция (Task 17) применяется один раз и видна обоим; видимость фичи разводится ТОЛЬКО флагом.
- **`OPENROUTER_DEFAULT_MODEL`** на проде уже = gpt-4.1-mini (гейт и синтез берут `MODELS.chat`).
- Деплой по раннбуку проекта: staging `build --no-cache web` + content-check → merge `--no-ff` → прод build+recreate → smoke. Откат: убрать `ASSISTANT_ENABLED` из compose (мгновенно скрыть) или `git revert -m 1 <merge>`.
- **Стриминг ответа** — deferred (инфры под SSE нет; splitLink только httpBatchLink). Если UX «ждать 3-8 сек» окажется плох — отдельная задача на SSE-route + новый link.
```
