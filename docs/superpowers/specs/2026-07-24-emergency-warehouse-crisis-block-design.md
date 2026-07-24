# Экстренный ЧП-блок «Склады WB под ударом» — дизайн

**Дата:** 2026-07-24
**Статус:** утверждён к реализации
**Ветка:** `feature/emergency-warehouse-crisis-block`

## Контекст

18–22.07.2026 — атаки на логистические комплексы Wildberries (Электросталь сгорел
полностью, Котовск, Краснодар, Невиномыск). Селлеры теряют товар и деньги. MPSTATS
собрал экстренный антикризисный вебинар (23.07.2026, 126 мин, 5 спикеров: модератор +
предприниматель + юристы по страховому/общему праву).

Задача: разместить материал на платформе **на самом видном месте**, оформив как
«решение задачи» (Job), чтобы клиент, зайдя на витрину, видел его почти первым.
Раскатка тёмная — параллельная команда методологов уже собрала 2 текстовых урока в тот
же набор.

## Цель

1. Загрузить запись вебинара как урок платформы (без Vision RAG — решение owner).
2. Оформить набор как `Job` (вебинар + 2 текстовых урока методологов).
3. Показать его на видном месте: баннер на витрине `/dashboard` + закреплённая карточка
   в каталоге решений `/learn/solutions` (WB).
4. Все 3 материала — в бесплатном доступе.
5. Единый быстрый kill-switch. Раскатка через staging.

## Что уже готово (не трогаем)

- **Phase A** (репо `E:\Academy Courses`): транскрипт → chunks → embeddings →
  Supabase `content_chunk` = 67 строк для `04_workshops_w12_jul26_crisis_001` (проверено).
- **2 текстовых урока методологов** уже `PUBLISHED`, `isHidden=false`:
  - `04_workshops_text_d1db18c6-7275-4e16-ab16-8ca58117cd50` — «Товар пострадал на складе:
    как зафиксировать ущерб и проверить компенсацию» (order 38)
  - `04_workshops_text_3bd9fe05-4195-41f8-a507-96fde377ec91` — «Когда принять компенсацию,
    а когда спорить с маркетплейсом» (order 39)
  - ID = первичный ключ `Lesson.id`, стабилен при публикации → превью-id = боевой id.

## Осознанные исключения из обычных правил

- **Vision RAG пропускаем.** Обычно `academy_video_frame` обязателен каждому видео-батчу
  (feedback_vision_rag_mandatory). Owner явно решил: этот урок Vision-разбор не требует.
- **Реюз выводимого `isPartnerFree` не подходит** — это не колонка БД, а флаг, выводимый из
  принадлежности партнёр-курсу. Для точечного освобождения 3 уроков вводим отдельный
  аллоулист (см. E).

---

## A. Контент (Phase B из хендоффа, Vision скипнут)

### A1. Seed урока-вебинара

Одноразовый идемпотентный `scripts/seed-lesson-w12-webinar.ts` (upsert по id):

| Поле | Значение |
|---|---|
| `id` | `04_workshops_w12_jul26_crisis_001` |
| `courseId` | `04_workshops` |
| `title` | `Антикризисный эфир 23.07.2026 — как защитить бизнес и деньги после атак на склады WB` |
| `duration` | `126` (минуты, не секунды) |
| `order` | `40` (= MAX(order) в курсе 39 + 1) |
| `skillCategory` | `OPERATIONS` |
| `skillCategories` | `[OPERATIONS, FINANCE]` |
| `skillBlocks` | с валидного соседа `04_workshops_w10_nov_crisis_002` (напр. `FINANCE/unit_economics` + операционные) — обязательны (Library фильтрует по `skillBlocks != null`) |
| `topics` | с соседа, включая «Антикризисное управление» |
| `contentType` | `VIDEO` (по умолчанию) |
| `isHidden` | `false` |
| `videoId`/`videoUrl` | проставит шаг A2 |

Источник значений соседа зафиксировать в скрипте на момент написания (не читать вживую в
проде из seed).

### A2. Kinescope upload

