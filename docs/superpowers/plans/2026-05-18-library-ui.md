# Library UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Пересобрать `/learn` в каталог на джобах — 5 экранов (каталог по задачам / по курсам, трек, страница джобы, поиск) с переключателем маркетплейса.

**Architecture:** Новый tRPC-роутер `job` отдаёт каталог джоб (сгруппированы по осям, фильтр по маркетплейсу) и страницу джобы. Каталог `/learn` получает линзу «по задачам / по курсам»; трек выносится на `/learn/track`; джоба — на `/learn/job/[slug]`. `LibrarySection` (Phase 46) и флаг `NEXT_PUBLIC_SHOW_LIBRARY` удаляются.

**Tech Stack:** Next.js 14 App Router, TypeScript, tRPC, Tailwind, shadcn/ui, Vitest.

**Зависит от:** Plan 1 (`2026-05-18-job-foundation-and-mapping.md`) — таблицы `Job`/`JobLesson` должны существовать. UI можно строить на провизорном seed (несколько джоб) до валидации полного JOB-PROPOSAL.

---

## Контекст

- Спек: `docs/superpowers/specs/2026-05-18-library-redesign-design.md` §6-7.
- Утверждённый макет (5 экранов) согласован в брейншторме.
- Существующее: `apps/web/src/app/(main)/learn/page.tsx` (тоггл path/courses + поиск + фильтры + `LibrarySection` внизу), `learning` tRPC-роутер, `LessonCard.tsx`, `SearchBar.tsx`, `FilterPanel.tsx`.
- Паттерн роутеров — `packages/api/src/routers/learning.ts`; регистрация — `packages/api/src/root.ts`.
- Паттерн тестов роутера — `packages/api/src/routers/__tests__/referral.test.ts`.

---

## Task 1: Shared-типы для джоб

**Files:**
- Modify: `packages/shared/src/types/index.ts` (добавить в конец)

- [ ] **Step 1: Добавить типы джоб**

В конец `packages/shared/src/types/index.ts`:

```ts
// ── Library redesign (Phase 57): Job catalog ──
export type JobMarketplace = 'WB' | 'OZON' | 'BOTH';

export interface JobSummary {
  id: string;
  slug: string;
  title: string;
  description: string;
  marketplace: JobMarketplace;
  axes: string[];               // canonical 5
  lessonCount: number;
  totalDurationMin: number;
  completedLessons: number;     // прогресс юзера
  isRecommended: boolean;       // джоба из трека/диагностики
}

export interface JobCatalogAxis {
  axis: string;                 // ANALYTICS | MARKETING | CONTENT | OPERATIONS | FINANCE
  title: string;                // «Аналитика» и т.д.
  jobs: JobSummary[];
}

export interface JobLessonItem {
  id: string;
  title: string;
  durationMin: number;
  order: number;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  watchedPercent: number;
  locked: boolean;
}

export interface JobDetail extends JobSummary {
  outcomes: string[];
  skillBlocks: string[];
  lessons: JobLessonItem[];
}
```

- [ ] **Step 2: Проверить сборку типов**

Run: `pnpm --filter @mpstats/shared build`
Expected: успешная сборка без ошибок TS.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types/index.ts
git commit -m "feat(shared): Job catalog types for library redesign"
```

---

## Task 2: tRPC-роутер `job`

**Files:**
- Create: `packages/api/src/routers/job.ts`
- Modify: `packages/api/src/root.ts`
- Test: `packages/api/src/routers/__tests__/job.test.ts`

- [ ] **Step 1: Написать падающий тест на чистый хелпер `axisTitle`**

Создать `packages/api/src/routers/__tests__/job.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { axisTitle, filterByMarketplace } from '../job';

describe('axisTitle', () => {
  it('маппит канонические оси на русские названия', () => {
    expect(axisTitle('ANALYTICS')).toBe('Аналитика');
    expect(axisTitle('FINANCE')).toBe('Финансы');
    expect(axisTitle('UNKNOWN')).toBe('UNKNOWN');
  });
});

