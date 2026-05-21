---
phase: 56-entry-flow-redesign
plan: 04
subsystem: web
tags: [onboarding, de-gating, lesson-page, profile, trpc, localStorage]

# Dependency graph
requires:
  - phase: 56-02
    provides: tRPC-роутер onboarding (getState query + complete mutation)
  - phase: 56-03
    provides: welcome-компоненты + options.ts (GOAL/MARKETPLACE/EXPERIENCE_OPTIONS)
provides:
  - Урок доступен на подписке без диагностики — жёсткий гейт снят
  - DiagnosticGateBanner — закрываемый ненавязчивый хинт над плеером
  - Секция «О вашем бизнесе» в /profile — редактирование квалификации
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "localStorage-флаг dismissal: useState(true) + useEffect-чтение — карточка не мелькает при SSR-гидрации"
    - "Редактируемая tRPC-секция: getState → локальный useState → complete + utils.invalidate"

key-files:
  created:
    - apps/web/src/components/profile/QualificationSection.tsx
  modified:
    - apps/web/src/components/learning/DiagnosticGateBanner.tsx
    - apps/web/src/app/(main)/learn/[id]/page.tsx
    - apps/web/src/app/(main)/profile/page.tsx

key-decisions:
  - "QualificationSection вынесена в отдельный компонент, не инлайн в profile/page.tsx — секция объёмная (~230 строк), profile/page.tsx и так большой"
  - "Каст marketplaces/goals/experienceLevel к never на границе onboarding.complete — getState отдаёт string[] (Prisma), литеральный union недостижим без рестракта; значения происходят из locked *_OPTIONS, тампер невозможен"
  - "dismissed инициализируется true (не false) — карточка скрыта до проверки localStorage, иначе она мелькнёт у пользователей с установленным флагом"

patterns-established:
  - "Закрываемый хинт через localStorage: компонент возвращает null при флаге, читает его в useEffect"

requirements-completed: []

# Metrics
duration: ~6min
completed: 2026-05-18
---

# Phase 56 Plan 04: де-гейтинг урока + редактирование квалификации Summary

**Снят жёсткий гейт диагностики на странице урока — урок доступен на подписке без прохождения теста; `DiagnosticGateBanner` переделан из блокирующего баннера в закрываемую хинт-карточку с localStorage-флагом; в `/profile` добавлена секция «О вашем бизнесе» для редактирования всей квалификации через `onboarding`.**

## Performance

- **Duration:** ~6 min
- **Tasks:** 2
- **Files:** 4 (1 создан, 3 изменено)

## Accomplishments

- **Де-гейтинг урока** — в `learn/[id]/page.tsx` из тернарника убрана ветка `hasDiagnostic === false ? <DiagnosticGateBanner/>`. Урок рендерится всегда, кроме `lesson.locked`. Подписочный `LockOverlay` нетронут.
- **`DiagnosticGateBanner` репокат** — из блокирующего `py-12`-баннера в компактную закрываемую хинт-карточку: `Card` с `border-l-4 border-mp-blue-500 bg-mp-blue-50`, padding `p-4`, раскладка `flex items-start gap-3` (`lucide Sparkles` слева, текст в центре, кнопка-`X` справа). Заголовок `text-heading-sm`, подтекст `text-body-sm`, inline-CTA `Button variant="link"` «Пройти →». Inline-SVG заменён на `lucide-react`.
- **localStorage-dismissal** — `useState(true)` + `useEffect` читают флаг `diagnosticHintDismissed`; компонент возвращает `null` если флаг `=== 'true'`. Кнопка-закрытие (`aria-label="Закрыть подсказку"`) ставит флаг и скрывает карточку навсегда.
- **Хинт рендерится над плеером** — `{hasDiagnostic === false && <DiagnosticGateBanner />}` внутри левой колонки, НАД `<Card>` плеера. Не блокирует видео.
- **Секция «О вашем бизнесе» в `/profile`** — новый компонент `QualificationSection`: загружает значения через `trpc.onboarding.getState`, рендерит редактируемые контролы для `goals` (чипы), `marketplaces` (карточки-grid), `experienceLevel` (радио-список), `goalText` (`Textarea`). Кнопка «Сохранить» вызывает `onboarding.complete` с 4 полями квалификации, `toast` на успех/ошибку, инвалидация `onboarding.getState`.
- **Переиспользование welcome-паттернов** — `QualificationSection` импортирует `GOAL_OPTIONS`/`MARKETPLACE_OPTIONS`/`EXPERIENCE_OPTIONS` из `components/welcome/options.ts`; визуальные паттерны чипов/карточек/радио повторяют `StepIntent`/`StepMarketplaces`/`StepExperience` — без хардкода списков.

