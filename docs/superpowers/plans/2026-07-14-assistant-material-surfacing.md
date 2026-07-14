# AI-ассистент Material-surfacing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ассистент проактивно подмешивает релевантные материалы базы знаний (чек-листы/таблицы/памятки/презентации/сервисы) карточкой в `material`-ветке — по назначению, с капом ≤2, гейтингом доступа по родительскому уроку.

**Architecture:** Поверх концьерж-слоя. Материалы эмбеддятся в БД (`Material.embedding vector(1536)`, зеркало `Job.embedding`). Новый ретрив `searchMaterialsByEmbedding` включается только для `material`-ветки, мержится в `AssistantRetrieval`. Синтез whitelистит `materialIds` (≤2). Роутер резолвит доступ (доступен ⟺ ≥1 родительский урок доступен, реюз D-23 ACL) и гейтит URL. Новая карточка материала (open/download/locked). Аддитивные миграции.

**Tech Stack:** TypeScript, Vitest, tRPC, Prisma (`@mpstats/db`), pgvector (`vector(1536)`, ivfflat cosine), OpenRouter `embedQuery` (text-embedding-3-small), Next.js 14, Supabase Mgmt API.

**Тестовые команды:** ai `pnpm --filter @mpstats/ai test <path>`; api `pnpm --filter @mpstats/api test <path>`; web `pnpm --filter web test <path>`; typecheck `pnpm typecheck`.

**Гочи проекта (обязательно):** работаем в worktree `.claude/worktrees/ai-assistant`, ветка `feature/ai-assistant` — все bash-команды начинать с `cd "D:/GpT_docs/MPSTATS ACADEMY ADAPTIVE LEARNING/MAAL/.claude/worktrees/ai-assistant" && ...`; все пути абсолютные с этим сегментом. НЕ гонять tsc/git/тесты из main-tree (он на другой ветке). Прод-БД НЕ трогать `prisma db push/migrate` — только `prisma generate` + tsx-скрипт миграции via Mgmt API (`reference_supabase_migration_via_mgmt_api.md`). Локальные ai-скрипты: `NODE_OPTIONS=--dns-result-order=ipv4first npx tsx --conditions=react-server ...` (эмбеддинг требует `OPENROUTER_API_KEY` из `MAAL/.env`).

**Предшественник:** концьерж-слой (spec `docs/superpowers/specs/2026-07-13-assistant-concierge-design.md`, план `docs/superpowers/plans/2026-07-13-assistant-concierge.md`) уже реализован на этой ветке, НО не протестирован на staging. Material-surfacing строится поверх него. Актуальное состояние типов/пайплайна см. `packages/ai/src/assistant/`.

---

## Файловая структура

**Создаём:**
- `packages/ai/src/assistant/materials/retrieve-materials.ts` — `searchMaterialsByEmbedding`
- `packages/ai/src/assistant/materials/embed-materials.ts` — `buildMaterialText` + скрипт эмбеддинга
- `packages/ai/src/assistant/materials/index.ts` — реэкспорт
- `packages/api/src/utils/material-access.ts` — батч-резолвер доступа + гейтинг
- `scripts/migrations/add-material-embedding.ts` — миграция via Mgmt API
- Тесты `*.test.ts` рядом с модулями

**Модифицируем:**
- `packages/ai/src/assistant/types.ts` — `AssistantMaterialRef`, `MaterialCandidate`; `AssistantBranchResult`/`AssistantTurnResult` += `materials`
- `packages/ai/src/assistant/retrieve.ts` — `retrieveMaterials` + `withMaterials`
- `packages/ai/src/assistant/synthesize.ts` — `materialIds` whitelist (≤2) + промпт
- `packages/ai/src/assistant/pipeline.ts` — материалы только в `material`-ветке
- `packages/ai/src/assistant/index.ts` + `packages/ai/src/index.ts` — экспорт типов
- `packages/db/prisma/schema.prisma` — `Material.embedding` + `AssistantMessage.materialIds`
- `scripts/migrations/add-assistant-category.ts` — дополнить колонкой `materialIds` (или отдельный скрипт — см. Task MB1)
- `packages/api/src/routers/assistant.ts` — резолвинг доступа + персист/отдача materials
- `apps/web/src/components/assistant/AssistantCards.tsx` — карточка материала
- `apps/web/src/components/assistant/AssistantConversation.tsx` — прокидка materials

---

# Phase M-A — Индексация + ретрив (ai)

## Task MA1: Типы материалов

**Files:** Modify `packages/ai/src/assistant/types.ts`, `packages/ai/src/index.ts`

- [ ] **Step 1: Добавить типы**

В `packages/ai/src/assistant/types.ts` добавить:

```ts
// Кандидат-материал из ретрива (до whitelist).
export interface MaterialCandidate {
  materialId: string;
  type: string;              // MaterialType (PRESENTATION|CALCULATION_TABLE|EXTERNAL_SERVICE|CHECKLIST|MEMO)
  title: string;
  description: string | null;
  ctaText: string;
  externalUrl: string | null;
  hasFile: boolean;          // storagePath присутствует → скачивание через getSignedUrl
  similarity: number;
}

// Карточка материала в ответе. isAccessible/externalUrl проставляет РОУТЕР (гейтинг).
export interface AssistantMaterialRef {
  materialId: string;
  type: string;
  title: string;
  ctaText: string;
  isAccessible: boolean;     // true только после резолвинга доступа в роутере
  externalUrl: string | null; // null для залоченных (не течёт) и для file-only
  hasFile: boolean;
}
```