Одноразовый map JSON (одна запись, `courseId=04_workshops`, папка на Kinescope) +
`npx tsx scripts/kinescope-upload.ts --map <...>`. Источник — локальный MP4
`E:\Academy Courses\04_workshops\w12_jul26_crisis\001_antikrizisnyy_efir_23_07.mp4`.
Обновит `Lesson.videoId` + `videoUrl`. Гоча (feedback_kinescope_already_exists): при HTTP
400419 на повторе — уникализировать title (` · v2`).

---

## B. Джоба (решение-обёртка)

Создаётся через существующий admin-флоу / seed (`packages/api/src/routers/admin-jobs.ts`
`createJob` + `addJobLesson`, либо `scripts/seed/seed-jobs.ts`-стиль).

| Поле | Значение |
|---|---|
| `slug` | `wb-warehouse-crisis-2026` (`^[a-z0-9-]+$`) |
| `title` | `Склады WB под ударом: как защитить бизнес и деньги` |
| `description` | краткий антикризисный вводный текст (из раскладки «О чём эфир») |
| `marketplace` | `WB` |
| `axes` | `[OPERATIONS, FINANCE]` (primary `OPERATIONS`) |
| `outcomes` | посчитать прямой убыток vs кассовый разрыв; проверить компенсацию WB (~40% себестоимости); разобраться, что покрывает страховка WB/Ozon и оговорка «БПЛА→теракт»; снизить риски (ФБС, диверсификация складов/каналов); действовать без паники и массовых исков |
| `skillBlocks` | 32-блок теги, с соседа/по смыслу |
| `isPublished` | `false` (тёмная раскатка) |

**Уроки джобы (`JobLesson.order`):**

| order | lessonId | Заголовок |
|---|---|---|
| 0 | `04_workshops_w12_jul26_crisis_001` | вебинар (видео) |
| 1 | `04_workshops_text_d1db18c6-…` | «Товар пострадал на складе…» |
| 2 | `04_workshops_text_3bd9fe05-…` | «Когда принять компенсацию…» |

Порядок: обзорный вебинар → фиксация ущерба/проверка компенсации → принять vs спорить.

---

## C. Продуктовые поверхности

Единый флаг окружения **`EMERGENCY_BANNER_ENABLED`** (runtime, как `OFFER_ENABLED` /
`PARTNER_COURSES_ENABLED`). Управляет и баннером, и пином. Целевой slug джобы — в константе.

### C1. Баннер на витрине `/dashboard` (вариант B — замещение)

Новый клиентский компонент `EmergencyBanner` (например
`apps/web/src/components/dashboard/EmergencyBanner.tsx`) встаёт в позицию
`HeroFirstLesson` (`apps/web/src/app/(main)/dashboard/page.tsx:146`).

**Флаг — рантайм через tRPC, НЕ `NEXT_PUBLIC_*`.** `NEXT_PUBLIC_*` вшивается при build →
kill-switch требовал бы пересборки. Значит флаг отдаём tRPC-запросом (сервер читает
`process.env.EMERGENCY_BANNER_ENABLED` на каждый запрос), напр. `dashboard.getEmergencyBanner`
→ `{ enabled, jobSlug }`. После смены env достаточно `up -d web` (перезапуск контейнера
подхватывает новое значение). Страница `/dashboard` — `'use client'`, так что состояние
приходит из query, не из server-only импорта (см. gotcha `next build` server-only).

Логика слота:
- Флаг **включён** → рендерим `EmergencyBanner` (виден **всем** юзерам), `HeroFirstLesson`
  в этот момент **не рендерим**.
- Флаг **выключен** → поведение как сейчас (холодные видят «Твой первый урок»).

Стиль — тревожный акцент (красный/alert-иконка), в бренде продукта. Ведёт на
`/learn/job/wb-warehouse-crisis-2026`. **Непропадающий** (без «крестика») — снятие только
через kill-switch.

### C2. Пин в каталоге решений `/learn/solutions`

`job.getCatalog` группирует джобы по осям (`AXIS_ORDER`), отдельного «сверху» слота нет.
ЧП-джоба по оси = `OPERATIONS` (4-я) → через `displayOrder` первой не поднять.