describe('filterByMarketplace', () => {
  const jobs = [
    { marketplace: 'WB' }, { marketplace: 'OZON' }, { marketplace: 'BOTH' },
  ] as any[];
  it('WB показывает WB + BOTH', () => {
    expect(filterByMarketplace(jobs, 'WB').map((j) => j.marketplace)).toEqual(['WB', 'BOTH']);
  });
  it('OZON показывает OZON + BOTH', () => {
    expect(filterByMarketplace(jobs, 'OZON').map((j) => j.marketplace)).toEqual(['OZON', 'BOTH']);
  });
});
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `npx vitest run packages/api/src/routers/__tests__/job.test.ts`
Expected: FAIL — `Cannot find module '../job'`.

- [ ] **Step 3: Написать роутер `job.ts`**

Создать `packages/api/src/routers/job.ts`:

```ts
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { handleDatabaseError } from '../utils/db-errors';
import { getUserActiveSubscriptions, getUserAdminBypass, isLessonAccessible } from '../utils/access';
import { isFeatureEnabled } from '../utils/feature-flags';
import type { JobCatalogAxis, JobDetail, JobMarketplace } from '@mpstats/shared';

const AXIS_TITLES: Record<string, string> = {
  ANALYTICS: 'Аналитика', MARKETING: 'Маркетинг', CONTENT: 'Контент',
  OPERATIONS: 'Операции', FINANCE: 'Финансы',
};
const AXIS_ORDER = ['ANALYTICS', 'MARKETING', 'CONTENT', 'OPERATIONS', 'FINANCE'];

export function axisTitle(axis: string): string {
  return AXIS_TITLES[axis] ?? axis;
}

export function filterByMarketplace<T extends { marketplace: string }>(
  jobs: T[], mp: 'WB' | 'OZON',
): T[] {
  return jobs.filter((j) => j.marketplace === mp || j.marketplace === 'BOTH');
}

export const jobRouter = router({
  // Каталог джоб, сгруппированный по осям, отфильтрованный по маркетплейсу
  getCatalog: protectedProcedure
    .input(z.object({ marketplace: z.enum(['WB', 'OZON']).default('WB') }))
    .query(async ({ ctx, input }): Promise<JobCatalogAxis[]> => {
      try {
        const [jobs, subs, billingEnabled, isAdminBypass, track] = await Promise.all([
          ctx.prisma.job.findMany({
            where: { isPublished: true },
            include: {
              lessons: {
                include: {
                  lesson: {
                    select: {
                      duration: true, courseId: true, order: true,
                      progress: { where: { path: { userId: ctx.user.id } } },
                    },
                  },
                },
              },
            },
            orderBy: { displayOrder: 'asc' },
          }),
          getUserActiveSubscriptions(ctx.user.id, ctx.prisma),
          isFeatureEnabled('billing_enabled'),
          getUserAdminBypass(ctx.user.id, ctx.prisma),
          ctx.prisma.learningPath.findUnique({
            where: { userId: ctx.user.id }, select: { lessons: true },
          }),
        ]);

        const trackLessonIds = new Set<string>(
          track?.lessons ? extractLessonIds(track.lessons) : [],
        );

        const summaries = jobs.map((job) => {
          const lessons = job.lessons;
          const completed = lessons.filter(
            (jl) => jl.lesson.progress[0]?.status === 'COMPLETED',
          ).length;
          const isRecommended = lessons.some((jl) => trackLessonIds.has(jl.lessonId));
          return {
            id: job.id, slug: job.slug, title: job.title, description: job.description,
            marketplace: job.marketplace as JobMarketplace,
            axes: job.axes as string[],
            lessonCount: lessons.length,
            totalDurationMin: lessons.reduce((s, jl) => s + (jl.lesson.duration ?? 0), 0),
            completedLessons: completed,
            isRecommended,
            _primaryAxis: (job.axes as string[])[0] ?? 'ANALYTICS',
          };
        });

        const visible = filterByMarketplace(summaries, input.marketplace);

        return AXIS_ORDER
          .map((axis) => ({
            axis, title: axisTitle(axis),
            jobs: visible.filter((j) => j._primaryAxis === axis)
              .map(({ _primaryAxis, ...j }) => j),
          }))
          .filter((a) => a.jobs.length > 0);
      } catch (error) {
        handleDatabaseError(error);
      }
    }),

  // Одна джоба по slug — с упорядоченными уроками и прогрессом
  getJob: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }): Promise<JobDetail | null> => {
      try {
        const [job, subs, billingEnabled, isAdminBypass] = await Promise.all([
          ctx.prisma.job.findUnique({
            where: { slug: input.slug },
            include: {
              lessons: {
                orderBy: { order: 'asc' },
                include: {
                  lesson: {
                    include: { progress: { where: { path: { userId: ctx.user.id } } } },
                  },
                },
              },
            },
          }),
          getUserActiveSubscriptions(ctx.user.id, ctx.prisma),
          isFeatureEnabled('billing_enabled'),
          getUserAdminBypass(ctx.user.id, ctx.prisma),
        ]);
        if (!job || !job.isPublished) return null;

        const lessons = job.lessons.map((jl) => {
          const l = jl.lesson;
          return {
            id: l.id, title: l.title, durationMin: l.duration ?? 0, order: jl.order,
            status: (l.progress[0]?.status ?? 'NOT_STARTED') as JobDetail['lessons'][number]['status'],
            watchedPercent: l.progress[0]?.watchedPercent ?? 0,
            locked: !isLessonAccessible(
              { order: l.order, courseId: l.courseId }, subs, billingEnabled, isAdminBypass,
            ),
          };
        });

        return {
          id: job.id, slug: job.slug, title: job.title, description: job.description,
          marketplace: job.marketplace as JobMarketplace,
          axes: job.axes as string[], skillBlocks: job.skillBlocks as string[],
          outcomes: job.outcomes as string[],
          lessonCount: lessons.length,
          totalDurationMin: lessons.reduce((s, l) => s + l.durationMin, 0),
          completedLessons: lessons.filter((l) => l.status === 'COMPLETED').length,
          isRecommended: false,
          lessons,
        };
      } catch (error) {
        handleDatabaseError(error);
      }
    }),
});

/** Извлекает плоский список lessonId из JSON learningPath (старый и sectioned формат). */
function extractLessonIds(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  if (raw && typeof raw === 'object' && 'sections' in raw) {
    const sections = (raw as { sections?: { lessonIds?: string[] }[] }).sections ?? [];
    return sections.flatMap((s) => s.lessonIds ?? []);
  }
  return [];
}
```