Расширить `AssistantBranchResult` (добавить поле после `navLinks`):
```ts
  materials: AssistantMaterialRef[];
```
(`AssistantTurnResult extends AssistantBranchResult` — наследует автоматически.)

- [ ] **Step 2: Реэкспорт из `@mpstats/ai`**

В `packages/ai/src/index.ts`, в assistant-блок экспорта типов добавить `AssistantMaterialRef` и `MaterialCandidate`.

- [ ] **Step 3: Typecheck (ожидаемы падения в synthesize/pipeline/concierge — чиним ниже)**

Run: `cd "<worktree>" && pnpm --filter @mpstats/ai exec tsc --noEmit`
Expected: FAIL в местах, где строится `AssistantBranchResult` без `materials` (synthesize.ts, pipeline.ts, concierge). Это ожидаемо — чиним в MA4/MA5 + патч концьержа (см. Step 4).

- [ ] **Step 4: Починить концьерж-ветку и off_domain (добавить `materials: []`)**

Все места, возвращающие `AssistantBranchResult`/`AssistantTurnResult`, должны включать `materials: []`:
- `packages/ai/src/assistant/concierge/concierge-pipeline.ts` — в `MISS` и в финальном return добавить `materials: []`.
- `packages/ai/src/assistant/synthesize.ts` — fallback и финальный return += `materials: []` (окончательно доработается в MA5, но чтобы tsc прошёл — добавить сейчас).
- `packages/ai/src/assistant/pipeline.ts` — ветка off_domain: `{ category, ..., materials: [] }`.

Run: `cd "<worktree>" && pnpm --filter @mpstats/ai exec tsc --noEmit`
Expected: PASS (все ветки возвращают materials).

- [ ] **Step 5: Прогон ai-тестов (не должны сломаться — materials опциональны в ассертах)**

Run: `cd "<worktree>" && pnpm --filter @mpstats/ai test`
Expected: PASS (существующие тесты не проверяют materials; если какой-то падает на строгом равенстве объекта — обнови ассерт добавив `materials: []`).

- [ ] **Step 6: Commit**

```bash
cd "<worktree>" && git add packages/ai/src/assistant/types.ts packages/ai/src/index.ts packages/ai/src/assistant/concierge/concierge-pipeline.ts packages/ai/src/assistant/synthesize.ts packages/ai/src/assistant/pipeline.ts
git commit -m "feat(assistant): material ref/candidate types + materials on branch result"
```

## Task MA2: Схема Material.embedding + миграция + скрипт эмбеддинга

**Files:** Modify `packages/db/prisma/schema.prisma`; Create `scripts/migrations/add-material-embedding.ts`, `packages/ai/src/assistant/materials/embed-materials.ts`; Test `packages/ai/src/assistant/materials/embed-materials.test.ts`

- [ ] **Step 1: Схема — зеркалить Job.embedding**

В `packages/db/prisma/schema.prisma`, в модель `Material` (после `updatedAt` или рядом с полями) добавить:
```prisma
  embedding    Unsupported("vector(1536)")? // material-surfacing: assistant retrieval via pgvector cosine
```

- [ ] **Step 2: prisma generate (НЕ push)**

Run: `cd "<worktree>" && pnpm --filter @mpstats/db exec prisma generate`
Expected: `Generated Prisma Client`. **НЕ запускать db push/migrate.**

- [ ] **Step 3: Скрипт миграции (Mgmt API, НЕ запускать)**

Создать `scripts/migrations/add-material-embedding.ts` (по образцу `scripts/migrations/add-assistant-category.ts`):
```ts
// Аддитивно: Material.embedding vector(1536) + ivfflat index. Idempotent. НЕ запускать локально.
// Запуск (owner, staging/prod): NODE_OPTIONS=--dns-result-order=ipv4first npx tsx scripts/migrations/add-material-embedding.ts
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
  await run(`ALTER TABLE "Material" ADD COLUMN IF NOT EXISTS "embedding" vector(1536);`);
  await run(`CREATE INDEX IF NOT EXISTS "Material_embedding_idx" ON "Material" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 50);`);
  console.log('OK: Material.embedding + index добавлены');
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 4: Написать падающий тест pure `buildMaterialText`**

Создать `packages/ai/src/assistant/materials/embed-materials.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildMaterialText, typeLabel } from './embed-materials';

describe('buildMaterialText', () => {
  it('включает title, description, тип-лейбл и названия уроков', () => {
    const txt = buildMaterialText({
      title: 'Калькулятор юнит-экономики',
      description: 'Таблица для расчёта маржи',
      type: 'CALCULATION_TABLE',
      lessonTitles: ['Юнит-экономика с нуля'],
    });
    expect(txt).toContain('Калькулятор юнит-экономики');
    expect(txt).toContain('Таблица для расчёта маржи');
    expect(txt).toContain('таблица-калькулятор');
    expect(txt).toContain('Юнит-экономика с нуля');
  });
  it('без description/уроков не падает', () => {
    const txt = buildMaterialText({ title: 'Памятка', description: null, type: 'MEMO', lessonTitles: [] });
    expect(txt).toContain('Памятка');
    expect(txt).toContain('памятка');
  });
});

