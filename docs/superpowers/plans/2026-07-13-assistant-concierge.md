# AI-ассистент Концьерж-слой + хребет `category` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать AI-ассистенту концьерж-режим — строго-граунденные ответы про саму платформу (карта-конфиг + эмбеддинги в репо, deep-link карточки) — и общий хребет: категорию каждой реплики (`material | platform_help | complaint | off_domain`).

**Architecture:** Расширяем существующий детерминированный пайплайн `packages/ai/src/assistant/` (gate → retrieve → synthesize). Гейт возвращает `category`; пайплайн роутит по ней. Новая концьерж-ветка (`assistant/concierge/`) матчит запрос к курируемой карте платформы по эмбеддингам (top-K, cosine в JS над committed JSON, ноль прод-БД) и синтезирует ответ, строго граундясь на найденных записях + живые факты каталога курсов из БД. Whitelisted deep-link карточки. Одна аддитивная миграция (`AssistantMessage.category` + `navLinks`).

**Tech Stack:** TypeScript, Vitest, tRPC, Prisma (`@mpstats/db`), OpenRouter (`gpt-4.1-mini` через `MODELS.chat`), `embedQuery` (text-embedding-3-small, 1536), Next.js 14 (App Router), Supabase Mgmt API для миграции.

**Тестовые команды:**
- ai: `pnpm --filter @mpstats/ai test <path>`
- api: `pnpm --filter @mpstats/api test <path>`
- web: `pnpm --filter web test <path>`
- typecheck: `pnpm typecheck`

**Гочи проекта (обязательно):** работаем в worktree `.claude/worktrees/ai-assistant` — все пути абсолютные с `.claude/worktrees/ai-assistant/`. Прод-БД НЕ трогаем `prisma db push/migrate` — миграция только tsx-скриптом через Mgmt API (`reference_supabase_migration_via_mgmt_api.md`). Локальные ai-скрипты: `NODE_OPTIONS=--dns-result-order=ipv4first npx tsx --conditions=react-server ...`.

---

## Файловая структура

**Создаём:**
- `packages/ai/src/assistant/concierge/types.ts` — `MapEntry` (static/dynamic), `ConciergeMatch`
- `packages/ai/src/assistant/concierge/platform-map.ts` — курируемая карта (источник правды)
- `packages/ai/src/assistant/concierge/platform-map.embeddings.ts` — committed вектора (генерятся, `export const MAP_EMBEDDINGS`)
- `packages/ai/src/assistant/concierge/concierge-match.ts` — pure cosine + top-K матчер
- `packages/ai/src/assistant/concierge/embed-map.ts` — скрипт: карта → platform-map.embeddings.ts
- `packages/ai/src/assistant/concierge/course-facts.ts` — живой резолвер каталога курсов (БД)
- `packages/ai/src/assistant/concierge/concierge-synthesize.ts` — grounded LLM-синтез + whitelist
- `packages/ai/src/assistant/concierge/concierge-pipeline.ts` — оркестратор концьерж-ветки
- `packages/ai/src/assistant/concierge/index.ts` — реэкспорт
- Тесты: `*.test.ts` рядом с каждым модулем
- `apps/web/tests/unit/platform-map-hrefs.test.ts` — CI-гард мёртвых href
- `scripts/concierge-eval/run.ts` + `cases.json` — калибровка порога
- `scripts/migrations/add-assistant-category.ts` — миграция via Mgmt API

**Модифицируем:**
- `packages/ai/src/assistant/types.ts` — `ReplyCategory`, `AssistantNavLink`, `AssistantBranchResult`, обновить `AssistantTurnResult`
- `packages/ai/src/assistant/gate.ts` — возвращать `category`
- `packages/ai/src/assistant/pipeline.ts` — роутинг по категории
- `packages/ai/src/assistant/index.ts` — экспорт concierge/types
- `packages/api/src/routers/assistant.ts` — персист `category`+`navLinks`, отдавать в history
- `packages/db/prisma/schema.prisma` — `AssistantMessage.category` + `navLinks`
- `apps/web/src/components/assistant/AssistantCards.tsx` — nav-карточка
- `apps/web/src/components/assistant/AssistantConversation.tsx` — прокинуть navLinks
- `apps/web/src/app/support/page.tsx` — FAQ из карты

---

# Phase A — Хребет `category`

## Task A1: Типы категории и ветвлённого результата

**Files:**
- Modify: `packages/ai/src/assistant/types.ts`

- [ ] **Step 1: Написать типы**

В начало `packages/ai/src/assistant/types.ts` добавить (перед существующим `AssistantTurnResult`):

```ts
// Категория реплики (хребет): определяется гейтом, роутит пайплайн.
export type ReplyCategory = 'material' | 'platform_help' | 'complaint' | 'off_domain';

// Навигационная deep-link карточка концьержа (propose→click).
export interface AssistantNavLink {
  label: string;
  href: string;
}

// Результат одной ветки пайплайна (без категории — её проставляет оркестратор).
export interface AssistantBranchResult {
  answer: string;
  lessons: AssistantLessonRef[];
  jobs: AssistantJobRef[];
  navLinks: AssistantNavLink[];
}
```

Заменить существующий `AssistantTurnResult` на:

```ts
// Ответ ассистента на один ход диалога.
export interface AssistantTurnResult extends AssistantBranchResult {
  category: ReplyCategory; // off_domain ⟺ !inDomain (inDomain выводим при персисте)
}
```

- [ ] **Step 2: Typecheck (ожидаем падения в gate/synthesize/pipeline)**

Run: `pnpm --filter @mpstats/ai exec tsc --noEmit`
Expected: FAIL — `gate.ts`, `synthesize.ts`, `pipeline.ts` ещё на старых типах (чиним в A2–A3, B). Это ожидаемо; переходим дальше.

- [ ] **Step 3: Реэкспортировать новые типы из `@mpstats/ai`**

В `packages/ai/src/index.ts`, в блоке `// Assistant pipeline (...)` расширить список типов:

```ts
export {
  runAssistantPipeline,
  type AssistantTurnResult,
  type AssistantBranchResult,
  type AssistantLessonRef,
  type AssistantJobRef,
  type AssistantNavLink,
  type ReplyCategory,
  type AssistantHistoryMessage,
  type AssistantPipelineArgs,
} from './assistant';
```

(`AssistantNavLink`/`ReplyCategory`/`AssistantBranchResult` уже экспортятся из `assistant/index.ts` через `export * from './types'` — проверить, что эта строка там есть; если нет — добавить `export * from './types';` первой строкой `assistant/index.ts`.)

- [ ] **Step 4: Commit**

```bash
git add packages/ai/src/assistant/types.ts packages/ai/src/index.ts
git commit -m "feat(assistant): add ReplyCategory + AssistantNavLink + branch result types"
```

## Task A2: Гейт возвращает категорию

**Files:**
- Modify: `packages/ai/src/assistant/gate.ts`
- Test: `packages/ai/src/assistant/gate.test.ts`

- [ ] **Step 1: Написать падающий тест**

Создать `packages/ai/src/assistant/gate.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();
vi.mock('../openrouter', () => ({
  MODELS: { chat: 'test-model' },
  getOpenRouterClient: () => ({ chat: { completions: { create: mockCreate } } }),
}));

import { classifyDomain } from './gate';

function reply(json: unknown) {
  return { choices: [{ message: { content: JSON.stringify(json) } }] };
}

describe('classifyDomain', () => {
  beforeEach(() => mockCreate.mockReset());

  it('возвращает platform_help', async () => {
    mockCreate.mockResolvedValue(reply({ category: 'platform_help' }));
    expect(await classifyDomain('как отменить подписку')).toEqual({ category: 'platform_help' });
  });

  it('возвращает off_domain', async () => {
    mockCreate.mockResolvedValue(reply({ category: 'off_domain' }));
    expect(await classifyDomain('реши уравнение')).toEqual({ category: 'off_domain' });
  });

  it('fail-open → material при ошибке', async () => {
    mockCreate.mockRejectedValue(new Error('boom'));
    expect(await classifyDomain('что угодно')).toEqual({ category: 'material' });
  });

  it('неизвестная категория → material', async () => {
    mockCreate.mockResolvedValue(reply({ category: 'zzz' }));
    expect(await classifyDomain('x')).toEqual({ category: 'material' });
  });
});
```

