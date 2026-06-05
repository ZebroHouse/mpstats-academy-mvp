# Phase 61: Обучение 2.0 — редизайн раздела — Context

**Gathered:** 2026-06-03
**Status:** Ready for planning
**Source:** Brainstorming-сессия owner 2026-06-03 + презентация CPO (слайды 6–19) + анализ текущего кода (`apps/web/src/app/(main)/learn/`, `components/learning/`, `packages/api/src/routers/{intent,job,learning,material,ai}.ts`, `packages/db/prisma/schema.prisma`).
**Spec:** `docs/superpowers/specs/2026-06-03-learning-2.0-redesign-design.md` (источник истины, читать первым).

<domain>
## Phase Boundary

Развести раздел «Обучение» (нынешний одностраничный `/learn` с переключателем `lens` jobs/courses) на **4 сущности** с отдельными маршрутами и сабменю, сделать поиск **контекстным по сущности раздела**, перестроить дашборд в **3 входа** и вывести поиск на видное место.

Закрывает задачи owner: **2** (контекстный поиск), **3** (сабменю/4 сущности), **4** (UI дашборд + hero-поиск). Задача 1 (диагностика WB/Ozon) уже сделана (Phase 59 v2) — вне scope.

**Разработка пофазно (waves A–E), деплой единый**: всё на ветке `learning-2.0-redesign` → staging → QA → правки → merge в master → прод. Master не трогаем до проверки на стейдже (`feedback_deploy_flow_control.md`).

4 сущности:
| Под-раздел | URL | База (AS-IS) |
|---|---|---|
| Персональный план | `/learn/plan` | `LearningPath` (нынешний `/learn/track`), только диагностическая часть |
| Решения под задачу | `/learn/solutions` | `Job`-каталог (нынешний lens «По задачам») |
| База знаний | `/learn/library` | `Course`/`Lesson` (lens «Все курсы») + материалы |
| Избранное | `/learn/favorites` | новая модель `Favorite` |

</domain>

<decisions>
## Implementation Decisions

### D-01: Навигация — сабменю «Обучение»

`sidebar.tsx` (сейчас плоский `navItems`) получает раскрывающийся пункт «Обучение» с 4 под-пунктами (Персональный план / Решения под задачу / База знаний / Избранное). Механизма nested-nav сейчас нет — добавить. `MobileNav` тоже обновить. Активное состояние — по `pathname.startsWith`.

Routes: `/learn/plan`, `/learn/solutions`, `/learn/library`, `/learn/favorites`. Нынешний `/learn` → редирект на дефолт (Персональный план если есть непустой трек, иначе База знаний). `/learn/track` → редирект на `/learn/plan` (внутренние ссылки + закладки/письма). `/learn/job/[slug]` и `/learn/[id]` (урок) — маршруты НЕ меняем.

### D-02: Терминологический канон — только UI-строки и URL

Ренейм: трек→«Персональный план», плейбук/джоба→«Решение под задачу»/«Задача», все курсы/каталог→«База знаний», ручное «+ В трек»→«В избранное» (сердечко). **Имена моделей БД (`Job`, `LearningPath`, `JobLesson`) НЕ переименовываем** — внутренний код, ренейм = риск без пользы. Канон применяется к пользовательским строкам и маршрутам.

### D-03: Персональный план = диагностика; Избранное = ручные добавления

`LearningPath` сейчас смешивает диагностические секции (по 5 компетенциям) и ручные добавления (секция `id: 'custom'` «Мои уроки» через `addToTrack` + `addedJobs[]` через `addJobToTrack`).

TO-BE:
- **Персональный план** = только диагностические секции `getRecommendedPath`.
- **Избранное** = `custom`-секция (ручные уроки) + `addedJobs[]` (ручные джобы) → переезжают в `Favorite`.
- `LessonProgress` НЕ трогаем (hard rule, как D-07 Phase 58) — прогресс независим от того, в Плане урок или в Избранном.

**Open question для планера (wave D):** проверить надёжность определения `custom`-секции в `getRecommendedPath` (`apps/web/src/app/(main)/learn/page.tsx:124` помечает `id:'custom'`, title «Мои уроки» — признак есть, подтвердить на стороне роутера `learning.ts:274`).

