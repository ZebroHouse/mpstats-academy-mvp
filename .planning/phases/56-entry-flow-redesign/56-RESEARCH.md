# Phase 56: Entry Flow Redesign — Research

**Researched:** 2026-05-18
**Domain:** Next.js 14 App Router routing/guards, Prisma schema migration на prod-БД, tRPC router, client-side multi-step wizard
**Confidence:** HIGH (всё подтверждено чтением фактического кода репозитория)

## Summary

Фаза техническая, не исследовательская: вся продуктовая и визуальная часть зафиксированы (CONTEXT.md + UI-SPEC.md). Это исследование отвечает только на вопрос «как планировщику структурировать задачи», и каждый вывод прослежен до конкретного файла в репозитории.

Главные технические факты, которые формируют план:

1. **`/welcome` — это новый top-level каталог `apps/web/src/app/welcome/`** рядом с `(main)`, `(auth)`, `about/`, `pricing/`. Route-группы `(...)` не создают URL-сегмент; обычный каталог `welcome/` даёт путь `/welcome`. Своя `layout.tsx` внутри `welcome/` полностью заменяет цепочку layout'ов `(main)` — никакого сайдбара. Группа `(welcome)` НЕ нужна (одна страница).
2. **Гард — серверный компонент `(main)/layout.tsx`**, который уже делает `prisma.userProfile.findUnique` и `redirect()`. Добавляется ещё одно поле в `select` (`onboardingCompletedAt`) и ветка `if (... == null) redirect('/welcome')`. Edge-middleware для этого не подходит — Prisma в Edge Runtime ненадёжен (это уже зафиксированное решение проекта, STATE.md `[v1.2]`).
3. **Миграция Prisma против prod Supabase — критическая операция.** CLAUDE.md содержит инцидент 2026-05-12. Проект использует `prisma db push` (НЕ migrate-deploy в CI), и есть рабочий паттерн «ручной ALTER на prod до rebuild». Для 5 nullable-полей это безопасно (additive, no data loss), но дисциплина обязательна.
4. **tRPC `onboarding` router** — точная копия паттерна `referral.ts` / `profile.ts`: `router({...})` с `protectedProcedure`, регистрация в `packages/api/src/root.ts`.
5. **Де-гейтинг урока — чисто клиентская правка** в `learn/[id]/page.tsx` (`'use client'`, строки 641-645). Сервер `learning.getLesson` урок уже отдаёт всегда.
6. **Готового степпер/wizard-компонента нет.** Диагностика — серверный multi-step (состояние шага в БД `DiagnosticSession.currentQuestion`). Визард 56 — наоборот, клиентский `useState`-степпер; переиспользуется только `diagnostic/ProgressBar.tsx` для полоски прогресса.

**Primary recommendation:** Планировать 4 волны — (1) schema + миграция на prod, (2) `onboarding` tRPC router + unit-тесты, (3) `/welcome` route + layout + 4 шаг-компонента + гард в `(main)/layout`, (4) де-гейтинг урока + `DiagnosticGateBanner` → хинт + редактирование квалификации в `/profile`. Волна 1 — блокирующая для всех остальных.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Хранение квалификации (`marketplaces`, `goals`, …) | Database / Storage | API | 5 новых колонок на `UserProfile` в prod Supabase |
| Гард «не прошёл онбординг → /welcome» | Frontend Server (SSR layout) | Database | Серверный компонент `(main)/layout.tsx` делает DB-запрос + `redirect()`; Edge-middleware исключён (Prisma в Edge ненадёжен) |
| `onboarding.getState` / `onboarding.complete` | API / Backend | Database | tRPC router, `protectedProcedure`, доступ к `UserProfile` через `ctx.prisma` |
| Состояние шагов визарда (1→2→3→fork) | Browser / Client | — | `useState` в client-компоненте; серверный per-step save не нужен (флоу ~30 сек) |
| `/welcome` layout (fullscreen, без сайдбара) | Frontend Server (SSR) | — | Standalone `welcome/layout.tsx` вне `(main)` |
| Honest reframe (эхо выбранных целей) | Browser / Client | — | Клиентский шаблон строки, без LLM (locked) |
| Де-гейтинг урока + хинт-карточка | Browser / Client | — | `learn/[id]/page.tsx` — `'use client'`; правка только клиентская, сервер `getLesson` урок уже отдаёт |
| Dismissal-флаг хинта диагностики | Browser / Client (localStorage) | — | Не персистится на сервере (locked, как `errors`-секция в Phase 23-03) |

## Standard Stack

