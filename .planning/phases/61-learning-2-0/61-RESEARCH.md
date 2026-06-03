# Phase 61: Обучение 2.0 — редизайн раздела — Research

**Researched:** 2026-06-03
**Domain:** Next.js 14 App Router (route split + nested nav), tRPC/Prisma refactor (search scoping, polymorphic Favorite model + idempotent data migration), MAAL learning section redesign
**Confidence:** HIGH (all findings verified against current code at cited file:line; no external library version risk — pattern reuse only)

## Summary

Это **brownfield UI+API+DB рефакторинг** существующего раздела `/learn`. Риска "не та библиотека / устарела версия" нет — фаза целиком про переиспользование собственных паттернов MAAL и аккуратное расщепление существующего кода. Главные технические риски сосредоточены в трёх местах: (1) **router-cache loop** при редиректах внутри `(main)` (документированный gotcha, server `redirect()` guard в layout.tsx уже есть); (2) **полиморфная модель `Favorite` + идемпотентная data-миграция** трек→избранное на shared prod БД (PROD DATABASE SAFETY — additive only, через Management API); (3) **ACL материалов** — `getSignedUrl` требует, чтобы материал был привязан к доступному уроку, а standalone-материалы (новый кейс) такой привязки не имеют → их скачивание сломается, если не доработать ACL.

Wave-порядок из CONTEXT (A каркас → B поиск → C материалы → D избранное → E дашборд) технически корректен. Единственная корректировка, которую планер должен учесть: **`getRecommendedPath` сейчас отдаёт `addedJobs` и `custom`-секцию в одном ответе, и И `AgentSearch`, И `/learn/track`, И `/learn` page их читают.** Расщепление План/Избранное (D) затрагивает все три потребителя — нельзя менять роутер, не обновив одновременно фронтенд этих трёх мест. Это естественно ложится в Wave D, но это «широкий» рефактор, не точечный.

**Primary recommendation:** Делать строго пофазно на ветке `learning-2.0-redesign`, additive-only миграция `Favorite` через Management API с `IF NOT EXISTS`, data-миграция как идемпотентный seed-скрипт (re-run safe благодаря `@@unique([userId,itemType,itemId])`), `LessonProgress` не трогать, фильтр `isHidden` копировать в каждый новый запрос. Редиректы `/learn` и `/learn/track` — серверные (`redirect()` в Server Component page), но переходы пользователя ИЗ gated-флоу (если появятся) — жёсткой навигацией.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01 Навигация:** `sidebar.tsx` (плоский `navItems`) → раскрывающийся пункт «Обучение» с 4 под-пунктами (Персональный план / Решения под задачу / База знаний / Избранное). Механизма nested-nav сейчас нет — добавить. `MobileNav` тоже. Активное состояние по `pathname.startsWith`. Routes: `/learn/plan`, `/learn/solutions`, `/learn/library`, `/learn/favorites`. `/learn` → редирект на дефолт (План если непустой трек, иначе База знаний). `/learn/track` → `/learn/plan`. `/learn/job/[slug]` и `/learn/[id]` (урок) НЕ меняем.
- **D-02 Терминологический канон — только UI-строки и URL:** трек→«Персональный план», плейбук/джоба→«Решение под задачу»/«Задача», все курсы/каталог→«База знаний», ручное «+ В трек»→«В избранное» (сердечко). **Имена моделей БД (`Job`, `LearningPath`, `JobLesson`) НЕ переименовываем.**
- **D-03 План=диагностика; Избранное=ручные добавления:** Персональный план = только диагностические секции `getRecommendedPath`. Избранное = `custom`-секция (ручные уроки) + `addedJobs[]` (ручные джобы) → переезжают в `Favorite`. `LessonProgress` НЕ трогаем (hard rule).
- **D-04 Контекстный поиск:** `AgentSearch` принимает `scope: 'solutions' | 'library'`. solutions → `intent.resolve` (плейбуки). library → `ai.searchLessons` + поиск материалов (`contains` по title). Избранное — локальный фильтр по `Favorite`, без бэкенд-поиска.
- **D-05 Материалы в Базе знаний user-facing:** новый `material.listForUser` (protectedProcedure) — видимые материалы (`isHidden=false`), фильтр по типу + поиск по title. Standalone + привязанные к доступным урокам. ACL скачивания (`getSignedUrl`) — без изменений. UI: каталог материалов, `MaterialCard.tsx`.
- **D-06 Модель `Favorite` (полиморфная):** enum `FavoriteItemType { LESSON JOB MATERIAL }`, без FK на 3 таблицы, целостность на уровне приложения. tRPC `favorite.{add, remove, list, isFavorited}`. Общий `FavoriteButton` (сердечко).
- **D-07 Migration — additive + idempotent (PROD DATABASE SAFETY):** строго additive. Data-миграция idempotent, backup перед запуском, без потери. VPS без pnpm/prisma → через Supabase Management API.
- **D-08 Дашборд — 3 входа:** Продолжить мой план → `/learn/plan`; Найти быстрый ответ → `/learn/library`; Решить задачу → `/learn/solutions`. 4 счётчика ужать.
- **D-09 Hero-поиск:** крупный hero-блок вверху «Решений» и «Базы знаний» (вместо h-12). Акцентный фон, фильтры-чипы.
- **D-10 Регресс-зоны:** `data-tour` якоря обновить; CQ `pa_*` события проверить; hidden-lesson `isHidden` фильтр сохранить во всех новых запросах.