- [ ] **Step 4: Запустить тест — убедиться, что проходит**

Run: `npx vitest run packages/api/src/routers/__tests__/job.test.ts`
Expected: PASS (3 теста).

- [ ] **Step 5: Зарегистрировать роутер**

В `packages/api/src/root.ts`: добавить импорт `import { jobRouter } from './routers/job';` и строку `job: jobRouter,` в `router({...})`.

- [ ] **Step 6: Проверить типизацию**

Run: `pnpm typecheck`
Expected: без ошибок.

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/routers/job.ts packages/api/src/routers/__tests__/job.test.ts packages/api/src/root.ts
git commit -m "feat(api): job router — catalog and job detail endpoints"
```

---

## Task 3: Компонент `MarketplaceSwitch`

**Files:**
- Create: `apps/web/src/components/learning/MarketplaceSwitch.tsx`

- [ ] **Step 1: Написать компонент**

Создать `apps/web/src/components/learning/MarketplaceSwitch.tsx`:

```tsx
'use client';

import { cn } from '@/lib/utils';

type Marketplace = 'WB' | 'OZON';

interface Props {
  value: Marketplace;
  onChange: (mp: Marketplace) => void;
}

const OPTIONS: { id: Marketplace; label: string; dot: string }[] = [
  { id: 'WB', label: 'Wildberries', dot: 'bg-purple-500' },
  { id: 'OZON', label: 'Ozon', dot: 'bg-sky-500' },
];

