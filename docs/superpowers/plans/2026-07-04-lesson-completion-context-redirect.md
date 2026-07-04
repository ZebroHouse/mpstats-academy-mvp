# Контекстный возврат после завершения урока — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** После завершения урока вести пользователя в контексте, из которого он пришёл (задача/план/курс/избранное/витрина): в середине последовательности — следующий-в-контексте, на финале — осознанная модалка «куда вернуться» вместо слепого редиректа в `/learn/plan`.

**Architecture:** `getLesson` расширяется **аддитивно** — принимает `from` и возвращает новый блок `context` (kind/label/returnHref/fromParam/nextInContext/prevInContext/isLastInContext), не трогая существующие `nextLesson/prevLesson` (их читают другие консьюмеры). Вся логика контекста — в чистых функциях (`packages/api/src/utils/lesson-context.ts`), покрытых юнит-тестами. Страница урока пробрасывает `from` сквозь навигацию и показывает модалку `LessonCompletionModal`, когда `isLastInContext`. Точки входа (план/избранное/витрина/библиотека) проставляют `from` через новый проп `LessonCard`.

**Tech Stack:** Next.js 14 App Router, tRPC, Prisma, Vitest, React Testing Library, Tailwind.

**Спека:** `docs/superpowers/specs/2026-07-03-lesson-completion-context-redirect-design.md` (в основном дереве репо).

---

## Контракт (источник истины для всех задач)

Тип (shared):
```ts
export type LessonContextKind = 'job' | 'plan' | 'course' | 'favorites' | 'storefront';
```

`getLesson` теперь возвращает дополнительно:
```ts
context: {
  kind: LessonContextKind;
  label: string;            // "задача «Автобидер»" / "курс «Реклама»" / "Персональный план" / "Избранное" / "Главная"
  returnHref: string;       // куда ведёт «назад»: /learn/job/<slug> | /learn/plan | /learn/library#<courseId> | /learn/favorites | /dashboard
  fromParam: string;        // канон значения ?from= для сохранения в навигации: "job:<slug>" | "plan" | "course" | "favorites" | "storefront"
  nextInContext: { id: string; title: string } | null;
  prevInContext: { id: string; title: string } | null;
  isLastInContext: boolean; // nextInContext === null
}
```

Копирайт модалки (редполитика, финал — с Настей):

| kind | Заголовок | Подзаголовок | Primary (возврат) | Secondary |
|---|---|---|---|---|
| job | Задача пройдена | Вы прошли все уроки задачи — отличная работа | Вернуться к задаче → `returnHref` | К персональному плану → `/learn/plan` |
| course | Курс пройден | Вы прошли курс целиком | Вернуться к курсу → `returnHref` | К персональному плану → `/learn/plan` |
| plan | Урок пройден | Вы на шаг ближе к цели | К персональному плану → `/learn/plan` | Остаться на уроке → `onStay` |
| favorites | Урок пройден | Вы на шаг ближе к цели | В избранное → `returnHref` | К персональному плану → `/learn/plan` |
| storefront | Урок пройден | Вы на шаг ближе к цели | На главную → `returnHref` | К персональному плану → `/learn/plan` |

Модалка всегда закрываема (крестик/бэкдроп → `onStay`), пользователь остаётся на уроке.

---

## Task 1: Чистые функции контекста + shared-тип

**Files:**
- Modify: `packages/shared/src/types/index.ts` (добавить `LessonContextKind`)
- Create: `packages/api/src/utils/lesson-context.ts`
- Test: `packages/api/src/utils/__tests__/lesson-context.test.ts`

- [ ] **Step 1: Написать падающий тест**