Новых зависимостей фаза НЕ требует. Всё строится на текущем стеке проекта.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 14 (App Router) | Роуты `/welcome`, layout-гард | [VERIFIED: apps/web/package.json, существующие `(main)`/`(auth)` группы] |
| Prisma | ^5.22.0 | 5 новых полей `UserProfile` | [VERIFIED: packages/db/package.json] — на VPS глобально 7.x, всегда `npx prisma@5.22.0` (CLAUDE.md gotcha) |
| @trpc/server | (текущая) | `onboarding` router | [VERIFIED: packages/api/src/trpc.ts] |
| zod | (текущая) | input-валидация `onboarding.complete` | [VERIFIED: profile.ts/referral.ts используют `z.object`] |
| @supabase/ssr | (текущая) | server-side сессия в layout-гарде | [VERIFIED: `createClient` в `(main)/layout.tsx`] |
| Tailwind + shadcn/ui | (текущая) | UI визарда | [VERIFIED: UI-SPEC.md Registry Safety — все блоки уже в проекте] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | ^0.453.0 | иконки чипов/карт/хинта | UI-SPEC требует lucide для нового кода |
| sonner | (текущая) | toast при ошибке `onboarding.complete` | UI-SPEC States Contract |
| superjson | (текущая) | tRPC transformer (DateTime в `getState`) | [VERIFIED: trpc.ts `transformer: superjson`] — `onboardingCompletedAt` сериализуется корректно |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `useState`-степпер на клиенте | Серверный per-step save (как диагностика) | Locked: визард ~30 сек, бросил → начинает заново. Серверный save — over-engineering. |
| `String[]` для `marketplaces`/`goals` | Prisma `enum` | `String[]` повторяет существующий `toursCompleted String[]` (см. ниже) — рекомендуется. |
| Гард в layout | Гард в edge-middleware | Edge Runtime не может Prisma (STATE.md `[v1.2]`). Locked в CONTEXT.md. |

## Architecture Patterns

### System Architecture Diagram

```
                    Регистрация (DOI / Yandex OAuth)
                              │
            ┌─────────────────┴──────────────────┐
            ▼                                    ▼
   /auth/confirm/route.ts              /auth/callback/route.ts
   (verifyOtp → redirect)              (exchangeCode → redirect)
            │                                    │
            └────────────── redirect '/dashboard' ──────────────┐
                                                                ▼
                                              ┌──────────────────────────────┐
                                              │  (main)/layout.tsx (SSR)     │
                                              │  ── ГАРД ──                  │
                                              │  prisma.userProfile          │
                                              │   .findUnique(select:        │
                                              │     onboardingCompletedAt)   │
                                              └──────────────┬───────────────┘
                                       null ──┐              │── not null
                                              ▼              ▼
                                  redirect('/welcome')   рендер /dashboard
                                              │           (как сейчас)
                                              ▼
                          ┌─────────────────────────────────────────┐
                          │  welcome/layout.tsx  (fullscreen, БЕЗ    │
                          │  сайдбара, bg-mp-gray-50)                │
                          │  welcome/page.tsx  ('use client' wizard) │
                          │   useState: step (1|2|3|fork) + ответы   │
                          │   Step1 Intent → Step2 MP → Step3 Exp    │
                          │                  → Fork                  │
                          └────────────────┬──────────────────────────┘
                                  клик по карте развилки
                                           │
                                           ▼
                          trpc.onboarding.complete.mutate(
                            { marketplaces, experienceLevel,
                              goals, goalText })
                                           │
                          UserProfile.update: 4 поля +
                          onboardingCompletedAt = now()
                                           │
                          ┌────────────────┴────────────────┐
                          ▼                                  ▼
                  router.push('/diagnostic')        router.push('/learn')
                  (гард (main) теперь пропустит — onboardingCompletedAt != null)
```

### Recommended Project Structure

```
apps/web/src/app/
├── welcome/                       # НОВЫЙ top-level каталог → URL /welcome
│   ├── layout.tsx                 # fullscreen layout, БЕЗ сайдбара (Server Component)
│   └── page.tsx                   # 'use client' — оркестратор визарда (useState степпер)
├── (main)/
│   └── layout.tsx                 # ПРАВКА: + select onboardingCompletedAt + redirect
├── auth/                          # БЕЗ изменений (redirect → /dashboard остаётся)
└── (auth)/, about/, pricing/ ...

apps/web/src/components/
├── welcome/                       # НОВАЯ папка (структура — на усмотрение планировщика)
│   ├── WizardStepper.tsx          # 3-сегментная полоска (база — diagnostic/ProgressBar.tsx)
│   ├── StepIntent.tsx             # шаг 1: textarea + 7 чипов целей
│   ├── StepMarketplaces.tsx       # шаг 2: grid из 7 карточек-маркетплейсов
│   ├── StepExperience.tsx         # шаг 3: 4 карточки-радио
│   └── ForkScreen.tsx             # финальный экран — 2 равные карты
└── learning/
    └── DiagnosticGateBanner.tsx   # ПРАВКА: блокирующий баннер → dismissible хинт

packages/api/src/
├── routers/onboarding.ts          # НОВЫЙ router: getState + complete
├── routers/__tests__/onboarding.test.ts  # НОВЫЙ unit-тест (паттерн referral.test.ts)
└── root.ts                        # ПРАВКА: + onboarding: onboardingRouter

packages/db/prisma/
├── schema.prisma                  # ПРАВКА: +5 полей на UserProfile
└── migrations/2026XXXX_add_onboarding_fields/migration.sql  # НОВАЯ
```

