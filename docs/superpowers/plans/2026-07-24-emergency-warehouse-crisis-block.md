# Экстренный ЧП-блок «Склады WB под ударом» — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Загрузить антикризисный вебинар как урок, обернуть в `Job` из 3 уроков, показать заметный ЧП-блок на витрине и в каталоге решений под единым флагом, все 3 урока — бесплатны.

**Architecture:** Backend — константы+флаг-хелпер, вливание аллоулиста бесплатных уроков в единый чокпоинт `getFirstJobLessonIds`, один tRPC-запрос `job.getEmergencyFeatured` (источник правды для обеих поверхностей). Frontend — `EmergencyBanner` замещает `HeroFirstLesson` на `/dashboard`, `EmergencyFeaturedCard` пинится над осями в `/learn/solutions` (WB). Контент — идемпотентные tsx-сиды + Kinescope. **Единственный рычаг — env-флаг:** джоба остаётся `isPublished=false` (нет в обычном каталоге → ноль утечки на прод при общей БД), ЧП-поверхности гейтятся флагом, а `getJob`/`getTitleBySlug` получают байпас `isPublished` для ЧП-slug, чтобы детальная страница работала.

**Tech Stack:** Next.js 14 (App Router), tRPC, Prisma (Supabase), TypeScript, Vitest, Docker Compose.

## Global Constraints

- **Prod-safety:** НИКАКИХ `prisma db push`/`migrate` против этой БД. Только additive tsx-скрипты. Схему не меняем (миграции не нужны — новых колонок нет).
- **Ветка:** `feature/emergency-warehouse-crisis-block`. Прямые коммиты в master запрещены.
- **Флаг:** `EMERGENCY_BANNER_ENABLED` — рантайм env (`=== 'true'`), НЕ `NEXT_PUBLIC_*` (иначе kill-switch требует пересборки). Образец: `packages/api/src/services/offer/resolve.ts:16` (`OFFER_ENABLED`).
- **Билд перед деплоем:** `pnpm --filter web build` локально обязателен (`next build` ловит server-only-в-client, чего `tsc` не видит). Client-компоненты берут данные из tRPC-query, не из server-only импортов.
- **Staging:** `docker compose -p maal-staging -f docker-compose.staging.yml up -d --build` (при .ts/.tsx — `--no-cache web`). После staging — `git checkout master` до prod-деплоя.
- **Целевые id (verbatim):**
  - webinar lesson: `04_workshops_w12_jul26_crisis_001`
  - text lesson 1: `04_workshops_text_d1db18c6-7275-4e16-ab16-8ca58117cd50`
  - text lesson 2: `04_workshops_text_3bd9fe05-4195-41f8-a507-96fde377ec91`
  - job slug: `wb-warehouse-crisis-2026`
- **Копирайт баннера/пина** — по редполитике MPSTATS (скилл `mpstats-copywriting`); тексты в плане — черновые, owner может править.
- **Локальные Supabase-скрипты:** `NODE_OPTIONS=--dns-result-order=ipv4first npx tsx <script>`.

---

## File Structure

- Create `packages/api/src/utils/emergency.ts` — константы (`EMERGENCY_JOB_SLUG`, `EMERGENCY_FREE_LESSON_IDS`) + `emergencyBannerEnabled()`.
- Modify `packages/api/src/utils/access.ts` — влить `EMERGENCY_FREE_LESSON_IDS` в `getFirstJobLessonIds`.
- Create `packages/api/src/utils/__tests__/access-free-lessons.test.ts` — тесты аллоулиста.
- Modify `packages/api/src/routers/job.ts` — процедура `getEmergencyFeatured`.
- Create `packages/api/src/routers/__tests__/job-emergency-featured.test.ts` — тесты процедуры.
- Create `apps/web/src/components/dashboard/EmergencyBanner.tsx` — баннер витрины.
- Create `apps/web/src/components/learning/EmergencyFeaturedCard.tsx` — пин каталога.
- Modify `apps/web/src/app/(main)/dashboard/page.tsx` — слот баннер↔первый-урок.
- Modify `apps/web/src/app/(main)/learn/solutions/page.tsx` — пин над каталогом (WB).
- Create `scripts/seed-lesson-w12-webinar.ts` — seed урока-вебинара.
- Create `scripts/kinescope-map-w12-webinar.json` — карта Kinescope (1 запись).
- Create `scripts/seed-job-warehouse-crisis.ts` — создать Job + привязать 3 урока.

---

## Task 1: Emergency config module (константы + флаг)

