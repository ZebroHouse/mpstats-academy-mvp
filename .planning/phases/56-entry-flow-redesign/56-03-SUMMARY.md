---
phase: 56-entry-flow-redesign
plan: 03
subsystem: web
tags: [onboarding, wizard, next-app-router, ssr-guard, trpc, e2e]

# Dependency graph
requires:
  - phase: 56-01
    provides: 5 полей квалификации на UserProfile (onboardingCompletedAt, marketplaces, experienceLevel, goals, goalText)
  - phase: 56-02
    provides: tRPC-роутер onboarding (getState query + complete mutation)
provides:
  - Роут /welcome — standalone fullscreen онбординг-визард вне (main)
  - Гард в (main)/layout — redirect на /welcome при onboardingCompletedAt == null
  - 5 компонентов визарда (WizardStepper, StepIntent, StepMarketplaces, StepExperience, ForkScreen) + options.ts
  - E2E-спека phase-56-entry-flow (3 сценария)
affects: [56-04-degating]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Standalone-роут вне route-группы: welcome/ — свой fullscreen layout + server-side auth-guard"
    - "Клиентский useState-степпер (1|2|3|'fork') — одна финальная мутация onboarding.complete на развилке"
    - "router.push строго внутри onSuccess мутации — защита от redirect-loop"
    - "Honest reframe — клиентский шаблон-эхо выбранных целей, без LLM"

key-files:
  created:
    - apps/web/src/app/welcome/layout.tsx
    - apps/web/src/app/welcome/page.tsx
    - apps/web/src/components/welcome/WizardStepper.tsx
    - apps/web/src/components/welcome/StepIntent.tsx
    - apps/web/src/components/welcome/StepMarketplaces.tsx
    - apps/web/src/components/welcome/StepExperience.tsx
    - apps/web/src/components/welcome/ForkScreen.tsx
    - apps/web/src/components/welcome/options.ts
    - apps/web/tests/e2e/phase-56-entry-flow.spec.ts
  modified:
    - apps/web/src/app/(main)/layout.tsx
    - apps/web/src/middleware.ts

key-decisions:
  - "Гард (main)/layout читает onboardingCompletedAt прямым prisma.findUnique (один лишний select-field), не через onboarding.getState — ноль новых round-trip'ов"
  - "Имя пользователя в визарде берётся из trpc.profile.get (первое слово name) — без отдельного round-trip, query уже кэшируется"
  - "/welcome добавлен и в middleware protectedRoutes (быстро), и в welcome/layout getUser-проверку (надёжно) — defense in depth"

patterns-established:
  - "Клиентский multi-step wizard: useState-степпер + накопленный стейт + одна финальная tRPC-мутация"

requirements-completed: []

# Metrics
duration: ~9min
completed: 2026-05-18
---

# Phase 56 Plan 03: онбординг-визард /welcome Summary

**Построен standalone-роут `/welcome` — клиентский 3-шаговый онбординг-визард (Цели → Маркетплейсы → Опыт) с равноценной развилкой `/diagnostic` ↔ `/learn`, плюс server-side гард в `(main)/layout`, заворачивающий не прошедших онбординг пользователей на `/welcome`.**

## Performance

- **Duration:** ~9 min
- **Tasks:** 3
- **Files:** 11 (9 создано, 2 изменено)

## Accomplishments