### D-04: Контекстный поиск — `AgentSearch` со `scope`

`AgentSearch` (сейчас всегда `intent.resolve({surface:'learn'})` → всегда плейбуки) рефакторится: принимает `scope: 'solutions' | 'library'`.
- `scope='solutions'` → `intent.resolve` (плейбуки, как сейчас).
- `scope='library'` → `ai.searchLessons` (**уже существует**, `packages/api/src/routers/ai.ts:213`, не подключён к UI) + поиск материалов (`contains` по title).
Разные карточки результата под тип сущности. Избранное — локальный фильтр по `Favorite`, без бэкенд-поиска.

### D-05: Материалы в Базе знаний — user-facing

Сейчас read-эндпоинты `Material` (`list`, `getById`) — только `adminProcedure`; юзер видит материалы только внутри урока (`material.getSignedUrl`). Флаг `Material.isStandalone` есть («D-04: задел под Library, не используется»).

Делаем: новый `material.listForUser` (protectedProcedure) — видимые материалы (`isHidden=false`), фильтр по типу (`MaterialType`: PRESENTATION/CALCULATION_TABLE/EXTERNAL_SERVICE/CHECKLIST/MEMO) + поиск по title. Включает standalone + привязанные к доступным урокам. ACL скачивания (`getSignedUrl`) — без изменений. UI: каталог материалов в Базе знаний, карточка `MaterialCard.tsx` (есть).

### D-06: Модель `Favorite` (полиморфная)

```prisma
enum FavoriteItemType { LESSON JOB MATERIAL }

model Favorite {
  id        String           @id @default(cuid())
  userId    String
  itemType  FavoriteItemType
  itemId    String
  createdAt DateTime         @default(now())
  user      UserProfile      @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([userId, itemType, itemId])
  @@index([userId, itemType])
}
```

Полиморфная ссылка `(itemType, itemId)` — без FK на 3 таблицы (Prisma не поддерживает полиморфные FK; целостность на уровне приложения). tRPC `favorite.{add, remove, list, isFavorited}`. Общий компонент `FavoriteButton` (сердечко) на карточках урока/решения/материала.

### D-07: Schema migration — additive + idempotent (PROD DATABASE SAFETY)

Migration `Favorite` table + `FavoriteItemType` enum — строго additive. Data-миграция трек→избранное (wave D) — idempotent, backup перед запуском, без потери (переклассификация). VPS без pnpm/prisma → применять через Supabase Management API (паттерн `reference_supabase_migration_via_mgmt_api.md`).

### D-08: Дашборд — 3 входа (слайд 17)

`/dashboard`: добавить 3 крупных акцентных входа вверху:
| Вход | → | Подпись |
|---|---|---|
| Продолжить мой план | `/learn/plan` | к месту, где остановился |
| Найти быстрый ответ | `/learn/library` | поиск по урокам и материалам |
| Решить задачу | `/learn/solutions` | каталог инструкций под задачи |
4 счётчика (уроков/минут/streak/%) → ужать (нулей у нового юзера быть не должно). Радар, «Продолжить урок», лента активности — остаются ниже.

### D-09: Hero-поиск в разделах (слайд 6)

Крупный hero-блок с поисковой строкой вверху «Решений под задачу» и «Базы знаний» (вместо нынешней мелкой h-12). Акцентный фон, фильтры-чипы под строкой.

### D-10: Регресс-зоны (проверить, не сломать)