## Task Commits

1. **Task 1: де-гейтинг урока + DiagnosticGateBanner → закрываемый хинт** — `22ef3c1` (feat)
2. **Task 2: секция редактирования квалификации в /profile** — `108ae5d` (feat)

## Files Created/Modified

**Создано:**
- `apps/web/src/components/profile/QualificationSection.tsx` — редактируемая секция квалификации

**Изменено:**
- `apps/web/src/components/learning/DiagnosticGateBanner.tsx` — блокирующий баннер → закрываемый хинт
- `apps/web/src/app/(main)/learn/[id]/page.tsx` — убрана блокирующая ветка тернарника, хинт перенесён над плеер
- `apps/web/src/app/(main)/profile/page.tsx` — импорт + рендер `QualificationSection` после `SecurityCard`

## Decisions Made

- **`QualificationSection` — отдельный компонент**, не инлайн в `profile/page.tsx`. Секция объёмная (~230 строк); `profile/page.tsx` и так 838 строк. Отдельный файл следует паттерну `SecurityCard` (тоже отдельный компонент внутри страницы профиля).
- **Каст к `never` на границе `onboarding.complete`** — `getState` возвращает `marketplaces`/`goals` как `string[]` (Prisma), а `complete` принимает литеральный union (`z.enum`). Без рестракта роутера каст неизбежен; значения происходят из locked `*_OPTIONS` (ключи совпадают с whitelist'ом роутера), тампер невозможен — сервер всё равно валидирует `z.enum`.
- **`dismissed` инициализируется `true`** — карточка скрыта до проверки `localStorage` в `useEffect`. Если бы инициализировали `false`, у пользователей с уже установленным флагом хинт кратко мелькнул бы при гидрации.

## Deviations from Plan

None — план выполнен ровно как написано.

## Threat Model Coverage

- **T-56-12 (Elevation of Privilege)** — `onboarding.complete` (план 56-02) использует `protectedProcedure` + `where: { id: ctx.user.id }`; редактирование из `/profile` затрагивает только профиль текущего пользователя.
- **T-56-13 (Tampering / обход подписочного гейта)** — удалена ТОЛЬКО ветка `hasDiagnostic === false`; ветка `lesson.locked → <LockOverlay/>` сохранена без изменений. Подтверждено в диффе `learn/[id]/page.tsx`.
- **T-56-14 (XSS в goalText)** — `goalText` рендерится в `Textarea` value через React-эскейпинг, без `dangerouslySetInnerHTML`.
- **T-56-15 (манипуляция localStorage)** — принято: флаг `diagnosticHintDismissed` управляет только показом необязательной подсказки, не security-граница.

## Verification

- `pnpm --filter web typecheck` — зелёный (после каждой из 2 задач)
- `DiagnosticGateBanner.tsx` — `grep py-12` 0 совпадений, `grep <svg` 0 совпадений (inline-SVG заменён на lucide)
- `DiagnosticGateBanner.tsx` — содержит `aria-label="Закрыть подсказку"`, `lucide Sparkles` + `X`, читает/пишет `localStorage` ключ `diagnosticHintDismissed`, возвращает `null` при флаге
- `learn/[id]/page.tsx` — тернарник не содержит ветку `hasDiagnostic === false ? <DiagnosticGateBanner`; хинт рендерится через `{hasDiagnostic === false && <DiagnosticGateBanner />}`; ветка `lesson.locked → <LockOverlay/>` присутствует без изменений
- `profile/page.tsx` — `QualificationSection` импортирована и отрендерена; секция загружает значения через `onboarding.getState`, сохраняет через `onboarding.complete`, инвалидирует `getState`
- Ручная проверка урока/`/profile` отложена — требует запущенного окружения; типобезопасность и контракты подтверждены статически

## Next Phase Readiness

- Фаза 56 завершена — все 4 плана выполнены. Перед phase-gate: прогнать `pnpm test:e2e -- phase-56-entry-flow` в окружении с рабочим Supabase test-юзером (см. `56-03-SUMMARY.md` Issues Encountered).

## Self-Check: PASSED

- FOUND: `.planning/phases/56-entry-flow-redesign/56-04-SUMMARY.md`
- FOUND: `apps/web/src/components/profile/QualificationSection.tsx`
- FOUND: `apps/web/src/components/learning/DiagnosticGateBanner.tsx`
- FOUND commit: `22ef3c1`
- FOUND commit: `108ae5d`

---
*Phase: 56-entry-flow-redesign*
*Completed: 2026-05-18*