**Files:**
- Create: `packages/api/src/utils/emergency.ts`
- Modify: `packages/api/src/index.ts` (ре-экспорт, если нужен фронту)

**Interfaces:**
- Produces: `EMERGENCY_JOB_SLUG: string`, `EMERGENCY_FREE_LESSON_IDS: ReadonlySet<string>`, `emergencyBannerEnabled(): boolean`.

- [ ] **Step 1: Создать модуль**

```typescript
// packages/api/src/utils/emergency.ts
/**
 * Экстренный ЧП-блок «Склады WB под ударом» (2026-07). Единый источник констант.
 * Флаг — рантайм env (как OFFER_ENABLED): смена значения + `up -d web`, без пересборки.
 */
export const EMERGENCY_JOB_SLUG = 'wb-warehouse-crisis-2026';

/** 3 урока набора — бесплатны для всех (решение D2, spec §D). */
export const EMERGENCY_FREE_LESSON_IDS: ReadonlySet<string> = new Set([
  '04_workshops_w12_jul26_crisis_001',
  '04_workshops_text_d1db18c6-7275-4e16-ab16-8ca58117cd50',
  '04_workshops_text_3bd9fe05-4195-41f8-a507-96fde377ec91',
]);

export function emergencyBannerEnabled(): boolean {
  return process.env.EMERGENCY_BANNER_ENABLED === 'true';
}
```

- [ ] **Step 2: Проверить сборку пакета**

Run: `cd "D:/GpT_docs/mpSTATS ACADEMY ADAPTIVE LEARNING/MAAL" && pnpm --filter @mpstats/api typecheck`
Expected: PASS (нет ошибок типов).

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/utils/emergency.ts
git commit -m "feat(api): emergency block constants + runtime flag helper"
```

---

## Task 2: Бесплатный доступ к 3 урокам (аллоулист)

`isLessonAccessible` в вызовах получает урок **без `id`**; «бесплатность» приходит из `getFirstJobLessonIds(...).has(l.id)`. Вливаем аллоулист в этот единый чокпоинт — все поверхности (dashboard, job, learning, material, ai, `checkLessonAccess`) наследуют без правок.

**Files:**
- Modify: `packages/api/src/utils/access.ts:65-94` (`getFirstJobLessonIds`)
- Test: `packages/api/src/utils/__tests__/access-free-lessons.test.ts`

**Interfaces:**
- Consumes: `EMERGENCY_FREE_LESSON_IDS` (Task 1).
- Produces: `getFirstJobLessonIds(prisma, lessonIds?)` теперь возвращает объединение (первые уроки джоб) ∪ (аллоулист, суженный `lessonIds`).

- [ ] **Step 1: Написать падающий тест**

```typescript
// packages/api/src/utils/__tests__/access-free-lessons.test.ts
import { describe, it, expect, vi } from 'vitest';
import { getFirstJobLessonIds } from '../access';
import { EMERGENCY_FREE_LESSON_IDS } from '../emergency';

function prismaWithNoJobLessons() {
  return { jobLesson: { findMany: vi.fn().mockResolvedValue([]) } } as any;
}