```ts
// packages/api/src/utils/__tests__/lesson-context.test.ts
import { describe, it, expect } from 'vitest';
import { parseFromParam, resolveContextNav, flattenPlanLessonIds } from '../lesson-context';

describe('parseFromParam', () => {
  it('парсит job:<slug>', () => {
    expect(parseFromParam('job:autobidder')).toEqual({ kind: 'job', jobSlug: 'autobidder' });
  });
  it('парсит plan/favorites/storefront/course', () => {
    expect(parseFromParam('plan')).toEqual({ kind: 'plan' });
    expect(parseFromParam('favorites')).toEqual({ kind: 'favorites' });
    expect(parseFromParam('storefront')).toEqual({ kind: 'storefront' });
    expect(parseFromParam('course')).toEqual({ kind: 'course' });
  });
  it('unknown / undefined → course (fallback)', () => {
    expect(parseFromParam(undefined)).toEqual({ kind: 'course' });
    expect(parseFromParam('garbage')).toEqual({ kind: 'course' });
    expect(parseFromParam('job:')).toEqual({ kind: 'course' }); // пустой slug невалиден
  });
});

describe('resolveContextNav', () => {
  const ids = ['a', 'b', 'c'];
  it('середина → next+prev, не последний', () => {
    expect(resolveContextNav(ids, 'b')).toEqual({ index: 1, nextId: 'c', prevId: 'a', isLast: false });
  });
  it('первый → prev null', () => {
    expect(resolveContextNav(ids, 'a')).toEqual({ index: 0, nextId: 'b', prevId: null, isLast: false });
  });
  it('последний → next null, isLast', () => {
    expect(resolveContextNav(ids, 'c')).toEqual({ index: 2, nextId: null, prevId: 'b', isLast: true });
  });
  it('одиночный → isLast', () => {
    expect(resolveContextNav(['x'], 'x')).toEqual({ index: 0, nextId: null, prevId: null, isLast: true });
  });
  it('не найден в контексте → терминально (safe)', () => {
    expect(resolveContextNav(ids, 'z')).toEqual({ index: -1, nextId: null, prevId: null, isLast: true });
  });
  it('пустой список → терминально', () => {
    expect(resolveContextNav([], 'a')).toEqual({ index: -1, nextId: null, prevId: null, isLast: true });
  });
});

describe('flattenPlanLessonIds', () => {
  it('v1 (массив строк) → как есть', () => {
    expect(flattenPlanLessonIds(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });
  it('v2/v3 (секции) → errorLessonIds, затем lessonIds, по порядку секций, без дублей', () => {
    const path = {
      version: 3,
      sections: [
        { axis: 'ANALYTICS', lessonIds: ['a', 'b'], errorLessonIds: ['e1'] },
        { axis: 'MARKETING', lessonIds: ['b', 'c'], errorLessonIds: [] },
      ],
    };
    expect(flattenPlanLessonIds(path)).toEqual(['e1', 'a', 'b', 'c']);
  });
  it('пусто/мусор → []', () => {
    expect(flattenPlanLessonIds(null)).toEqual([]);
    expect(flattenPlanLessonIds({})).toEqual([]);
  });
});
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `pnpm --filter @mpstats/api test -- lesson-context`
Expected: FAIL («Cannot find module '../lesson-context'»).

- [ ] **Step 3: Добавить shared-тип**

В `packages/shared/src/types/index.ts` добавить (рядом с прочими экспортами типов):
```ts
export type LessonContextKind = 'job' | 'plan' | 'course' | 'favorites' | 'storefront';
```

- [ ] **Step 4: Реализовать чистые функции**

```ts
// packages/api/src/utils/lesson-context.ts
import { parseLearningPath, type LessonContextKind } from '@mpstats/shared';

export function parseFromParam(from?: string): { kind: LessonContextKind; jobSlug?: string } {
  if (from?.startsWith('job:')) {
    const slug = from.slice(4);
    if (slug.length > 0) return { kind: 'job', jobSlug: slug };
    return { kind: 'course' };
  }
  if (from === 'plan' || from === 'favorites' || from === 'storefront') return { kind: from };
  return { kind: 'course' };
}