- [ ] **Step 2: Запустить — упадёт**

Run: `pnpm --filter @mpstats/ai test src/assistant/gate.test.ts`
Expected: FAIL (`classifyDomain` возвращает `{ inDomain }`, не `{ category }`).

- [ ] **Step 3: Переписать gate.ts**

Заменить всё содержимое `packages/ai/src/assistant/gate.ts`:

```ts
import { getOpenRouterClient, MODELS } from '../openrouter';
import type { ReplyCategory } from './types';

export interface DomainVerdict {
  category: ReplyCategory;
}

const VALID: ReplyCategory[] = ['material', 'platform_help', 'complaint', 'off_domain'];

const SYSTEM = `Ты — классификатор реплик пользователя в AI-ассистенте обучающей платформы для селлеров маркетплейсов (Wildberries, Ozon).
Верни СТРОГО JSON: {"category":"<одна из: material | platform_help | complaint | off_domain>"}.

Категории:
- "platform_help" — вопрос про ПОЛЬЗОВАНИЕ этой платформой: где что нажать, как отменить подписку, где избранное/план/диагностика, как работает реф-программа, что умеет ассистент, сколько уроков в курсе, как перезапустить онбординг. Ориентирование по интерфейсу и функциям платформы.
- "complaint" — жалоба/негатив/«не работает»/«ничего не открывается»/раздражение в адрес платформы или обучения.
- "material" — содержательный вопрос про бизнес продавца на маркетплейсах: механика WB/Ozon, карточки, реклама, аналитика, финансы бизнеса (юнит-экономика, ДРР, налоги ИП), продвижение, операционка. Всё «про дело», не про интерфейс платформы.
- "off_domain" — всё остальное: код, школьные/мед/полит вопросы, личные финансы, творчество не про бизнес продавца.

Правила приоритета: если это жалоба на платформу → "complaint". Если про интерфейс/функции платформы → "platform_help". Если по сути про бизнес продавца → "material". Иначе → "off_domain". При сомнении между material и off_domain выбирай material.`;

// Fail-open: любая ошибка/невалидность → material (безопаснее ответить, чем отказать селлеру).
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
    const parsed = JSON.parse(raw) as { category?: unknown };
    const cat = parsed.category;
    if (typeof cat === 'string' && VALID.includes(cat as ReplyCategory)) {
      return { category: cat as ReplyCategory };
    }
    return { category: 'material' };
  } catch {
    return { category: 'material' };
  }
}
```

- [ ] **Step 4: Запустить — пройдёт**

Run: `pnpm --filter @mpstats/ai test src/assistant/gate.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/assistant/gate.ts packages/ai/src/assistant/gate.test.ts
git commit -m "feat(assistant): gate returns reply category (backbone)"
```

## Task A3: Пайплайн роутит по категории (material/off_domain/complaint; platform_help — стаб)

**Files:**
- Modify: `packages/ai/src/assistant/synthesize.ts`
- Modify: `packages/ai/src/assistant/pipeline.ts`
- Test: `packages/ai/src/assistant/pipeline.test.ts`

- [ ] **Step 1: Обновить synthesize.ts под AssistantBranchResult**

В `packages/ai/src/assistant/synthesize.ts` изменить возвраты `synthesizeAssistantResponse` (сигнатуру функции — на `Promise<AssistantBranchResult>`), убрав `inDomain` и добавив `navLinks: []`:

Заменить импорт-тип `AssistantTurnResult` на `AssistantBranchResult`:
```ts
import type { AssistantHistoryMessage, AssistantBranchResult, LessonCandidate } from './types';
```
Изменить объявление функции:
```ts
export async function synthesizeAssistantResponse(args: SynthesizeArgs): Promise<AssistantBranchResult> {
```
Заменить fallback-return:
```ts
  if (!parsed) {
    return { answer: FALLBACK_ANSWER, lessons: [], jobs: [], navLinks: [] };
  }
```
Заменить финальный return:
```ts
  return { answer: fixBrandNames(parsed.answer), lessons, jobs, navLinks: [] };
```

- [ ] **Step 2: Написать падающий тест роутинга**

Создать `packages/ai/src/assistant/pipeline.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const classifyDomain = vi.fn();
const retrieveForAssistant = vi.fn();
const synthesizeAssistantResponse = vi.fn();
const runConciergePipeline = vi.fn();

vi.mock('./gate', () => ({ classifyDomain }));
vi.mock('./retrieve', () => ({ retrieveForAssistant }));
vi.mock('./synthesize', () => ({ synthesizeAssistantResponse }));
vi.mock('./concierge', () => ({ runConciergePipeline }));

import { runAssistantPipeline } from './pipeline';

describe('runAssistantPipeline routing', () => {
  beforeEach(() => {
    classifyDomain.mockReset();
    retrieveForAssistant.mockReset();
    synthesizeAssistantResponse.mockReset();
    runConciergePipeline.mockReset();
  });

  it('off_domain → отказ, без ретрива', async () => {
    classifyDomain.mockResolvedValue({ category: 'off_domain' });
    const r = await runAssistantPipeline({ query: 'x', history: [] });
    expect(r.category).toBe('off_domain');
    expect(r.lessons).toEqual([]);
    expect(r.navLinks).toEqual([]);
    expect(retrieveForAssistant).not.toHaveBeenCalled();
    expect(runConciergePipeline).not.toHaveBeenCalled();
  });

  it('material → retrieve + synthesize', async () => {
    classifyDomain.mockResolvedValue({ category: 'material' });
    retrieveForAssistant.mockResolvedValue({ lessons: [], jobs: [] });
    synthesizeAssistantResponse.mockResolvedValue({ answer: 'A', lessons: [], jobs: [], navLinks: [] });
    const r = await runAssistantPipeline({ query: 'как ДРР', history: [] });
    expect(r.category).toBe('material');
    expect(r.answer).toBe('A');
    expect(runConciergePipeline).not.toHaveBeenCalled();
  });

  it('complaint → ведёт себя как material', async () => {
    classifyDomain.mockResolvedValue({ category: 'complaint' });
    retrieveForAssistant.mockResolvedValue({ lessons: [], jobs: [] });
    synthesizeAssistantResponse.mockResolvedValue({ answer: 'help', lessons: [], jobs: [], navLinks: [] });
    const r = await runAssistantPipeline({ query: 'ничего не работает', history: [] });
    expect(r.category).toBe('complaint');
    expect(synthesizeAssistantResponse).toHaveBeenCalled();
  });

  it('platform_help → concierge-ветка', async () => {
    classifyDomain.mockResolvedValue({ category: 'platform_help' });
    runConciergePipeline.mockResolvedValue({ answer: 'нажми X', lessons: [], jobs: [], navLinks: [{ label: 'Профиль', href: '/profile' }] });
    const r = await runAssistantPipeline({ query: 'как отменить', history: [] });
    expect(r.category).toBe('platform_help');
    expect(r.navLinks).toEqual([{ label: 'Профиль', href: '/profile' }]);
    expect(retrieveForAssistant).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Запустить — упадёт**

Run: `pnpm --filter @mpstats/ai test src/assistant/pipeline.test.ts`
Expected: FAIL (`./concierge` не существует, pipeline на старых типах).

- [ ] **Step 4: Создать временный concierge-стаб**

Создать `packages/ai/src/assistant/concierge/index.ts`:

```ts
import type { AssistantBranchResult, AssistantHistoryMessage } from '../types';

export interface ConciergePipelineArgs {
  query: string;
  history: AssistantHistoryMessage[];
}