### Pattern 1: Standalone route вне route-группы

**What:** Route-группы `(name)` в App Router НЕ добавляют URL-сегмент — они только группируют общий layout. Обычный каталог `welcome/` создаёт сегмент `/welcome`. Каждый каталог может иметь свой `layout.tsx`, который оборачивает только свои страницы.

**When to use:** `/welcome` нужен свой fullscreen layout без сайдбара `(main)`. Прецедент в репозитории — `pricing/` (top-level каталог со своим хедером, STATE.md `[19-02]: Pricing page outside (main) layout — own header with back nav, no sidebar`).

**Example:**
```tsx
// apps/web/src/app/welcome/layout.tsx — Server Component
// Source: паттерн (main)/layout.tsx — auth-проверка обязательна, т.к.
// edge-middleware protectedRoutes НЕ содержит /welcome (см. Pitfall 2)
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function WelcomeLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data?.user) redirect('/login');
  return (
    <div className="flex min-h-screen items-center justify-center bg-mp-gray-50 px-4 py-12">
      {children}
    </div>
  );
}
```

### Pattern 2: SSR layout-гард с Prisma + redirect

**What:** `(main)/layout.tsx` — async Server Component, уже делает `prisma.userProfile.findUnique` и `redirect()` (для `pending_promo`). Добавляется одна ветка.

**Example:**
```tsx
// apps/web/src/app/(main)/layout.tsx — ПРАВКА существующего блока
// Текущий код (строки 53-56) уже фетчит profile для UserNav:
const profile = await prisma.userProfile.findUnique({
  where: { id: user.id },
  select: { name: true, avatarUrl: true, onboardingCompletedAt: true }, // + поле
});

// НОВАЯ ветка — ставить ПОСЛЕ pending_promo-редиректа, ДО рендера:
if (profile && profile.onboardingCompletedAt === null) {
  redirect('/welcome');
}
```
> Важно: `redirect()` в Next.js бросает исключение — ставить после всех `await`, перед `return`. Текущий `pending_promo`-блок (строки 41-50) — рабочий прецедент того же приёма.

### Pattern 3: tRPC router (копия `referral.ts` / `profile.ts`)

**Example:**
```ts
// packages/api/src/routers/onboarding.ts
// Source: packages/api/src/routers/referral.ts + profile.ts
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { ensureUserProfile } from '../utils/ensure-user-profile';
import { handleDatabaseError } from '../utils/db-errors';

const MARKETPLACES = ['WB','OZON','YANDEX','ALIEXPRESS','MEGAMARKET','OWN_SHOP','OTHER'] as const;
const GOALS = ['SALES','ADS','CONTENT','ANALYTICS','OPERATIONS','FINANCE','NEW_MARKETPLACE'] as const;
const EXPERIENCE = ['PROSPECTING','BEGINNER','STABLE','ADVANCED'] as const;

export const onboardingRouter = router({
  getState: protectedProcedure.query(async ({ ctx }) => {
    try {
      await ensureUserProfile(ctx.prisma, ctx.user);
      const p = await ctx.prisma.userProfile.findUnique({
        where: { id: ctx.user.id },
        select: { onboardingCompletedAt: true, marketplaces: true,
                  experienceLevel: true, goals: true, goalText: true },
      });
      return p;
    } catch (error) { handleDatabaseError(error); }
  }),

  complete: protectedProcedure
    .input(z.object({
      marketplaces: z.array(z.enum(MARKETPLACES)).default([]),
      experienceLevel: z.enum(EXPERIENCE).nullable().optional(),
      goals: z.array(z.enum(GOALS)).default([]),
      goalText: z.string().trim().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        await ensureUserProfile(ctx.prisma, ctx.user);
        return await ctx.prisma.userProfile.update({
          where: { id: ctx.user.id },
          data: { ...input, onboardingCompletedAt: new Date() },
        });
      } catch (error) { handleDatabaseError(error); }
    }),
});
```
Регистрация в `packages/api/src/root.ts`: `import { onboardingRouter }` + `onboarding: onboardingRouter`.

### Pattern 4: Клиентский multi-step wizard

**What:** В репозитории НЕТ переиспользуемого stepper/wizard-компонента. Диагностика (`diagnostic/session/page.tsx`) — серверный multi-step: каждый шаг = отдельный вопрос, состояние хранится в `DiagnosticSession.currentQuestion` (БД), переход = `refetch()`. **Это НЕ паттерн для визарда 56** (CONTEXT.md: per-step server-save отвергнут).