Решение: **закреплённая featured-карточка** над группами осей, флаг-гейт тот же
`EMERGENCY_BANNER_ENABLED`, показывается **только на `marketplace=WB`** (склады WB; на Ozon
не показываем). Источник данных — та же джоба по slug.

Kill-switch: `EMERGENCY_BANNER_ENABLED=false` + `docker compose up -d web` (секунды, без
пересборки).

---

## D. Access — все 3 урока бесплатны (решение D2)

`packages/api/src/utils/access.ts` уже даёт два бесплатных примитива: первый урок
опубликованной джобы (`getFirstJobLessonIds`) и партнёр-курс (`isPartnerFree`, выводимый).
Ни один не освобождает произвольные 2-й/3-й уроки джобы.

Вводим точечный аллоулист (без миграции, по образцу партнёр-курса):

- Константа `FREE_LESSON_IDS: Set<string>` (напр. в `packages/shared` или рядом с
  `access.ts`) с 3 id набора.
- Проверка в **обоих** путях доступа:
  - синхронный `isLessonAccessible(...)` — добавить `if (FREE_LESSON_IDS.has(lesson.id)) return true;`
  - асинхронный `checkLessonAccess(...)` — аналогично, reason `free_lesson`.
- Консьюмеры, которым нужен `lesson.id` для проверки: свериться грепом (плеер урока,
  job-detail, storefront). `isLessonAccessible` сейчас принимает урок без `id` в части
  вызовов — расширить сигнатуру/пробросить id там, где освобождение должно действовать.

Результат: вебинар + 2 текста доступны без подписки. (Дублируется с
job-first-lesson для вебинара — безвредно.)

---

## E. Раскатка (staging → prod)

1. Контент (A) + джоба (B, `isPublished=false`) + код (C, D) на ветке.
2. `pnpm --filter web build` локально (ловит server-only-в-client) + `pnpm typecheck` + тесты.
3. **Staging**: `docker-compose.staging.yml`, `build --no-cache web`, флаг
   `EMERGENCY_BANNER_ENABLED=true` + временно опубликовать джобу → **отсмотреть баннер и пин
   глазами на staging**. После — `git checkout master` до prod-деплоя.
4. **Prod, тёмный**: мерж в master, деплой, джоба `isPublished=false`, флаг `false` →
   **заметный ЧП-блок** (баннер + пин + карточка джобы в каталоге) не виден. Оговорка: сам
   урок-вебинар лежит в курсе «Практикумы» с `isHidden=false`, поэтому он доступен в общей
   Библиотеке курса (как обычный воркшоп) — это ок, «тёмная» — только про выделенный
   ЧП-блок. Методологи финализируют (их 2 текста уже опубликованы).
5. **Запуск**: опубликовать джобу (`setJobPublished true`) + `EMERGENCY_BANNER_ENABLED=true`
   + `up -d web`. Баннер и пин зажигаются вместе. Отсмотреть на проде.

## Verification

```sql
-- урок вебинара загружен
SELECT "videoId","skillBlocks","order","duration" FROM "Lesson"
  WHERE id='04_workshops_w12_jul26_crisis_001';           -- videoId NOT NULL, duration=126, order=40
SELECT COUNT(*) FROM content_chunk
  WHERE lesson_id LIKE '04_workshops_w12_jul26_crisis_%';  -- 67

-- джоба и её уроки
SELECT slug,"isPublished",axes,marketplace FROM "Job" WHERE slug='wb-warehouse-crisis-2026';
SELECT "lessonId","order" FROM "JobLesson" jl
  JOIN "Job" j ON j.id=jl."jobId" WHERE j.slug='wb-warehouse-crisis-2026' ORDER BY "order";  -- 3 строки 0..2
```
- Vision `academy_video_frame` для этого урока — **не создаём** (осознанно).
- Доступ: залогиниться под юзером без подписки (не-admin) → все 3 урока открываются.
- Флаг off → баннер и пин исчезают, «Твой первый урок» возвращается холодным.

## Вне scope

- Content самих текстовых уроков (методологи).
- Vision RAG.
- Показ на Ozon-стороне каталога.
- Публичный роадмеп/анонсы.