- `data-tour` якоря (`learn-view-toggle`, `learn-search`, `learn-add-to-track`) — обновить под новую структуру, иначе онбординг-тур ломается.
- CarrotQuest `pa_*` события (трек/диагностика) — проверить при изменении флоу.
- Hidden-lesson auto-sync (Phase 57 PR #9) — фильтр `isHidden` должен сохраниться во всех новых запросах.

### Claude's Discretion

- Точная вёрстка hero-блока и карточек входов (в рамках бренда `ui-brand.md` + слайды как ориентир, не пиксель-перфект).
- Имена файлов компонентов новых страниц.
- Дефолтный редирект `/learn` (план vs библиотека) — выбрать по наличию трека.

</decisions>

## Canonical References

### Код (AS-IS)
- `apps/web/src/components/shared/sidebar.tsx` — плоская навигация (D-01).
- `apps/web/src/app/(main)/learn/page.tsx` — одностраничный lens jobs/courses, `AgentSearch` (h-12), track banner.
- `apps/web/src/app/(main)/learn/track/page.tsx` — нынешний трек → станет `/learn/plan`.
- `apps/web/src/components/learning/AgentSearch.tsx` — поиск, всегда плейбуки (D-04).
- `apps/web/src/app/(main)/dashboard/page.tsx` — 4 счётчика + 2 CTA + радар (D-08).
- `packages/api/src/routers/intent.ts` — `resolve({surface})`.
- `packages/api/src/routers/ai.ts:213` — `searchLessons` (готов, не подключён).
- `packages/api/src/routers/material.ts` — admin-only read + `getSignedUrl` (D-05).
- `packages/api/src/routers/learning.ts:274` — `getRecommendedPath` (секции, custom) (D-03).
- `packages/api/src/routers/job.ts` — `getCatalog`, `getJob`.
- `packages/db/prisma/schema.prisma` — `LearningPath`(212), `Material`(433)/`isStandalone`(443), `Job`(632), `LessonMaterial`(455).

### Specs / memory
- `docs/superpowers/specs/2026-06-03-learning-2.0-redesign-design.md` (этот редизайн).
- `docs/superpowers/specs/2026-05-18-library-redesign-design.md` (Phase 57, предыстория `/learn` каталога).
- `~/.claude/projects/.../memory/project_phase57_library_redesign.md`, `project_phase58_diagnostic_on_jobs.md`.
- `reference_supabase_migration_via_mgmt_api.md` (D-07).

## Waves (порядок разработки — финализирует planner)

- **A — Каркас + ренейминг** (UI+навигация, низкий риск): сабменю D-01, routes + редиректы, расщепление lens на страницы, ренейм строк D-02. Зависит от: —
- **B — Контекстный поиск** (API+UI, средний): `AgentSearch` scope D-04, подключить `ai.searchLessons`. Зависит от: A.
- **C — Материалы в Базе знаний** (API+UI, средний): `material.listForUser` D-05, isStandalone, каталог+фильтр+поиск. Зависит от: A, B.
- **D — Избранное** (DB+API+UI, ВЫСОКИЙ): модель `Favorite` D-06, миграция трек→избранное D-03/D-07, `FavoriteButton`, План→диагностический. Зависит от: A, C.
- **E — UI дашборд + hero-поиск** (UI, низкий): D-08 + D-09. Зависит от: A, B.

## Acceptance criteria (черновые — финализирует planner)

- [ ] Сабменю «Обучение» с 4 под-пунктами в sidebar + mobile nav; активное состояние корректно.
- [ ] 4 отдельных маршрута работают; `/learn` и `/learn/track` редиректят правильно.
- [ ] Поиск в «Решениях» возвращает плейбуки; в «Базе знаний» — уроки + материалы.
- [ ] Материалы видны юзеру в Базе знаний с фильтром по типу; ACL скачивания не сломан.
- [ ] Сердечко «В избранное» на карточках; раздел Избранное показывает сохранённое с фильтром по типу.
- [ ] Персональный план показывает только диагностические рекомендации; ручные добавления — в Избранном.
- [ ] Миграция трек→избранное применена идемпотентно, `LessonProgress` не затронут.
- [ ] Дашборд: 3 акцентных входа ведут в нужные разделы; счётчики ужаты.
- [ ] Hero-поиск крупный вверху разделов обучения.
- [ ] UI-строки по канону (нет «трек»/«плейбук»/«джоба» в пользовательском тексте).
- [ ] Онбординг-тур (`data-tour`) не сломан; CQ-события целы.
- [ ] api + web тесты зелёные, typecheck зелёный.

## Deferred Ideas (out of scope)

- «Мои подборки» / коллекции в Избранном (слайд 15) — плоское Избранное на этот заход (owner: вариант A). Future при потребности в группировке.
- Комьюнити-блок «Жизнь Академии» на Главной (слайд 36, направление 06) — отдельное направление.
- Семантический поиск по материалам — пока `contains` по title.
- Переименование моделей БД — только UI-строки.