describe('getFirstJobLessonIds — free-lesson allowlist', () => {
  it('включает id из аллоулиста даже когда нет джоб (bulk)', async () => {
    const set = await getFirstJobLessonIds(prismaWithNoJobLessons());
    for (const id of EMERGENCY_FREE_LESSON_IDS) expect(set.has(id)).toBe(true);
  });

  it('при фильтре lessonIds возвращает только запрошенные free-id', async () => {
    const wanted = '04_workshops_w12_jul26_crisis_001';
    const other = '04_workshops_text_d1db18c6-7275-4e16-ab16-8ca58117cd50';
    const set = await getFirstJobLessonIds(prismaWithNoJobLessons(), [wanted]);
    expect(set.has(wanted)).toBe(true);
    expect(set.has(other)).toBe(false); // не запрашивали — не должен просочиться
  });

  it('пустой lessonIds → пустой набор (ранний выход сохранён)', async () => {
    const set = await getFirstJobLessonIds(prismaWithNoJobLessons(), []);
    expect(set.size).toBe(0);
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `cd "D:/GpT_docs/mpSTATS ACADEMY ADAPTIVE LEARNING/MAAL" && pnpm --filter @mpstats/api test access-free-lessons`
Expected: FAIL (free-id отсутствуют — аллоулист ещё не влит).

- [ ] **Step 3: Влить аллоулист в `getFirstJobLessonIds`**

В `packages/api/src/utils/access.ts` добавить импорт вверху:

```typescript
import { EMERGENCY_FREE_LESSON_IDS } from './emergency';
```

Обновить тело функции (обновив и doc-comment). Ранний выход `if (lessonIds && lessonIds.length === 0) return new Set();` остаётся первым. Перед `return firstSet;` влить аллоулист:

```typescript
  // Free-lesson allowlist (spec §D, ЧП-набор): эти уроки бесплатны везде, где
  // access-проверка проходит через этот чокпоинт, независимо от членства в джобе.
  for (const id of EMERGENCY_FREE_LESSON_IDS) {
    if (restrict && !restrict.has(id)) continue;
    firstSet.add(id);
  }
  return firstSet;
```

(`restrict` — уже существующая `lessonIds ? new Set(lessonIds) : null` внутри функции.) Doc-comment функции дополнить строкой: «Плюс явный аллоулист `EMERGENCY_FREE_LESSON_IDS` (spec §D).»

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `pnpm --filter @mpstats/api test access-free-lessons`
Expected: PASS (3 теста).

- [ ] **Step 5: Регресс существующих тестов доступа**

Run: `pnpm --filter @mpstats/api test access-partner`
Expected: PASS (ничего не сломали).

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/utils/access.ts packages/api/src/utils/__tests__/access-free-lessons.test.ts
git commit -m "feat(access): free-lesson allowlist for emergency crisis set (D2)"
```

---

## Task 3: tRPC `job.getEmergencyFeatured` + байпас `isPublished` для ЧП-slug

Единый запрос-источник для баннера и пина, гейт — **только флаг** (джоба остаётся `isPublished=false`, чтобы не течь в обычный каталог). Плюс байпас `isPublished` в `getJob`/`getTitleBySlug`, чтобы детальная страница ЧП-джобы открывалась.

**Files:**
- Modify: `packages/api/src/routers/job.ts` (процедура `getEmergencyFeatured` + байпас в `getJob:167` и `getTitleBySlug:132`)
- Test: `packages/api/src/routers/__tests__/job-emergency-featured.test.ts`

**Interfaces:**
- Consumes: `EMERGENCY_JOB_SLUG`, `emergencyBannerEnabled()` (Task 1).
- Produces: `job.getEmergencyFeatured` → `{ enabled: boolean; job: { slug: string; title: string; description: string; marketplace: 'WB' | 'OZON' | 'BOTH'; lessonCount: number } | null }`.

- [ ] **Step 1: Написать падающий тест**

```typescript
// packages/api/src/routers/__tests__/job-emergency-featured.test.ts
import { describe, it, expect, afterEach, vi } from 'vitest';
import { jobRouter } from '../job';

function caller(prisma: any) {
  return jobRouter.createCaller({ prisma, user: { id: 'u1' } } as any);
}
const jobRow = {
  slug: 'wb-warehouse-crisis-2026', title: 'Склады WB под ударом',
  description: 'desc', marketplace: 'WB', lessons: [{}, {}, {}],
};

describe('job.getEmergencyFeatured', () => {
  const OLD = process.env.EMERGENCY_BANNER_ENABLED;
  afterEach(() => { process.env.EMERGENCY_BANNER_ENABLED = OLD; });

  it('флаг off → { enabled:false, job:null } и в БД не ходит', async () => {
    process.env.EMERGENCY_BANNER_ENABLED = 'false';
    const prisma = { job: { findFirst: vi.fn() } };
    const res = await caller(prisma).getEmergencyFeatured();
    expect(res).toEqual({ enabled: false, job: null });
    expect(prisma.job.findFirst).not.toHaveBeenCalled();
  });

  it('флаг on + джоба есть (даже unpublished) → job заполнен', async () => {
    process.env.EMERGENCY_BANNER_ENABLED = 'true';
    const prisma = { job: { findFirst: vi.fn().mockResolvedValue(jobRow) } };
    const res = await caller(prisma).getEmergencyFeatured();
    expect(res.enabled).toBe(true);
    expect(res.job).toEqual({
      slug: 'wb-warehouse-crisis-2026', title: 'Склады WB под ударом',
      description: 'desc', marketplace: 'WB', lessonCount: 3,
    });
  });

  it('флаг on, но джобы нет → job:null', async () => {
    process.env.EMERGENCY_BANNER_ENABLED = 'true';
    const prisma = { job: { findFirst: vi.fn().mockResolvedValue(null) } };
    const res = await caller(prisma).getEmergencyFeatured();
    expect(res).toEqual({ enabled: true, job: null });
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `pnpm --filter @mpstats/api test job-emergency-featured`
Expected: FAIL (`getEmergencyFeatured is not a function`).

- [ ] **Step 3: Добавить процедуру + байпас в `job.ts`**

Импорт вверху `packages/api/src/routers/job.ts`:

```typescript
import { EMERGENCY_JOB_SLUG, emergencyBannerEnabled } from '../utils/emergency';
```

Добавить в объект `jobRouter` (например после `getCatalog`). Гейт — только флаг; джобу грузим **независимо от `isPublished`** (она намеренно остаётся неопубликованной, чтобы не течь в обычный каталог):

```typescript
  // Экстренный ЧП-блок: единый источник для баннера витрины и пина в каталоге.
  // Гейт — только флаг (spec §C). Джоба остаётся isPublished=false (нет в обычном
  // каталоге), поэтому грузим по slug без фильтра isPublished.
  getEmergencyFeatured: protectedProcedure.query(async ({ ctx }) => {
    if (!emergencyBannerEnabled()) return { enabled: false as const, job: null };
    const job = await ctx.prisma.job.findFirst({
      where: { slug: EMERGENCY_JOB_SLUG },
      select: {
        slug: true, title: true, description: true, marketplace: true,
        lessons: {
          where: { lesson: { isHidden: false, course: { isHidden: false } } },
          select: { lessonId: true },
        },
      },
    });
    if (!job) return { enabled: true as const, job: null };
    return {
      enabled: true as const,
      job: {
        slug: job.slug, title: job.title, description: job.description,
        marketplace: job.marketplace as 'WB' | 'OZON' | 'BOTH',
        lessonCount: job.lessons.length,
      },
    };
  }),
```

Байпас `isPublished` для ЧП-slug, чтобы детальная страница открывалась при неопубликованной джобе.

В `getTitleBySlug` (строка ~132) заменить:
```typescript
        if (!job || !job.isPublished) return null;
```
на:
```typescript
        if (!job || (!job.isPublished && job.slug !== EMERGENCY_JOB_SLUG)) return null;
```

В `getJob` (строка ~167) — та же замена:
```typescript
        if (!job || (!job.isPublished && job.slug !== EMERGENCY_JOB_SLUG)) return null;
```

(Доступ к урокам внутри `getJob` уже корректен — 3 урока бесплатны через Task 2, остальное как обычно.)

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `pnpm --filter @mpstats/api test job-emergency-featured`
Expected: PASS (3 теста).

- [ ] **Step 5: Регресс каталога**

Run: `pnpm --filter @mpstats/api test job`
Expected: PASS (байпас не сломал существующие тесты `getJob`/`getCatalog`).

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/routers/job.ts packages/api/src/routers/__tests__/job-emergency-featured.test.ts
git commit -m "feat(api): job.getEmergencyFeatured (flag-only) + isPublished bypass for crisis slug"
```

---

## Task 4: `EmergencyBanner` + слот на `/dashboard` (вариант B)

**Files:**
- Create: `apps/web/src/components/dashboard/EmergencyBanner.tsx`
- Modify: `apps/web/src/app/(main)/dashboard/page.tsx:146` (заменить `<HeroFirstLesson />` на условие)

**Interfaces:**
- Consumes: `job.getEmergencyFeatured` (Task 3).
- Produces: `<EmergencyBanner job={{ slug, title, lessonCount }} />` — презентационный, ведёт на `/learn/job/${slug}`.

- [ ] **Step 1: Создать компонент**

```tsx
// apps/web/src/components/dashboard/EmergencyBanner.tsx
'use client';

import Link from 'next/link';

interface Props {
  job: { slug: string; title: string; lessonCount: number };
}

/**
 * ЧП-баннер витрины. Занимает слот HeroFirstLesson (вариант B — замещение).
 * Виден всем юзерам, снимается только kill-switch'ем (EMERGENCY_BANNER_ENABLED).
 */
export function EmergencyBanner({ job }: Props) {
  return (
    <Link
      href={`/learn/job/${job.slug}`}
      className="block rounded-2xl border border-red-300 bg-gradient-to-r from-red-50 to-orange-50 p-5 shadow-mp-card transition-shadow hover:shadow-mp-card-hover"
    >
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-100 text-2xl">
          🔥
        </div>
        <div className="min-w-0">
          <p className="text-body-sm font-semibold uppercase tracking-wide text-red-600">
            Экстренно · склады WB
          </p>
          <h3 className="mt-0.5 text-heading text-mp-gray-900">{job.title}</h3>
          <p className="mt-1 text-body-sm text-mp-gray-600">
            Как защитить товар и деньги, посчитать убыток и получить компенсацию — разбор из {job.lessonCount} материалов.
          </p>
        </div>
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Подключить слот на витрине**

В `apps/web/src/app/(main)/dashboard/page.tsx`:

Добавить импорт рядом с `HeroFirstLesson`:

```tsx
import { EmergencyBanner } from '@/components/dashboard/EmergencyBanner';
```

Рядом с существующим `getStorefront`-query (около строки 43) добавить:

```tsx
  const emergency = trpc.job.getEmergencyFeatured.useQuery();
```

Заменить строку `<HeroFirstLesson />` (строка ~146) на:

```tsx
        {emergency.data?.job ? (
          <EmergencyBanner job={emergency.data.job} />
        ) : (
          <HeroFirstLesson />
        )}
```

- [ ] **Step 3: Проверить билд (ловит server-only-в-client)**

Run: `cd "D:/GpT_docs/mpSTATS ACADEMY ADAPTIVE LEARNING/MAAL" && pnpm --filter web build`
Expected: билд успешен (страница компилируется).

- [ ] **Step 4: Ручной smoke на dev (owner)**

Run: `pnpm dev`, зайти на `/dashboard` под аккаунтом `preview-hero@mpstats.academy` (пароль в чате). Флаг `EMERGENCY_BANNER_ENABLED` не выставлен → баннера нет, виден «Твой первый урок» (регресс не сломан). Выставить `EMERGENCY_BANNER_ENABLED=true` в `apps/web/.env` → баннер замещает первый урок (джобу публиковать НЕ нужно — гейт только флаг).
Note: до Task 8 джобы нет → `job:null` → баннера не будет; это ожидаемо.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/dashboard/EmergencyBanner.tsx "apps/web/src/app/(main)/dashboard/page.tsx"
git commit -m "feat(dashboard): emergency banner replaces first-lesson hero (variant B)"
```

---

## Task 5: `EmergencyFeaturedCard` + пин в `/learn/solutions` (WB)

**Files:**
- Create: `apps/web/src/components/learning/EmergencyFeaturedCard.tsx`
- Modify: `apps/web/src/app/(main)/learn/solutions/page.tsx` (над `<JobCatalog />`)

**Interfaces:**
- Consumes: `job.getEmergencyFeatured` (Task 3).
- Produces: `<EmergencyFeaturedCard job={{ slug, title, description, lessonCount }} />`.

- [ ] **Step 1: Создать компонент**

```tsx
// apps/web/src/components/learning/EmergencyFeaturedCard.tsx
'use client';

import Link from 'next/link';

interface Props {
  job: { slug: string; title: string; description: string; lessonCount: number };
}

/** Закреплённая ЧП-карточка над осями каталога решений (spec §C2). */
export function EmergencyFeaturedCard({ job }: Props) {
  return (
    <Link
      href={`/learn/job/${job.slug}`}
      className="block rounded-2xl border border-red-300 bg-gradient-to-r from-red-50 to-orange-50 p-5 shadow-mp-card transition-shadow hover:shadow-mp-card-hover"
    >
      <p className="text-body-sm font-semibold uppercase tracking-wide text-red-600">
        🔥 Экстренно · склады WB
      </p>
      <h3 className="mt-1 text-heading text-mp-gray-900">{job.title}</h3>
      <p className="mt-1 text-body-sm text-mp-gray-600 line-clamp-2">{job.description}</p>
      <span className="mt-2 inline-block text-body-sm font-medium text-red-600">
        Открыть разбор ({job.lessonCount}) →
      </span>
    </Link>
  );
}
```

- [ ] **Step 2: Подключить пин на странице решений**

В `apps/web/src/app/(main)/learn/solutions/page.tsx`:

Импорт:

```tsx
import { EmergencyFeaturedCard } from '@/components/learning/EmergencyFeaturedCard';
```

Рядом с `getCatalog`-query (около строки 29) добавить:

```tsx
  const emergency = trpc.job.getEmergencyFeatured.useQuery();
```

Внутри `<div className="space-y-4">` (перед блоком каталога, ~строка 93) вставить пин — только на WB:

```tsx
        {marketplace === 'WB' && emergency.data?.job && (
          <EmergencyFeaturedCard job={emergency.data.job} />
        )}
```

- [ ] **Step 3: Проверить билд**

Run: `pnpm --filter web build`
Expected: успешно.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/learning/EmergencyFeaturedCard.tsx "apps/web/src/app/(main)/learn/solutions/page.tsx"
git commit -m "feat(solutions): pinned emergency job card above axes (WB)"
```

---

## Task 6: Seed урока-вебинара

**Files:**
- Create: `scripts/seed-lesson-w12-webinar.ts`

- [ ] **Step 1: Создать идемпотентный сид**

```typescript
// scripts/seed-lesson-w12-webinar.ts
/**
 * Seed урока-вебинара 04_workshops_w12_jul26_crisis_001 (Phase B, Vision скипнут).
 * Идемпотентен (upsert по id). content_chunk (67) уже загружены в Phase A.
 * skillBlocks/topics — verbatim с валидного соседа w10_nov_crisis_002 (гарантия валидных slug'ов).
 * Запуск: NODE_OPTIONS=--dns-result-order=ipv4first npx tsx scripts/seed-lesson-w12-webinar.ts
 */
import { PrismaClient } from '@prisma/client';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();
const ID = '04_workshops_w12_jul26_crisis_001';

async function main() {
  const max = await prisma.lesson.aggregate({
    where: { courseId: '04_workshops' }, _max: { order: true },
  });
  const order = (max._max.order ?? 0) + 1; // ожидаемо 40

  const data = {
    courseId: '04_workshops',
    title: 'Антикризисный эфир 23.07.2026 — как защитить бизнес и деньги после атак на склады WB',
    duration: 126, // МИНУТЫ
    order,
    skillCategory: 'OPERATIONS' as const,
    skillCategories: ['OPERATIONS', 'FINANCE'],
    // verbatim с соседа w10_nov_crisis_002 — валидные slug'и; методологи могут ретегнуть позже
    skillBlocks: ['ANALYTICS/competitor_analysis', 'ANALYTICS/product_metrics', 'FINANCE/unit_economics'],
    topics: ['Антикризисное управление', 'Управление остатками', 'Работа с цифрами'],
    contentType: 'VIDEO' as const,
    isHidden: false,
  };

  const lesson = await prisma.lesson.upsert({
    where: { id: ID },
    update: data,          // videoId/videoUrl НЕ трогаем — их ставит Kinescope (Task 7)
    create: { id: ID, ...data },
    select: { id: true, order: true, skillCategory: true, duration: true },
  });
  console.log('✅ lesson upserted:', lesson);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Запустить сид**

Run: `cd "D:/GpT_docs/mpSTATS ACADEMY ADAPTIVE LEARNING/MAAL" && NODE_OPTIONS=--dns-result-order=ipv4first npx tsx scripts/seed-lesson-w12-webinar.ts`
Expected: `✅ lesson upserted: { id: '04_workshops_w12_jul26_crisis_001', order: 40, skillCategory: 'OPERATIONS', duration: 126 }`

- [ ] **Step 3: Verify**

Run (через существующий паттерн inline-tsx или Prisma Studio):
```sql
SELECT "order","duration","skillCategory","skillBlocks" FROM "Lesson" WHERE id='04_workshops_w12_jul26_crisis_001';
SELECT COUNT(*) FROM content_chunk WHERE lesson_id LIKE '04_workshops_w12_jul26_crisis_%';  -- 67
```
Expected: order=40, duration=126, skillBlocks NOT NULL, chunks=67.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-lesson-w12-webinar.ts
git commit -m "chore(content): seed w12 crisis webinar lesson (order 40, no video yet)"
```

---

## Task 7: Kinescope upload вебинара

**Files:**
- Create: `scripts/kinescope-map-w12-webinar.json`

- [ ] **Step 1: Создать карту (одна запись)**

```json
{
  "generated": "2026-07-24 (w12 crisis webinar)",
  "matched": [
    {
      "lessonId": "04_workshops_w12_jul26_crisis_001",
      "courseId": "04_workshops",
      "title": "Антикризисный эфир 23.07.2026 — как защитить бизнес и деньги после атак на склады WB",
      "filePath": "E:/Academy Courses/04_workshops/w12_jul26_crisis/001_antikrizisnyy_efir_23_07.mp4",
      "fileExists": true,
      "extension": ".mp4"
    }
  ],
  "stats": { "total": 1, "matched": 1 }
}
```

- [ ] **Step 2: Dry-run**

Run: `cd "D:/GpT_docs/mpSTATS ACADEMY ADAPTIVE LEARNING/MAAL" && npx tsx scripts/kinescope-upload.ts --map scripts/kinescope-map-w12-webinar.json --dry-run`
Expected: показывает 1 видео к загрузке в папку `04_workshops`, MP4 найден.

- [ ] **Step 3: Загрузить**

Run: `npx tsx scripts/kinescope-upload.ts --map scripts/kinescope-map-w12-webinar.json`
Expected: upload OK, `Lesson.videoId`/`videoUrl` проставлены. (Гоча: при HTTP 400419 «already exists» — добавить ` · v2` к title в карте и повторить.)

- [ ] **Step 4: Verify**

```sql
SELECT "videoId","videoUrl" FROM "Lesson" WHERE id='04_workshops_w12_jul26_crisis_001';  -- NOT NULL
```

- [ ] **Step 5: Commit**

```bash
git add scripts/kinescope-map-w12-webinar.json
git commit -m "chore(content): kinescope map for w12 crisis webinar"
```

---

## Task 8: Seed Job + привязка 3 уроков

**Files:**
- Create: `scripts/seed-job-warehouse-crisis.ts`

- [ ] **Step 1: Создать сид джобы**

```typescript
// scripts/seed-job-warehouse-crisis.ts
/**
 * Создать Job 'wb-warehouse-crisis-2026' + привязать 3 урока по порядку.
 * Идемпотентен (upsert по slug; JobLesson через deleteMany+createMany для чистоты порядка).
 * isPublished=false НАВСЕГДА (spec §E / Task 9): гейт — только флаг, джоба вне обычного каталога.
 * Embedding НЕ считаем в сиде (не обязателен; при желании — admin reembedJob позже).
 * Запуск: NODE_OPTIONS=--dns-result-order=ipv4first npx tsx scripts/seed-job-warehouse-crisis.ts
 */
import { PrismaClient } from '@prisma/client';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();
const SLUG = 'wb-warehouse-crisis-2026';
const LESSONS = [
  '04_workshops_w12_jul26_crisis_001',                      // 0 — вебинар
  '04_workshops_text_d1db18c6-7275-4e16-ab16-8ca58117cd50', // 1 — «Товар пострадал…»
  '04_workshops_text_3bd9fe05-4195-41f8-a507-96fde377ec91', // 2 — «Когда принять компенсацию…»
];

async function main() {
  // Предохранитель: все 3 урока должны существовать
  const found = await prisma.lesson.findMany({ where: { id: { in: LESSONS } }, select: { id: true } });
  if (found.length !== LESSONS.length) {
    throw new Error(`Не все уроки найдены: ${found.map((l) => l.id).join(', ')}`);
  }

  const jobData = {
    title: 'Склады WB под ударом: как защитить бизнес и деньги',
    description:
      'Экстренный антикризисный разбор после атак на склады Wildberries (18–22.07.2026): ' +
      'как действовать с холодной головой, посчитать убыток, получить компенсацию и снизить риски.',
    marketplace: 'WB',
    axes: ['OPERATIONS', 'FINANCE'],
    skillBlocks: ['FINANCE/unit_economics'],
    outcomes: [
      'Отличить прямой убыток от кассового разрыва и посчитать оба',
      'Проверить и получить компенсацию WB (~40% себестоимости)',
      'Разобраться, что покрывает страховка WB/Ozon и оговорка «БПЛА→теракт»',
      'Снизить риски: ФБС, диверсификация складов и каналов',
      'Действовать без паники и преждевременных коллективных исков',
    ],
    displayOrder: 0,
    isPublished: false,
  };

  const job = await prisma.job.upsert({
    where: { slug: SLUG },
    update: jobData,
    create: { slug: SLUG, ...jobData },
    select: { id: true, slug: true },
  });

  await prisma.jobLesson.deleteMany({ where: { jobId: job.id } });
  await prisma.jobLesson.createMany({
    data: LESSONS.map((lessonId, order) => ({ jobId: job.id, lessonId, order })),
  });

  const rows = await prisma.jobLesson.findMany({
    where: { jobId: job.id }, orderBy: { order: 'asc' }, select: { lessonId: true, order: true },
  });
  console.log('✅ job:', job.slug, 'lessons:', rows);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
```

Примечание: поля `axes`/`skillBlocks`/`outcomes` в схеме — `Json`; массивы записываются как есть. Свериться с типом `marketplace` в схеме `Job` (строка/enum) — при необходимости привести к нужному литералу.

- [ ] **Step 2: Запустить сид**

Run: `cd "D:/GpT_docs/mpSTATS ACADEMY ADAPTIVE LEARNING/MAAL" && NODE_OPTIONS=--dns-result-order=ipv4first npx tsx scripts/seed-job-warehouse-crisis.ts`
Expected: `✅ job: wb-warehouse-crisis-2026 lessons: [ {order:0…}, {order:1…}, {order:2…} ]`

- [ ] **Step 3: Verify**

```sql
SELECT slug,"isPublished",marketplace FROM "Job" WHERE slug='wb-warehouse-crisis-2026';  -- isPublished=false
SELECT "lessonId","order" FROM "JobLesson" jl JOIN "Job" j ON j.id=jl."jobId"
  WHERE j.slug='wb-warehouse-crisis-2026' ORDER BY "order";                               -- 3 строки 0..2
```

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-job-warehouse-crisis.ts
git commit -m "chore(content): seed wb-warehouse-crisis-2026 job (3 lessons, dark)"
```

---

## Task 9: Раскатка (staging → prod → запуск)

**Files:** нет (ops). `docker-compose.staging.yml`, prod `.env.production`.

Джоба **всегда `isPublished=false`** — ни в каталог, ни на прод не течёт. Единственный рычаг — env-флаг `EMERGENCY_BANNER_ENABLED`, он per-environment. Никаких `UPDATE isPublished` на общей БД.

- [ ] **Step 1: Полная локальная проверка**

Run:
```bash
cd "D:/GpT_docs/mpSTATS ACADEMY ADAPTIVE LEARNING/MAAL"
pnpm --filter @mpstats/api test
pnpm typecheck
pnpm --filter web build
```
Expected: тесты зелёные, типы чистые, билд успешен.

- [ ] **Step 2: Push ветки + staging deploy с флагом on**

```bash
git push -u origin feature/emergency-warehouse-crisis-block
ssh deploy@89.208.106.208
cd /home/deploy/maal && git fetch && git checkout feature/emergency-warehouse-crisis-block
# в docker-compose.staging.yml env web: EMERGENCY_BANNER_ENABLED=true
docker compose -p maal-staging -f docker-compose.staging.yml up -d --build --no-cache web
```
На staging (флаг on) **отсмотреть глазами**: баннер на `/dashboard`, пин на `/learn/solutions` (WB), открыть детальную страницу `/learn/job/wb-warehouse-crisis-2026` (работает благодаря байпасу), проверить бесплатный доступ к 3 урокам под не-admin юзером. Прод не затронут: prod-контейнер с флагом off ничего не показывает, джоба неопубликована → её нет и в обычном каталоге на проде.

- [ ] **Step 3: `git checkout master` на сервере деплоя**

```bash
cd /home/deploy/maal && git checkout master
```

- [ ] **Step 4: Merge в master + prod deploy (тёмный)**

После аппрува ветки — merge, prod redeploy. Флаг `EMERGENCY_BANNER_ENABLED` в `.env.production` = `false`, джоба `isPublished=false` → ЧП-блок не виден нигде, утечки в каталог нет.

- [ ] **Step 5: Запуск (по готовности) — только флаг**

```bash
# .env.production
EMERGENCY_BANNER_ENABLED=true
docker compose up -d web
```
Джобу публиковать НЕ нужно. Отсмотреть баннер (`/dashboard`) + пин (`/learn/solutions`, WB) на проде.

- [ ] **Step 6: Kill-switch check**

Убедиться: `EMERGENCY_BANNER_ENABLED=false` + `up -d web` → баннер и пин исчезают, «Твой первый урок» возвращается холодным. Джоба как была неопубликована — в каталоге её нет.

---

## Self-Review

- **Spec §A (контент):** Task 6 (seed lesson) + Task 7 (kinescope). Vision скипнут (Global Constraints). ✅
- **Spec §B (джоба):** Task 8. ✅
- **Spec §C1 (баннер, вариант B):** Task 4 + Task 3 (флаг-gated query). ✅
- **Spec §C2 (пин WB):** Task 5. ✅
- **Spec §C (единый флаг/kill-switch):** Task 1 + Task 9 Step 6. ✅
- **Spec §D (все 3 бесплатны, D2):** Task 2. ✅
- **Spec §E (staging→prod):** Task 9. Общая БD решена чисто: джоба навсегда `isPublished=false`, гейт — только per-env флаг, `getJob`/`getTitleBySlug` байпасят `isPublished` для ЧП-slug (Task 3). Запуск = флаг on, без публикации. ✅
- Типы согласованы: `getEmergencyFeatured` → `{ enabled, job }` используется идентично в Task 4/5. `EMERGENCY_*` из Task 1 потребляются в Task 2/3.
- Плейсхолдеров нет; код приведён полностью.