Визард 56 — клиентский: `useState` в `welcome/page.tsx` держит `step` (1|2|3|'fork') и накопленные ответы; одна мутация `onboarding.complete` в конце.

**Example:**
```tsx
// apps/web/src/app/welcome/page.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { toast } from 'sonner';

export default function WelcomePage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3 | 'fork'>(1);
  const [goals, setGoals] = useState<string[]>([]);
  const [goalText, setGoalText] = useState('');
  const [marketplaces, setMarketplaces] = useState<string[]>([]);
  const [experienceLevel, setExperienceLevel] = useState<string | null>(null);

  const complete = trpc.onboarding.complete.useMutation({
    onError: () => toast.error('Не удалось сохранить ответы. Попробуйте ещё раз.'),
  });

  const finish = (dest: '/diagnostic' | '/learn') => {
    complete.mutate(
      { goals, goalText, marketplaces, experienceLevel },
      { onSuccess: () => router.push(dest) }, // навигация ТОЛЬКО после успеха
    );
  };
  // ...рендер шага по step; finish() вызывается из ForkScreen
}
```
> Дизайн-токены и тексты — строго по UI-SPEC.md (степпер `1. Цели / 2. Маркетплейсы / 3. Опыт`; `ProgressBar.tsx` как база полоски). Reframe-строка (шаг 1→2) — клиентский шаблон, без LLM (locked).

### Anti-Patterns to Avoid
- **Гард в edge-middleware.** Prisma в Edge Runtime ненадёжен — locked-решение проекта. Гард только в `(main)/layout.tsx`.
- **Серверный per-step save визарда.** Over-engineering — locked. `useState` на клиенте, одна финальная мутация.
- **`prisma db push` против prod из соседней папки или с `--accept-data-loss`.** Инцидент 2026-05-12. См. Pitfall 1.
- **Навигация на `/diagnostic`/`/learn` ДО успеха мутации.** Если мутация упала — пользователь ушёл с `onboardingCompletedAt == null` → гард вернёт его на `/welcome` (loop). `router.push` строго в `onSuccess`.
- **Удаление `DiagnosticGateBanner.tsx`.** Файл не удаляется — репокат в dismissible-хинт (locked). Текущий экспорт `DiagnosticGateBanner` импортируется в `learn/[id]/page.tsx:11`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Серверная сессия в layout-гарде | Свой парсер cookie | `createClient()` из `@/lib/supabase/server` + `supabase.auth.getUser()` | Уже используется в `(main)/layout.tsx` |
| tRPC error → user message | Свой try/catch с маппингом | `handleDatabaseError` из `../utils/db-errors` | Все routers так делают |
| Создание `UserProfile`, если его нет | Свой upsert | `ensureUserProfile(ctx.prisma, ctx.user)` | `profile.ts`/`diagnostic.ts` вызывают перед записью |
| Полоска прогресса степпера | Свой прогресс-бар с нуля | `diagnostic/ProgressBar.tsx` (`h-2 rounded-full`) как база | UI-SPEC прямо разрешает переиспользование |
| Toast об ошибке | Свой alert | `sonner` (`toast.error`) | Уже в проекте, UI-SPEC States Contract |
| Карты равной высоты на развилке | Свой flexbox-хак | `Card` + `flex flex-col` + CTA `mt-auto` | STATE.md `[19-02]`: `CardFooter + mt-auto pattern for equal-height` |

**Key insight:** Фаза почти целиком собирается из существующих паттернов проекта. Новый код — только бизнес-логика визарда и `onboarding` router; вся инфраструктура (auth, tRPC, error handling, UI-обёртки) переиспользуется.

## Runtime State Inventory

> Фаза НЕ rename/refactor, но содержит миграцию prod-БД и затрагивает существующих пользователей — проверка обязательна.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `UserProfile` в prod Supabase `saecuecevicwjkpmaoot` — ~158 живых пользователей. У всех 5 новых полей будут `null`/`[]` после миграции. `onboardingCompletedAt == null` → гард покажет визард при следующем входе (locked, ожидаемое поведение). | Миграция 5 nullable/default-полей. Backfill НЕ нужен. |
| Live service config | Нет — фаза не трогает n8n/CQ/внешние сервисы. | None — verified: новых интеграций нет. |
| OS-registered state | Нет. | None. |
| Secrets/env vars | Нет новых секретов/env-переменных. `NEXT_PUBLIC_*` не добавляются. | None. |
| Build artifacts | После правки `schema.prisma` нужен `prisma generate` (`pnpm db:generate`) — иначе Prisma Client не знает о новых полях; падёт typecheck/build. На VPS — `npx prisma@5.22.0 generate`. | `prisma generate` локально и в deploy-цепочке. |

**Канонический вопрос:** после миграции и rebuild у ~158 prod-юзеров `onboardingCompletedAt == null` → каждый увидит визард один раз при следующем входе. Это явно зафиксировано как желаемое поведение (CONTEXT.md, design-spec «Testing»: регрессия-кейс).