### Claude's Discretion
- Точная вёрстка hero-блока и карточек входов (бренд `ui-brand.md` + слайды как ориентир, не пиксель-перфект).
- Имена файлов компонентов новых страниц.
- Дефолтный редирект `/learn` (план vs библиотека) — выбрать по наличию трека.

### Deferred Ideas (OUT OF SCOPE)
- «Мои подборки» / коллекции в Избранном — плоское Избранное (вариант A).
- Комьюнити-блок «Жизнь Академии» на Главной — отдельное направление.
- Семантический поиск по материалам — пока `contains` по title.
- Переименование моделей БД — только UI-строки.
</user_constraints>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Nested submenu «Обучение» | Frontend (client component) | — | `Sidebar`/`MobileNav` — `'use client'`, active-state через `usePathname` |
| Route split + redirects | Frontend Server (App Router page) | — | `/learn` и `/learn/track` редиректы — серверные `redirect()` в Server Component page |
| Search scoping (`scope`) | Frontend (AgentSearch) + API (intent/ai routers) | — | UI выбирает scope; бэкенд-роутер уже существует, подключение — UI-уровень |
| Material listForUser | API (tRPC protectedProcedure) | Database | Новый user-facing read эндпоинт + ACL логика — backend |
| Material download ACL | API (`getSignedUrl`) | Supabase Storage | ACL-проверка подписки server-side, signed URL из Storage |
| `Favorite` модель + миграция | Database (Prisma + Mgmt API) | API | Additive schema change на shared prod БД |
| favorite.{add,remove,list,isFavorited} | API (tRPC) | Database | Бизнес-логика избранного |
| FavoriteButton | Frontend (shared component) | API (mutation) | Сердечко на карточках |
| Dashboard 3 входа + hero | Frontend | — | Чистая вёрстка, переиспользование `Card variant` |

## Standard Stack

Внешних библиотек фаза НЕ добавляет. Весь стек — уже в проекте, верифицирован по коду:

### Core (already installed — no new deps)
| Library | Purpose | Verified at |
|---------|---------|-------------|
| Next.js 14 App Router | route split, server `redirect()` | `apps/web/src/app/(main)/layout.tsx:2` (`import { redirect } from 'next/navigation'`) [VERIFIED: codebase] |
| tRPC | роутеры intent/ai/material/learning/favorite | `packages/api/src/routers/*` [VERIFIED: codebase] |
| Prisma | schema + миграции | `packages/db/prisma/schema.prisma` [VERIFIED: codebase] |
| `driver.js` | онбординг-тур (`DriveStep`) | `apps/web/src/lib/tours/definitions.ts:1` [VERIFIED: codebase] |
| `sonner` (toast) | уведомления о действиях | `AgentSearch.tsx:2` [VERIFIED: codebase] |
| `lucide-react` | иконки (MaterialCard) | `MaterialCard.tsx:4` [VERIFIED: codebase] |

**Installation:** none — phase adds zero npm packages.

## Package Legitimacy Audit

> Не применимо: фаза не устанавливает внешних пакетов. Все используемые библиотеки уже присутствуют в `package.json` и работают в продакшене. `slopcheck` не запускался — нет новых пакетов для проверки.

## Architecture Patterns

### System Architecture Diagram (TO-BE data flow)

```
                    ┌─────────────────────────────────────────────┐
   Sidebar /        │  Nested «Обучение» group (D-01)             │
   MobileNav  ──────┤  ▸ /learn/plan  ▸ /learn/solutions          │
   (client)         │  ▸ /learn/library  ▸ /learn/favorites       │
                    └───────────────┬─────────────────────────────┘
                                    │ Link navigation
        ┌───────────────┬───────────┼───────────────┬───────────────┐
        ▼               ▼           ▼               ▼               ▼
   /learn (redirect)  /learn/plan  /learn/solutions /learn/library  /learn/favorites
   server redirect→   (Server)     (client)         (client)        (client)
   plan|library                    │                │               │
                                   │                │               │
              ┌────────────────────┘                │               │
              ▼                                      ▼               ▼
   getRecommendedPath              AgentSearch scope='solutions'   AgentSearch scope='library'   favorite.list (local filter)
   (диагност. секции ТОЛЬКО)       → intent.resolve                → ai.searchLessons
                                                                   + material.listForUser
        │                                │                          │                 │
        ▼                                ▼                          ▼                 ▼
   ┌──────────────────────────── tRPC layer (packages/api) ──────────────────────────┐
   │ learning.getRecommendedPath   intent.resolve   ai.searchLessons   material.*     │
   │ favorite.{add,remove,list,isFavorited}                                          │
   └──────────────────────────────────┬──────────────────────────────────────────────┘
                                       ▼
                          Prisma → Supabase prod (saecuecevicwjkpmaoot)
                          LearningPath | Job | Lesson | Material | Favorite(NEW)
```