// Стаб — реальная реализация в Phase B (concierge-pipeline.ts).
export async function runConciergePipeline(_args: ConciergePipelineArgs): Promise<AssistantBranchResult> {
  return {
    answer: 'Точно подсказать по этому не берусь, чтобы не запутать. Если что — напиши в поддержку, там помогут.',
    lessons: [],
    jobs: [],
    navLinks: [{ label: 'Написать в поддержку', href: '/support' }],
  };
}
```

- [ ] **Step 5: Переписать pipeline.ts**

Заменить всё содержимое `packages/ai/src/assistant/pipeline.ts`:

```ts
import { classifyDomain } from './gate';
import { retrieveForAssistant } from './retrieve';
import { synthesizeAssistantResponse } from './synthesize';
import { runConciergePipeline } from './concierge';
import type { AssistantHistoryMessage, AssistantTurnResult } from './types';

export interface AssistantPipelineArgs {
  query: string;
  history: AssistantHistoryMessage[];
}

const OFF_DOMAIN_REPLY =
  'Я помощник по обучению продажам на маркетплейсах — помогаю разобраться в WB/Ozon, рекламе, аналитике, финансах бизнеса и подобрать уроки. С этим вопросом помочь не смогу, но спроси что-нибудь про твой бизнес на маркетплейсе — с удовольствием разберу.';

export async function runAssistantPipeline(args: AssistantPipelineArgs): Promise<AssistantTurnResult> {
  const { category } = await classifyDomain(args.query);

  if (category === 'off_domain') {
    return { category, answer: OFF_DOMAIN_REPLY, lessons: [], jobs: [], navLinks: [] };
  }

  if (category === 'platform_help') {
    const r = await runConciergePipeline({ query: args.query, history: args.history });
    return { category, ...r };
  }

  // material | complaint → материальная ветка (complaint: детекция записана категорией, поведение = помочь)
  const { lessons, jobs } = await retrieveForAssistant(args.query);
  const r = await synthesizeAssistantResponse({
    query: args.query,
    history: args.history,
    lessonCandidates: lessons,
    jobCandidates: jobs,
  });
  return { category, ...r };
}
```

- [ ] **Step 6: Запустить — пройдёт**

Run: `pnpm --filter @mpstats/ai test src/assistant/pipeline.test.ts`
Expected: PASS (4/4).

- [ ] **Step 7: Обновить экспорт index.ts**

В `packages/ai/src/assistant/index.ts` добавить строку:
```ts
export { runConciergePipeline } from './concierge';
```

- [ ] **Step 8: Typecheck + весь ai-пакет**

Run: `pnpm --filter @mpstats/ai exec tsc --noEmit && pnpm --filter @mpstats/ai test`
Expected: PASS (typecheck чист, все ai-тесты зелёные).

- [ ] **Step 9: Commit**

```bash
git add packages/ai/src/assistant/synthesize.ts packages/ai/src/assistant/pipeline.ts packages/ai/src/assistant/pipeline.test.ts packages/ai/src/assistant/concierge/index.ts packages/ai/src/assistant/index.ts
git commit -m "feat(assistant): route pipeline by category, concierge branch stub"
```

## Task A4: Миграция БД + персист category/navLinks в роутере

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `scripts/migrations/add-assistant-category.ts`
- Modify: `packages/api/src/routers/assistant.ts`

- [ ] **Step 1: Обновить Prisma-схему**

В `packages/db/prisma/schema.prisma`, в модель `AssistantMessage` (после `inDomain`) добавить:

```prisma
  category       String?  // material | platform_help | complaint | off_domain (хребет)
  navLinks       Json     @default("[]") // deep-link карточки концьержа [{label,href}]
```

- [ ] **Step 2: Сгенерить Prisma-клиент (локально, без push!)**

Run: `pnpm --filter @mpstats/db exec prisma generate`
Expected: `Generated Prisma Client`. **НЕ запускать `db push`/`migrate` — прод-БД общая.**

- [ ] **Step 3: Написать скрипт миграции via Mgmt API**

Создать `scripts/migrations/add-assistant-category.ts`:

```ts
// Аддитивная миграция AssistantMessage: category + navLinks. Idempotent.
// Запуск: NODE_OPTIONS=--dns-result-order=ipv4first npx tsx scripts/migrations/add-assistant-category.ts
const PROJECT_REF = 'saecuecevicwjkpmaoot';
const TOKEN = process.env.SUPABASE_MGMT_TOKEN;

async function run(sql: string) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  if (!TOKEN) throw new Error('SUPABASE_MGMT_TOKEN не задан');
  await run(`ALTER TABLE "AssistantMessage" ADD COLUMN IF NOT EXISTS "category" text;`);
  await run(`ALTER TABLE "AssistantMessage" ADD COLUMN IF NOT EXISTS "navLinks" jsonb NOT NULL DEFAULT '[]'::jsonb;`);
  console.log('OK: category + navLinks добавлены');
}
main().catch((e) => { console.error(e); process.exit(1); });
```

> Скрипт запускает owner (или с явного согласия) когда придёт время staging/prod. Токен — из `reference_supabase_mgmt.md`. Для локального теста колонки не нужны — Prisma-клиент уже знает поля из схемы.

- [ ] **Step 4: Обновить роутер — персист + отдача**

В `packages/api/src/routers/assistant.ts`:

Обновить импорт-типы (строка 8):
```ts
import type { AssistantLessonRef, AssistantJobRef, AssistantNavLink } from '@mpstats/ai';
```

Расширить `EnrichedMessage` (после `jobs`):
```ts
export interface EnrichedMessage {
  role: 'user' | 'assistant';
  content: string;
  inDomain: boolean;
  category: string | null;
  lessons: AssistantLessonRef[];
  jobs: AssistantJobRef[];
  navLinks: AssistantNavLink[];
}
```

Заменить персист assistant-сообщения (был блок `create` с `inDomain: result.inDomain`):
```ts
      await ctx.prisma.assistantMessage.create({
        data: {
          conversationId: convo.id,
          role: 'assistant',
          content: result.answer,
          lessonIds: result.lessons.map((l) => l.lessonId),
          jobIds: result.jobs.map((j) => j.jobId),
          inDomain: result.category !== 'off_domain',
          category: result.category,
          navLinks: result.navLinks,
        },
      });
```

В `getConversation` map строк — добавить `category` и `navLinks` в возвращаемый объект (после `jobs: [...]`):
```ts
      category: r.category,
      navLinks: (r.navLinks as unknown as AssistantNavLink[]) ?? [],
```

- [ ] **Step 5: Typecheck api**

Run: `pnpm --filter @mpstats/api exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/db/prisma/schema.prisma scripts/migrations/add-assistant-category.ts packages/api/src/routers/assistant.ts
git commit -m "feat(assistant): persist category + navLinks (additive migration)"
```

---

# Phase B — Концьерж-движок

## Task B1: Типы карты + фикстурная карта

**Files:**
- Create: `packages/ai/src/assistant/concierge/types.ts`
- Create: `packages/ai/src/assistant/concierge/platform-map.ts` (стартовый мини-набор, расширяется в Phase D)

- [ ] **Step 1: Написать типы карты**

Создать `packages/ai/src/assistant/concierge/types.ts`:

```ts
export interface BaseMapEntry {
  id: string;              // стабильный слаг
  triggers: string[];      // перефразировки для матча (эмбеддятся)
  section: string;         // аналитика: 'billing' | 'referral' | 'diagnostic' | 'navigation' | 'catalog' | 'meta' | ...
  showInFaq?: boolean;     // рендерить на /support
}

export interface StaticMapEntry extends BaseMapEntry {
  kind: 'static';
  answer: string;                              // КАНОНИЧЕСКИЙ текст (grounding-источник)
  deepLink?: { label: string; href: string };
}

export interface DynamicMapEntry extends BaseMapEntry {
  kind: 'dynamic';
  resolver: 'courseFacts';                     // ключ живого резолвера
}

export type MapEntry = StaticMapEntry | DynamicMapEntry;

// Одна запись embeddings.ts.
export interface MapEmbedding {
  id: string;
  vec: number[];
}