describe('typeLabel', () => {
  it('маппит типы в человекочитаемые лейблы', () => {
    expect(typeLabel('CHECKLIST')).toBe('чек-лист');
    expect(typeLabel('UNKNOWN')).toBe('материал');
  });
});
```

- [ ] **Step 5: Запустить — упадёт**

Run: `cd "<worktree>" && pnpm --filter @mpstats/ai test src/assistant/materials/embed-materials.test.ts`
Expected: FAIL (модуля нет).

- [ ] **Step 6: Реализовать embed-materials.ts**

Создать `packages/ai/src/assistant/materials/embed-materials.ts`:
```ts
import { prisma } from '@mpstats/db/client';
import { embedQuery } from '../../embeddings';

const TYPE_LABELS: Record<string, string> = {
  PRESENTATION: 'презентация',
  CALCULATION_TABLE: 'таблица-калькулятор',
  EXTERNAL_SERVICE: 'внешний сервис',
  CHECKLIST: 'чек-лист',
  MEMO: 'памятка',
};

export function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? 'материал';
}

export function buildMaterialText(m: {
  title: string;
  description: string | null;
  type: string;
  lessonTitles: string[];
}): string {
  const parts = [m.title, typeLabel(m.type)];
  if (m.description) parts.push(m.description);
  for (const t of m.lessonTitles) parts.push(t);
  return parts.join('\n');
}

interface MaterialForEmbed {
  id: string;
  title: string;
  description: string | null;
  type: string;
  embedding: unknown | null;
  lessons: { lesson: { title: string } }[];
}

export async function embedMaterial(m: MaterialForEmbed, opts: { force: boolean }): Promise<void> {
  if (!opts.force && m.embedding != null) return;
  const text = buildMaterialText({
    title: m.title,
    description: m.description,
    type: m.type,
    lessonTitles: m.lessons.map((lm) => lm.lesson.title),
  });
  const vec = await embedQuery(text);
  const literal = `[${vec.join(',')}]`;
  await prisma.$executeRawUnsafe(
    `UPDATE "Material" SET "embedding" = '${literal}'::vector WHERE "id" = '${m.id}'`,
  );
}