### Pattern 1: Nested expandable nav group (D-01)

**What:** В `sidebar.tsx` сейчас плоский `navItems.map()` рендерит `<Link>` для каждого. Механизма раскрытия нет.
**Текущий active-state (переиспользовать):** `sidebar.tsx:118`
```tsx
const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
```
**Рекомендация:** добавить тип `NavGroup` (title, icon, children: NavItem[]). Группа «Обучение» раскрыта, если `pathname.startsWith('/learn')`. Для управления раскрытием — локальный `useState`, по умолчанию открыта когда активна. **Готового accordion-компонента для nav в кодовой базе нет** (есть `alert-dialog`, но не collapsible). Самый чистый путь — не тащить radix collapsible, а написать ~20 строк: кнопка-заголовок с `chevron` + условный рендер `children` (тот же паттерн что в `track/page.tsx:412` toggleSection и `learn/page.tsx:206` toggleCourseExpanded — оба используют `Set` + chevron `rotate-180`).
**Landmine:** `MobileNav` (`mobile-nav.tsx`) — горизонтальная нижняя панель из 4-7 иконок, у неё нет места под 4 под-пункта обучения. Решение: либо «Уроки» в mobile ведёт на дефолт (`/learn/plan`) и под-навигация показывается табами внутри страниц обучения, либо отдельный mobile-паттерн. CONTEXT D-01 говорит «MobileNav тоже обновить» — планер должен явно решить UX для mobile (это Claude's Discretion по вёрстке).

### Pattern 2: Server redirect for route aliases (D-01)

**What:** `/learn` → дефолт, `/learn/track` → `/learn/plan`.
**Существующий паттерн (переиспользовать):** `(main)/layout.tsx:34,49,64` — Server Component с `redirect()` из `next/navigation`.
```tsx
// layout.tsx — Server Component pattern
import { redirect } from 'next/navigation';
if (!user) redirect('/login');
if (!profile || profile.onboardingCompletedAt === null) redirect('/welcome');
```
**Рекомендация:**
- `/learn/track/page.tsx` → заменить весь компонент на Server Component, который `redirect('/learn/plan')`. Безусловный редирект — тривиально.
- `/learn/page.tsx` → дефолт зависит от наличия трека. Текущий page — `'use client'`. Чтобы редиректить по данным, нужен серверный доступ к `learningPath`. Вариант: переписать `/learn/page.tsx` в Server Component, который читает `prisma.learningPath` (как layout.tsx читает profile) и `redirect()` на `/learn/plan` или `/learn/library`. Логику текущего `LearnPageInner` (lens jobs/courses) расщепить в `/learn/solutions` и `/learn/library`.
**Landmine (документированный gotcha — CLAUDE.md / incident 2026-05-19):** Server-side `redirect()`-гард в layout + клиентский `router.push` = **петля** (Next Router Cache отдаёт протухший RSC-сегмент гарда). `(main)/layout.tsx:63` уже содержит такой гард (onboarding → `/welcome`). Для редиректов `/learn` и `/learn/track` это безопасно, **пока редирект серверный** (`redirect()` в page, не `router.push` в эффекте). Не реализовывать дефолт-редирект через `useEffect(() => router.push(...))` — это воспроизведёт баг. Регресс-тест-аналог: `apps/web/tests/unit/welcome-page.test.tsx`.

### Pattern 3: AgentSearch scope prop (D-04)

**What:** `AgentSearch.tsx:35` хардкодит `surface: 'learn'` → всегда плейбуки.
```tsx
// AgentSearch.tsx:35 — current
const res = await resolveMutation.mutateAsync({ query: q.trim(), surface: 'learn', conversationState });
```
**`intent.resolve` input (verified `intent.ts:16`):** `surface: z.enum(['learn', 'welcome', 'diagnostic'])` — `'learn'` остаётся валидным для scope='solutions'.
**`ai.searchLessons` (verified `ai.ts:213-379`, готов, не подключён к UI):**
- **Input:** `{ query: z.string().min(1).max(500) }`.
- **Output:** `{ query: string; results: SearchLessonResult[]; totalChunks: number }`. Каждый `SearchLessonResult` = `{ lesson: {id,courseId,title,duration,order,skillCategory,skillLevel,skillCategories,topics}, course: {id,title,isHidden}, snippets: SearchSnippet[], bestSimilarity, watchedPercent, status, locked, inRecommendedPath }`.
- Гибридный поиск: vector (`searchChunks`, threshold 0.5, academy-only) + keyword (`contains` по title/description). Уже фильтрует `isHidden: false` (`ai.ts:237-238, 283-284`). ✓ D-10 соблюдён из коробки.
**Рекомендация:** `AgentSearch` принимает `scope: 'solutions' | 'library'`.
- `scope='solutions'` → `intent.resolve` (текущий код, рендер job-карточек, `AgentSearch.tsx:93-118`).
- `scope='library'` → две параллельные query: `ai.searchLessons({query})` (lesson-карточки, ссылка `/learn/{lesson.id}`) + `material.listForUser({search: query})` (material-карточки). Разный рендер результата по scope.
**Landmine:** `AgentSearch` сейчас подписан на `learning.getRecommendedPath` ради `trackedJobIds` (`AgentSearch.tsx:15-19`) для состояния «В треке ✓». После D (План/Избранное split) семантика «В трек» для джоб через `addJobToTrack` сохраняется (джоба остаётся способом наполнить план), НО кнопка «+ В трек» на джобе по D-02 переименовывается, и появляется ещё сердечко «В избранное». Планер должен решить: на solutions-результате две кнопки («В план» = addJobToTrack + «В избранное» = favorite.add JOB) или одна. CONTEXT spec §3.2 допускает оба действия.

### Pattern 4: Polymorphic Favorite + idempotent data migration (D-06, D-07)

**Schema (additive, безопасно для prod):**
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
**Back-relation (verified `schema.prisma:46-59`):** `UserProfile` имеет блок relation-полей. Добавить `favorites Favorite[]` рядом с `learningPath LearningPath?` (`schema.prisma:48`). Это additive — существующие строки не трогаются.
**Миграция SQL (паттерн `20260528000000_add_referral_code_table/migration.sql`):**
```sql
-- additive only
CREATE TYPE "FavoriteItemType" AS ENUM ('LESSON', 'JOB', 'MATERIAL');  -- НЕ ALTER TYPE — новый enum
CREATE TABLE "Favorite" ( ... CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id") );
CREATE UNIQUE INDEX "Favorite_userId_itemType_itemId_key" ON "Favorite"("userId","itemType","itemId");
CREATE INDEX "Favorite_userId_itemType_idx" ON "Favorite"("userId","itemType");
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```
**Применение через Mgmt API (verified `reference_supabase_migration_via_mgmt_api.md`):** compute sha256 от migration.sql → POST `/database/query` (новый enum = `CREATE TYPE`, не `ALTER TYPE ADD VALUE`, поэтому можно одним блоком с `IF NOT EXISTS` где доступно) → INSERT row в `_prisma_migrations` с checksum. Только additive. Review SQL глазами: grep `DROP|TRUNCATE|ALTER COLUMN.*TYPE` = 0.
**Data-миграция трек→избранное (отдельный idempotent seed-скрипт, НЕ внутри schema-миграции):** для каждого `LearningPath`: lessonIds из `custom`-секции → `Favorite(LESSON)`; элементы `addedJobs[]` → `Favorite(JOB)`. Идемпотентность гарантируется `@@unique([userId,itemType,itemId])` + `prisma.favorite.createMany({ data, skipDuplicates: true })` или upsert. Re-run не дублирует. **`LessonProgress` НЕ трогаем** (hard rule D-03/D-07). **Backup перед запуском** (PITR на проекте включён).

### Pattern 5: Material listForUser + ACL (D-05)

**Текущий ACL (verified `material.ts:398-492`, `getSignedUrl`):** скачивание разрешено, только если материал привязан хотя бы к одному **видимому** уроку, доступному юзеру (`material.lessons.length > 0` + `checkLessonAccess` хотя бы по одному). **Hidden material → NOT_FOUND.**
**Текущий read (verified `material.ts:112,162`):** `list` и `getById` — `adminProcedure`. Юзер видит материалы только через урок.
**Новый `material.listForUser` (protectedProcedure):** паттерн из `list` (`material.ts:123-156`) — фильтр `isHidden=false`, `type` (опц.), `title contains` (опц.). Включает standalone (`isStandalone=true`) + привязанные к доступным урокам.
**КРИТИЧЕСКИЙ Landmine — standalone download ACL:**
- `MaterialCard.tsx:21` требует проп `lessonId`, а `material.getSignedUrl` (`material.ts:437`) бросает `FORBIDDEN`, если `material.lessons.length === 0`. **Standalone-материал по определению не привязан к уроку → его файл невозможно скачать текущим ACL.** CONTEXT D-05 говорит «ACL скачивания без изменений» — но это сделает standalone-материалы нескачиваемыми. Планер должен **явно решить** один из вариантов:
  1. На этом заходе standalone — только `externalUrl` (без storagePath), скачивание не требует `getSignedUrl` → ACL не затрагивается. (Самый безопасный, соответствует «без изменений ACL».)
  2. Расширить `getSignedUrl` ACL: для `isStandalone` материала проверять подписку юзера напрямую (не через привязанный урок). Это **изменение ACL** — противоречит формулировке D-05, нужен явный sign-off owner.
- **Рекомендация:** Вариант 1 (standalone = externalUrl only на этом заходе), зафиксировать в acceptance. Если методологи захотят standalone-файлы — отдельная задача с ACL-доработкой.
- `MaterialCard.tsx` нужно сделать `lessonId` опциональным (для standalone карточек в Базе знаний), и в `reachGoal` (`MaterialCard.tsx:46`) учесть отсутствие `lessonId`.

### Anti-Patterns to Avoid
- **`router.push` для дефолт-редиректа `/learn`** — воспроизводит router-cache loop (см. Pattern 2). Только серверный `redirect()`.
- **Переименование моделей БД** (`Job`→Solution) — явно запрещено D-02. Только UI-строки/URL.
- **Трогать `LessonProgress` в миграции** — запрещено D-03/D-07. Прогресс независим.
- **Забыть `isHidden` фильтр** в новых запросах — сломает Phase 57 hidden-lesson auto-sync (D-10). Каждый новый query по Lesson/Material обязан фильтровать `isHidden: false` (+ `course.isHidden: false` для уроков).
- **ALTER TYPE для нового enum** — `FavoriteItemType` это новый enum → `CREATE TYPE`, а не `ALTER TYPE ADD VALUE` (последнее не работает в одной транзакции с использованием).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Семантический поиск уроков | новый vector search | `ai.searchLessons` (`ai.ts:213`) | Готов, гибридный (vector+keyword), фильтрует isHidden, проверяет access |
| Поиск плейбуков | новый intent-резолвер | `intent.resolve` (`intent.ts`) | Уже на solutions работает |
| Карточка материала | новый компонент | `MaterialCard.tsx` | Есть, только сделать `lessonId` опциональным |
| Card-акценты для входов/hero | кастомные градиенты | `<Card variant="soft-blue\|soft-green\|gradient">` (`card.tsx:13-17`) | Брендовые токены уже определены |
| Применение миграции на prod | ручной SQL без записи в `_prisma_migrations` | Mgmt API паттерн (`reference_supabase_migration_via_mgmt_api.md`) | Прецедент Phase 60, не ломает prisma migrate status |
| Идемпотентность data-миграции | ручной check-then-insert | `createMany({ skipDuplicates: true })` + `@@unique` | Re-run safe без дублей |

**Key insight:** Почти всё, что нужно фазе, уже построено в предыдущих фазах (55/57/58/59/60). Это интеграционно-рефакторная фаза, не строительная. Главная работа — расщепление и переиспользование, а не написание нового.

## Runtime State Inventory

> Фаза включает миграцию данных (трек→избранное) и переименование UI-строк — runtime state проверен.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `LearningPath.lessons` JSON: `custom`-секция (`id:'custom'`, title «Мои уроки», verified `learning.ts:897`) + `LearningPath.addedJobs` JSON массив jobId (verified `schema.prisma:217`, `learning.ts:1140`). ~170 юзеров. | **Data-миграция** (wave D): custom lessonIds → `Favorite(LESSON)`, addedJobs → `Favorite(JOB)`. Идемпотентно. После — `addedJobs`/`custom` можно оставить dormant (CONTEXT §6 допускает). |
| Live service config | Нет. Раздел обучения не имеет внешней конфигурации в UI/БД сторонних сервисов. | None — verified: нет n8n/Datadog/Tailscale зависимостей у /learn. |
| OS-registered state | Нет. | None — это веб-фича, нет Task Scheduler/pm2/systemd. |
| Secrets/env vars | Нет новых. `SUPABASE_SECRET_KEY` (material storage, `material.ts:59`) — без изменений. | None. |
| Build artifacts | `NEXT_PUBLIC_*` вшиваются при build — фаза не добавляет таких. Новые маршруты — обычный rebuild. | Полный rebuild с `--no-cache` на staging при изменении .tsx (gotcha `feedback_staging_docker_no_cache_required.md`). |

**Канонический вопрос:** После обновления всех файлов repo единственное runtime-состояние, требующее миграции, — это `LearningPath.lessons.custom` + `LearningPath.addedJobs` в prod БД. Всё остальное — code/markup, обновляется деплоем.

## Common Pitfalls

### Pitfall 1: Router-cache loop при клиентском редиректе
**What goes wrong:** Дефолт-редирект `/learn` через `useEffect(()=>router.push('/learn/plan'))` зацикливает юзера (Router Cache отдаёт протухший RSC гарда из `(main)/layout.tsx:63`).
**Why:** `(main)/layout.tsx` — Server Component с `redirect()` гардом; soft-navigation не инвалидирует его кеш.
**How to avoid:** `/learn/page.tsx` → Server Component с серверным `redirect()` по данным `prisma.learningPath`. Никакого `router.push` для редиректа.
**Warning signs:** «страница мигает и возвращается назад» при заходе на `/learn`.

### Pitfall 2: Standalone material нельзя скачать (ACL gap)
**What goes wrong:** Standalone-материал (`isStandalone=true`, без привязанного урока) с `storagePath` → `getSignedUrl` бросает `FORBIDDEN` (`material.ts:437`).
**Why:** ACL завязан на наличие доступного привязанного урока; у standalone его нет.
**How to avoid:** На этом заходе standalone = только `externalUrl` (без storagePath). Или явный sign-off на расширение ACL.
**Warning signs:** «Доступ к материалу ограничен» toast (`MaterialCard.tsx:62`) на материале из Базы знаний.

### Pitfall 3: Три потребителя getRecommendedPath расходятся при split
**What goes wrong:** План/Избранное split меняет `getRecommendedPath`, но `AgentSearch.tsx:15` (trackedJobIds), `/learn/track` (`addedJobs`, custom), `/learn` page (`trackLessonIds`) читают его — рассинхрон состояния «В треке/В избранном».
**Why:** `addedJobs` и `custom`-секция отдаются в одном ответе и читаются в трёх местах.
**How to avoid:** В Wave D обновить все три потребителя одновременно. Решить: оставить `addedJobs` в ответе (для совместимости плана) или вынести в `favorite.list`.
**Warning signs:** сердечко «В избранном» и бейдж «В треке» показывают противоречивое состояние.

### Pitfall 4: Forgotten isHidden filter
**What goes wrong:** Новый запрос по Lesson/Material без `isHidden:false` показывает скрытый методологами контент (ломает Phase 57 auto-sync).
**How to avoid:** Копировать паттерн `where: { isHidden:false, course:{ isHidden:false } }` (для Lesson) и `where:{ isHidden:false }` (для Material) в каждый новый query. `material.listForUser`, поиск материалов, favorite.list (резолв itemId → entity).
**Warning signs:** скрытый дубль-урок снова виден.

## Code Examples

### Server redirect alias (track → plan)
```tsx
// apps/web/src/app/(main)/learn/track/page.tsx — REPLACE entire client component
// Source: pattern from (main)/layout.tsx:64 [VERIFIED: codebase]
import { redirect } from 'next/navigation';
export default function TrackRedirect() {
  redirect('/learn/plan');
}
```

### Idempotent data migration (track → favorites)
```ts
// scripts/migrate-track-to-favorites.ts — idempotent seed (run once, re-run safe)
// Source: @@unique([userId,itemType,itemId]) + skipDuplicates [VERIFIED: D-06 schema]
const paths = await prisma.learningPath.findMany({ select: { userId: true, lessons: true, addedJobs: true } });
const rows: { userId: string; itemType: 'LESSON'|'JOB'; itemId: string }[] = [];
for (const p of paths) {
  const parsed = parseLearningPath(p.lessons);                 // existing helper
  if (!Array.isArray(parsed)) {
    const custom = parsed.sections.find(s => s.id === 'custom'); // verified id:'custom' learning.ts:897
    custom?.lessonIds.forEach(id => rows.push({ userId: p.userId, itemType: 'LESSON', itemId: id }));
  }
  (Array.isArray(p.addedJobs) ? p.addedJobs as string[] : [])
    .forEach(jobId => rows.push({ userId: p.userId, itemType: 'JOB', itemId: jobId }));
}
await prisma.favorite.createMany({ data: rows, skipDuplicates: true }); // re-run safe
// LessonProgress untouched (hard rule)
```

### `custom` section detection — VERIFIED (resolves D-03 open question)
```tsx
// Open question from CONTEXT D-03 / spec §6: надёжно ли определяется custom?
// ANSWER: YES. Router writes id:'custom', title 'Мои уроки' deterministically:
//   learning.ts:897   { id: 'custom', title: 'Мои уроки', ... }   (addToTrack)
//   learning.ts:1043  { id: 'custom', ... }                       (addLessonsToTrack bulk)
//   learning.ts:936   if (s.id === 'custom') return s             (excluded from AI rebuild)
//   rebuildTrack учёт: learning.ts:1214 const customSection = parsed.sections.find(s => s.id === 'custom')
// Detection via section.id === 'custom' is reliable. Migration can safely key on it. [VERIFIED: codebase]
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Один `/learn` с lens-toggle | 4 маршрута + сабменю | эта фаза | Расщепление; редиректы для совместимости |
| `+ В трек` смешивает диагностику и ручное | План=диагностика, Избранное=ручное | эта фаза (D) | data-миграция, новый Favorite |
| Материалы только внутри урока | `material.listForUser` user-facing | эта фаза (C) | standalone ACL вопрос |
| Поиск всегда плейбуки | scope-зависимый поиск | эта фаза (B) | подключение готового `ai.searchLessons` |

**Deprecated/outdated:** ничего не deprecated этой фазой; `LearningPath.addedJobs` и `custom`-секция становятся dormant после миграции (не удаляются на этом заходе).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Standalone-материалы на этом заходе будут только `externalUrl` (без storagePath), чтобы не трогать ACL | Pattern 5 / Pitfall 2 | Если методологи зальют storagePath-standalone — скачивание сломается; нужна ACL-доработка + sign-off |
| A2 | `addedJobs` и `custom`-секцию можно оставить dormant после миграции (не чистить колонку в эту фазу) | Runtime State / CONTEXT §6 | Если оставить и фронт План случайно их прочитает — дубли; нужно явно убрать чтение из плана |
| A3 | MobileNav под-навигацию обучения решат табами внутри страниц (нет места под 4 пункта в bottom-bar) | Pattern 1 | UX-решение за планером/owner; влияет на вёрстку (Claude's Discretion) |
| A4 | На solutions-результате поиска оставить и «В план» (addJobToTrack), и «В избранное» (favorite JOB) | Pattern 3 | Если owner хочет одну кнопку — упрощается; spec §3.2 допускает оба |

**Эти 4 пункта — для discuss-phase / планера подтвердить.** Остальные claims верифицированы по коду.

## Open Questions

1. **Standalone material download ACL (A1)**
   - Что знаем: `getSignedUrl` требует привязанный доступный урок; standalone его не имеет.
   - Что неясно: разрешит ли owner расширить ACL или ограничиться externalUrl-standalone.
   - Рекомендация: externalUrl-only на этом заходе, зафиксировать в acceptance.

2. **MobileNav UX для 4 под-разделов (A3)**
   - Что знаем: bottom-bar уже несёт до 7 иконок; 4 под-пункта не влезут.
   - Рекомендация: «Уроки» в mobile → `/learn/plan` дефолт, под-разделы табами внутри страниц.

3. **Судьба `addedJobs`/`custom` после миграции (A2)**
   - Рекомендация: оставить dormant, убрать ТОЛЬКО чтение из фронта Плана; колонку не дропать (additive-safety).

## Environment Availability

> Фаза — code/config/UI + одна additive миграция. Внешних рантайм-зависимостей сверх существующего стека нет.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase Management API | применение Favorite-миграции | ✓ | — | localhost prisma migrate (если есть prod DATABASE_URL) |
| Supabase prod (saecuecevicwjkpmaoot) | вся фаза | ✓ | Postgres 17 | — |
| pgvector / `searchChunks` | `ai.searchLessons` | ✓ | — | keyword-only (уже встроен fallback в ai.ts) |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none критичных.

## Validation Architecture

> `workflow.nyquist_validation` не отключён явно — секция включена.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (unit, api + web), Playwright (e2e) |
| Config file | существует (`pnpm test`, `pnpm test:e2e` — CLAUDE.md Commands) |
| Quick run command | `pnpm test` (Vitest, фильтр по файлу) |
| Full suite command | `pnpm test && pnpm typecheck` (api 123/123 + web 205/205 на момент Phase 59 v2) |

### Phase Requirements → Test Map
| Behavior | Test Type | Automated Command | File Exists? |
|----------|-----------|-------------------|-------------|
| `favorite.{add,remove,list,isFavorited}` логика | unit | `pnpm test favorite` (api) | ❌ Wave 0 — новый роутер |
| Идемпотентность data-миграции (re-run без дублей) | unit | `pnpm test migrate-track-to-favorites` | ❌ Wave 0 |
| `material.listForUser` ACL + isHidden фильтр | unit | `pnpm test material` (api) | ⚠️ расширить существующий material-тест |
| `AgentSearch` scope routing (solutions vs library) | unit | `pnpm test AgentSearch` (web) | ❌ Wave 0 |
| Редирект `/learn/track`→`/learn/plan`, `/learn`→дефолт | e2e | `pnpm test:e2e learn-redirect` | ❌ Wave 0 |
| Tour не сломан под новой структурой | manual + e2e | `60-HUMAN-UAT`-стиль | ❌ Wave 0 (manual) |
| Нет регрессии `LessonProgress` после миграции | unit | snapshot count before/after | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test <module>` (затронутый роутер/компонент).
- **Per wave merge:** `pnpm test && pnpm typecheck` (full).
- **Phase gate:** full suite green + staging QA (gotcha: `--no-cache` rebuild + content-check) перед merge в master.

### Wave 0 Gaps
- [ ] `packages/api/src/routers/__tests__/favorite.test.ts` — CRUD + isFavorited батч
- [ ] `scripts/__tests__/migrate-track-to-favorites.test.ts` — идемпотентность + LessonProgress untouched
- [ ] `apps/web/.../AgentSearch.test.tsx` — scope routing
- [ ] e2e: redirect-якоря `/learn`, `/learn/track`
- [ ] расширить material-тест на `listForUser` (isHidden + type filter + standalone)

## Security Domain

> `security_enforcement` не отключён — секция включена.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V4 Access Control | **yes** | `protectedProcedure`/`adminProcedure` (tRPC); `favorite.*` — protectedProcedure с `ctx.user.id` scoping; `material.listForUser` — protected; download ACL `getSignedUrl` БЕЗ ослабления |
| V5 Input Validation | yes | zod на всех новых input (favorite itemId/itemType, material filters, search query) — паттерн уже в роутерах |
| V6 Cryptography | no (нет нового крипто) | signed URL TTL через Supabase (`MATERIAL_SIGNED_URL_TTL`) — без изменений |
| V2/V3 Auth/Session | no (не трогаем) | Supabase Auth — вне scope |

### Known Threat Patterns for tRPC/Prisma/Supabase
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| IDOR на favorite (чужой userId) | Elevation | `favorite.*` всегда фильтрует по `ctx.user.id`, никогда из input |
| Полиморфный itemId без FK → битая ссылка | Tampering | App-level integrity: при `favorite.list` резолвить itemId с `isHidden:false` фильтром, пропускать несуществующие |
| Ослабление material ACL ради standalone | Elevation | НЕ менять `getSignedUrl`; standalone = externalUrl-only (A1) |
| Утечка скрытого контента в новых query | Info Disclosure | `isHidden:false` (+ `course.isHidden:false`) в каждом новом read |

## Sources

### Primary (HIGH confidence — verified in this session)
- `apps/web/src/components/shared/sidebar.tsx` (active-state :118, flat navItems :16)
- `apps/web/src/components/shared/mobile-nav.tsx` (bottom-bar pattern)
- `apps/web/src/app/(main)/learn/page.tsx` (lens toggle, custom id marker :124, addToTrack optimistic :115)
- `apps/web/src/app/(main)/learn/track/page.tsx` (sections render, custom/addedJobs consumers)
- `apps/web/src/app/(main)/layout.tsx` (server redirect guard :34,49,64 — Server Component)
- `apps/web/src/components/learning/AgentSearch.tsx` (surface hardcode :35, trackedJobIds :15-19, result render :93-138)
- `apps/web/src/components/learning/MaterialCard.tsx` (lessonId required :21, getSignedUrl flow :57)
- `apps/web/src/components/learning/JobCatalog.tsx` / `JobCard.tsx` (isInTrack :36, onAddToTrack :54)
- `apps/web/src/lib/tours/definitions.ts` (learn-search/-view-toggle/-add-to-track anchors, getSteps DOM-state branch :178)
- `apps/web/src/components/ui/card.tsx` (variants soft-blue/soft-green/gradient :13-17)
- `apps/web/src/app/(main)/dashboard/page.tsx` (4 stats :138, 2 CTA cards :180-218)
- `packages/api/src/routers/learning.ts` (getRecommendedPath :274, addToTrack :881, removeFromTrack :974, addLessonsToTrack :1020, addJobToTrack :1121, removeJobFromTrack :1159, rebuildTrack :1200, custom marker :897)
- `packages/api/src/routers/ai.ts` (searchLessons :213-379 input/output shape)
- `packages/api/src/routers/material.ts` (list/getById adminProcedure :112/:162, getSignedUrl ACL :398-492)
- `packages/api/src/routers/intent.ts` (surface enum :16)
- `packages/db/prisma/schema.prisma` (UserProfile relations :46-59, LearningPath :212/addedJobs :217, Material :433/isStandalone :443, LessonMaterial :455)
- `packages/db/prisma/migrations/20260528000000_add_referral_code_table/migration.sql` (additive pattern)

### Secondary (memory references)
- `reference_supabase_migration_via_mgmt_api.md` — Mgmt API migration procedure (checksum, split, _prisma_migrations)
- CLAUDE.md gotchas — router-cache loop (`window.location.assign`), `--no-cache` staging rebuild, isHidden auto-sync (Phase 57)

### Tertiary (LOW confidence)
- none — все claims верифицированы по коду или явно помечены [ASSUMED] в Assumptions Log.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new deps, all reuse verified at file:line
- Architecture (route split, nav, search scope): HIGH — patterns read directly from current code
- Favorite model + migration: HIGH — schema from CONTEXT, Mgmt API precedent verified
- Material ACL: MEDIUM — gap identified (standalone), resolution requires owner decision (A1)
- Pitfalls: HIGH — all traced to documented incidents or verified code constraints

**Research date:** 2026-06-03
**Valid until:** 2026-07-03 (stable brownfield refactor; only risk is parallel commits to `/learn` from another agent — re-verify file:line before Wave D)

## RESEARCH COMPLETE