## Common Pitfalls

### Pitfall 1: Миграция против prod Supabase — риск потери данных
**What goes wrong:** `prisma db push` трактует `schema.prisma` как полное желаемое состояние БД. Запуск из неполной schema или с `--accept-data-loss` сносит незадекларированные таблицы.
**Why it happens:** Инцидент 2026-05-12: соседний проект запустил `db push --accept-data-loss` против shared MAAL Supabase → снёс 24 prod-таблицы. Восстановление через Supabase PITR (~12 ч потерь).
**How to avoid:**
- Миграцию запускать **только из MAAL-репозитория**, где `schema.prisma` декларирует все 24+ таблицы.
- Перед запуском — проверить, что `DATABASE_URL` указывает на нужную БД (prod ref = `saecuecevicwjkpmaoot`).
- **Никогда** `--accept-data-loss` против prod.
- 5 новых полей все nullable (`DateTime?`, `String?`) или с `@default([])` (`String[]`) — additive, без data-loss. Это безопасный класс изменения, но дисциплина запуска обязательна.
- Прецедент безопасного приёма в проекте: `20260512000000_add_lesson_metadata` — одна строка `ALTER TABLE ... ADD COLUMN`, применялась вручную на prod **до** rebuild.
**Warning signs:** `prisma migrate` предупреждает о drop таблиц; `DATABASE_URL` содержит `saecuecevicwjkpmaoot` при тестовом прогоне.

### Pitfall 2: Schema migration ПЕРЕД rebuild (recurring lesson — Phase 28)
**What goes wrong:** Если выкатить новый код (читающий `onboardingCompletedAt`) до миграции — Prisma Client запрашивает несуществующую колонку → рантайм-ошибки на проде.
**Why it happens:** STATE.md `[Phase 28 / feedback_schema_migration_order]`: «rebuild BEFORE migration when change alters existing query behavior» — был near-miss на `/pricing`.
**How to avoid:** Порядок деплоя — (1) применить миграцию на prod-БД, (2) затем `git pull && docker compose build`. CONTEXT.md фиксирует это явно: «Schema migration runs on prod before rebuild».
**Warning signs:** `PrismaClientKnownRequestError: column does not exist` в логах после деплоя.

### Pitfall 3: `/welcome` отсутствует в edge-middleware protectedRoutes
**What goes wrong:** `middleware.ts:10` — `protectedRoutes = ['/dashboard','/diagnostic','/learn','/profile','/admin','/complete-profile']`. `/welcome` там нет → неавторизованный пользователь не редиректится на `/login` с `/welcome`.
**Why it happens:** `/welcome` — новый путь, middleware его не знает.
**How to avoid:** Два варианта (планировщик выбирает): (а) добавить `/welcome` в `protectedRoutes` массив middleware; (б) auth-проверка в `welcome/layout.tsx` (`getUser()` → `redirect('/login')`). Рекомендуется **оба** (defense in depth) — middleware быстрее, layout надёжнее. Layout-проверка обязательна в любом случае.
**Warning signs:** Неавторизованный заход на `/welcome` показывает пустой/сломанный визард вместо `/login`.

### Pitfall 4: Redirect-loop при упавшей мутации
**What goes wrong:** Если `router.push('/learn')` вызвать до/независимо от успеха `onboarding.complete`, а мутация упала — `onboardingCompletedAt` остался `null`, гард `(main)` вернёт на `/welcome`.
**How to avoid:** `router.push` строго внутри `onSuccess` мутации. При ошибке — `toast.error`, клиентский стейт сохранён, пользователь повторяет (UI-SPEC States Contract это уже описывает).
**Warning signs:** Пользователь после развилки моргает обратно на `/welcome`.

### Pitfall 5: `@prisma/client` import в `apps/web` падает
**What goes wrong:** Прямой `import ... from '@prisma/client'` в `apps/web` ломает vite resolve.
**How to avoid:** Использовать `@mpstats/db` (re-exports) — `import { prisma } from '@mpstats/db'`. Уже так в `(main)/layout.tsx`. Routers используют `@mpstats/db/client`. CLAUDE.md gotcha.
**Warning signs:** Vite resolve error на сборке `apps/web`.

### Pitfall 6: VPS Prisma version mismatch
**What goes wrong:** На VPS глобально установлен Prisma 7.x, проект использует 5.22.0. `prisma generate`/`db push` без версии берёт глобальный 7.x → несовместимость.
**How to avoid:** На VPS всегда `npx prisma@5.22.0 ...`. STATE memory `project_vps_prisma`.

## Code Examples