- **Роут `/welcome`** — новый top-level каталог вне `(main)`: `welcome/layout.tsx` (Server Component, `getUser()` → `redirect('/login')`, fullscreen `bg-mp-gray-50`-обёртка без сайдбара) + `welcome/page.tsx` (клиентский оркестратор).
- **Гард в `(main)/layout.tsx`** — `onboardingCompletedAt` добавлен в `select`; ветка `if (profile && profile.onboardingCompletedAt === null) redirect('/welcome')` после `pending_promo`-блока, до `return`.
- **`/welcome` в `middleware.ts protectedRoutes`** — defense in depth.
- **5 компонентов визарда** строго по 56-UI-SPEC:
  - `WizardStepper` — 3-сегментная полоска (`h-2 rounded-full`), подписи `1. Цели / 2. Маркетплейсы / 3. Опыт`, mobile «Шаг N из 3».
  - `StepIntent` — заголовок с именем, 7 multi-select чипов целей, `Textarea` (optional), privacy-нота.
  - `StepMarketplaces` — grid 7 multi-select карточек, `CheckCircle2` в углу при выборе.
  - `StepExperience` — вертикальный список 4 single-select радио-карточек.
  - `ForkScreen` — 2 равные карты (`flex flex-col` + CTA `mt-auto`): синяя «Пройти диагностику» (`variant="default"`), зелёная «Перейти в обучение» (`variant="success"`), loading-state «Сохраняем…».
- **`options.ts`** — `GOAL_OPTIONS` (7), `MARKETPLACE_OPTIONS` (7), `EXPERIENCE_OPTIONS` (4) с lucide-иконками; ключи совпадают с whitelist'ами `onboarding`-роутера.
- **Оркестратор `welcome/page.tsx`** — `useState`-степпер `1|2|3|'fork'`, накопленный стейт ответов, `onboarding.complete` с `router.push` строго в `onSuccess`, `toast.error` в `onError`, клиентский reframe-эхо целей после шага 1.
- **E2E `phase-56-entry-flow.spec.ts`** — 3 сценария: новый юзер → визард → «Перейти в обучение» → `/learn`; новый юзер → «Пройти диагностику» → `/diagnostic`; визард не повторяется после прохождения.

## Task Commits

1. **Task 1: welcome route + fullscreen layout + гард в (main)/layout** — `6623298` (feat)
2. **Task 2: WizardStepper + 4 шаг-компонента + options.ts** — `6865b44` (feat)
3. **Task 3: оркестратор welcome/page.tsx + E2E-тест** — `6dc4a19` (feat)

## Files Created/Modified

**Создано:**
- `apps/web/src/app/welcome/layout.tsx` — fullscreen layout + auth-guard
- `apps/web/src/app/welcome/page.tsx` — клиентский оркестратор визарда
- `apps/web/src/components/welcome/WizardStepper.tsx`
- `apps/web/src/components/welcome/StepIntent.tsx`
- `apps/web/src/components/welcome/StepMarketplaces.tsx`
- `apps/web/src/components/welcome/StepExperience.tsx`
- `apps/web/src/components/welcome/ForkScreen.tsx`
- `apps/web/src/components/welcome/options.ts`
- `apps/web/tests/e2e/phase-56-entry-flow.spec.ts`

**Изменено:**
- `apps/web/src/app/(main)/layout.tsx` — `onboardingCompletedAt` в `select` + redirect-ветка
- `apps/web/src/middleware.ts` — `/welcome` в `protectedRoutes`

## Decisions Made

- **Гард читает `onboardingCompletedAt` напрямую через `prisma`** (рекомендация 56-RESEARCH Open Question 1): один `select`-field в уже существующем `findUnique`, ноль новых round-trip'ов. `getState` остаётся для `/profile` (план 04).
- **Имя в визарде — из `trpc.profile.get`**, первое слово `name`. Минимальный round-trip: query уже кэшируется react-query, отдельный эндпоинт избыточен.
- **Defense in depth для `/welcome`** — и middleware `protectedRoutes`, и `getUser()`-проверка в layout. Middleware быстрее, layout надёжнее (middleware не может читать БД).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] E2E сценарий 3 не мог работать с tester-юзером после миграции 56-01**
- **Found during:** Task 3
- **Issue:** План описывал сценарий 3 как «после прохождения визард не показывается». Но после миграции 56-01 у ВСЕХ prod-юзеров (включая `tester@mpstats.academy`) `onboardingCompletedAt == null` — то есть tester сам увидит визард. Исходная формулировка теста (`expect не /welcome` сразу после логина) гарантированно падала бы.
- **Fix:** Сценарий 3 переписан устойчиво: логин → если попал на `/welcome`, пройти визард до конца → затем повторная навигация на `/learn` и `/dashboard` должна остаться на (main)-роуте, не редиректить на `/welcome`. Так тест корректен независимо от исходного состояния tester'а.
- **Files modified:** `apps/web/tests/e2e/phase-56-entry-flow.spec.ts`
- **Commit:** `6dc4a19`