// Результат матча.
export interface ConciergeMatch {
  id: string;
  score: number;
}
```

- [ ] **Step 2: Написать стартовую карту (мини-набор; полнота — Phase D)**

Создать `packages/ai/src/assistant/concierge/platform-map.ts`:

```ts
import type { MapEntry } from './types';

// ИСТОЧНИК ПРАВДЫ карты платформы. Полное покрытие добавляется в Phase D по аудиту.
// Каждый href ДОЛЖЕН резолвиться в реальный роут (см. platform-map-hrefs.test.ts).
export const PLATFORM_MAP: MapEntry[] = [
  {
    id: 'cancel-subscription',
    kind: 'static',
    section: 'billing',
    showInFaq: true,
    triggers: ['как отменить подписку', 'отписаться', 'убрать автосписание', 'где отключить продление'],
    answer:
      'Открой Профиль → блок «Подписка» → «Отменить». Доступ сохранится до конца оплаченного периода.',
    deepLink: { label: 'Открыть Профиль', href: '/profile' },
  },
  {
    id: 'favorites',
    kind: 'static',
    section: 'navigation',
    triggers: ['где избранное', 'сохранённые уроки', 'как найти что я сохранил'],
    answer:
      'Всё, что ты добавил через сердечко, лежит в разделе Обучение → Избранное.',
    deepLink: { label: 'Открыть Избранное', href: '/learn/favorites' },
  },
  {
    id: 'course-catalog',
    kind: 'dynamic',
    section: 'catalog',
    resolver: 'courseFacts',
    triggers: ['сколько уроков в курсе', 'какие темы в курсе', 'из чего состоит курс', 'что в курсе аналитика'],
  },
];
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @mpstats/ai exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/ai/src/assistant/concierge/types.ts packages/ai/src/assistant/concierge/platform-map.ts
git commit -m "feat(concierge): map entry types + seed platform map"
```

## Task B2: Матчер (pure cosine + top-K)

**Files:**
- Create: `packages/ai/src/assistant/concierge/concierge-match.ts`
- Test: `packages/ai/src/assistant/concierge/concierge-match.test.ts`

- [ ] **Step 1: Написать падающий тест**

Создать `packages/ai/src/assistant/concierge/concierge-match.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { cosineSim, matchTopK } from './concierge-match';
import type { MapEmbedding } from './types';

describe('cosineSim', () => {
  it('идентичные векторы → 1', () => {
    expect(cosineSim([1, 0], [1, 0])).toBeCloseTo(1);
  });
  it('ортогональные → 0', () => {
    expect(cosineSim([1, 0], [0, 1])).toBeCloseTo(0);
  });
});

describe('matchTopK', () => {
  const entries: MapEmbedding[] = [
    { id: 'a', vec: [1, 0, 0] },
    { id: 'b', vec: [0, 1, 0] },
    { id: 'c', vec: [0.9, 0.1, 0] },
  ];

  it('возвращает топ-K по убыванию, выше порога', () => {
    const r = matchTopK([1, 0, 0], entries, { k: 2, threshold: 0.5 });
    expect(r.map((m) => m.id)).toEqual(['a', 'c']);
    expect(r[0].score).toBeGreaterThan(r[1].score);
  });

  it('пусто, если ничего выше порога', () => {
    const r = matchTopK([0, 0, 1], entries, { k: 3, threshold: 0.5 });
    expect(r).toEqual([]);
  });
});
```

- [ ] **Step 2: Запустить — упадёт**

Run: `pnpm --filter @mpstats/ai test src/assistant/concierge/concierge-match.test.ts`
Expected: FAIL (модуль не существует).

- [ ] **Step 3: Реализовать матчер**

Создать `packages/ai/src/assistant/concierge/concierge-match.ts`:

```ts
import type { MapEmbedding, ConciergeMatch } from './types';