### Schema: 5 новых полей на UserProfile
```prisma
// packages/db/prisma/schema.prisma — добавить в model UserProfile
// Прецедент массива-поля: toursCompleted String[] @default([]) (строка 34)
model UserProfile {
  // ...существующие поля...
  toursCompleted        String[]  @default([])   // существующий прецедент
  onboardingCompletedAt DateTime?                // null = показать визард
  marketplaces          String[]  @default([])   // WB|OZON|YANDEX|ALIEXPRESS|MEGAMARKET|OWN_SHOP|OTHER
  experienceLevel       String?                  // PROSPECTING|BEGINNER|STABLE|ADVANCED
  goals                 String[]  @default([])   // SALES|ADS|CONTENT|ANALYTICS|OPERATIONS|FINANCE|NEW_MARKETPLACE
  goalText              String?                  // свободный текст шага 1
}
```

### Migration SQL (additive, без data-loss)
```sql
-- packages/db/prisma/migrations/2026XXXX_add_onboarding_fields/migration.sql
-- Паттерн: 20260512000000_add_lesson_metadata (ручной ALTER на prod до rebuild)
ALTER TABLE "UserProfile" ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3);
ALTER TABLE "UserProfile" ADD COLUMN "marketplaces" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "UserProfile" ADD COLUMN "experienceLevel" TEXT;
ALTER TABLE "UserProfile" ADD COLUMN "goals" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "UserProfile" ADD COLUMN "goalText" TEXT;
```

### Де-гейтинг урока (клиентская правка)
```tsx
// apps/web/src/app/(main)/learn/[id]/page.tsx — строки 641-645
// БЫЛО:
{lesson.locked ? (
  <LockOverlay lessonTitle={lesson.title} />
) : hasDiagnostic === false ? (
  <DiagnosticGateBanner />          // ← блокирующая ветка УБИРАЕТСЯ
) : (
  <div className="grid lg:grid-cols-3 gap-6"> ... плеер ... </div>
)}

// СТАЛО — урок рендерится всегда (кроме подписочного гейта);
// хинт встаёт НАД плеером, не блокирует:
{lesson.locked ? (
  <LockOverlay lessonTitle={lesson.title} />
) : (
  <div className="grid lg:grid-cols-3 gap-6">
    <div className="lg:col-span-2 space-y-4">
      {hasDiagnostic === false && <DiagnosticGateBanner />}  {/* теперь dismissible хинт */}
      <Card>...VideoPlayer...</Card>
      ...
    </div>
  </div>
)}
```
> `lesson.locked` (подписочный гейт) остаётся нетронутым — STATE.md `[20-02]: Paywall LockOverlay takes priority over DiagnosticGateBanner`. `hasDiagnostic` берётся из `trpc.diagnostic.hasCompletedDiagnostic.useQuery()` (строка 302) — менять процедуру не нужно.