export function resolveContextNav(
  orderedIds: string[],
  currentId: string,
): { index: number; nextId: string | null; prevId: string | null; isLast: boolean } {
  const index = orderedIds.indexOf(currentId);
  if (index === -1) return { index: -1, nextId: null, prevId: null, isLast: true };
  const nextId = index < orderedIds.length - 1 ? orderedIds[index + 1] : null;
  const prevId = index > 0 ? orderedIds[index - 1] : null;
  return { index, nextId, prevId, isLast: nextId === null };
}

// Плоский упорядоченный список уроков плана: errorLessonIds → lessonIds по каждой секции,
// в порядке секций, без дублей. v1 (массив) отдаётся как есть.
export function flattenPlanLessonIds(lessonsJson: unknown): string[] {
  const parsed = parseLearningPath(lessonsJson);
  if (Array.isArray(parsed)) return [...parsed];
  if (!parsed || !Array.isArray((parsed as { sections?: unknown[] }).sections)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of (parsed as { sections: Array<{ lessonIds?: string[]; errorLessonIds?: string[] }> }).sections) {
    for (const id of [...(s.errorLessonIds ?? []), ...(s.lessonIds ?? [])]) {
      if (!seen.has(id)) { seen.add(id); out.push(id); }
    }
  }
  return out;
}
```

> ⚠️ Проверь фактический экспорт `parseLearningPath` в `packages/shared` и форму, которую он возвращает для v1/v2/v3 (см. `packages/shared/src/types/index.ts:320-331`). Если v1 возвращается не как массив, а как `{version:1,...}` — адаптируй `flattenPlanLessonIds`. Тест из Step 1 обязан пройти на реальной сигнатуре.

- [ ] **Step 5: Запустить тест — зелёный**

Run: `pnpm --filter @mpstats/api test -- lesson-context`
Expected: PASS (все кейсы).

- [ ] **Step 6: Коммит**

```bash
git add packages/shared/src/types/index.ts packages/api/src/utils/lesson-context.ts packages/api/src/utils/__tests__/lesson-context.test.ts
git commit -m "feat(learning): pure lesson-context resolver + LessonContextKind"
```

---

## Task 2: Расширить getLesson контекстом (аддитивно)

**Files:**
- Modify: `packages/api/src/routers/learning.ts:568-668` (процедура `getLesson`)
- Test: `packages/api/src/routers/__tests__/learning-getlesson-context.test.ts` (эталон структуры — `learning-interactive-getlesson.test.ts` в той же папке)

- [ ] **Step 1: Написать падающий тест**

По образцу `learning-interactive-getlesson.test.ts` (мок `ctx.prisma`) написать тест `learning-getlesson-context.test.ts`, проверяющий блок `context`:
- `from='course'` и урок в середине курса → `context.kind==='course'`, `nextInContext` = следующий по курсу, `isLastInContext===false`, `returnHref` содержит `/learn/library#`.
- `from='course'` и урок последний в курсе → `isLastInContext===true`, `nextInContext===null`.
- `from='job:<slug>'` → `context.kind==='job'`, `fromParam==='job:<slug>'`, `returnHref==='/learn/job/<slug>'`, порядок из `jobLesson.order` (не курсовой).
- `from='favorites'` → `kind==='favorites'`, `isLastInContext===true`, `returnHref==='/learn/favorites'`.
- `from` отсутствует → `kind==='course'` (fallback).
- Существующие `nextLesson/prevLesson` (курсовые) по-прежнему в ответе (не удалены).

Мок должен вернуть `job.findUnique` с `lessons` и `learningPath.findUnique` для веток job/plan; `lesson.findMany` для тайтлов next/prev.

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `pnpm --filter @mpstats/api test -- learning-getlesson-context`
Expected: FAIL (нет `context` в ответе).

- [ ] **Step 3: Реализация в `getLesson`**