// CLI: NODE_OPTIONS=--dns-result-order=ipv4first npx tsx --conditions=react-server \
//   packages/ai/src/assistant/materials/embed-materials.ts [--force]
async function main() {
  const force = process.argv.includes('--force');
  const materials = await prisma.material.findMany({
    where: { isHidden: false },
    select: {
      id: true, title: true, description: true, type: true, embedding: true,
      lessons: { where: { lesson: { isHidden: false } }, select: { lesson: { select: { title: true } } } },
    },
  }) as unknown as MaterialForEmbed[];
  let done = 0;
  for (const m of materials) {
    await embedMaterial(m, { force });
    done += 1;
    if (done % 20 === 0) console.log(`embedded ${done}/${materials.length}`);
  }
  console.log(`done: ${done}/${materials.length} materials`);
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
```

> Примечание: `type` в select вернётся как enum — привести к строке в вызове (`m.type as unknown as string`) если tsc потребует; MaterialType-строки совпадают со значениями enum.

- [ ] **Step 7: Запустить тест — пройдёт**

Run: `cd "<worktree>" && pnpm --filter @mpstats/ai test src/assistant/materials/embed-materials.test.ts`
Expected: PASS (4).

- [ ] **Step 8: Commit** (генерацию векторов не запускаем локально — прогон на staging в MD1/деплое)

```bash
cd "<worktree>" && git add packages/db/prisma/schema.prisma scripts/migrations/add-material-embedding.ts packages/ai/src/assistant/materials/embed-materials.ts packages/ai/src/assistant/materials/embed-materials.test.ts
git commit -m "feat(materials): Material.embedding schema + migration + embed script"
```

## Task MA3: Ретрив материалов по эмбеддингу

**Files:** Create `packages/ai/src/assistant/materials/retrieve-materials.ts`, `.../index.ts`; Test `.../retrieve-materials.test.ts`

- [ ] **Step 1: Написать падающий тест (мок prisma.$queryRawUnsafe + embedQuery)**

Создать `packages/ai/src/assistant/materials/retrieve-materials.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { queryRawUnsafe, embedQuery } = vi.hoisted(() => ({
  queryRawUnsafe: vi.fn(),
  embedQuery: vi.fn(),
}));
vi.mock('@mpstats/db/client', () => ({ prisma: { $queryRawUnsafe: queryRawUnsafe } }));
vi.mock('../../embeddings', () => ({ embedQuery }));

import { searchMaterialsByEmbedding } from './retrieve-materials';

describe('searchMaterialsByEmbedding', () => {
  beforeEach(() => { queryRawUnsafe.mockReset(); embedQuery.mockReset().mockResolvedValue([0.1, 0.2]); });

  it('маппит строки БД в MaterialCandidate', async () => {
    queryRawUnsafe.mockResolvedValue([
      { id: 'm1', type: 'CHECKLIST', title: 'Чек-лист', description: 'd', cta_text: 'Скачать', external_url: null, has_file: true, similarity: 0.7 },
    ]);
    const r = await searchMaterialsByEmbedding('как проверить карточку', { limit: 6, threshold: 0.3 });
    expect(r).toEqual([
      { materialId: 'm1', type: 'CHECKLIST', title: 'Чек-лист', description: 'd', ctaText: 'Скачать', externalUrl: null, hasFile: true, similarity: 0.7 },
    ]);
    expect(embedQuery).toHaveBeenCalledWith('как проверить карточку');
  });

  it('пустой результат → []', async () => {
    queryRawUnsafe.mockResolvedValue([]);
    expect(await searchMaterialsByEmbedding('x', {})).toEqual([]);
  });
});
```

- [ ] **Step 2: Запустить — упадёт**

Run: `cd "<worktree>" && pnpm --filter @mpstats/ai test src/assistant/materials/retrieve-materials.test.ts`
Expected: FAIL (модуля нет).

- [ ] **Step 3: Реализовать retrieve-materials.ts (зеркало searchJobsByEmbedding)**

Создать `packages/ai/src/assistant/materials/retrieve-materials.ts`:
```ts
import { prisma } from '@mpstats/db/client';
import { embedQuery } from '../../embeddings';
import type { MaterialCandidate } from '../types';

interface MaterialEmbedRow {
  id: string;
  type: string;
  title: string;
  description: string | null;
  cta_text: string;
  external_url: string | null;
  has_file: boolean;
  similarity: number;
}

// Косинус-поиск по Material.embedding. Только non-hidden материалы,
// у которых есть хотя бы один видимый прикреплённый урок (D-23/D-37 фильтр).
export async function searchMaterialsByEmbedding(
  query: string,
  opts: { limit?: number; threshold?: number } = {},
): Promise<MaterialCandidate[]> {
  const { limit = 6, threshold = 0.35 } = opts;
  const vec = await embedQuery(query);
  const literal = `[${vec.join(',')}]`;
  const rows = await prisma.$queryRawUnsafe<MaterialEmbedRow[]>(
    `SELECT m.id::text AS id, m.type::text AS type, m.title, m.description,
            m."ctaText" AS cta_text, m."externalUrl" AS external_url,
            (m."storagePath" IS NOT NULL) AS has_file,
            (1 - (m."embedding" <=> '${literal}'::vector))::float AS similarity
     FROM "Material" m
     WHERE m."embedding" IS NOT NULL
       AND m."isHidden" = false
       AND (1 - (m."embedding" <=> '${literal}'::vector)) > ${threshold}
       AND EXISTS (
         SELECT 1 FROM "LessonMaterial" lm
         JOIN "Lesson" l ON l.id = lm."lessonId"
         WHERE lm."materialId" = m.id AND l."isHidden" = false
       )
     ORDER BY m."embedding" <=> '${literal}'::vector
     LIMIT ${limit}`,
  );
  return rows.map((r) => ({
    materialId: r.id,
    type: r.type,
    title: r.title,
    description: r.description,
    ctaText: r.cta_text,
    externalUrl: r.external_url,
    hasFile: r.has_file,
    similarity: r.similarity,
  }));
}
```

Создать `packages/ai/src/assistant/materials/index.ts`:
```ts
export { searchMaterialsByEmbedding } from './retrieve-materials';
export { buildMaterialText, typeLabel } from './embed-materials';
```

- [ ] **Step 4: Запустить — пройдёт**

Run: `cd "<worktree>" && pnpm --filter @mpstats/ai test src/assistant/materials/retrieve-materials.test.ts`
Expected: PASS (2).

- [ ] **Step 5: Commit**

```bash
cd "<worktree>" && git add packages/ai/src/assistant/materials/retrieve-materials.ts packages/ai/src/assistant/materials/retrieve-materials.test.ts packages/ai/src/assistant/materials/index.ts
git commit -m "feat(materials): searchMaterialsByEmbedding retrieval"
```

## Task MA4: Интеграция ретрива материалов в пайплайн (только material-ветка)

**Files:** Modify `packages/ai/src/assistant/retrieve.ts`, `packages/ai/src/assistant/pipeline.ts`; Test: расширить `packages/ai/src/assistant/pipeline.test.ts`

- [ ] **Step 1: Расширить retrieve.ts**

В `packages/ai/src/assistant/retrieve.ts`:
- Импорт: `import { searchMaterialsByEmbedding } from './materials';` и тип `MaterialCandidate` в `import type`.
- В `AssistantRetrieval` добавить `materials: MaterialCandidate[];`.
- Добавить функцию:
```ts
const MATERIAL_LIMIT = 6;
const MATERIAL_THRESHOLD = 0.35;

async function retrieveMaterials(query: string): Promise<MaterialCandidate[]> {
  return searchMaterialsByEmbedding(query, { limit: MATERIAL_LIMIT, threshold: MATERIAL_THRESHOLD });
}
```
- Изменить сигнатуру `retrieveForAssistant`:
```ts
export async function retrieveForAssistant(
  query: string,
  opts: { withMaterials?: boolean } = {},
): Promise<AssistantRetrieval> {
  const expanded = expandSellerQuery(query);
  const [lessons, jobs, materials] = await Promise.all([
    retrieveLessons(expanded),
    retrieveJobs(query),
    opts.withMaterials ? retrieveMaterials(query) : Promise.resolve([] as MaterialCandidate[]),
  ]);
  return { lessons, jobs, materials };
}
```

- [ ] **Step 2: Обновить pipeline.ts — материалы только для material**

В `packages/ai/src/assistant/pipeline.ts`, в material|complaint-ветке:
```ts
  // material | complaint → материальная ветка. Материалы подмешиваем ТОЛЬКО для чистого material
  // (жалобе complaint не отвлекаем внимание материалами).
  const { lessons, jobs, materials } = await retrieveForAssistant(args.query, {
    withMaterials: category === 'material',
  });
  const r = await synthesizeAssistantResponse({
    query: args.query,
    history: args.history,
    lessonCandidates: lessons,
    jobCandidates: jobs,
    materialCandidates: materials,
  });
  return { category, ...r };
```

- [ ] **Step 3: Добавить тест ветвления материалов в pipeline.test.ts**

В `packages/ai/src/assistant/pipeline.test.ts` расширить существующие моки: `retrieveForAssistant` мок должен возвращать `{ lessons: [], jobs: [], materials: [] }`; `synthesizeAssistantResponse` мок возвращать `{ answer, lessons: [], jobs: [], navLinks: [], materials: [] }`. Добавить кейсы:
```ts
  it('material → retrieve с withMaterials:true', async () => {
    classifyDomain.mockResolvedValue({ category: 'material' });
    retrieveForAssistant.mockResolvedValue({ lessons: [], jobs: [], materials: [] });
    synthesizeAssistantResponse.mockResolvedValue({ answer: 'A', lessons: [], jobs: [], navLinks: [], materials: [] });
    await runAssistantPipeline({ query: 'как считать ДРР', history: [] });
    expect(retrieveForAssistant).toHaveBeenCalledWith('как считать ДРР', { withMaterials: true });
  });

  it('complaint → retrieve с withMaterials:false', async () => {
    classifyDomain.mockResolvedValue({ category: 'complaint' });
    retrieveForAssistant.mockResolvedValue({ lessons: [], jobs: [], materials: [] });
    synthesizeAssistantResponse.mockResolvedValue({ answer: 'help', lessons: [], jobs: [], navLinks: [], materials: [] });
    await runAssistantPipeline({ query: 'не работает', history: [] });
    expect(retrieveForAssistant).toHaveBeenCalledWith('не работает', { withMaterials: false });
  });
```
(Существующие material/complaint кейсы, если ассертят `retrieveForAssistant` вызов — обновить под новую сигнатуру с opts.)

- [ ] **Step 4: Запустить pipeline-тест + весь пакет + tsc**

Run: `cd "<worktree>" && pnpm --filter @mpstats/ai test src/assistant/pipeline.test.ts && pnpm --filter @mpstats/ai exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd "<worktree>" && git add packages/ai/src/assistant/retrieve.ts packages/ai/src/assistant/pipeline.ts packages/ai/src/assistant/pipeline.test.ts
git commit -m "feat(materials): retrieve materials only for material branch"
```

## Task MA5: Синтез — whitelist materialIds (кап ≤2) + промпт

**Files:** Modify `packages/ai/src/assistant/synthesize.ts`; Test: расширить `packages/ai/src/__tests__/assistant-synthesize.test.ts`

- [ ] **Step 1: Обновить synthesize.ts**

В `packages/ai/src/assistant/synthesize.ts`:
- `SynthesizeArgs` += `materialCandidates: MaterialCandidate[];` (импорт типа).
- `llmSchema` += `materialIds: z.array(z.string()).default([])`.
- В системный промпт добавить пункт про материалы:
```
5. В "materialIds" клади ТОЛЬКО id из списка КАНДИДАТОВ-МАТЕРИАЛОВ ниже и ТОЛЬКО если материал прямо в тему вопроса или юзер просит шаблон/чек-лист/таблицу. МАКСИМУМ 1-2, не вываливай все. Обычно 0-1. Не придумывай id. В тексте ответа материалы и их id не упоминай.
```
И в JSON-формат ответа добавить `"materialIds": ["<id>"]`.
- В `buildUserMessage` добавить блок кандидатов-материалов:
```ts
  const materials = args.materialCandidates
    .map((m) => `- МАТЕРИАЛ id=${m.materialId} | ${m.title} | ${m.type}`)
    .join('\n');
```
и включить в возвращаемую строку: `\n\nКАНДИДАТЫ-МАТЕРИАЛЫ:\n${materials || '(нет)'}`.
- В обработке результата: whitelist + кап 2 (материалы БЕЗ резолвинга доступа — заглушки, доступ проставит роутер):
```ts
  const CAP = 2;
  const materialById = new Map(args.materialCandidates.map((m) => [m.materialId, m]));
  const materials = parsed.materialIds
    .filter((id) => materialById.has(id))
    .slice(0, CAP)
    .map((id) => {
      const m = materialById.get(id)!;
      return {
        materialId: id, type: m.type, title: m.title, ctaText: m.ctaText,
        isAccessible: true, externalUrl: m.externalUrl, hasFile: m.hasFile,
      } satisfies AssistantMaterialRef;
    });
```
- Добавить `materials` в оба return (`fallback` → `materials: []`; финальный → `materials`).

- [ ] **Step 2: Добавить тест whitelist материалов**

В `packages/ai/src/__tests__/assistant-synthesize.test.ts`:
- В существующие вызовы `synthesizeAssistantResponse({...})` добавить `materialCandidates: []` (иначе tsc).
- Добавить фикстуру materialCands + тест:
```ts
const materialCands = [
  { materialId: 'M1', type: 'CHECKLIST', title: 'Чек-лист карточки', description: null, ctaText: 'Скачать', externalUrl: null, hasFile: true, similarity: 0.7 },
  { materialId: 'M2', type: 'CALCULATION_TABLE', title: 'Таблица юнит-экономики', description: null, ctaText: 'Открыть', externalUrl: 'https://x', hasFile: false, similarity: 0.6 },
];

it('whitelist материалов + кап 2, ghost выброшен', async () => {
  mockReply({ answer: 'текст', lessonIds: [], jobIds: [], materialIds: ['GHOST', 'M1', 'M2'] });
  const r = await synthesizeAssistantResponse({ query: 'чек-лист по карточке', history: [], lessonCandidates: [], jobCandidates: [], materialCandidates: materialCands });
  expect(r.materials.map((m) => m.materialId)).toEqual(['M1', 'M2']);
  expect(r.materials[0]).toMatchObject({ isAccessible: true, hasFile: true });
});

it('материалы не отдаются при отсутствии materialIds', async () => {
  mockReply({ answer: 'текст', lessonIds: [], jobIds: [] });
  const r = await synthesizeAssistantResponse({ query: 'q', history: [], lessonCandidates: [], jobCandidates: [], materialCandidates: materialCands });
  expect(r.materials).toEqual([]);
});
```

- [ ] **Step 3: Запустить + весь пакет + tsc**

Run: `cd "<worktree>" && pnpm --filter @mpstats/ai test && pnpm --filter @mpstats/ai exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd "<worktree>" && git add packages/ai/src/assistant/synthesize.ts packages/ai/src/__tests__/assistant-synthesize.test.ts
git commit -m "feat(materials): synthesize whitelists materialIds (cap 2) + strict prompt"
```

---

# Phase M-B — Доступ + роутер + персист

## Task MB1: Батч-резолвер доступа + гейтинг URL

**Files:** Create `packages/api/src/utils/material-access.ts`; Test `packages/api/src/utils/material-access.test.ts`

- [ ] **Step 1: Написать падающий тест pure `applyMaterialAccess`**

Создать `packages/api/src/utils/material-access.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { applyMaterialAccess } from './material-access';
import type { AssistantMaterialRef } from '@mpstats/ai';

const mk = (id: string, ext: string | null): AssistantMaterialRef => ({
  materialId: id, type: 'CHECKLIST', title: id, ctaText: 'x', isAccessible: true, externalUrl: ext, hasFile: false,
});

describe('applyMaterialAccess', () => {
  it('залоченный → isAccessible=false, externalUrl=null', () => {
    const out = applyMaterialAccess([mk('m1', 'https://x'), mk('m2', 'https://y')], new Set(['m1']));
    expect(out.find((m) => m.materialId === 'm1')).toMatchObject({ isAccessible: true, externalUrl: 'https://x' });
    expect(out.find((m) => m.materialId === 'm2')).toMatchObject({ isAccessible: false, externalUrl: null });
  });
});
```

- [ ] **Step 2: Запустить — упадёт**

Run: `cd "<worktree>" && pnpm --filter @mpstats/api test src/utils/material-access.test.ts`
Expected: FAIL.

- [ ] **Step 3: Реализовать material-access.ts**

Создать `packages/api/src/utils/material-access.ts`:
```ts
import type { PrismaClient } from '@mpstats/db';
import type { AssistantMaterialRef } from '@mpstats/ai';
import {
  getUserActiveSubscriptions,
  getUserAdminBypass,
  getFirstJobLessonIds,
  isLessonAccessible,
} from './access';
import { isFeatureEnabled } from './feature-flags';

// Батч: множество materialId → Set доступных (доступен ⟺ ≥1 видимый родительский урок доступен).
// Зеркалит D-23 ACL из material.getSignedUrl, но без N+1 (subs/bypass/first-lessons резолвятся один раз).
export async function resolveAccessibleMaterialIds(
  prisma: PrismaClient,
  userId: string,
  materialIds: string[],
): Promise<Set<string>> {
  if (materialIds.length === 0) return new Set();
  const materials = await prisma.material.findMany({
    where: { id: { in: materialIds }, isHidden: false },
    select: {
      id: true,
      lessons: {
        where: { lesson: { isHidden: false } },
        select: { lesson: { select: { id: true, order: true, courseId: true } } },
      },
    },
  });
  const allLessonIds = materials.flatMap((m) => m.lessons.map((lm) => lm.lesson.id));
  const [subs, billingEnabled, isAdminBypass, firstJobLessonIds] = await Promise.all([
    getUserActiveSubscriptions(userId, prisma),
    isFeatureEnabled('billing_enabled'),
    getUserAdminBypass(userId, prisma),
    getFirstJobLessonIds(prisma, allLessonIds),
  ]);
  const accessible = new Set<string>();
  for (const m of materials) {
    const ok = m.lessons.some((lm) =>
      isLessonAccessible(
        { order: lm.lesson.order, courseId: lm.lesson.courseId },
        subs,
        billingEnabled,
        isAdminBypass,
        firstJobLessonIds.has(lm.lesson.id),
      ),
    );
    if (ok) accessible.add(m.id);
  }
  return accessible;
}

// Pure: проставить isAccessible + занулить externalUrl у залоченных (не течёт на фронт).
export function applyMaterialAccess(
  materials: AssistantMaterialRef[],
  accessibleIds: Set<string>,
): AssistantMaterialRef[] {
  return materials.map((m) => {
    const isAccessible = accessibleIds.has(m.materialId);
    return { ...m, isAccessible, externalUrl: isAccessible ? m.externalUrl : null };
  });
}
```

> Проверь точные пути импорта `isFeatureEnabled` (в `material.ts` используется — сверься с его import) и `getUserActiveSubscriptions`/`getUserAdminBypass`/`getFirstJobLessonIds`/`isLessonAccessible` из `./access`.

- [ ] **Step 4: Запустить — пройдёт**

Run: `cd "<worktree>" && pnpm --filter @mpstats/api test src/utils/material-access.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd "<worktree>" && git add packages/api/src/utils/material-access.ts packages/api/src/utils/material-access.test.ts
git commit -m "feat(materials): batch material access resolver + URL gating"
```

## Task MB2: Миграция materialIds + роутер персист/отдача с гейтингом

**Files:** Modify `packages/db/prisma/schema.prisma`, `scripts/migrations/add-material-embedding.ts`, `packages/api/src/routers/assistant.ts`

- [ ] **Step 1: Схема — колонка materialIds**

В `packages/db/prisma/schema.prisma`, модель `AssistantMessage` (после `navLinks`) добавить:
```prisma
  materialIds    String[] @default([]) // подмешанные карточки материалов (assistant)
```
Run: `cd "<worktree>" && pnpm --filter @mpstats/db exec prisma generate` (НЕ push).

- [ ] **Step 2: Дополнить скрипт миграции**

В `scripts/migrations/add-material-embedding.ts`, в `main()` добавить перед `console.log`:
```ts
  await run(`ALTER TABLE "AssistantMessage" ADD COLUMN IF NOT EXISTS "materialIds" text[] NOT NULL DEFAULT '{}'::text[];`);
```
Обновить финальный лог: `'OK: Material.embedding + index + AssistantMessage.materialIds добавлены'`.

- [ ] **Step 3: Роутер — персист + резолвинг доступа**

В `packages/api/src/routers/assistant.ts`:
- Импорт: `import { resolveAccessibleMaterialIds, applyMaterialAccess } from '../utils/material-access';` и тип `AssistantMaterialRef` в `import type` из `@mpstats/ai`.
- `EnrichedMessage` += `materials: AssistantMaterialRef[];`.
- В `sendMessage`, персист assistant-сообщения += `materialIds: result.materials.map((m) => m.materialId)`.
- В `sendMessage` return — прогнать материалы через гейтинг перед отдачей:
```ts
      const accessibleIds = await resolveAccessibleMaterialIds(
        ctx.prisma, userId, result.materials.map((m) => m.materialId),
      );
      const gatedMaterials = applyMaterialAccess(result.materials, accessibleIds);
      const quotaAfter = await getAssistantQuota(userId, ctx.prisma, new Date());
      return { ...result, materials: gatedMaterials, quota: quotaAfter };
```
- В `getConversation`: собрать `allMaterialIds` (как lessonIds/jobIds), `prisma.material.findMany` (non-hidden) → построить `AssistantMaterialRef` (isAccessible=true заглушка, externalUrl из модели, hasFile = storagePath!=null), затем `resolveAccessibleMaterialIds` + `applyMaterialAccess` (пересчёт доступа при чтении), и в маппинге строк добавить:
```ts
      materials: (r.materialIds ?? [])
        .filter((id) => materialMap.has(id))
        .map((id) => materialRefMap.get(id)!),
```
где `materialRefMap` — Map после гейтинга. (Подробности реализации маппинга — по образцу lessons/jobs enrichment в этом же методе.)

- [ ] **Step 4: Typecheck api**

Run: `cd "<worktree>" && pnpm --filter @mpstats/api exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd "<worktree>" && git add packages/db/prisma/schema.prisma scripts/migrations/add-material-embedding.ts packages/api/src/routers/assistant.ts
git commit -m "feat(materials): persist materialIds + gated material enrichment in router"
```

---

# Phase M-C — Фронт

## Task MC1: Карточка материала в AssistantCards

**Files:** Modify `apps/web/src/components/assistant/AssistantCards.tsx`

- [ ] **Step 1: Обновить компонент**

В `apps/web/src/components/assistant/AssistantCards.tsx`:
- Импорт-тип `AssistantMaterialRef` из `@mpstats/ai`; `import { trpc } from '@/lib/trpc/client'` (для getSignedUrl) — если компонент серверный/презентационный, вынести кнопку скачивания в маленький client-подкомпонент `MaterialCard` (`'use client'`). Проверить: `AssistantCards.tsx` уже `'use client'` (да, есть `Link` и FavoriteButton) → можно инлайн.
- `Props` += `materials?: AssistantMaterialRef[]`.
- Ранний возврат учитывает materials.
- Рендер (после navLinks): для каждого material карточка:
  - иконка по типу (по type — простой emoji/svg маппинг: 📊 таблица, ✅ чеклист, 📄 памятка, 🖼 презентация, 🔗 сервис),
  - title + ctaText,
  - `isAccessible && externalUrl` → `<a href={externalUrl} target="_blank" rel="noopener">{ctaText}</a>`,
  - `isAccessible && hasFile && !externalUrl` → кнопка «Скачать» → onClick вызывает `trpc.material.getSignedUrl` (useMutation/useUtils fetch) → `window.open(url)`,
  - `!isAccessible` → замок + ссылка «Оформить доступ» → `/billing`,
  - `FavoriteButton itemType="MATERIAL" itemId={materialId}` (проверить, что FavoriteType поддерживает MATERIAL — да).

Точную вёрстку сделать в стиле существующих карточек (border/rounded/p-2.5). Для скачивания использовать `const getUrl = trpc.material.getSignedUrl.useMutation()` или `utils.material.getSignedUrl.fetch({materialId})` → открыть результат.

- [ ] **Step 2: Typecheck web**

Run: `cd "<worktree>" && pnpm --filter web exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd "<worktree>" && git add apps/web/src/components/assistant/AssistantCards.tsx
git commit -m "feat(assistant-ui): material card (open/download/locked)"
```

## Task MC2: Прокидка materials через Conversation

**Files:** Modify `apps/web/src/components/assistant/AssistantConversation.tsx`

- [ ] **Step 1: Обновить**

В `apps/web/src/components/assistant/AssistantConversation.tsx`:
- Импорт-тип `AssistantMaterialRef`.
- `UiMessage` += `materials?: AssistantMaterialRef[]`.
- Гидрация из `convo.messages` (setMessages) += `materials: m.materials`.
- `sendMutation.onSuccess` append += `materials: res.materials`.
- Рендер `<AssistantCards ... materials={m.materials ?? []} />`.
- (Опц.) favItems useMemo — добавить материалы для FavoriteButton-состояния, если хочешь чтобы сердечко материалов гидрировалось (реюз `favorite.isFavorited` с `itemType:'MATERIAL'`). Не критично для v1.

- [ ] **Step 2: Typecheck web**

Run: `cd "<worktree>" && pnpm --filter web exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd "<worktree>" && git add apps/web/src/components/assistant/AssistantConversation.tsx
git commit -m "feat(assistant-ui): thread materials through conversation"
```

---

# Phase M-D — Калибровка + верификация

## Task MD1: Калибровка порога/капа материалов

**Files:** Create `scripts/material-eval/cases.json`, `scripts/material-eval/run.ts`

> Требует прогнанной миграции + backfill эмбеддингов на реальной БД (staging). Если БД без эмбеддингов материалов — калибровку отложить до staging-деплоя (зафиксировать в отчёте).

- [ ] **Step 1: Прогнать миграцию + backfill (owner/staging)**

Миграция: `SUPABASE_MGMT_TOKEN=... NODE_OPTIONS=--dns-result-order=ipv4first npx tsx scripts/migrations/add-material-embedding.ts`
Backfill: `set -a && . .env && set +a && NODE_OPTIONS=--dns-result-order=ipv4first npx tsx --conditions=react-server packages/ai/src/assistant/materials/embed-materials.ts`
Expected: `done: N/N materials`.

- [ ] **Step 2: Собрать cases.json + run.ts**

По образцу `scripts/concierge-eval/`: ~15 кейсов реальных бизнес-запросов, для которых ожидается конкретный материал (`expect: materialId`) или отсутствие (`expect: "NONE"` — запрос без релевантного материала). `run.ts` эмбеддит запрос → `searchMaterialsByEmbedding` при разных порогах → печатает top-K + similarity + PASS/FAIL.

- [ ] **Step 3: Калибровка**

Прогнать при TH=0.30/0.35/0.40, выбрать порог с лучшим балансом (материал появляется на релевантных, молчит на нерелевантных). Вписать в `MATERIAL_THRESHOLD` (`retrieve.ts`). Проверить, что кап ≤2 не даёт «стены».

- [ ] **Step 4: Commit**

```bash
cd "<worktree>" && git add scripts/material-eval/cases.json scripts/material-eval/run.ts packages/ai/src/assistant/retrieve.ts
git commit -m "test(materials): eval harness + calibrated retrieval threshold"
```

## Task MD2: Холистическая проверка

- [ ] **Все пакеты зелёные**

Run: `cd "<worktree>" && pnpm typecheck && pnpm --filter @mpstats/ai test && pnpm --filter @mpstats/api test && pnpm --filter web test`
Expected: PASS (кроме известного yandex-oauth web-флейка — проверить изоляцией).

- [ ] **Staging deploy + UAT (совместно с концьержем)**

Прогнать ОБЕ группы миграций на staging (концьерж `category`+`navLinks` + материалы `embedding`+`materialIds`) + backfill эмбеддингов материалов, затем staging-деплой (`--no-cache web`). UAT: бизнес-вопрос → урок + ≤2 релевантных материала; залоченный материал → замок + paywall; доступный external → «Открыть», file → «Скачать»; концьерж/off_domain → без материалов.

---

## Deferred / вне скоупа
- Standalone-материалы (`isStandalone`).
- Материалы в in-lesson чате.
- Полнотекст-индексация содержимого файлов материала (эмбеддим только метаданные).
- Отдельная детекция «явного запроса материала».

## ВАЖНО для исполнителя (следующая сессия)
- Концьерж-слой на этой ветке **НЕ протестирован на staging** — material-surfacing строится поверх непроверенного кода. Тестируем ВСЁ вместе на staging (см. MD2).
- Две группы аддитивных миграций прогоняются на staging совместно.
- Не мержить `feature/tochka-oauth-login` (residue). Работать только в worktree `feature/ai-assistant`.
