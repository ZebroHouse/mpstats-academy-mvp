---
phase: 56-entry-flow-redesign
plan: 01
subsystem: database
tags: [prisma, postgres, supabase, schema-migration, onboarding]

# Dependency graph
requires:
  - phase: 34-user-profile-enhancement
    provides: model UserProfile (база, куда добавляются поля квалификации)
provides:
  - 5 новых полей квалификации на model UserProfile (onboardingCompletedAt, marketplaces, experienceLevel, goals, goalText)
  - Additive migration 20260518000000_add_onboarding_fields, применённая на prod Supabase
  - Регенерированный Prisma Client с новыми полями для downstream-планов
affects: [56-02-onboarding-router, 56-03-welcome-wizard, 56-04-degating]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Additive schema migration — только nullable / DEFAULT колонки, zero data-loss"
    - "Ручное применение DDL на prod через Supabase Management API query endpoint + ручной INSERT в _prisma_migrations"

key-files:
  created:
    - packages/db/prisma/migrations/20260518000000_add_onboarding_fields/migration.sql
  modified:
    - packages/db/prisma/schema.prisma

key-decisions:
  - "String[] вместо Prisma enum для marketplaces/goals — повторяет паттерн toursCompleted, locked в CONTEXT.md"
  - "Миграция применена на prod ДО docker rebuild (recurring lesson Phase 28) — rebuild отдельным шагом в конце фазы"
  - "DDL на prod выполнен через Supabase Management API query endpoint, _prisma_migrations синхронизирована ручным INSERT (R1-паттерн Lesson.order)"

patterns-established:
  - "Additive migration class: все новые колонки nullable или с DEFAULT — backwards-compatible, безопасно для live prod с активными пользователями"

requirements-completed: []

# Metrics
duration: ~10min
completed: 2026-05-18
---

# Phase 56 Plan 01: Schema +5 полей UserProfile + additive-миграция Summary

**5 полей квалификации (onboardingCompletedAt, marketplaces, experienceLevel, goals, goalText) добавлены на model UserProfile и применены на prod Supabase additive-миграцией с нулевой потерей данных (170 пользователей целы).**

## Performance

- **Duration:** ~10 min
- **Tasks:** 2
- **Files modified:** 2 (1 изменён, 1 создан)

## Accomplishments

- 5 новых полей квалификации объявлены в `model UserProfile` (`schema.prisma`): `onboardingCompletedAt DateTime?`, `marketplaces String[] @default([])`, `experienceLevel String?`, `goals String[] @default([])`, `goalText String?`
- Создан каталог миграции `20260518000000_add_onboarding_fields/` с additive `migration.sql` (5 операторов `ALTER TABLE "UserProfile" ADD COLUMN`, без DROP / `--accept-data-loss`)
- Миграция применена на prod Supabase (`saecuecevicwjkpmaoot`) через Management API query endpoint и **верифицирована**:
  - Все 5 новых колонок присутствуют на `UserProfile` (`information_schema.columns`)
  - Количество строк `UserProfile` не изменилось: 170 до = 170 после (zero data-loss)
  - Строка `20260518000000_add_onboarding_fields` добавлена в `_prisma_migrations`
- Prisma Client регенерирован — downstream-планы (onboarding router, гард `(main)`, `/profile`) могут типизироваться против новых полей

## Task Commits

Каждая задача закоммичена атомарно:

1. **Task 1: 5 полей квалификации в model UserProfile + регенерация Prisma Client** — `6a6a5a5` (feat)
2. **Task 2: [BLOCKING] additive-миграция для onboarding-полей + применение на prod** — `ee82a15` (feat)

**Plan metadata:** см. финальный `docs(56-01)`-коммит.

## Files Created/Modified

- `packages/db/prisma/schema.prisma` — 5 полей квалификации в `model UserProfile` (после `toursCompleted`)
- `packages/db/prisma/migrations/20260518000000_add_onboarding_fields/migration.sql` — additive-миграция: 5 `ALTER TABLE ADD COLUMN`, чисто nullable / DEFAULT

## Decisions Made

- **`String[]` вместо Prisma enum** для `marketplaces` и `goals` — locked-решение CONTEXT.md, повторяет уже существующий `toursCompleted String[] @default([])`.
- **Миграция на prod применена ДО docker rebuild** — recurring lesson Phase 28: schema-изменение, меняющее поведение query, накатывается на БД раньше пересборки контейнеров. Docker rebuild — отдельный шаг деплоя в конце фазы.
- **DDL на prod выполнен через Supabase Management API query endpoint**, НЕ через `prisma db push` и без `--accept-data-loss` — соблюдение zero-exception правил `MAAL/CLAUDE.md` (инцидент 2026-05-12). `_prisma_migrations` синхронизирована ручным INSERT — established R1-паттерн (Lesson.order recovery).

## Deviations from Plan

None — план выполнен ровно как написан.

## Issues Encountered

None.

## User Setup Required

None — внешняя конфигурация сервисов не требуется.

## Checkpoint Resolution

Task 2 был `checkpoint:human-action` (blocking gate) — применение DDL против live prod-БД требует ручного подтверждения. Чекпойнт разрешён: оркестратор применил additive-миграцию на prod Supabase (`saecuecevicwjkpmaoot`) через Management API query endpoint и верифицировал результат (5 колонок присутствуют, 170 пользователей целы, `_prisma_migrations` синхронизирована). Дальнейшие операции с prod-БД в этом плане не выполняются.

## Next Phase Readiness

- Schema-фундамент готов: план 02 (`onboarding` tRPC-роутер) может писать в новые поля, план 03 (гард `(main)`-layout) — читать `onboardingCompletedAt`, план 04 (`/profile`) — редактировать квалификацию.
- Prisma Client регенерирован — `typecheck`/`build` downstream-планов не упадут на отсутствии полей.
- Никаких блокеров для Wave 2.

## Self-Check: PASSED

- FOUND: `.planning/phases/56-entry-flow-redesign/56-01-SUMMARY.md`
- FOUND: `packages/db/prisma/schema.prisma`
- FOUND: `packages/db/prisma/migrations/20260518000000_add_onboarding_fields/migration.sql`
- FOUND commit: `6a6a5a5`
- FOUND commit: `ee82a15`

---
*Phase: 56-entry-flow-redesign*
*Completed: 2026-05-18*
