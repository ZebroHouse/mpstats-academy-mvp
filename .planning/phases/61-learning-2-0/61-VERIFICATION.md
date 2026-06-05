---
phase: 61-learning-2-0
verified: 2026-06-03T15:10:00Z
status: human_needed
score: 11/12 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Проверить, что сабменю «Обучение» разворачивается на desktop /learn/* с подсветкой активного пункта; на мобиле LearningTabs видна на /learn/*"
    expected: "4 пункта в sidebar раскрываются при клике, активный пункт подсвечен; на мобиле горизонтальный таб-стрип показывается вверху страниц /learn/*"
    why_human: "Вёрстка / интерактивное состояние не верифицируются grep'ом"
  - test: "Поиск в /learn/solutions: ввести запрос, нажать Enter → должны вернуться карточки решений (playbooks) через intent.resolve"
    expected: "Результаты с job-карточками и кнопкой «В план»; никаких уроков или материалов"
    why_human: "Требует работающего staging/prod сервера с данными"
  - test: "Поиск в /learn/library: ввести запрос → должны вернуться сгруппированные «Уроки» и «Материалы»"
    expected: "Секция «Уроки» с карточками уроков (LessonResultCard) и секция «Материалы» (MaterialCard); при пустом запросе виден каталог курсов + material catalog"
    why_human: "Требует работающего сервера; поведение при пустом vs заполненном запросе проверяется интерактивно"
  - test: "Каталог материалов в /learn/library: фильтр по типу (5 чипов + «Уроки») — переключение показывает только материалы выбранного типа; при отсутствии «Материалов этого типа пока нет»"
    expected: "Чипы фильтруют список; пустой результат → «Материалов этого типа пока нет»"
    why_human: "Требует prod-данных и живого UI"
  - test: "FavoriteButton (сердечко) на карточках: клик по сердечку на JobCard, MaterialCard, LessonResultCard → оптимистичное изменение цвета, появляется в /learn/favorites"
    expected: "Сердечко становится розовым (mp-pink-500); в /learn/favorites появляется добавленный элемент с кнопкой удаления"
    why_human: "Интерактивное поведение, анимация, работа с реальным favorite.add API"
  - test: "Страница /learn/plan показывает ТОЛЬКО диагностические секции (errors/deepening/growth/advanced); раздел «Избранное» (/learn/favorites) показывает бывшие ручные добавления (из трека)"
    expected: "В Плане нет секции «Мои уроки»; в Избранном — 677 LESSON + 41 JOB, мигрированные 2026-06-03"
    why_human: "Требует реального аккаунта с существующим планом и мигрированными данными"
  - test: "Дашборд /dashboard: вверху 3 акцентных карточки ведут в /learn/plan, /learn/library, /learn/solutions"
    expected: "3 карточки «Продолжить мой план», «Найти быстрый ответ», «Решить задачу» с правильными вариантами (soft-blue/soft-green/gradient); статы condensed"
    why_human: "Вёрстка и визуальные варианты"
  - test: "Онбординг-тур: запустить тур → шаг «Обучение» находит data-tour=learn-submenu на sidebar (desktop), шаг «Поиск» находит data-tour=learn-search в hero-блоке"
    expected: "Тур не показывает «element not found»; шаги позиционируются корректно"
    why_human: "driver.js DOM поиск не верифицируется статически; IN-04 (review) флагирует потенциальную проблему на mobile"
  - test: "E2E Playwright learn-redirect: посетить /learn/track → попасть на /learn/plan; посетить /learn → попасть на /learn/plan или /learn/library"
    expected: "URL assertion проходит для обоих тестов"
    why_human: "Playwright e2e не может выполниться автоматически — tester@mpstats.academy / TestUser2024 не совпадает с реальным паролем аккаунта (известная проблема с credential gate, не дефект реализации)"
gaps: []
deferred: []
---

# Phase 61: Обучение 2.0 — Verification Report

**Phase Goal:** Развести раздел «Обучение» на 4 сущности с ясными зонами (Персональный план / Решения под задачу / База знаний / Избранное), сделать поиск контекстным по сущности раздела, перестроить дашборд в 3 входа + вывести поиск на видное место. Закрывает задачи owner 2 (поиск), 3 (сабменю), 4 (UI).
**Verified:** 2026-06-03T15:10:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Сабменю «Обучение» с 4 под-пунктами в sidebar + mobile nav; активное состояние корректно | ✓ VERIFIED | `sidebar.tsx:24-27` содержит все 4 href (/learn/plan/solutions/library/favorites) с канонными метками; `data-tour="learn-submenu"` на group header; `learnOpen` state с `rotate-180` chevron; `LearningTabs.tsx` с `md:hidden overflow-x-auto` |
| 2 | 4 отдельных маршрута работают; `/learn` и `/learn/track` редиректят правильно | ✓ VERIFIED | `/learn/page.tsx` — Server Component, `redirect()` без `'use client'`; читает `learningPath` через prisma; `/learn/track/page.tsx` — `redirect('/learn/plan')` без `useEffect`/`router.push` |
| 3 | Поиск в «Решениях» возвращает плейбуки; в «Базе знаний» — уроки + материалы | ✓ VERIFIED | `AgentSearch.tsx`: `scope` prop; `solutions` ветка → `resolveMutation` (`intent.resolve`); `library` ветка → `Promise.all([searchLessons, material.listForUser])` + grouped render «Уроки»/«Материалы» |
| 4 | Материалы видны юзеру в Базе знаний с фильтром по типу; ACL скачивания не сломан | ✓ VERIFIED | `material.listForUser` — `protectedProcedure`, `where.isHidden = false` принудительно (line 219), `z.nativeEnum(MaterialType)` для type filter; `storagePath` выбирается, стрипается в `.map()` → `hasFile` boolean только; `getSignedUrl` не тронут |
| 5 | Сердечко «В избранное» на карточках; раздел Избранное показывает сохранённое с фильтром | ✓ VERIFIED | `FavoriteButton.tsx`: `Heart w-5 h-5`, `min-h-11 min-w-11`, `fill-mp-pink-500`, `aria-pressed`, click-guard `e.preventDefault/stopPropagation`; смонтирован в `JobCard.tsx:48`, `MaterialCard.tsx:110`, `LessonResultCard.tsx:40`; `favorites/page.tsx` вызывает `trpc.favorite.list.useQuery` с type-filter чипами |
| 6 | Персональный план показывает только диагностические рекомендации; ручные добавления — в Избранном | ✓ VERIFIED | `plan/page.tsx`: `DIAGNOSTIC_SECTION_IDS = ['errors','deepening','growth','advanced']`; `diagnosticSections` фильтрует `.filter(s => DIAGNOSTIC_SECTION_IDS.includes(s.id))`; grep `addedJobs\|'custom'\|"custom"` → 0 |
| 7 | Миграция трек→избранное применена идемпотентно; `LessonProgress` не затронут | ✓ VERIFIED | `migrate-track-to-favorites.ts`: `createMany({skipDuplicates:true})`; `lessonProgress.count()` before/after assert; Prod: 718 rows (677 LESSON + 41 JOB), LessonProgress 1703→1703 (unchanged), idempotent re-run = 0 new — зафиксировано в 61-07-SUMMARY.md |
| 8 | Дашборд: 3 акцентных входа ведут в нужные разделы; счётчики ужаты | ✓ VERIFIED | `dashboard/page.tsx:54,62,70` содержит `/learn/plan`, `/learn/library`, `/learn/solutions` с канонными заголовками «Продолжить мой план», «Найти быстрый ответ», «Решить задачу» |
| 9 | Hero-поиск крупный вверху разделов обучения | ✓ VERIFIED | `LearningHero.tsx`: `bg-mp-hero-gradient`, `text-display-sm`, `data-tour="learn-search"` на slot; смонтирован в `solutions/page.tsx:64` и `library/page.tsx:252` |
| 10 | UI-строки по канону (нет «трек»/«плейбук»/«джоба» в пользовательском тексте) | ✓ VERIFIED | grep по 4 learn-sub-страницам: единственное совпадение в комментарии файла `favorites/page.tsx:20` («мигрированные из трека») — не user-facing строка; в AgentSearch «В плане ✓» canon-совместимо |
| 11 | Онбординг-тур (`data-tour`) не сломан; CQ-события целы | ? UNCERTAIN | `definitions.ts` содержит `learn-submenu` → sidebar (desktop); `learn-search` → LearningHero; `learn-view-toggle` — удалён из tour, `learn-add-to-track` → library page (line 319). CQ pa_* — нет событий на track/plan flow (подтверждено в 61-07-SUMMARY). WARNING IN-04 из code review: `learn-submenu` на мобиле может не найтись (anchor только в desktop sidebar, `md:flex`); требует ручной проверки тура на mobile |
| 12 | api + web тесты зелёные, typecheck зелёный | ✓ VERIFIED | turbo typecheck: 6/6 packages clean; api vitest: 142/142 pass (incl. 8 favorite + 6 migrate + 12 material); web vitest: 208/208 pass (incl. 7 AgentSearch scope) |

**Score:** 11/12 truths verified (1 uncertain — tour on mobile)

### Deferred Items

Нет.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/web/src/components/shared/sidebar.tsx` | Expandable «Обучение» nav group + 4 sub-links | ✓ VERIFIED | `learnSubItems[]` с 4 href; `data-tour="learn-submenu"`; `rotate-180` chevron |
| `apps/web/src/components/learning/LearningTabs.tsx` | Mobile horizontal pill-tab strip | ✓ VERIFIED | `md:hidden overflow-x-auto`; 4 tab links |
| `apps/web/src/app/(main)/learn/track/page.tsx` | Server redirect /learn/track → /learn/plan | ✓ VERIFIED | `redirect('/learn/plan')` без `'use client'` |
| `apps/web/src/app/(main)/learn/page.tsx` | Server-redirect entry (default by plan) | ✓ VERIFIED | Server Component, `redirect(hasPlan ? '/learn/plan' : '/learn/library')` |
| `apps/web/src/app/(main)/learn/solutions/page.tsx` | Solutions (Job catalog) page | ✓ VERIFIED | `JobCatalog`, `LearningHero scope="solutions"` |
| `apps/web/src/app/(main)/learn/library/page.tsx` | Library (courses) page | ✓ VERIFIED | `База знаний`, `material.listForUser.useQuery`, `LearningHero scope="library"` |
| `apps/web/src/app/(main)/learn/plan/page.tsx` | Персональный план page (diagnostic-only) | ✓ VERIFIED | `getRecommendedPath`; DIAGNOSTIC_SECTION_IDS filter; пустое состояние «Плана пока нет» |
| `apps/web/src/app/(main)/learn/favorites/page.tsx` | Избранное page via favorite.list | ✓ VERIFIED | `trpc.favorite.list.useQuery`; type-filter chips; «В избранном пусто» |
| `packages/api/src/routers/material.ts` | material.listForUser user-facing read | ✓ VERIFIED | `listForUser: protectedProcedure`; `where.isHidden = false` принудительно |
| `apps/web/src/components/learning/MaterialCard.tsx` | MaterialCard с optional lessonId | ✓ VERIFIED | `lessonId?: string` (line 27); externalUrl-only path when lessonId absent |
| `apps/web/src/components/learning/AgentSearch.tsx` | scope-aware search | ✓ VERIFIED | `scope: Scope` prop; solutions→`resolveMutation`; library→parallel `searchLessons`+`listForUser` |
| `apps/web/src/components/learning/LessonResultCard.tsx` | lesson search-result card | ✓ VERIFIED | `FavoriteButton` смонтирован; link к `/learn/${lesson.id}` |
| `packages/db/prisma/migrations/20260603000000_add_favorite/migration.sql` | Additive Favorite DDL | ✓ VERIFIED | `CREATE TYPE "FavoriteItemType"`, `CREATE TABLE "Favorite"`, unique index, FK ON DELETE CASCADE; нет DROP/TRUNCATE |
| `packages/api/src/routers/favorite.ts` | favorite CRUD router (IDOR-safe) | ✓ VERIFIED | `ctx.user.id` везде; 4 protectedProcedure; `isHidden:false` в list resolution |
| `packages/api/src/root.ts` | favorite router mounted | ✓ VERIFIED | line 33: `favorite: favoriteRouter` |
| `apps/web/src/components/learning/FavoriteButton.tsx` | Shared optimistic heart toggle | ✓ VERIFIED | `favorite.add`/`remove`; `min-h-11 min-w-11`; `fill-mp-pink-500`; `aria-pressed`; toast error |
| `scripts/migrate-track-to-favorites.ts` | Idempotent track→favorites migration | ✓ VERIFIED | `skipDuplicates:true`; `section.id === 'custom'` detection; LessonProgress count-only |
| `apps/web/src/components/learning/LearningHero.tsx` | Hero search wrapper (gradient bg) | ✓ VERIFIED | `bg-mp-hero-gradient`; `text-display-sm`; `data-tour="learn-search"` |
| `apps/web/src/app/(main)/dashboard/page.tsx` | 3 entry cards + condensed stats | ✓ VERIFIED | `/learn/plan`, `/learn/library`, `/learn/solutions` с canonical titles |
| `packages/api/src/routers/__tests__/favorite.test.ts` | Wave 0 stub: favorite CRUD + IDOR | ✓ VERIFIED | Файл существует, `describe` + `ctx.user.id` assertion |
| `scripts/__tests__/migrate-track-to-favorites.test.ts` | Wave 0 stub: idempotency + LessonProgress | ✓ VERIFIED | Файл существует, `skipDuplicates`, before/after LessonProgress count |
| `apps/web/src/components/learning/__tests__/AgentSearch.test.tsx` | Wave 0 stub: scope routing | ✓ VERIFIED | Файл существует, `scope`, `solutions`, `library` assertions |
| `apps/web/tests/e2e/learn-redirect.spec.ts` | Wave 0 stub: /learn и /learn/track redirect | ✓ VERIFIED | Файл существует; `/learn/track` и `/learn/plan` URL assertions |
| `packages/api/src/routers/__tests__/material.test.ts` | Extended: listForUser | ✓ VERIFIED | Файл существует, `listForUser` и `isHidden` ссылки |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `sidebar.tsx` | `/learn/{plan,solutions,library,favorites}` | sub-Link hrefs | ✓ WIRED | Все 4 href присутствуют в `learnSubItems[]` |
| `AgentSearch (scope='library')` | `ai.searchLessons + material.listForUser` | parallel trpc queries | ✓ WIRED | `Promise.all([utils.ai.searchLessons.fetch, utils.material.listForUser.fetch])` в `submitLibrary()` |
| `AgentSearch (scope='solutions')` | `intent.resolve` | mutation | ✓ WIRED | `resolveMutation.mutateAsync({query, surface:'learn'})` в `submitSolutions()` |
| `favorite.ts` | `prisma.favorite` | ctx.user.id scoped queries | ✓ WIRED | Все 4 процедуры используют `ctx.user.id`; `userId` в input отсутствует |
| `schema.prisma UserProfile` | `Favorite` | `favorites Favorite[]` back-relation | ✓ WIRED | `schema.prisma:670-688` + UserProfile relations block |
| `favorites/page.tsx` | `favorite.list` | useQuery | ✓ WIRED | `trpc.favorite.list.useQuery(filter === 'ALL' ? undefined : { itemType: filter })` |
| `dashboard entry cards` | `/learn/{plan,library,solutions}` | card links | ✓ WIRED | `dashboard/page.tsx:54,62,70` |
| `LearningHero` | `AgentSearch` | wraps scoped search | ✓ WIRED | `solutions/page.tsx:69`, `library/page.tsx:257` |
| `material.listForUser` | `prisma.material` | findMany with where.isHidden=false | ✓ WIRED | `where.isHidden = false` line 219 принудительно |
| `/learn/plan` | `getRecommendedPath (diagnostic-only)` | useQuery, no addedJobs/custom | ✓ WIRED | `diagnosticSections` filter; grep `addedJobs\|custom` = 0 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `favorites/page.tsx` | `items` (FavItem[]) | `trpc.favorite.list.useQuery` → `favorite.ts list` → `prisma.favorite.findMany + entity resolve` | Да — реальные Favorite строки из prod (718 rows) | ✓ FLOWING |
| `plan/page.tsx` | `recommendedPath` | `trpc.learning.getRecommendedPath.useQuery` (без изменений) | Да — существующий путь из БД | ✓ FLOWING |
| `library/page.tsx` | `materialsData` | `trpc.material.listForUser.useQuery` → `prisma.material.findMany` | Да — `isHidden=false` filtered DB query | ✓ FLOWING |
| `AgentSearch (library)` | `libResult` | `ai.searchLessons` + `material.listForUser` | Да — реальные tRPC ответы | ✓ FLOWING |
| `dashboard/page.tsx` | entry cards | static config (hrefs/titles) | N/A — статические ссылки | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Check | Result | Status |
|----------|-------|--------|--------|
| `/learn/page.tsx` — Server Component, нет `'use client'` | `grep "'use client'" learn/page.tsx` | Пусто | ✓ PASS |
| `/learn/track/page.tsx` — `redirect('/learn/plan')` без client nav | `cat track/page.tsx \| grep redirect` | `redirect('/learn/plan')` найден; нет `useEffect`/`router.push` | ✓ PASS |
| `migration.sql` — нет деструктивных операций | `grep -E 'DROP\|TRUNCATE\|ALTER COLUMN.*TYPE' migration.sql` | Пусто | ✓ PASS |
| `plan/page.tsx` — нет потребления `addedJobs`/`custom` | `grep -E "addedJobs\|'custom'|\"custom\"" plan/page.tsx` | Пусто | ✓ PASS |
| `favorite.ts` — `userId` из `ctx.user.id` только | grep `input.*userId` | Пусто | ✓ PASS |
| Typecheck | `pnpm typecheck` (turbo) | 6/6 packages PASS, 0 errors | ✓ PASS |
| api tests | `pnpm vitest run` (packages/api) | 142/142 pass | ✓ PASS |
| web tests | turbo test (apps/web) | 208/208 pass | ✓ PASS |

### Probe Execution

Нет probe-*.sh в этой фазе. Механизм проверки — vitest + typecheck (выполнены выше).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| NYQUIST-W0 | 61-00 | Wave 0 test scaffolds — 5 файлов RED до реализации | ✓ SATISFIED | Все 5 файлов существуют и коллектятся без import errors |
| D-01 | 61-01, 61-02 | Навигация — сабменю «Обучение», 4 sub-routes, redirect /learn/track | ✓ SATISFIED | sidebar.tsx, LearningTabs.tsx, track/page.tsx, learn/page.tsx |
| D-02 | 61-02 | Терминологический канон — UI-строки и URL | ✓ SATISFIED | grep UI-строк по 4 sub-страницам; cannon strings везде |
| D-03 | 61-07 | Персональный план = диагностика; Избранное = ручные добавления | ✓ SATISFIED | plan/page.tsx diagnostic-only; 718 rows мигрированы; LessonProgress 1703→1703 |
| D-04 | 61-04 | Контекстный поиск — AgentSearch со scope | ✓ SATISFIED | AgentSearch.tsx с scope prop; solutions→intent; library→searchLessons+listForUser |
| D-05 | 61-03, 61-04 | Материалы в Базе знаний user-facing | ✓ SATISFIED | material.listForUser; library/page.tsx material catalog + type filter |
| D-06 | 61-06, 61-07 | Модель Favorite (полиморфная) | ✓ SATISFIED | schema.prisma, migration.sql, favorite.ts, FavoriteButton.tsx |
| D-07 | 61-06, 61-07 | Schema migration — additive + idempotent, applied to prod | ✓ SATISFIED | migration.sql только CREATE; prod: Favorite table live, _prisma_migrations записан; data migration applied |
| D-08 | 61-05 | Дашборд — 3 входа | ✓ SATISFIED | dashboard/page.tsx 3 entry cards с canon titles |
| D-09 | 61-05 | Hero-поиск в разделах | ✓ SATISFIED | LearningHero.tsx с bg-mp-hero-gradient; смонтирован на solutions/library |
| D-10 | 61-01, 61-02, 61-07 | Регресс-зоны: data-tour, CQ pa_*, isHidden | ✓ SATISFIED | data-tour re-homed (learn-submenu/learn-search/learn-add-to-track/learn-sections); CQ: нет событий на track/plan flow — нечего терять; isHidden сохранён во всех новых queries |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `packages/api/src/routers/material.ts:240-242` | 241 | Противоречивый комментарий: «storagePath НЕ выбираем» при `select:true` (реально стрипается ниже в .map) | ℹ️ Info | Confusing but not a bug; поведение верное |
| `apps/web/src/components/learning/JobCard.tsx:40,71` | 40, 71 | «В треке» / «+ В трек» — не переименовано в «В плане»/«+ В план» | ⚠️ Warning | Незначительное нарушение D-02 канона: label в AgentSearch уже «В плане ✓», но JobCard ещё «В треке». Визуально непоследовательно, но не функциональный дефект |
| `apps/web/src/app/(main)/learn/library/page.tsx` | WR-04 (review) | AgentSearch результаты рендерятся внутри Hero, но каталог под ним не скрывается при активном поиске | ⚠️ Warning | UX: пользователь видит и результаты поиска, и полный каталог одновременно — confusing UI |
| `packages/api/src/routers/material.ts:306-348` | WR-01 (review) | soft-delete не обнуляет storagePath → при восстановлении материала hasFile=true при отсутствующем файле | ⚠️ Warning | Редкий edge-case (admin restore); не блокирует фазу |
| `apps/web/src/lib/tours/definitions.ts:65,92` | IN-04 (review) | data-tour="learn-submenu" отсутствует в LearningTabs (мобиле) — только в desktop sidebar | ⚠️ Warning | Тур на mobile не найдёт anchor для learn-submenu шага |

**Debt markers (TBD/FIXME/XXX):** Не найдено ни одного.

### Human Verification Required

#### 1. Навигация desktop/mobile

**Test:** Открыть /learn/plan на desktop и mobile (responsive mode)
**Expected:** Desktop — сабменю разворачивается в sidebar с подсветкой «Персональный план»; mobile — LearningTabs горизонтальный стрип вверху страницы
**Why human:** CSS responsive + интерактивное состояние

#### 2. Контекстный поиск — Решения под задачу

**Test:** На /learn/solutions ввести запрос (напр. «настроить рекламу») и нажать отправить
**Expected:** Результаты — только job-карточки с кнопкой «В план»; нет уроков или материалов
**Why human:** Требует работающего сервера с данными

#### 3. Контекстный поиск — База знаний

**Test:** На /learn/library ввести запрос (напр. «аналитика продаж») → Enter
**Expected:** Сгруппированные секции «Уроки» и «Материалы»; при пустом запросе — каталог курсов
**Why human:** Runtime behavior

#### 4. Фильтр материалов в Базе знаний

**Test:** На /learn/library переключать чипы типов материалов
**Expected:** Каждый чип фильтрует список; при пустом → «Материалов этого типа пока нет»
**Why human:** Требует prod-данных с материалами

#### 5. FavoriteButton toggle на всех трёх типах карточек

**Test:** Нажать сердечко на карточке задачи (JobCard), материала (MaterialCard), урока (LessonResultCard)
**Expected:** Оптимистичное изменение цвета → pink; элемент появляется в /learn/favorites
**Why human:** Интерактивное поведение + реальный API

#### 6. План/Избранное split — проверка на реальном аккаунте

**Test:** Аккаунт из 24 мигрированных юзеров → открыть /learn/plan и /learn/favorites
**Expected:** /learn/plan — только diagnostic sections; /learn/favorites — бывшие ручные добавления (677 уроков + 41 решение мигрированы 2026-06-03)
**Why human:** Требует аккаунта с историческими данными

#### 7. Дашборд — 3 акцентных карточки (визуальный QA)

**Test:** Открыть /dashboard
**Expected:** Вверху 3 карточки с вариантами soft-blue/soft-green/gradient; click ведёт в нужный раздел; stats condensed
**Why human:** Визуальный QA вёрстки

#### 8. Онбординг-тур — data-tour anchors

**Test:** Запустить тур на /learn/* на desktop и mobile
**Expected:** Шаги корректно позиционируются; нет «element not found»
**Why human:** В-04 (code review) флагирует: `learn-submenu` anchor отсутствует в LearningTabs (mobile) — только в desktop sidebar. На мобиле шаг может сломаться. Нужна ручная проверка.

#### 9. E2E Playwright learn-redirect (credential gate)

**Test:** Запустить `pnpm test:e2e learn-redirect` с реальным паролем tester@mpstats.academy
**Expected:** Оба теста GREEN — /learn/track→/learn/plan и /learn→/learn/plan или /learn/library
**Why human:** Тест использует `TestUser2024` которое не совпадает с реальным паролем Supabase аккаунта. Это credential gate, не дефект реализации (server redirect через `redirect()` верифицирован статически).

### Gaps Summary

Критических gaps нет. Все 8 planning-level must-haves (D-01..D-10) подтверждены кодом. Фаза достигает goal-а: 4 сущности существуют на отдельных маршрутах, поиск контекстный по сущности, дашборд перестроен в 3 входа, hero-поиск выведен на видное место, Favorite модель live на prod с мигрированными данными.

Открытые items требуют только ручной проверки:
- Онбординг-тур на мобиле (IN-04 из code review — возможный break)
- Визуальный QA разделов обучения
- E2E тест с обновлёнными credentials

WARNING items из code review (WR-01, WR-02, WR-04, IN-05) и замечание по JobCard терминологии рекомендуется адресовать в следующем cleanup-цикле, но не блокируют goal фазы 61.

---

_Verified: 2026-06-03T15:10:00Z_
_Verifier: Claude (gsd-verifier)_