export function cosineSim(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function matchTopK(
  queryVec: number[],
  entries: MapEmbedding[],
  opts: { k: number; threshold: number },
): ConciergeMatch[] {
  return entries
    .map((e) => ({ id: e.id, score: cosineSim(queryVec, e.vec) }))
    .filter((m) => m.score >= opts.threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.k);
}
```

- [ ] **Step 4: Запустить — пройдёт**

Run: `pnpm --filter @mpstats/ai test src/assistant/concierge/concierge-match.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/assistant/concierge/concierge-match.ts packages/ai/src/assistant/concierge/concierge-match.test.ts
git commit -m "feat(concierge): pure cosine top-K matcher"
```

## Task B3: Скрипт эмбеддинга карты + сгенерить вектора (.ts)

**Files:**
- Create: `packages/ai/src/assistant/concierge/embed-map.ts`
- Create (generated): `packages/ai/src/assistant/concierge/platform-map.embeddings.ts`

- [ ] **Step 1: Написать скрипт (генерит .ts-модуль, не JSON — избегаем resolveJsonModule/бандлинг)**

Создать `packages/ai/src/assistant/concierge/embed-map.ts`:

```ts
// Эмбеддит PLATFORM_MAP → platform-map.embeddings.ts (committed TS-модуль).
// Запуск: NODE_OPTIONS=--dns-result-order=ipv4first npx tsx --conditions=react-server \
//   packages/ai/src/assistant/concierge/embed-map.ts
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { embedQuery } from '../../embeddings';
import { PLATFORM_MAP } from './platform-map';
import type { MapEmbedding, MapEntry } from './types';

function entryText(e: MapEntry): string {
  const parts = [...e.triggers];
  if (e.kind === 'static') parts.push(e.answer);
  return parts.join('\n');
}

async function main() {
  const out: MapEmbedding[] = [];
  for (const e of PLATFORM_MAP) {
    const vec = await embedQuery(entryText(e));
    out.push({ id: e.id, vec });
    console.log(`embedded ${e.id}`);
  }
  const body =
    `// AUTOGENERATED by embed-map.ts — не редактировать вручную.\n` +
    `import type { MapEmbedding } from './types';\n\n` +
    `export const MAP_EMBEDDINGS: MapEmbedding[] = ${JSON.stringify(out)};\n`;
  const path = join(__dirname, 'platform-map.embeddings.ts');
  writeFileSync(path, body);
  console.log(`wrote ${out.length} → ${path}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Создать стартовый вектор-файл (если ключа локально нет — пустой, генерация в Phase D)**

Если `OPENROUTER` ключ доступен локально (`MAAL/.env`):
Run: `NODE_OPTIONS=--dns-result-order=ipv4first npx tsx --conditions=react-server packages/ai/src/assistant/concierge/embed-map.ts`
Expected: `embedded cancel-subscription` … `wrote 3 → …platform-map.embeddings.ts`

Если ключа нет — создать `packages/ai/src/assistant/concierge/platform-map.embeddings.ts` вручную:
```ts
// AUTOGENERATED by embed-map.ts — не редактировать вручную.
import type { MapEmbedding } from './types';

export const MAP_EMBEDDINGS: MapEmbedding[] = [];
```
(матч даст промах на всё, пока не сгенерим реальные вектора в Phase D — юнит-тесты B6 мокают модуль и не зависят от содержимого.)

- [ ] **Step 3: Commit**

```bash
git add packages/ai/src/assistant/concierge/embed-map.ts packages/ai/src/assistant/concierge/platform-map.embeddings.ts
git commit -m "feat(concierge): map embedding script + generated vectors module"
```

## Task B4: Живой резолвер каталога курсов

**Files:**
- Create: `packages/ai/src/assistant/concierge/course-facts.ts`
- Test: `packages/ai/src/assistant/concierge/course-facts.test.ts`

- [ ] **Step 1: Написать падающий тест (pure formatter)**

Создать `packages/ai/src/assistant/concierge/course-facts.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatCourseFacts } from './course-facts';

describe('formatCourseFacts', () => {
  it('форматирует курс с числом уроков и темами', () => {
    const txt = formatCourseFacts([
      { title: 'Аналитика', lessonCount: 12, topics: ['Ниши', 'Спрос', 'Сезонность'] },
    ]);
    expect(txt).toContain('Аналитика');
    expect(txt).toContain('12');
    expect(txt).toContain('Ниши');
  });

  it('пустой список → пометка об отсутствии', () => {
    expect(formatCourseFacts([])).toMatch(/не наш|нет данных|не нашёл/i);
  });
});
```

- [ ] **Step 2: Запустить — упадёт**

Run: `pnpm --filter @mpstats/ai test src/assistant/concierge/course-facts.test.ts`
Expected: FAIL (модуль не существует).

- [ ] **Step 3: Реализовать резолвер**

Создать `packages/ai/src/assistant/concierge/course-facts.ts`:

```ts
import { prisma } from '@mpstats/db';

export interface CourseFact {
  title: string;
  lessonCount: number;
  topics: string[]; // верхнеуровневые темы (первые N названий уроков)
}

const MAX_TOPICS = 6;

// Pure: факты курсов → краткий грунд-текст для LLM.
export function formatCourseFacts(facts: CourseFact[]): string {
  if (facts.length === 0) {
    return 'В каталоге платформы не нашёл подходящего курса по этому запросу.';
  }
  return facts
    .map((f) => {
      const topics = f.topics.slice(0, MAX_TOPICS).join(', ');
      return `Курс «${f.title}»: ${f.lessonCount} опубликованных уроков. Темы: ${topics}.`;
    })
    .join('\n');
}

// Живая выборка: все видимые курсы + число опубликованных уроков + первые темы.
export async function resolveCourseFacts(): Promise<CourseFact[]> {
  const courses = await prisma.course.findMany({
    where: { isHidden: false },
    select: {
      title: true,
      lessons: {
        where: { isHidden: false },
        select: { title: true },
        orderBy: { order: 'asc' },
      },
    },
    orderBy: { order: 'asc' },
  });
  return courses.map((c) => ({
    title: c.title,
    lessonCount: c.lessons.length,
    topics: c.lessons.map((l) => l.title),
  }));
}
```

> Примечание: `resolveCourseFacts` отдаёт все курсы; LLM-синтез (B5) выбирает релевантный под вопрос. Если понадобится сузить — добавить фильтр по названию на этапе калибровки. `partnerKey`-курсы (`07_instruments`) видимы только при флаге — для v1 оставляем как есть (все `isHidden:false`); при необходимости исключить добавить `partnerKey: null`.

- [ ] **Step 4: Запустить — пройдёт**

Run: `pnpm --filter @mpstats/ai test src/assistant/concierge/course-facts.test.ts`
Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/assistant/concierge/course-facts.ts packages/ai/src/assistant/concierge/course-facts.test.ts
git commit -m "feat(concierge): live course-catalog facts resolver"
```

## Task B5: Grounded LLM-синтез + whitelist navLinks

**Files:**
- Create: `packages/ai/src/assistant/concierge/concierge-synthesize.ts`
- Test: `packages/ai/src/assistant/concierge/concierge-synthesize.test.ts`

- [ ] **Step 1: Написать падающий тест (pure post-processing)**

Создать `packages/ai/src/assistant/concierge/concierge-synthesize.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildNavLinks } from './concierge-synthesize';
import type { MapEntry } from './types';

const entries: MapEntry[] = [
  { id: 'cancel', kind: 'static', section: 'billing', triggers: [], answer: 'x', deepLink: { label: 'Профиль', href: '/profile' } },
  { id: 'fav', kind: 'static', section: 'navigation', triggers: [], answer: 'y', deepLink: { label: 'Избранное', href: '/learn/favorites' } },
  { id: 'cat', kind: 'dynamic', section: 'catalog', triggers: [], resolver: 'courseFacts' },
];

describe('buildNavLinks', () => {
  it('собирает deep-links только из переданных записей (whitelist)', () => {
    const links = buildNavLinks(entries);
    expect(links).toEqual([
      { label: 'Профиль', href: '/profile' },
      { label: 'Избранное', href: '/learn/favorites' },
    ]);
  });

  it('dynamic без deepLink → пропускается', () => {
    const links = buildNavLinks([entries[2]]);
    expect(links).toEqual([]);
  });
});
```

- [ ] **Step 2: Запустить — упадёт**

Run: `pnpm --filter @mpstats/ai test src/assistant/concierge/concierge-synthesize.test.ts`
Expected: FAIL (модуль не существует).

- [ ] **Step 3: Реализовать синтез**

Создать `packages/ai/src/assistant/concierge/concierge-synthesize.ts`:

```ts
import { z } from 'zod';
import { getOpenRouterClient, MODELS } from '../../openrouter';
import { fixBrandNames } from '../../generation';
import type { AssistantHistoryMessage, AssistantNavLink } from '../types';
import type { MapEntry } from './types';

const llmSchema = z.object({ answer: z.string().min(1) });

const FALLBACK =
  'Точно подсказать по этому не берусь, чтобы не запутать. Если что — напиши в поддержку, там помогут.';

// Whitelist: deep-links только из найденных записей карты. LLM их не генерирует.
export function buildNavLinks(entries: MapEntry[]): AssistantNavLink[] {
  const links: AssistantNavLink[] = [];
  for (const e of entries) {
    if (e.kind === 'static' && e.deepLink) links.push(e.deepLink);
  }
  return links;
}

const SYSTEM = `Ты — консьерж обучающей платформы для селлеров WB/Ozon. Помогаешь ориентироваться по платформе и её функциям.
СТРОГО: отвечай ТОЛЬКО на основе предоставленных СПРАВОК ниже. НЕ придумывай кнопок, страниц, шагов и ссылок, которых нет в справках. Можно переформулировать под вопрос пользователя, соединить несколько справок, отвечать живо и кратко по-русски. Ссылки/карточки платформа покажет сама — в тексте их не дублируй и не пиши URL.
Если справок недостаточно, чтобы точно ответить — верни ровно: {"answer":"${FALLBACK}"}.
Верни СТРОГО JSON: {"answer":"<markdown-ответ>"}`;

export interface ConciergeSynthArgs {
  query: string;
  history: AssistantHistoryMessage[];
  entries: MapEntry[];        // найденные записи (grounding-источник)
  courseFacts?: string;       // грунд из живого резолвера (для dynamic)
}

function buildUser(args: ConciergeSynthArgs): string {
  const refs = args.entries
    .map((e) => (e.kind === 'static' ? `СПРАВКА [${e.id}]: ${e.answer}` : `СПРАВКА [${e.id}]: (данные каталога ниже)`))
    .join('\n');
  const facts = args.courseFacts ? `\n\nДАННЫЕ КАТАЛОГА:\n${args.courseFacts}` : '';
  const hist = args.history.slice(-6).map((m) => `${m.role === 'user' ? 'Юзер' : 'Ассистент'}: ${m.content}`).join('\n');
  return `ИСТОРИЯ:\n${hist || '(пусто)'}\n\nВОПРОС: ${args.query}\n\nСПРАВКИ:\n${refs || '(нет)'}${facts}`;
}

export async function synthesizeConcierge(args: ConciergeSynthArgs): Promise<string> {
  try {
    const client = getOpenRouterClient();
    const resp = await client.chat.completions.create({
      model: MODELS.chat,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: buildUser(args) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });
    const raw = resp.choices[0]?.message?.content ?? '';
    const parsed = llmSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return fixBrandNames(parsed.data.answer);
  } catch {
    /* fall through */
  }
  return FALLBACK;
}
```

- [ ] **Step 4: Запустить — пройдёт**

Run: `pnpm --filter @mpstats/ai test src/assistant/concierge/concierge-synthesize.test.ts`
Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/assistant/concierge/concierge-synthesize.ts packages/ai/src/assistant/concierge/concierge-synthesize.test.ts
git commit -m "feat(concierge): grounded LLM synthesis + navLink whitelist"
```

## Task B6: Оркестратор концьерж-ветки (заменяет стаб)

**Files:**
- Create: `packages/ai/src/assistant/concierge/concierge-pipeline.ts`
- Modify: `packages/ai/src/assistant/concierge/index.ts`
- Test: `packages/ai/src/assistant/concierge/concierge-pipeline.test.ts`

- [ ] **Step 1: Написать падающий тест**

Создать `packages/ai/src/assistant/concierge/concierge-pipeline.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const matchTopK = vi.fn();
const synthesizeConcierge = vi.fn();
const resolveCourseFacts = vi.fn();
const embedQuery = vi.fn();

vi.mock('./concierge-match', async (orig) => ({ ...(await orig<any>()), matchTopK }));
vi.mock('./concierge-synthesize', async (orig) => ({ ...(await orig<any>()), synthesizeConcierge }));
vi.mock('./course-facts', async (orig) => ({ ...(await orig<any>()), resolveCourseFacts }));
vi.mock('../../embeddings', () => ({ embedQuery }));
vi.mock('./platform-map.embeddings', () => ({
  MAP_EMBEDDINGS: [
    { id: 'cancel-subscription', vec: [1, 0] },
    { id: 'course-catalog', vec: [0, 1] },
  ],
}));

import { runConciergePipeline } from './concierge-pipeline';

describe('runConciergePipeline', () => {
  beforeEach(() => {
    matchTopK.mockReset();
    synthesizeConcierge.mockReset();
    resolveCourseFacts.mockReset();
    embedQuery.mockReset().mockResolvedValue([1, 0]);
  });

  it('промах (пусто) → честный отказ + /support', async () => {
    matchTopK.mockReturnValue([]);
    const r = await runConciergePipeline({ query: 'непонятно', history: [] });
    expect(r.navLinks).toEqual([{ label: 'Написать в поддержку', href: '/support' }]);
    expect(synthesizeConcierge).not.toHaveBeenCalled();
  });

  it('static-хит → синтез + whitelisted deep-link', async () => {
    matchTopK.mockReturnValue([{ id: 'cancel-subscription', score: 0.9 }]);
    synthesizeConcierge.mockResolvedValue('Открой Профиль → Подписка → Отменить.');
    const r = await runConciergePipeline({ query: 'как отписаться', history: [] });
    expect(r.answer).toContain('Отменить');
    expect(r.navLinks).toEqual([{ label: 'Открыть Профиль', href: '/profile' }]);
    expect(resolveCourseFacts).not.toHaveBeenCalled();
  });

  it('dynamic-хит → тянет факты курсов', async () => {
    matchTopK.mockReturnValue([{ id: 'course-catalog', score: 0.8 }]);
    resolveCourseFacts.mockResolvedValue([{ title: 'Аналитика', lessonCount: 12, topics: ['Ниши'] }]);
    synthesizeConcierge.mockResolvedValue('В курсе Аналитика 12 уроков.');
    const r = await runConciergePipeline({ query: 'сколько уроков в аналитике', history: [] });
    expect(resolveCourseFacts).toHaveBeenCalled();
    expect(synthesizeConcierge).toHaveBeenCalledWith(expect.objectContaining({ courseFacts: expect.stringContaining('Аналитика') }));
  });
});
```

- [ ] **Step 2: Запустить — упадёт**

Run: `pnpm --filter @mpstats/ai test src/assistant/concierge/concierge-pipeline.test.ts`
Expected: FAIL (`concierge-pipeline.ts` не существует).

- [ ] **Step 3: Реализовать оркестратор**

Создать `packages/ai/src/assistant/concierge/concierge-pipeline.ts`:

```ts
import { embedQuery } from '../../embeddings';
import type { AssistantBranchResult, AssistantHistoryMessage } from '../types';
import { PLATFORM_MAP } from './platform-map';
import { matchTopK } from './concierge-match';
import { synthesizeConcierge, buildNavLinks } from './concierge-synthesize';
import { resolveCourseFacts, formatCourseFacts } from './course-facts';
import { MAP_EMBEDDINGS } from './platform-map.embeddings';
import type { MapEntry } from './types';

const TOP_K = 4;
const THRESHOLD = 0.35; // калибруется в Phase D

const MISS: AssistantBranchResult = {
  answer: 'Точно подсказать по этому не берусь, чтобы не запутать. Если что — напиши в поддержку, там помогут.',
  lessons: [],
  jobs: [],
  navLinks: [{ label: 'Написать в поддержку', href: '/support' }],
};

const EMBEDDINGS = MAP_EMBEDDINGS;
const BY_ID = new Map<string, MapEntry>(PLATFORM_MAP.map((e) => [e.id, e]));

export interface ConciergePipelineArgs {
  query: string;
  history: AssistantHistoryMessage[];
}

export async function runConciergePipeline(args: ConciergePipelineArgs): Promise<AssistantBranchResult> {
  const qVec = await embedQuery(args.query);
  const matches = matchTopK(qVec, EMBEDDINGS, { k: TOP_K, threshold: THRESHOLD });
  if (matches.length === 0) return MISS;

  const entries = matches.map((m) => BY_ID.get(m.id)).filter((e): e is MapEntry => Boolean(e));
  if (entries.length === 0) return MISS;

  const hasDynamic = entries.some((e) => e.kind === 'dynamic');
  const courseFacts = hasDynamic ? formatCourseFacts(await resolveCourseFacts()) : undefined;

  const answer = await synthesizeConcierge({ query: args.query, history: args.history, entries, courseFacts });
  return { answer, lessons: [], jobs: [], navLinks: buildNavLinks(entries) };
}
```

- [ ] **Step 4: Заменить стаб + прокинуть экспорт до `@mpstats/ai`**

Заменить всё содержимое `packages/ai/src/assistant/concierge/index.ts`:

```ts
export { runConciergePipeline } from './concierge-pipeline';
export type { ConciergePipelineArgs } from './concierge-pipeline';
export type { MapEntry, StaticMapEntry, DynamicMapEntry } from './types';
export { PLATFORM_MAP } from './platform-map';
```

В `packages/ai/src/assistant/index.ts` заменить строку `export { runConciergePipeline } from './concierge';` (из Task A3 Step 7) на реэкспорт всего публичного API концьержа:
```ts
export * from './concierge';
```

В `packages/ai/src/index.ts` добавить блок (после assistant-экспорта):
```ts
// Concierge (platform knowledge map)
export { PLATFORM_MAP } from './assistant/concierge';
export type { MapEntry, StaticMapEntry, DynamicMapEntry } from './assistant/concierge';
```

- [ ] **Step 5: Запустить тест + весь пакет + typecheck**

Run: `pnpm --filter @mpstats/ai test src/assistant/concierge/concierge-pipeline.test.ts && pnpm --filter @mpstats/ai test && pnpm --filter @mpstats/ai exec tsc --noEmit`
Expected: PASS (все зелёные).

> Если `MAP_EMBEDDINGS` = `[]` (ключа не было в B3) — рантайм-матч даст промах на всё; это ок для юнит-тестов (мокают модуль). Реальная генерация — Phase D.

- [ ] **Step 6: Commit**

```bash
git add packages/ai/src/assistant/concierge/concierge-pipeline.ts packages/ai/src/assistant/concierge/concierge-pipeline.test.ts packages/ai/src/assistant/concierge/index.ts
git commit -m "feat(concierge): pipeline orchestrator replaces stub"
```

---

# Phase C — Фронт

## Task C1: Nav-карточка в AssistantCards

**Files:**
- Modify: `apps/web/src/components/assistant/AssistantCards.tsx`

- [ ] **Step 1: Обновить компонент**

В `apps/web/src/components/assistant/AssistantCards.tsx`:

Обновить импорт-типы:
```ts
import type { AssistantLessonRef, AssistantJobRef, AssistantNavLink } from '@mpstats/ai';
```

Расширить `Props`:
```ts
interface Props {
  lessons: AssistantLessonRef[];
  jobs: AssistantJobRef[];
  navLinks?: AssistantNavLink[];
  favoritedKeys: Set<string>; // "LESSON:<id>" / "JOB:<id>"
}
```

Изменить сигнатуру и ранний возврат:
```ts
export function AssistantCards({ lessons, jobs, navLinks = [], favoritedKeys }: Props) {
  if (lessons.length === 0 && jobs.length === 0 && navLinks.length === 0) return null;
```

Перед закрывающим `</div>` блока (после `lessons.map(...)`) добавить рендер nav-карточек:
```tsx
      {navLinks.map((n) => (
        <Link
          key={`N:${n.href}`}
          href={n.href}
          className="flex items-center gap-3 rounded-lg border border-mp-blue-200 bg-mp-blue-50 p-2.5 hover:bg-mp-blue-100"
        >
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-wide text-mp-blue-500">Перейти</div>
            <div className="truncate text-sm font-semibold text-mp-blue-700">{n.label}</div>
          </div>
          <svg className="h-4 w-4 shrink-0 text-mp-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      ))}
```

- [ ] **Step 2: Typecheck web**

Run: `pnpm --filter web exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/assistant/AssistantCards.tsx
git commit -m "feat(assistant-ui): navigation deep-link card variant"
```

## Task C2: Прокинуть navLinks через Conversation

**Files:**
- Modify: `apps/web/src/components/assistant/AssistantConversation.tsx`

- [ ] **Step 1: Обновить UiMessage + гидрацию + рендер**

В `apps/web/src/components/assistant/AssistantConversation.tsx`:

Импорт-типы:
```ts
import type { AssistantLessonRef, AssistantJobRef, AssistantNavLink } from '@mpstats/ai';
```

Расширить `UiMessage`:
```ts
interface UiMessage {
  role: 'user' | 'assistant';
  content: string;
  lessons?: AssistantLessonRef[];
  jobs?: AssistantJobRef[];
  navLinks?: AssistantNavLink[];
}
```

В эффекте гидрации (setMessages из convo) добавить navLinks:
```ts
    setMessages(convo.messages.map((m) => ({ role: m.role, content: m.content, lessons: m.lessons, jobs: m.jobs, navLinks: m.navLinks })));
```

В `sendMutation.onSuccess` добавить navLinks в аппенд:
```ts
      setMessages((prev) => [...prev, { role: 'assistant', content: res.answer, lessons: res.lessons, jobs: res.jobs, navLinks: res.navLinks }]);
```

В рендере `AssistantCards` прокинуть navLinks:
```tsx
                <AssistantCards lessons={m.lessons ?? []} jobs={m.jobs ?? []} navLinks={m.navLinks ?? []} favoritedKeys={favoritedKeys} />
```

- [ ] **Step 2: Typecheck web**

Run: `pnpm --filter web exec tsc --noEmit`
Expected: PASS (`res.navLinks` и `m.navLinks` теперь в типах роутера из Task A4).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/assistant/AssistantConversation.tsx
git commit -m "feat(assistant-ui): thread navLinks through conversation + hydration"
```

## Task C3: FAQ на /support из карты (один источник)

**Files:**
- Create: `packages/ai/src/assistant/concierge/faq.ts`
- Modify: `packages/ai/src/assistant/concierge/index.ts`
- Modify: `apps/web/src/app/support/page.tsx`
- Test: `packages/ai/src/assistant/concierge/faq.test.ts`

- [ ] **Step 1: Написать падающий тест FAQ-селектора**

Создать `packages/ai/src/assistant/concierge/faq.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getFaqItems } from './faq';

describe('getFaqItems', () => {
  it('отдаёт только static-записи с showInFaq', () => {
    const items = getFaqItems();
    expect(items.length).toBeGreaterThan(0);
    for (const it of items) {
      expect(it.question).toBeTruthy();
      expect(it.answer).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Запустить — упадёт**

Run: `pnpm --filter @mpstats/ai test src/assistant/concierge/faq.test.ts`
Expected: FAIL (модуль не существует).

- [ ] **Step 3: Реализовать FAQ-селектор**

Создать `packages/ai/src/assistant/concierge/faq.ts`:

```ts
import { PLATFORM_MAP } from './platform-map';

export interface FaqItem {
  question: string; // первый триггер записи
  answer: string;
}

// FAQ = static-записи карты с showInFaq. Один источник правды с концьержем.
export function getFaqItems(): FaqItem[] {
  return PLATFORM_MAP.filter(
    (e): e is Extract<typeof e, { kind: 'static' }> => e.kind === 'static' && e.showInFaq === true,
  ).map((e) => ({ question: e.triggers[0] ?? e.id, answer: e.answer }));
}
```

> На этапе Phase D записям с `showInFaq: true` дают человекочитаемый `question` — добавить опц. поле `faqQuestion?: string` в `StaticMapEntry` и использовать его здесь вместо `triggers[0]`, если триггер звучит не как заголовок. (Для стартовой карты `triggers[0]='как отменить подписку'` — уже приемлемо.)

- [ ] **Step 4: Экспортировать до `@mpstats/ai`**

В `packages/ai/src/assistant/concierge/index.ts` добавить:
```ts
export { getFaqItems } from './faq';
export type { FaqItem } from './faq';
```

В `packages/ai/src/index.ts`, в блок `// Concierge (...)` добавить:
```ts
export { getFaqItems } from './assistant/concierge';
export type { FaqItem } from './assistant/concierge';
```
(`assistant/index.ts` уже делает `export * from './concierge'` из Task B6, поэтому `getFaqItems` доступен в модуле assistant; строка выше поднимает его на верхний `@mpstats/ai`.)

- [ ] **Step 5: Подключить на /support**

В `apps/web/src/app/support/page.tsx` заменить хардкод `FAQ_ITEMS`:

Удалить массив `const FAQ_ITEMS = [ ... ];` (строки с 5 объектами) и заменить импортом:
```ts
import { getFaqItems } from '@mpstats/ai';
```
Внутри компонента (перед `return`) добавить:
```ts
  const FAQ_ITEMS = getFaqItems();
```

> `getFaqItems` — pure (без БД/сети), безопасно вызывать в client-компоненте. Проверить, что `@mpstats/ai` уже в зависимостях `apps/web` (он импортируется в AssistantCards) — да.

- [ ] **Step 6: Запустить тест + typecheck web**

Run: `pnpm --filter @mpstats/ai test src/assistant/concierge/faq.test.ts && pnpm --filter web exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/ai/src/assistant/concierge/faq.ts packages/ai/src/assistant/concierge/faq.test.ts packages/ai/src/assistant/concierge/index.ts apps/web/src/app/support/page.tsx
git commit -m "feat(concierge): /support FAQ reads from platform map (single source)"
```

---

# Phase D — Карта: полный аудит, калибровка, гард

## Task D1: Аудит продуктовой поверхности → инвентарь

**Files:**
- Create: `docs/superpowers/plans/concierge-map-inventory.md`

- [ ] **Step 1: Запустить параллельный аудит субагентами**

Дispatch (superpowers:dispatching-parallel-agents) — по одному агенту на зону, каждый читает код и выдаёт структурный список «раздел / экран / ключевые кнопки-действия / реальный href»:
- Агент 1: `apps/web/src/app/(main)/dashboard/**` + `/learn/**` (витрина, план, решения, библиотека, избранное, коллекции)
- Агент 2: `apps/web/src/app/(main)/diagnostic/**` + `/profile/**` + `/profile/referral/**` (диагностика, профиль, пароль, реф-программа)
- Агент 3: `apps/web/src/app/(main)/billing/**` + `/mpstats-tools/**` + `(main)/layout.tsx` (биллинг, партнёр-курс, шапка/навигация, счётчики, баннеры)
- Агент 4: `apps/web/src/app/support/**` + текущий `FAQ_ITEMS` + `apps/web/src/components/assistant/**` (поддержка, что умеет сам ассистент)

Каждый агент возвращает markdown-таблицу `[раздел | что делает | ключевые действия | href]`.

- [ ] **Step 2: Свести инвентарь**

Собрать выводы агентов в `docs/superpowers/plans/concierge-map-inventory.md` — единый структурный список продуктовой поверхности. Пометить, какие пункты станут `static`-записями, а какие `dynamic` (каталог курсов).

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/concierge-map-inventory.md
git commit -m "docs(concierge): product-surface audit inventory for map authoring"
```

## Task D2: Авторинг полной карты + генерация векторов + owner-ревью

**Files:**
- Modify: `packages/ai/src/assistant/concierge/platform-map.ts`
- Modify (generated): `packages/ai/src/assistant/concierge/platform-map.embeddings.ts`

- [ ] **Step 1: Написать записи карты по инвентарю**

Расширить `PLATFORM_MAP` записями из инвентаря D1 — тематические кластеры из спеки §4: само-описание агента (`section:'meta'`), реф-программа пошагово (`section:'referral'`, по реальной механике: друг 7 дней сразу, реферер +14 после оплаты друга), флоу диагностики (`section:'diagnostic'`), навигация всех разделов (`section:'navigation'`), FAQ (`showInFaq:true`: подписка/видео/письмо). Каждая static-запись: `triggers` (3-6 перефразировок) + канонический `answer` + `deepLink` где уместно.

- [ ] **Step 2: Owner-ревью карты (человеческий гейт)**

Отдать owner/методологам `platform-map.ts` на вычитку (client-facing точность формулировок, шагов, ссылок). Внести правки.

- [ ] **Step 3: Перегенерить вектора**

Run: `NODE_OPTIONS=--dns-result-order=ipv4first npx tsx --conditions=react-server packages/ai/src/assistant/concierge/embed-map.ts`
Expected: `wrote N → …platform-map.embeddings.ts` (N = число записей).

- [ ] **Step 4: Прогнать весь ai-пакет**

Run: `pnpm --filter @mpstats/ai test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/assistant/concierge/platform-map.ts packages/ai/src/assistant/concierge/platform-map.embeddings.ts
git commit -m "feat(concierge): full platform map from audit + owner review + vectors"
```

## Task D3: CI-гард мёртвых href

**Files:**
- Create: `apps/web/tests/unit/platform-map-hrefs.test.ts`

- [ ] **Step 1: Написать тест-гард**

Создать `apps/web/tests/unit/platform-map-hrefs.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PLATFORM_MAP } from '@mpstats/ai';

// Каждый deepLink.href в карте должен соответствовать реальному роуту App Router.
// Роут /a/b → apps/web/src/app/a/b/page.tsx (учитываем route-группы (main)/(auth)).
const APP_DIR = join(__dirname, '..', '..', 'src', 'app');
const GROUPS = ['', '(main)', '(auth)'];

function routeExists(href: string): boolean {
  const path = href.split('?')[0].replace(/^\//, '');
  return GROUPS.some((g) => existsSync(join(APP_DIR, g, path, 'page.tsx')));
}

describe('platform map deep-links', () => {
  const links = PLATFORM_MAP.flatMap((e) =>
    e.kind === 'static' && e.deepLink ? [e.deepLink.href] : [],
  );

  it('в карте есть хотя бы одна ссылка', () => {
    expect(links.length).toBeGreaterThan(0);
  });

  it.each(links)('href %s резолвится в реальный роут', (href) => {
    expect(routeExists(href)).toBe(true);
  });
});
```

- [ ] **Step 2: Запустить — пройдёт (стартовая карта: /profile, /learn/favorites реальны)**

Run: `pnpm --filter web test tests/unit/platform-map-hrefs.test.ts`
Expected: PASS. Если падает — href в карте не имеет `page.tsx` → чинить карту (или расширить `GROUPS`/эвристику под динамические сегменты).

- [ ] **Step 3: Commit**

```bash
git add apps/web/tests/unit/platform-map-hrefs.test.ts
git commit -m "test(concierge): CI guard for dead deep-link hrefs"
```

## Task D4: Eval-набор + калибровка порога

**Files:**
- Create: `scripts/concierge-eval/cases.json`
- Create: `scripts/concierge-eval/run.ts`

- [ ] **Step 1: Собрать кейсы**

Создать `scripts/concierge-eval/cases.json` — ~20 кейсов: platform_help хиты (ожидаемый `id` записи), platform_help промахи (ожидается `MISS`), плюс несколько material/off_domain для проверки гейта:

```json
[
  { "query": "как отменить подписку", "expect": "cancel-subscription" },
  { "query": "где мои сохранённые уроки", "expect": "favorites" },
  { "query": "сколько уроков в курсе аналитика", "expect": "course-catalog" },
  { "query": "какая погода завтра", "expect": "MISS" }
]
```

- [ ] **Step 2: Написать раннер**

Создать `scripts/concierge-eval/run.ts`:

```ts
// Калибровка порога/K концьержа против карты.
// Запуск: NODE_OPTIONS=--dns-result-order=ipv4first npx tsx --conditions=react-server scripts/concierge-eval/run.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { embedQuery } from '../../packages/ai/src/embeddings';
import { matchTopK } from '../../packages/ai/src/assistant/concierge/concierge-match';
import { MAP_EMBEDDINGS } from '../../packages/ai/src/assistant/concierge/platform-map.embeddings';

const EMB = MAP_EMBEDDINGS;
const CASES = JSON.parse(readFileSync(join(__dirname, 'cases.json'), 'utf8')) as { query: string; expect: string }[];

const THRESHOLD = Number(process.env.TH ?? '0.35');

async function main() {
  let pass = 0;
  for (const c of CASES) {
    const vec = await embedQuery(c.query);
    const top = matchTopK(vec, EMB, { k: 4, threshold: THRESHOLD });
    const got = top[0]?.id ?? 'MISS';
    const ok = c.expect === 'MISS' ? top.length === 0 : top.some((m) => m.id === c.expect);
    if (ok) pass++;
    console.log(`${ok ? 'PASS' : 'FAIL'} [${c.query}] expect=${c.expect} got=${got} score=${top[0]?.score?.toFixed(2) ?? '-'}`);
  }
  console.log(`\n${pass}/${CASES.length} (threshold=${THRESHOLD})`);
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Калибровка**

Run: `TH=0.35 NODE_OPTIONS=--dns-result-order=ipv4first npx tsx --conditions=react-server scripts/concierge-eval/run.ts`
Затем варьировать `TH` (0.3 / 0.4 / 0.45), выбрать порог с лучшим балансом хит/промах. Записать выбранный порог в `concierge-pipeline.ts` (`THRESHOLD`).

- [ ] **Step 4: Commit**

```bash
git add scripts/concierge-eval/cases.json scripts/concierge-eval/run.ts packages/ai/src/assistant/concierge/concierge-pipeline.ts
git commit -m "test(concierge): eval harness + calibrated match threshold"
```

---

# Финал: холистическая проверка

- [ ] **Все пакеты зелёные**

Run: `pnpm typecheck && pnpm --filter @mpstats/ai test && pnpm --filter @mpstats/api test && pnpm --filter web test`
Expected: PASS (кроме известного yandex-oauth web-флейка).

- [ ] **Миграция на staging БД** (owner/с согласия): `SUPABASE_MGMT_TOKEN=... NODE_OPTIONS=--dns-result-order=ipv4first npx tsx scripts/migrations/add-assistant-category.ts` — вернёт «OK: category + navLinks добавлены». Аддитивно, прод-коду до релиза невидимо.

- [ ] **Staging deploy + UAT** по `.claude/memory/staging-workflow.md` (`--no-cache web` + content-check). Проверить: платформенные вопросы дают grounded-ответ + deep-link карточку; промах → честный отказ + /support; material/off_domain не изменились; FAQ на /support отрисован из карты.

---

## Deferred (следующие слои — НЕ в этом плане)
- Слой 2 (саппорт): complaint → предложить тикет → агент сам шлёт письмо в `clients@mpstats.academy`.
- Слой 3 (аналитика): дашборд категорий/топ-карточек в `/admin/analytics`.
- 👍/👎 фидбэк.