После вычисления `courseLessons`/`currentIndex` (строка ~616), перед `return`, собрать контекст. Импортировать вверху файла: `import { parseFromParam, resolveContextNav, flattenPlanLessonIds } from '../utils/lesson-context';`. Вход `input` расширить: `.input(z.object({ lessonId: z.string(), from: z.string().optional() }))`.

Логика (вставить перед `return {`):
```ts
const parsedFrom = parseFromParam(input.from);
let ctxKind = parsedFrom.kind;
let orderedIds: string[] = courseLessons.map((l) => l.id);
let label = `курс «${lesson.course.title}»`;
let returnHref = `/learn/library#${lesson.course.id}`;
let fromParam = 'course';

if (parsedFrom.kind === 'job' && parsedFrom.jobSlug) {
  const job = await ctx.prisma.job.findUnique({
    where: { slug: parsedFrom.jobSlug },
    select: {
      title: true, isPublished: true,
      lessons: {
        where: { lesson: { isHidden: false, course: { isHidden: false } } },
        orderBy: { order: 'asc' },
        select: { lessonId: true },
      },
    },
  });
  if (job && job.isPublished) {
    ctxKind = 'job';
    orderedIds = job.lessons.map((jl) => jl.lessonId);
    label = `задача «${job.title}»`;
    returnHref = `/learn/job/${parsedFrom.jobSlug}`;
    fromParam = `job:${parsedFrom.jobSlug}`;
  } else {
    ctxKind = 'course'; // джоба пропала → безопасный fallback
  }
} else if (parsedFrom.kind === 'plan') {
  const lp = await ctx.prisma.learningPath.findUnique({
    where: { userId: ctx.user.id },
    select: { lessons: true },
  });
  const flat = flattenPlanLessonIds(lp?.lessons);
  if (flat.length > 0) {
    ctxKind = 'plan';
    orderedIds = flat;
    label = 'Персональный план';
    returnHref = '/learn/plan';
    fromParam = 'plan';
  } else {
    ctxKind = 'course';
  }
} else if (parsedFrom.kind === 'favorites') {
  ctxKind = 'favorites';
  orderedIds = [lesson.id];
  label = 'Избранное';
  returnHref = '/learn/favorites';
  fromParam = 'favorites';
} else if (parsedFrom.kind === 'storefront') {
  ctxKind = 'storefront';
  orderedIds = [lesson.id];
  label = 'Главная';
  returnHref = '/dashboard';
  fromParam = 'storefront';
}

const nav = resolveContextNav(orderedIds, lesson.id);

// Тайтлы для next/prev — одним запросом (работает для всех kind)
const navIds = [nav.nextId, nav.prevId].filter((v): v is string => v !== null);
const titleMap = new Map<string, string>(courseLessons.map((l) => [l.id, l.title]));
const missing = navIds.filter((id) => !titleMap.has(id));
if (missing.length > 0) {
  const rows = await ctx.prisma.lesson.findMany({ where: { id: { in: missing } }, select: { id: true, title: true } });
  for (const r of rows) titleMap.set(r.id, r.title);
}
const contextNav = {
  kind: ctxKind,
  label,
  returnHref,
  fromParam,
  nextInContext: nav.nextId ? { id: nav.nextId, title: titleMap.get(nav.nextId) ?? '' } : null,
  prevInContext: nav.prevId ? { id: nav.prevId, title: titleMap.get(nav.prevId) ?? '' } : null,
  isLastInContext: nav.isLast,
};
```

Затем в объекте `return { ... }` добавить поле `context: contextNav,` (рядом с `nextLesson`/`prevLesson`, которые НЕ удаляем).

- [ ] **Step 4: Запустить тест — зелёный**

Run: `pnpm --filter @mpstats/api test -- learning-getlesson-context`
Expected: PASS.

- [ ] **Step 5: Регресс — весь api-пакет зелёный**

Run: `pnpm --filter @mpstats/api test` и `pnpm --filter @mpstats/api typecheck`
Expected: 0 failures, typecheck чистый.

- [ ] **Step 6: Коммит**

```bash
git add packages/api/src/routers/learning.ts packages/api/src/routers/__tests__/learning-getlesson-context.test.ts
git commit -m "feat(learning): getLesson returns context nav (additive, from-aware)"
```

---

## Task 3: Компонент LessonCompletionModal

**Files:**
- Create: `apps/web/src/components/learning/LessonCompletionModal.tsx`
- Test: `apps/web/tests/unit/lesson-completion-modal.test.tsx`

> Сначала проверь, есть ли в проекте примитив диалога (`apps/web/src/components/ui/dialog.tsx`) — если да, используй его; если нет, свёрстай самодостаточный overlay (fixed inset-0, полупрозрачный бэкдроп → onStay, центрированная белая карта, rounded-2xl). Ориентир по стилю — `apps/web/src/components/admin/lesson-editor/…` диалоги или `delete-lesson-dialog`.

- [ ] **Step 1: Написать падающий тест**

```tsx
// apps/web/tests/unit/lesson-completion-modal.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { LessonCompletionModal } from '@/components/learning/LessonCompletionModal';