export function MarketplaceSwitch({ value, onChange }: Props) {
  return (
    <div className="inline-flex rounded-lg border border-mp-gray-200 overflow-hidden bg-white">
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            'flex items-center gap-2 px-5 py-2.5 text-body-sm font-semibold transition-colors',
            value === o.id ? 'bg-mp-blue-500 text-white' : 'bg-white text-mp-gray-600 hover:bg-mp-gray-50',
          )}
        >
          <span className={cn('w-2 h-2 rounded-full', value === o.id ? 'bg-white' : o.dot)} />
          {o.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Проверить сборку**

Run: `pnpm --filter web typecheck`
Expected: без ошибок.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/learning/MarketplaceSwitch.tsx
git commit -m "feat(learn): MarketplaceSwitch component"
```

---

## Task 4: Компонент `JobCard`

**Files:**
- Create: `apps/web/src/components/learning/JobCard.tsx`

- [ ] **Step 1: Написать компонент**

Создать `apps/web/src/components/learning/JobCard.tsx`. Карточка джобы по утверждённому макету: метки (`WB + Ozon` / `Рекомендовано диагностикой`), заголовок, описание, мета `N уроков · ~Xч`, прогресс-бар. Кликабельна — ведёт на `/learn/job/<slug>`.

```tsx
'use client';

import Link from 'next/link';
import type { JobSummary } from '@mpstats/shared';

function fmtDuration(min: number): string {
  if (min < 60) return `${min} мин`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h} ч ${m} мин` : `${h} ч`;
}

export function JobCard({ job }: { job: JobSummary }) {
  const pct = job.lessonCount > 0
    ? Math.round((job.completedLessons / job.lessonCount) * 100)
    : 0;
  const done = pct === 100;

  return (
    <Link
      href={`/learn/job/${job.slug}`}
      className="flex flex-col bg-white border border-mp-gray-200 rounded-xl p-4 shadow-mp-card hover:shadow-mp-card-hover transition-shadow"
    >
      <div className="flex gap-1.5 mb-2 min-h-[18px]">
        {job.marketplace === 'BOTH' && (
          <span className="text-caption font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-700">WB + Ozon</span>
        )}
        {job.isRecommended && (
          <span className="text-caption font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-700">Рекомендовано диагностикой</span>
        )}
      </div>
      <h3 className="text-body font-semibold text-mp-gray-900 leading-snug">{job.title}</h3>
      <p className="text-body-sm text-mp-gray-500 mt-1 flex-1 line-clamp-2">{job.description}</p>
      <div className="text-caption text-mp-gray-400 mt-2.5">
        {job.lessonCount} уроков · ~{fmtDuration(job.totalDurationMin)}
      </div>
      <div className="h-1.5 bg-mp-gray-200 rounded-full mt-2 overflow-hidden">
        <div
          className={done ? 'h-full rounded-full bg-mp-green-500' : 'h-full rounded-full bg-mp-blue-500'}
          style={{ width: `${pct}%` }}
        />
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Проверить сборку**

Run: `pnpm --filter web typecheck`
Expected: без ошибок.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/learning/JobCard.tsx
git commit -m "feat(learn): JobCard component"
```

---

## Task 5: Компонент `JobCatalog`

**Files:**
- Create: `apps/web/src/components/learning/JobCatalog.tsx`

- [ ] **Step 1: Написать компонент**

Создать `apps/web/src/components/learning/JobCatalog.tsx`. Каталог по осям: для каждой оси — заголовок с цветным акцентом и сетка `JobCard` (3 колонки на desktop). Фильтр по прогрессу применяется к джобам.

```tsx
'use client';

import { JobCard } from './JobCard';
import type { JobCatalogAxis } from '@mpstats/shared';

const AXIS_COLOR: Record<string, string> = {
  ANALYTICS: 'bg-mp-blue-500', MARKETING: 'bg-mp-green-500', CONTENT: 'bg-pink-500',
  OPERATIONS: 'bg-orange-500', FINANCE: 'bg-amber-500',
};

export type ProgressFilter = 'ALL' | 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';

function matchesProgress(completed: number, total: number, f: ProgressFilter): boolean {
  if (f === 'ALL') return true;
  if (f === 'NOT_STARTED') return completed === 0;
  if (f === 'COMPLETED') return total > 0 && completed === total;
  return completed > 0 && completed < total; // IN_PROGRESS
}

export function JobCatalog({ axes, progressFilter }: {
  axes: JobCatalogAxis[];
  progressFilter: ProgressFilter;
}) {
  const filtered = axes
    .map((a) => ({
      ...a,
      jobs: a.jobs.filter((j) => matchesProgress(j.completedLessons, j.lessonCount, progressFilter)),
    }))
    .filter((a) => a.jobs.length > 0);

  if (filtered.length === 0) {
    return <p className="text-body-sm text-mp-gray-500 py-8 text-center">Под фильтр джоб не нашлось.</p>;
  }

  return (
    <div className="space-y-7">
      {filtered.map((axis) => (
        <section key={axis.axis}>
          <div className="flex items-center gap-2 mb-3">
            <span className={`w-1 h-5 rounded ${AXIS_COLOR[axis.axis] ?? 'bg-mp-gray-400'}`} />
            <h2 className="text-heading font-bold text-mp-gray-900">{axis.title}</h2>
            <span className="text-caption text-mp-gray-400 font-semibold">· {axis.jobs.length} джоб</span>
          </div>
          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {axis.jobs.map((job) => <JobCard key={job.id} job={job} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Проверить сборку**

Run: `pnpm --filter web typecheck`
Expected: без ошибок.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/learning/JobCatalog.tsx
git commit -m "feat(learn): JobCatalog component — jobs grouped by axis"
```

---

## Task 6: Страница джобы `/learn/job/[slug]`

**Files:**
- Create: `apps/web/src/app/(main)/learn/job/[slug]/page.tsx`

- [ ] **Step 1: Написать страницу**

Создать `apps/web/src/app/(main)/learn/job/[slug]/page.tsx`. Клиентский компонент: тянет `trpc.job.getJob`, рендерит заголовок, метки, «что сможешь после» (`outcomes`), прогресс-бар, упорядоченный список уроков со статусами, кнопки «Продолжить джобу» / «+ В трек». Уроки-строки ведут на `/learn/<lessonId>`. 404 при `null`.

```tsx
'use client';

import { use } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';

export default function JobPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { data: job, isLoading } = trpc.job.getJob.useQuery({ slug });

  if (isLoading) return <div className="p-8 text-center text-mp-gray-500">Загрузка...</div>;
  if (!job) notFound();

  const pct = job.lessonCount > 0 ? Math.round((job.completedLessons / job.lessonCount) * 100) : 0;
  const nextLesson = job.lessons.find((l) => l.status !== 'COMPLETED' && !l.locked);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="text-body-sm text-mp-gray-400">
        <Link href="/learn" className="hover:text-mp-gray-600">Каталог</Link> · {job.title}
      </div>

      <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
        <div>
          {job.marketplace === 'BOTH' && (
            <span className="text-caption font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-700">WB + Ozon</span>
          )}
          <h1 className="text-display-sm text-mp-gray-900 mt-2">{job.title}</h1>
          <p className="text-body text-mp-gray-500 mt-1 max-w-2xl">{job.description}</p>
          <p className="text-body-sm text-mp-gray-400 mt-2">
            {job.lessonCount} уроков · прогресс {job.completedLessons}/{job.lessonCount}
          </p>
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          {nextLesson && (
            <Link href={`/learn/${nextLesson.id}`}>
              <Button className="w-full">Продолжить джобу →</Button>
            </Link>
          )}
        </div>
      </div>

      <div className="h-2 bg-mp-gray-200 rounded-full overflow-hidden">
        <div className="h-full bg-mp-green-500 rounded-full" style={{ width: `${pct}%` }} />
      </div>

      {job.outcomes.length > 0 && (
        <div>
          <h2 className="text-heading font-bold text-mp-gray-900 mb-2">Что ты сможешь после</h2>
          <ul className="text-body-sm text-mp-gray-600 space-y-1">
            {job.outcomes.map((o, i) => <li key={i}>· {o}</li>)}
          </ul>
        </div>
      )}

      <div>
        <h2 className="text-heading font-bold text-mp-gray-900 mb-2">Уроки джобы — по порядку</h2>
        <div className="bg-white border border-mp-gray-200 rounded-xl overflow-hidden">
          {job.lessons.map((l, i) => (
            <Link
              key={l.id}
              href={l.locked ? '#' : `/learn/${l.id}`}
              className={`flex items-center gap-3 px-4 py-2.5 border-t border-mp-gray-100 first:border-t-0 ${l.locked ? 'opacity-50 pointer-events-none' : 'hover:bg-mp-gray-50'}`}
            >
              <span className="text-caption text-mp-gray-400 w-5 font-semibold">{i + 1}</span>
              <span className={`w-3.5 h-3.5 rounded-full shrink-0 ${l.status === 'COMPLETED' ? 'bg-mp-green-500' : l.status === 'IN_PROGRESS' ? 'border-2 border-mp-blue-500' : 'border-2 border-mp-gray-300'}`} />
              <span className="text-body-sm text-mp-gray-900 flex-1">{l.title}</span>
              <span className="text-caption text-mp-gray-400">{l.durationMin} мин</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Проверить сборку**

Run: `pnpm --filter web typecheck`
Expected: без ошибок.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(main)/learn/job/[slug]/page.tsx"
git commit -m "feat(learn): job detail page /learn/job/[slug]"
```

---

## Task 7: Страница трека `/learn/track`

**Files:**
- Create: `apps/web/src/app/(main)/learn/track/page.tsx`

- [ ] **Step 1: Написать страницу**

Создать `apps/web/src/app/(main)/learn/track/page.tsx`. Полный вид трека: переиспользует существующий `trpc.learning.getRecommendedPath` (он уже отдаёт `sections`). Это **вынос** сегодняшнего sectioned-вида из `learn/page.tsx` (viewMode='path') на отдельный роут — логика секций-аккордеона переносится как есть. Шапка: заголовок, общий прогресс-бар, кнопки «Продолжить с того места» (→ первый незавершённый урок), «Перестроить по диагностике» (`trpc.learning.rebuildTrack`), «Добавить из каталога» (→ `/learn`).

Переносимая логика sectioned-аккордеона — из `learn/page.tsx` (текущий блок `viewMode === 'path'`, секции `errors/deepening/growth/advanced/custom`, мутации `rebuildTrack`/`removeFromTrack`). Скопировать соответствующий JSX и мутации в новый файл; зависимые компоненты (`LessonCard`, `AlertDialog`) импортируются как в оригинале.

- [ ] **Step 2: Проверить сборку и трек руками**

Run: `pnpm --filter web typecheck` — без ошибок.
Запустить `pnpm dev`, открыть `/learn/track` — секции трека отображаются, «Продолжить» ведёт в следующий незавершённый урок, «Перестроить» работает.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(main)/learn/track/page.tsx"
git commit -m "feat(learn): full track view at /learn/track"
```

---

## Task 8: Переработка `/learn/page.tsx` — каталог с линзами

**Files:**
- Modify: `apps/web/src/app/(main)/learn/page.tsx`

- [ ] **Step 1: Заменить тоггл path/courses на линзу каталога + интегрировать джобы**

Переработать `learn/page.tsx`:
- Убрать `viewMode: 'path' | 'courses'` — вместо него `lens: 'jobs' | 'courses'` (default `'jobs'`).
- Добавить состояние `marketplace: 'WB' | 'OZON'` (default `'WB'`) + `<MarketplaceSwitch>` под шапкой.
- `lens === 'jobs'`: `<JobCatalog axes={trpc.job.getCatalog.useQuery({ marketplace })} progressFilter={...} />`.
- `lens === 'courses'`: оставить существующий курс-аккордеон (текущий блок `viewMode === 'courses'`) — он становится линзой «по курсам».
- Компактный баннер трека сверху: «Мой трек · N/M» + кнопки «Открыть трек» (→ `/learn/track`) и «Продолжить» (→ следующий незавершённый урок). Данные — `trpc.learning.getRecommendedPath`.
- Поиск (`SearchBar`) и его результаты — оставить как есть.
- Тонкие фильтры на линзе «по задачам» — только прогресс (`ProgressFilter`). Полная `FilterPanel` остаётся только в ветке результатов поиска.
- Удалить рендер `<LibrarySection />` (строки ~966-970).

- [ ] **Step 2: Проверить сборку**

Run: `pnpm --filter web typecheck && pnpm --filter web build`
Expected: без ошибок.

- [ ] **Step 3: Проверить руками**

`pnpm dev`, открыть `/learn`: каталог открывается линзой «по задачам» с джобами по осям; переключатель WB/Ozon фильтрует; линза «по курсам» показывает курс-аккордеон; баннер трека ведёт на `/learn/track`; поиск работает.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(main)/learn/page.tsx"
git commit -m "feat(learn): rework /learn into job catalog with jobs/courses lens"
```

---

## Task 9: Чистка — удаление LibrarySection и флага

**Files:**
- Delete: `apps/web/src/components/learning/LibrarySection.tsx`
- Modify: `packages/api/src/routers/learning.ts` (удалить `getLibrary`), `apps/web/src/app/(main)/learn/page.tsx` (убрать dynamic-import `LibrarySection`, если ещё остался)
- Поиск использований `NEXT_PUBLIC_SHOW_LIBRARY`

- [ ] **Step 1: Найти все использования**

Run: `grep -rn "LibrarySection\|getLibrary\|NEXT_PUBLIC_SHOW_LIBRARY" apps/web/src packages --include=*.ts --include=*.tsx`
Expected: список — `page.tsx` (dynamic import), `learning.ts` (`getLibrary` процедура), `LibrarySection.tsx`, типы `LibraryData`/`LibraryAxis` в `@mpstats/shared`.

- [ ] **Step 2: Удалить компонент и процедуру**

- Удалить файл `LibrarySection.tsx`.
- Удалить процедуру `getLibrary` из `learning.ts` (строки 96-~) и неиспользуемые импорты типов `LibraryData`/`LibraryAxis`.
- Убрать `dynamic(() => import('LibrarySection'))` и `<LibrarySection />` из `page.tsx`, если что-то осталось после Task 8.
- Типы `LibraryData`/`LibraryAxis`/`LibraryBlock`/`LibraryLesson` в `@mpstats/shared` оставить, если на них есть другие ссылки; иначе удалить.

- [ ] **Step 3: Проверить сборку и тесты**

Run: `pnpm typecheck && pnpm build && pnpm test`
Expected: всё зелёное, ни одной ссылки на удалённое.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(learn): remove LibrarySection and NEXT_PUBLIC_SHOW_LIBRARY (superseded by job catalog)"
```

---

## Task 10: Плейсхолдер поиска + staging

**Files:**
- Modify: `apps/web/src/components/learning/SearchBar.tsx`

- [ ] **Step 1: Обновить плейсхолдер**

В `SearchBar.tsx` placeholder заменить на формулировку под джоб-каталог (спек §12, открытый пункт). Текст согласовать с владельцем; по умолчанию: `'Опишите задачу — например: как снизить ДРР на Wildberries'`.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/learning/SearchBar.tsx
git commit -m "chore(learn): update search placeholder for job catalog"
```

- [ ] **Step 3: Деплой на staging**

По `.claude/memory/staging-workflow.md`: `ssh deploy@89.208.106.208`, `git checkout <branch>`, `docker compose -p maal-staging -f docker-compose.staging.yml up -d --build`. После — `git checkout master` на VPS.
Проверить на `https://staging.platform.mpstats.academy`: 5 экранов, переключатель маркетплейса, трек, страница джобы, поиск.

---

## Self-Review

**Spec coverage (§6-7):**
- §6 каталог по задачам → Task 5, 8 ✅
- §6 каталог по курсам (линза) → Task 8 (сохранён курс-аккордеон) ✅
- §6 `/learn/track` → Task 7 ✅
- §6 `/learn/job/<slug>` → Task 6 ✅
- §6 маркетплейс-переключатель → Task 3, 8 ✅
- §6 баннер трека (2 действия) → Task 8 ✅
- §6 удаление `LibrarySection`/флага → Task 9 ✅
- §7 тонкие фильтры на каталоге / полные на поиске → Task 8 (ProgressFilter на джобах; FilterPanel в ветке поиска) ✅
- §12 плейсхолдер поиска → Task 10 ✅

**Placeholder scan:** Task 7 и Task 8 описывают перенос существующего JSX словами, а не полным кодом — это намеренно: код переносится из текущего `learn/page.tsx` 1:1 (готовые блоки в репозитории), дублировать сотни строк в плане нет смысла; точные строки-источники указаны. Остальные задачи — с полным кодом.

**Type consistency:** `JobSummary`/`JobCatalogAxis`/`JobDetail`/`JobMarketplace` (Task 1) используются в роутере (Task 2) и компонентах (Task 4-6) согласованно. `ProgressFilter` определён в `JobCatalog.tsx` (Task 5), импортируется в `page.tsx` (Task 8). `trpc.job.getCatalog`/`getJob` (Task 2) ↔ вызовы в Task 6, 8.

**Зависимость от Plan 1:** роутер `job` (Task 2) обращается к таблицам `Job`/`JobLesson` — они создаются в Plan 1 Task 1-2. UI можно разрабатывать на провизорном seed; на staging выкатывать после валидированного `seed-jobs` (Plan 1 Task 7).