### Unit-тест onboarding router (паттерн referral.test.ts)
```ts
// packages/api/src/routers/__tests__/onboarding.test.ts
// Source: packages/api/src/routers/__tests__/referral.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onboardingRouter } from '../onboarding';

// ctx.prisma стаб — protectedProcedure дёргает userProfile.findUnique (lastActiveAt debounce)
const ctxPrismaStub = {
  userProfile: {
    findUnique: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue({}),
    upsert: vi.fn().mockResolvedValue({}),  // ensureUserProfile
  },
};
const ctx = { user: { id: 'user-1' }, prisma: ctxPrismaStub as any };

describe('onboarding.complete', () => {
  beforeEach(() => vi.clearAllMocks());
  it('сохраняет поля и ставит onboardingCompletedAt', async () => {
    const caller = onboardingRouter.createCaller(ctx as any);
    await caller.complete({ marketplaces: ['WB'], goals: ['SALES'],
                            experienceLevel: 'BEGINNER', goalText: '' });
    const updateArg = ctxPrismaStub.userProfile.update.mock.calls[0][0];
    expect(updateArg.data.onboardingCompletedAt).toBeInstanceOf(Date);
    expect(updateArg.data.marketplaces).toEqual(['WB']);
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Жёсткий гейт диагностики на странице урока (контент подменяется баннером) | Урок доступен на подписке; диагностика — необязательный хинт | Phase 56 | Activation rate ↑, опытные селлеры не упираются в стену |
| Диагностика-first вход | `/welcome` визард → равноценная развилка | Phase 56 | Пользователь выбирает путь |
| Платформа не знает аудиторию | 5 полей квалификации на `UserProfile` | Phase 56 | Вход для НАПРАВЛЕНИЯ 01 (сегментация диагностики) |

**Deprecated/outdated:** Нет — фаза только добавляет. `DiagnosticGateBanner` репокатится, не удаляется.

## Project Constraints (from CLAUDE.md)

- **PROD DATABASE SAFETY:** `prisma db push` против `saecuecevicwjkpmaoot` — только из MAAL-репо, никогда `--accept-data-loss`, миграция до rebuild. Сделать свежий backup перед DDL.
- **`@prisma/client` в `apps/web`** — запрещён, использовать `@mpstats/db`.
- **VPS Prisma** — всегда `npx prisma@5.22.0` (глобальный 7.x несовместим).
- **Deploy flow** — master = next-prod-release; непроверенную фичу не мержить в master, тестировать на staging (`docker-compose.staging.yml`). Фазу 56 вести на feature-branch (`phase-56-entry-flow` / worktree).
- **`NEXT_PUBLIC_*`** — вшиваются при build, не runtime. Фаза новых не вводит.
- **Git hygiene** — параллельные Claude-агенты; `git branch --show-current` перед каждым commit; своя feature-branch / worktree.
- **Коммиты** — `<type>(<scope>): <desc>`, body про WHY, английский header.
- **Clean code** — KISS, минимальные изменения, early return, без over-engineering.
- **Все user-facing строки — русский** (UI-SPEC Copywriting Contract фиксирует точные тексты).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Структура папок компонентов визарда (`components/welcome/*`) — на усмотрение планировщика | Recommended Project Structure | Низкий — CONTEXT.md явно отдаёт это в «Claude's Discretion» |
| A2 | `getState` будет нужен профилю/гарду; гард в layout может читать `onboardingCompletedAt` напрямую через `prisma` (без вызова tRPC-caller) — это быстрее и совпадает с текущим паттерном layout'а | Pattern 2 | Низкий — `(main)/layout.tsx` уже делает прямой `prisma.findUnique`, не tRPC. `getState` всё равно нужен `/profile` для редактирования. |
| A3 | 5 nullable/default-полей — безопасная additive-миграция без backfill | Runtime State Inventory, Pitfall 1 | Низкий — подтверждено типами полей; ни одно не `NOT NULL` без default |
| A4 | `protectedProcedure` достаточно для `onboarding` router (не нужен `publicProcedure`) | Pattern 3 | Низкий — визард доступен только авторизованным (после регистрации) |

**Все остальные технические утверждения [VERIFIED] чтением фактических файлов репозитория** — пути, номера строк, имена процедур, паттерны тестов и миграций.

## Open Questions

1. **Гард читает `onboardingCompletedAt` напрямую через `prisma` или через `onboarding.getState`?**
   - Что знаем: `(main)/layout.tsx` уже делает прямой `prisma.userProfile.findUnique` — добавить поле в `select` тривиально и быстро.
   - Что неясно: ничего критичного — оба варианта рабочие.
   - Рекомендация: гард — прямой `prisma`-запрос (один лишний `select`-field, ноль новых round-trip'ов). `onboarding.getState` оставить для `/profile` (редактирование квалификации) и при желании для клиентских компонентов.

2. **`auth/confirm` и `auth/callback` — менять или нет?**
   - Что знаем: оба редиректят на `/dashboard`; CONTEXT.md говорит «keep redirecting to /dashboard, гард перехватит».
   - Что неясно: ничего — менять НЕ нужно. Гард `(main)/layout` ловит и уводит на `/welcome`.
   - Рекомендация: `auth/*` не трогать. Это уменьшает поверхность изменений и риск регрессии auth.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node + pnpm | сборка, тесты | ✓ | (проектная) | — |
| Prisma CLI | миграция, generate | ✓ | 5.22.0 (локально); VPS глобально 7.x → `npx prisma@5.22.0` | — |
| Supabase prod `saecuecevicwjkpmaoot` | миграция UserProfile | ✓ | Postgres 17 | — |
| Vitest | unit-тест onboarding router | ✓ | ^2.1.3 | — |
| Playwright | E2E визарда | ✓ | ^1.48.1 | — |

**Missing dependencies:** нет — весь инструментарий в проекте.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework (unit) | Vitest ^2.1.3 |
| Framework (E2E) | Playwright ^1.48.1 |
| Config | `apps/web/vitest.config.ts`, `packages/api/vitest.config.ts`, `apps/web/playwright.config.ts` |
| Quick run command | `pnpm test` (Vitest, `vitest run`) |
| Full suite command | `pnpm test && pnpm test:e2e` |

### Phase Requirements → Test Map
| Behavior | Test Type | Automated Command | File Exists? |
|----------|-----------|-------------------|-------------|
| `onboarding.complete` сохраняет поля + ставит `onboardingCompletedAt` | unit | `pnpm --filter @mpstats/api test` | ❌ Wave — `packages/api/src/routers/__tests__/onboarding.test.ts` |
| `onboarding.getState` возвращает корректное состояние | unit | `pnpm --filter @mpstats/api test` | ❌ Wave |
| Новый юзер → `/welcome` → 3 шага → развилка → обе ветки | E2E | `pnpm test:e2e` | ❌ Wave — `apps/web/tests/e2e/phase-56-entry-flow.spec.ts` |
| Визард не показывается повторно после прохождения | E2E | `pnpm test:e2e` | ❌ Wave |
| Юзер без диагностики открывает урок → видео доступно, хинт закрывается; `LockOverlay` для платного урока блокирует | E2E | `pnpm test:e2e` | ❌ Wave (расширить `learning-flow.spec.ts` или новый файл) |

### Sampling Rate
- **Per task commit:** `pnpm typecheck` + `pnpm --filter @mpstats/api test` (быстрый прогон unit)
- **Per wave merge:** `pnpm test` (полный Vitest)
- **Phase gate:** `pnpm test && pnpm test:e2e` зелёные перед `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `packages/api/src/routers/__tests__/onboarding.test.ts` — unit (паттерн `referral.test.ts`)
- [ ] `apps/web/tests/e2e/phase-56-entry-flow.spec.ts` — E2E визарда + регрессия де-гейтинга (паттерн `phase-53a-referral.spec.ts`, `diagnostic-flow.spec.ts`)
- [ ] Фреймворк-установка не нужна — Vitest + Playwright уже в проекте

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Auth не меняется; визард — за `protectedProcedure` + layout-гард |
| V3 Session Management | no | Supabase SSR-сессия без изменений |
| V4 Access Control | yes | `onboarding` router — `protectedProcedure` (записывает только в `UserProfile` текущего юзера, `where: { id: ctx.user.id }`) |
| V5 Input Validation | yes | `zod` на `onboarding.complete`: `z.enum` для известных ключей маркетплейсов/целей/опыта, `z.string().max(500)` на `goalText` |
| V6 Cryptography | no | Криптография не вводится |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Запись произвольных строк в `marketplaces`/`goals`/`experienceLevel` | Tampering | `z.enum([...])` whitelist в input-схеме — отклоняет неизвестные ключи |
| Чужой `UserProfile` через подмену userId | Elevation of Privilege | `protectedProcedure` + жёсткий `where: { id: ctx.user.id }` — userId из серверной сессии, не из input |
| XSS через `goalText` (свободный текст) | Tampering | React эскейпит по умолчанию; `goalText` рендерится как текст, не `dangerouslySetInnerHTML`. Лимит длины `z.string().max(500)`. Прецедент — STATE.md `[35-01]: Plain text comments — no XSS surface` |
| Раздутый payload `goalText` | DoS | `z.string().max(500)` |

## Sources

### Primary (HIGH confidence) — фактический код репозитория
- `apps/web/src/middleware.ts` — protectedRoutes, edge auth
- `apps/web/src/app/(main)/layout.tsx` — SSR-гард, прямой `prisma.findUnique` + `redirect()`
- `apps/web/src/app/auth/confirm/route.ts`, `auth/callback/route.ts` — post-auth redirect → `/dashboard`
- `packages/api/src/trpc.ts` — `protectedProcedure`, `router`, superjson, context
- `packages/api/src/root.ts` — регистрация routers
- `packages/api/src/routers/profile.ts`, `referral.ts` — паттерн router/процедуры
- `packages/api/src/routers/__tests__/referral.test.ts` — паттерн unit-теста (vi.mock, createCaller)
- `apps/web/src/app/(main)/learn/[id]/page.tsx:641-645,302` — гейт диагностики, `hasDiagnostic`
- `apps/web/src/components/learning/DiagnosticGateBanner.tsx` — текущий блокирующий баннер
- `packages/db/prisma/schema.prisma:26-54` — `UserProfile` model, `toursCompleted String[]` прецедент
- `packages/db/prisma/migrations/20260512000000_add_lesson_metadata/` — паттерн additive ALTER на prod
- `apps/web/src/app/(main)/diagnostic/session/page.tsx` — серверный multi-step (контр-пример)
- `CLAUDE.md` (3 уровня) — PROD DATABASE SAFETY, gotchas, deploy flow

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` — decision history (`[v1.2]` Prisma в Edge; `[19-02]` pricing вне `(main)`; `[20-02]` LockOverlay приоритет; `[35-01]` plain text comments)

### Tertiary (LOW confidence)
- Нет — все утверждения проверены прямым чтением кода.

## Metadata

**Confidence breakdown:**
- Routing & layout-гард: HIGH — паттерн `pricing/` + `(main)/layout.tsx` прочитаны
- tRPC router: HIGH — `referral.ts`/`profile.ts` дают точный шаблон
- Миграция: HIGH — типы полей additive; паттерн `add_lesson_metadata` подтверждён; safety-правила в CLAUDE.md
- Де-гейтинг: HIGH — точные строки 641-645 прочитаны, сервер `getLesson` урок отдаёт всегда
- Wizard pattern: HIGH — подтверждено отсутствие готового stepper; диагностика — другой (серверный) паттерн
- Pitfalls: HIGH — каждый прослежен до инцидента/decision в CLAUDE.md / STATE.md

**Research date:** 2026-05-18
**Valid until:** 2026-06-17 (стабильный стек; внутренний код — пока репозиторий не реструктурирован)