describe('LessonCompletionModal', () => {
  it('job: заголовок + кнопки к задаче и к плану', () => {
    render(<LessonCompletionModal kind="job" label="задача «X»" returnHref="/learn/job/x" onStay={() => {}} />);
    expect(screen.getByText('Задача пройдена')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Вернуться к задаче' })).toHaveAttribute('href', '/learn/job/x');
    expect(screen.getByRole('link', { name: 'К персональному плану' })).toHaveAttribute('href', '/learn/plan');
  });
  it('course: «Курс пройден» + к курсу', () => {
    render(<LessonCompletionModal kind="course" label="курс «Y»" returnHref="/learn/library#c1" onStay={() => {}} />);
    expect(screen.getByText('Курс пройден')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Вернуться к курсу' })).toHaveAttribute('href', '/learn/library#c1');
  });
  it('plan: primary=к плану, secondary=остаться (onStay)', () => {
    const onStay = vi.fn();
    render(<LessonCompletionModal kind="plan" label="Персональный план" returnHref="/learn/plan" onStay={onStay} />);
    expect(screen.getByRole('link', { name: 'К персональному плану' })).toHaveAttribute('href', '/learn/plan');
    fireEvent.click(screen.getByRole('button', { name: 'Остаться на уроке' }));
    expect(onStay).toHaveBeenCalled();
  });
  it('favorites: «В избранное»', () => {
    render(<LessonCompletionModal kind="favorites" label="Избранное" returnHref="/learn/favorites" onStay={() => {}} />);
    expect(screen.getByRole('link', { name: 'В избранное' })).toHaveAttribute('href', '/learn/favorites');
  });
  it('storefront: «На главную»', () => {
    render(<LessonCompletionModal kind="storefront" label="Главная" returnHref="/dashboard" onStay={() => {}} />);
    expect(screen.getByRole('link', { name: 'На главную' })).toHaveAttribute('href', '/dashboard');
  });
});
```

- [ ] **Step 2: Запустить — падает**

Run: `pnpm --filter web test -- lesson-completion-modal`
Expected: FAIL (нет компонента).

- [ ] **Step 3: Реализация**

```tsx
// apps/web/src/components/learning/LessonCompletionModal.tsx
'use client';

import Link from 'next/link';
import type { LessonContextKind } from '@mpstats/shared';

interface Props {
  kind: LessonContextKind;
  label: string;
  returnHref: string;
  onStay: () => void;
}

const TITLE: Record<LessonContextKind, string> = {
  job: 'Задача пройдена',
  course: 'Курс пройден',
  plan: 'Урок пройден',
  favorites: 'Урок пройден',
  storefront: 'Урок пройден',
};
const SUBTITLE: Record<LessonContextKind, string> = {
  job: 'Вы прошли все уроки задачи — отличная работа',
  course: 'Вы прошли курс целиком',
  plan: 'Вы на шаг ближе к цели',
  favorites: 'Вы на шаг ближе к цели',
  storefront: 'Вы на шаг ближе к цели',
};
const PRIMARY_LABEL: Record<LessonContextKind, string> = {
  job: 'Вернуться к задаче',
  course: 'Вернуться к курсу',
  plan: 'К персональному плану',
  favorites: 'В избранное',
  storefront: 'На главную',
};

export function LessonCompletionModal({ kind, label, returnHref, onStay }: Props) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onStay}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 sm:p-8 text-center shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onStay}
          aria-label="Закрыть"
          className="absolute right-4 top-4 text-mp-gray-400 hover:text-mp-gray-600"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-mp-green-100 text-mp-green-600">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h2 className="text-xl font-bold text-mp-gray-900">{TITLE[kind]}</h2>
        <p className="mt-2 text-sm text-mp-gray-500">{SUBTITLE[kind]}</p>

        <div className="mt-6 flex flex-col gap-2">
          <Link
            href={returnHref}
            className="w-full rounded-xl bg-mp-blue-600 px-4 py-3 font-medium text-white hover:bg-mp-blue-700 transition-colors"
          >
            {PRIMARY_LABEL[kind]}
          </Link>
          {kind === 'plan' ? (
            <button
              onClick={onStay}
              className="w-full rounded-xl border border-mp-gray-200 px-4 py-3 font-medium text-mp-gray-700 hover:bg-mp-gray-50 transition-colors"
            >
              Остаться на уроке
            </button>
          ) : (
            <Link
              href="/learn/plan"
              className="w-full rounded-xl border border-mp-gray-200 px-4 py-3 font-medium text-mp-gray-700 hover:bg-mp-gray-50 transition-colors"
            >
              К персональному плану
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
```

> Класс `absolute` у крестика требует `relative` у карточки — добавь `relative` в className карточки, если крестик позиционируется неверно. Сверь классы палитры (`mp-blue-600`, `mp-green-100`) с существующими в проекте (grep по `bg-mp-blue-` в компонентах) и замени на фактические, если отличаются.

- [ ] **Step 4: Запустить — зелёный**

Run: `pnpm --filter web test -- lesson-completion-modal`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/web/src/components/learning/LessonCompletionModal.tsx apps/web/tests/unit/lesson-completion-modal.test.tsx
git commit -m "feat(learning): LessonCompletionModal (contextual return CTAs)"
```

---

## Task 4: Проводка страницы урока

**Files:**
- Modify: `apps/web/src/app/(main)/learn/[id]/page.tsx`

Референс текущих мест (могут сдвинуться): парсинг `from` ~297-305, `getLesson` вызов ~314, `completeLesson.onSuccess` 515-531, крошки 649-674, кнопки «Предыдущий/Следующий» ~872/908.

- [ ] **Step 1: Пробросить `from` в getLesson + распарсить контекст на клиенте**

Заменить блок парсинга `fromJobSlug` (297-305) на чтение сырого `from`:
```ts
const fromParam = typeof window !== 'undefined'
  ? new URLSearchParams(window.location.search).get('from')
  : null;
```
Изменить вызов (314):
```ts
const { data, isLoading, error: lessonError } = trpc.learning.getLesson.useQuery({
  lessonId,
  from: fromParam ?? undefined,
});
```
Удалить запрос `trpc.job.getTitleBySlug` и переменную `fromJobTitle` (крошки теперь берут из `data.context`). `ctx` алиас:
```ts
const lessonCtx = data?.context;
```

- [ ] **Step 2: Состояние модалки (с прочими хуками, выше early-returns)**

Рядом с другими `useState` (напр. рядом с `interactiveReachedEnd`, ~492) добавить:
```ts
const [showCompletionModal, setShowCompletionModal] = useState(false);
```
> Rules of Hooks: `useState` обязан быть выше любых `if (isLoading) return` (см. память `feedback_rules_of_hooks_early_returns.md`).

- [ ] **Step 3: Контекстный редирект в completeLesson.onSuccess**

Заменить хвост `onSuccess` (525-529):
```ts
      const c = data?.context;
      if (c?.isLastInContext) {
        setShowCompletionModal(true);            // финал контекста → осознанная модалка
      } else if (c?.nextInContext) {
        router.push(`/learn/${c.nextInContext.id}?from=${encodeURIComponent(c.fromParam)}`);
      } else if (data?.nextLesson) {
        router.push(`/learn/${data.nextLesson.id}`); // safety-fallback (нет context)
      } else {
        router.push('/learn');
      }
```

- [ ] **Step 4: Навигация «Следующий/Предыдущий» — из контекста, сохраняя from**

Там, где кнопки навигации используют `data.nextLesson`/`data.prevLesson`, использовать контекст с сохранением `from`. Например для «Следующий» (~908):
```tsx
{(lessonCtx?.nextInContext ?? data.nextLesson) && (
  <Link href={`/learn/${(lessonCtx?.nextInContext ?? data.nextLesson)!.id}${lessonCtx ? `?from=${encodeURIComponent(lessonCtx.fromParam)}` : ''}`}>
    …Следующий: {(lessonCtx?.nextInContext ?? data.nextLesson)!.title}…
  </Link>
)}
```
Аналогично «Предыдущий» (~872) с `prevInContext ?? data.prevLesson`.
> Если `isLastInContext` и нет `nextInContext` — кнопку «Следующий» не показываем (как и раньше при `!nextLesson`). Кнопка «К списку» может вести на `lessonCtx?.returnHref ?? '/learn'`.

- [ ] **Step 5: Крошки из контекста**

Блок крошек (649-674): вместо ветки `fromJobSlug && fromJobTitle` использовать `lessonCtx`. Для `kind==='job'|'plan'|'favorites'|'storefront'` — крошка `[label] → returnHref` + «Урок N»; для `kind==='course'` (и когда контекста нет) — прежняя курсовая крошка (`course.title → /learn#courseId`). Использовать `lessonCtx.label` и `lessonCtx.returnHref`.

- [ ] **Step 6: Рендер модалки**

Перед закрывающим фрагментом рендера страницы (там, где рендерятся оверлеи) добавить:
```tsx
{showCompletionModal && lessonCtx && (
  <LessonCompletionModal
    kind={lessonCtx.kind}
    label={lessonCtx.label}
    returnHref={lessonCtx.returnHref}
    onStay={() => setShowCompletionModal(false)}
  />
)}
```
Импорт вверху: `import { LessonCompletionModal } from '@/components/learning/LessonCompletionModal';`

- [ ] **Step 7: Typecheck + сборка страницы**

Run: `pnpm --filter web typecheck`
Expected: 0 ошибок. Проверить, что удаление `fromJobTitle`/`getTitleBySlug` не оставило висячих ссылок (grep `fromJobTitle`, `fromJobSlug` в файле — не должно остаться).

- [ ] **Step 8: Коммит**

```bash
git add apps/web/src/app/\(main\)/learn/\[id\]/page.tsx
git commit -m "feat(learning): context-aware next + completion modal on lesson page"
```

---

## Task 5: Проп контекста в LessonCard + простановка на точках входа

**Files:**
- Modify: `apps/web/src/components/learning/LessonCard.tsx`
- Modify точки входа (см. ниже)

- [ ] **Step 1: Проп `context` в LessonCard**

В `LessonCardProps` добавить:
```ts
  /** Значение ?from= для контекстного возврата: 'plan' | 'favorites' | 'storefront' | 'course'. */
  context?: string;
```
В сигнатуре деструктуризации добавить `context`. Заменить href (87):
```tsx
<Link href={`/learn/${lesson.id}${context ? `?from=${context}` : ''}`}>
```

- [ ] **Step 2: Проставить контекст на входах**

Найти все использования `<LessonCard` (grep) и добавить проп по месту:
- `apps/web/src/app/(main)/learn/plan/page.tsx` → `context="plan"`. Также CTA «Продолжить с того места» (`href={/learn/${firstUnfinishedLesson.id}}`) → добавить `?from=plan`.
- `apps/web/src/app/(main)/learn/favorites/page.tsx` → у ссылки урока (`href: /learn/${item.itemId}`) добавить `?from=favorites`.
- `apps/web/src/components/learning/Shelf.tsx` → `<LessonCard>` получает `context="storefront"`. (JobCard ведёт на `/learn/job/<slug>`, откуда урок уже получит `from=job:` — не трогаем.)
- `apps/web/src/app/(main)/dashboard/collection/[shelfKey]/page.tsx` → `<LessonCard context="storefront">`.
- `apps/web/src/app/(main)/learn/library/page.tsx` → `<LessonCard context="course">`. CTA «Продолжить просмотр» → `?from=course` (опционально).

> Shelf.tsx рендерит и LessonCard, и JobCard — прокинь `context` в `LessonCard` через проп Shelf'а или захардкодь `"storefront"` в месте рендера LessonCard внутри Shelf. Выбери минимально инвазивный вариант, не сломав JobCard.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: 0 ошибок.

- [ ] **Step 4: Коммит**

```bash
git add apps/web/src/components/learning/LessonCard.tsx apps/web/src/app/\(main\)/learn/plan/page.tsx apps/web/src/app/\(main\)/learn/favorites/page.tsx apps/web/src/components/learning/Shelf.tsx apps/web/src/app/\(main\)/dashboard/collection/\[shelfKey\]/page.tsx apps/web/src/app/\(main\)/learn/library/page.tsx
git commit -m "feat(learning): thread entry-context (from=) through LessonCard call-sites"
```

---

## Task 6: Полная верификация (gate)

**Files:** нет (только прогоны)

- [ ] **Step 1: Все юнит-тесты**

Run: `pnpm --filter @mpstats/api test && pnpm --filter web test`
Expected: 0 failures (кроме известного флейка `yandex-oauth` в web под нагрузкой — если всплывёт, прогнать таргетно).

- [ ] **Step 2: Typecheck всех пакетов**

Run: `pnpm typecheck`
Expected: 0 ошибок во всех пакетах (shared/api/ai/web).

- [ ] **Step 3: Продакшн-сборка web**

Run: `pnpm --filter web build`
Expected: успешная сборка (страница урока и модалка компилируются; `useSearchParams`/window-guards не валят SSG).

- [ ] **Step 4: Финальный коммит (если были правки от gate)**

```bash
git add -A && git commit -m "test(learning): full verification green for context redirect"
```

---

## Self-review (перед стартом исполнения)

- **Покрытие спеки:** таблица назначений → Task 2 (returnHref/label/fromParam) + Task 3 (кнопки). Правило «модалка на финале» → Task 4 Step 3. Авто-переход в середине → Task 4 Step 3 (ветка `nextInContext`). Проброс `from` → Task 4 Step 4 + Task 5. Fallback курс/поиск → `parseFromParam` (Task 1). Копирайт → Task 3.
- **Аддитивность:** `getLesson` сохраняет `nextLesson/prevLesson` (Task 2 Step 3) — консьюмер `PartnerLessonView` не затронут.
- **Prod-safety:** миграций нет, `LessonProgress`/завершение уроков не трогаем — только навигация + чтение.
- **Гочи:** Rules of Hooks (Task 4 Step 2), проверка сигнатуры `parseLearningPath` (Task 1 Step 4), классы палитры модалки (Task 3 Step 3).