## Issues Encountered

**E2E прогон в sandbox невозможен — pre-existing, out of scope.** `pnpm test:e2e -- phase-56-entry-flow` не проходит в этом окружении: Supabase auth отклоняет `tester@mpstats.academy` / `TestUser2024` с `invalid_credentials` (HTTP 400). Подтверждено как pre-existing — неизменённый `diagnostic-flow.spec.ts` падает идентично с той же ошибкой. Спека phase-56 синтаксически валидна (Playwright собрал все 3 теста без ошибок компиляции), сценарии 1-2 env-gated и скипаются без `TEST_NEW_USER_*`. Залогировано в `.planning/phases/56-entry-flow-redesign/deferred-items.md`. Запустить E2E нужно в окружении с валидным Supabase test-юзером (CI/staging) перед phase-gate.

## Verification

- `pnpm --filter web typecheck` — зелёный (после каждой из 3 задач)
- `phase-56-entry-flow.spec.ts` — Playwright собирает все 3 теста без ошибок парсинга/компиляции
- `(main)/layout.tsx` использует `prisma` из `@mpstats/db` — `@prisma/client` не импортируется (Pitfall 5 соблюдён)
- `welcome/layout.tsx` не импортирует `Sidebar`/`MobileNav`/`UserNav`
- E2E функциональный прогон отложен — см. «Issues Encountered» (pre-existing sandbox auth)

## Threat Model Coverage

- **T-56-08 (Spoofing / Access Control)** — `welcome/layout.tsx` (Server Component) делает `getUser()` → `redirect('/login')`; `/welcome` также в `middleware.ts protectedRoutes`. Неавторизованный визард не увидит.
- **T-56-09 (Elevation of Privilege)** — гард `(main)/layout` — серверный компонент, выполняется до рендера; обойти на клиенте нельзя. `redirect()` бросает исключение.
- **T-56-10 (Tampering, redirect-loop)** — `router.push` строго в `onSuccess` мутации `complete`; при сбое юзер остаётся на `/welcome` с сохранённым клиентским стейтом.
- **T-56-11 (XSS)** — reframe-строка — клиентский шаблон, рендерится как текст через React-эскейпинг, без `dangerouslySetInnerHTML`.

## Next Phase Readiness

- План 04 (де-гейтинг урока, `DiagnosticGateBanner` → хинт, редактирование квалификации в `/profile`) не имеет блокеров.
- Перед phase-gate: прогнать `pnpm test:e2e -- phase-56-entry-flow` в окружении с рабочим Supabase test-юзером.

## Self-Check: PASSED

- FOUND: `.planning/phases/56-entry-flow-redesign/56-03-SUMMARY.md`
- FOUND: `apps/web/src/app/welcome/layout.tsx`
- FOUND: `apps/web/src/app/welcome/page.tsx`
- FOUND: `apps/web/src/components/welcome/WizardStepper.tsx`
- FOUND: `apps/web/src/components/welcome/StepIntent.tsx`
- FOUND: `apps/web/src/components/welcome/StepMarketplaces.tsx`
- FOUND: `apps/web/src/components/welcome/StepExperience.tsx`
- FOUND: `apps/web/src/components/welcome/ForkScreen.tsx`
- FOUND: `apps/web/src/components/welcome/options.ts`
- FOUND: `apps/web/tests/e2e/phase-56-entry-flow.spec.ts`
- FOUND commit: `6623298`
- FOUND commit: `6865b44`
- FOUND commit: `6dc4a19`

---
*Phase: 56-entry-flow-redesign*
*Completed: 2026-05-18*
