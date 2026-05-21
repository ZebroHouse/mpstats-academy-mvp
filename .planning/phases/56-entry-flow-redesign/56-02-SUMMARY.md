---
phase: 56-entry-flow-redesign
plan: 02
subsystem: api
tags: [trpc, onboarding, zod, vitest, user-profile]

# Dependency graph
requires:
  - phase: 56-01
    provides: 5 полей квалификации на model UserProfile (onboardingCompletedAt, marketplaces, experienceLevel, goals, goalText)
provides:
  - tRPC-роутер onboarding с процедурами getState (query) и complete (mutation)
  - Регистрация onboarding в appRouter — доступен клиентам через trpc.onboarding.*
  - Whitelist-валидация квалификации (z.enum) — единственная точка персистентности визарда
affects: [56-03-welcome-wizard, 56-04-degating]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "tRPC router — копия profile.ts: protectedProcedure + ensureUserProfile + handleDatabaseError"
    - "zod z.enum whitelist на marketplaces/goals/experienceLevel — отклоняет tampered-ключи до записи в БД"
    - "Unit-тест: ctx prisma stub дискриминирует middleware-findUnique по select-аргументу"

key-files:
  created:
    - packages/api/src/routers/onboarding.ts
    - packages/api/src/routers/__tests__/onboarding.test.ts
  modified:
    - packages/api/src/root.ts

key-decisions:
  - "Гард читает onboardingCompletedAt напрямую через prisma в (main)/layout — getState оставлен для /profile (план 04)"
  - "Middleware-findUnique (lastActiveAt debounce) в тесте мокается через select-дискриминацию, возвращая свежий lastActiveAt — debounce пропускает side-effect update, не пачкая счётчики assert"

patterns-established:
  - "Whitelist-роутер квалификации: z.enum([...]) на каждое поле с фиксированным словарём ключей"

requirements-completed: []

# Metrics
duration: ~6min
completed: 2026-05-18
---

# Phase 56 Plan 02: onboarding tRPC-роутер Summary

**Создан tRPC-роутер `onboarding` (`getState` + `complete`), зарегистрирован в `appRouter`, покрыт 4 unit-тестами — единственная серверная точка персистентности визарда онбординга с whitelist-валидацией квалификации.**

## Performance

- **Duration:** ~6 min
- **Tasks:** 2
- **Files modified:** 3 (2 создано, 1 изменён)

## Accomplishments

- `onboardingRouter` с двумя процедурами на `protectedProcedure`:
  - `getState` — query: возвращает `onboardingCompletedAt`, `marketplaces`, `experienceLevel`, `goals`, `goalText` текущего пользователя (для `/profile`, план 04)
  - `complete` — mutation: пишет квалификацию в `UserProfile` + ставит `onboardingCompletedAt: new Date()`, возвращает обновлённый профиль (вызывается визардом на развилке, план 03)
- Whitelist-валидация: `z.array(z.enum(MARKETPLACES))`, `z.enum(EXPERIENCE).nullable().optional()`, `z.array(z.enum(GOALS))`, `z.string().trim().max(500)` для `goalText` — неизвестные ключи отклоняются до записи в БД
- Запись жёстко привязана к `where: { id: ctx.user.id }` — userId из серверной сессии, никогда из input
- `onboarding: onboardingRouter` зарегистрирован в `appRouter` (`root.ts`)
- 4 unit-теста (паттерн `referral.test.ts`): персистентность `complete` + Date-стамп, отклонение невалидного ключа маркетплейса до DB-записи, приём `null`-`experienceLevel`, корректный возврат `getState`

## Task Commits

Каждая задача закоммичена атомарно:

1. **Task 1: onboarding router (getState + complete) + регистрация в root** — `275ab40` (feat)
2. **Task 2: Unit-тесты onboarding router** — `f2f6fb1` (test)

## Files Created/Modified

- `packages/api/src/routers/onboarding.ts` (создан) — `onboardingRouter` с `getState` + `complete`, константы `MARKETPLACES`/`GOALS`/`EXPERIENCE`
- `packages/api/src/routers/__tests__/onboarding.test.ts` (создан) — 4 unit-теста
- `packages/api/src/root.ts` (изменён) — import + регистрация `onboarding: onboardingRouter`

## Decisions Made

- **Гард `(main)/layout` читает `onboardingCompletedAt` напрямую через `prisma`**, а не через `onboarding.getState` — это рекомендация 56-RESEARCH (Open Question 1): один лишний `select`-field, ноль новых round-trip'ов. `getState` остаётся для `/profile` (план 04) и клиентских компонентов.
- **Дискриминация middleware-`findUnique` в тесте по `select`-аргументу.** `protectedProcedure` фоном дёргает `userProfile.findUnique({ select: { lastActiveAt } })` (debounce) и при устаревшем `lastActiveAt` — `userProfile.update`. Стаб возвращает для этого вызова **свежий** `lastActiveAt` → debounce пропускает side-effect `update`, и счётчики `update` в assert'ах отражают только вызовы процедуры.

## Deviations from Plan

None — план выполнен ровно как написан.

## Issues Encountered

Первый прогон тестов: 3 фейла — middleware `protectedProcedure` сам вызывал `userProfile.update` (debounce `lastActiveAt`), что ломало `toHaveBeenCalledTimes(1)` и `not.toHaveBeenCalled()`. Исправлено в рамках Task 2: стаб `findUnique` возвращает свежий `lastActiveAt` для middleware-вызова → debounce-update не срабатывает. Все 32 теста (`@mpstats/api`) зелёные.

## Verification

- `pnpm --filter @mpstats/api typecheck` — зелёный
- `pnpm --filter @mpstats/api test` — 32/32 теста зелёные (4 onboarding + 28 существующих, общий suite не сломан)
- `onboarding` присутствует в `appRouter` (`root.ts`)

## Threat Model Coverage

- **T-56-04 (Tampering)** — `z.enum([...])` whitelist на `marketplaces`/`goals`/`experienceLevel`; unit-тест подтверждает rejection невалидного ключа до DB-записи
- **T-56-05 (Elevation of Privilege)** — `protectedProcedure` + жёсткий `where: { id: ctx.user.id }`; unit-тест проверяет `where` = `{ id: 'user-1' }`
- **T-56-06 (DoS)** — `z.string().trim().max(500)` ограничивает `goalText`
- **T-56-07 (XSS)** — `goalText` хранится как plain text; рендеринг в плане 04 — React-эскейпинг

## Next Phase Readiness

- План 03 (`/welcome` визард) может вызывать `trpc.onboarding.complete.useMutation` на развилке.
- План 04 (`/profile`) может вызывать `trpc.onboarding.getState` для редактирования квалификации.
- Никаких блокеров для Wave 3.

## Self-Check: PASSED

- FOUND: `.planning/phases/56-entry-flow-redesign/56-02-SUMMARY.md`
- FOUND: `packages/api/src/routers/onboarding.ts`
- FOUND: `packages/api/src/routers/__tests__/onboarding.test.ts`
- FOUND: `packages/api/src/root.ts` (содержит `onboarding: onboardingRouter`)
- FOUND commit: `275ab40`
- FOUND commit: `f2f6fb1`

---
*Phase: 56-entry-flow-redesign*
*Completed: 2026-05-18*
