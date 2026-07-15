# Аналитика по AI-ассистенту — таб «Ассистент» в `/admin/analytics`

**Дата:** 2026-07-15
**Автор:** brainstorm-сессия (owner + Claude)
**Статус:** design approved (структура из 4 секций подтверждена owner), ждёт ревью спеки
**Ветка:** `feature/assistant-analytics` (от `origin/master` `762153f`)

## Проблема

Сквозной AI-ассистент зашиплен на прод (merge `c85d6db` + флаг `ASSISTANT_ENABLED=true`, `fc20bc4`): drawer над RAG с квотами (5 free / 50 paid), концьерж (карта продукта + nav-карточки + `/support` fallback), material-surfacing (карточки материалов с гейтингом доступа). Данные о каждом ходе диалога уже пишутся в `AssistantMessage` / `AssistantConversation`, но **витрины над ними нет** — owner не видит ни adoption, ни качества ответов, ни давления квоты (сигнала к апселлу).

## Цель

Добавить таб «Ассистент» в `/admin/analytics`, покрывающий три линзы (выбраны owner на брейншторме):
1. **Здоровье/adoption** — живёт ли фича.
2. **Качество/продукт** — где ассистент промахивается (что чинить в RAG/концьерже).
3. **Апселл/монетизация** — кто упирается в free-квоту (кому предложить платное).

Плюс дешёвый бонус — **разбивка спроса** по `category` и топ подмешиваемых карточек (кормит и качество, и контент).

**Не-цели (v1, вынесены в бэклог):**
- Полный вьюер диалогов целиком.
- Связка ассистент→оплата (атрибуция к выручке; корреляция ≠ причина, требует джойна к `Payment`/`Subscription`).
- Топ-темы через кластеризацию/LLM (в v1 только `category`-разбивка).

## Модель данных (уже существует — миграций НЕ надо)

`packages/db/prisma/schema.prisma`:

```prisma
model AssistantConversation {
  id String @id
  userId String
  status String @default("active") // active | archived
  createdAt DateTime
  user UserProfile @relation(...)
  messages AssistantMessage[]
  @@index([userId, status])
}

model AssistantMessage {
  id String @id
  conversationId String
  role String            // user | assistant
  content String @db.Text
  lessonIds String[]     // подмешанные карточки уроков (assistant)
  jobIds String[]        // подмешанные карточки задач (assistant)
  inDomain Boolean @default(true) // false = off-topic отказ
  category String?       // material | platform_help | complaint | off_domain
  navLinks Json @default("[]")    // deep-link карточки [{label,href}]
  materialIds String[]   // подмешанные карточки материалов (assistant)
  createdAt DateTime
  conversation AssistantConversation @relation(...)
  @@index([conversationId, createdAt])
}
```

### Критические факты персиста (verified в `packages/api/src/routers/assistant.ts`)

- На один ход диалога создаётся **две строки**: `role='user'` (только `content` = текст запроса; `category=null`, `inDomain=default true`, массивы пустые) и `role='assistant'` (`content`=ответ + `category` + `inDomain` + `lessonIds`/`jobIds`/`materialIds` + `navLinks`).
- **`inDomain = (category !== 'off_domain')`** — то есть `off_domain ⟺ inDomain=false`, эквивалентны. В агрегатах используем `category`.
- ⚠️ **Все агрегаты по `category`/`inDomain`/карточкам ОБЯЗАНЫ фильтровать `role='assistant'`** — иначе user-строки (с `category=null`, `inDomain=true`) искажают доли.
- **Текст запроса юзера** живёт на **предыдущей** `role='user'`-строке того же диалога → для «списка проблемных» пара = assistant-строка (категория) + непосредственно предшествующая user-строка (текст).

### Квота (verified в `packages/api/src/utils/assistant-quota.ts`)

- `FREE_DAILY = 5`, `PAID_DAILY = 50`, `BURST_PER_MIN = 6` — **импортировать константы, не хардкодить**.
- Квота считает `role='assistant' AND inDomain=true` за **МСК-день** (`startOfMskDay(now)` — переиспользуемый хелпер).
- Tier `full` = `isAdmin OR активная подписка > 0`; иначе `free`.

### Fallback→/support сигнал (verified в `assistant/concierge/concierge-pipeline.ts`)

Концьерж-промах (`MISS`) = ответ с `navLinks` содержащим `{label:'Написать в поддержку', href:'/support'}` (пустые lessons/jobs/materials). Детектится в SQL: `navLinks::text LIKE '%/support%'` на `role='assistant'`-строках.

## Исключение тест-юзеров

Как в Phase 63. Ассистент-метрики привязаны к юзеру (не к плану) → исключение **чисто по `UserProfile.isTest`**. В SQL — джойн `AssistantConversation.userId → UserProfile` + `AND up."isTest" = false`. Где обогащаем в JS — `isExcludedFromRevenue({ user })` (`packages/api/src/utils/test-exclusion.ts`).

## Структура таба (approved)

Один таб `/admin/analytics/assistant`, **один селектор периода сверху** (структурный фикс «оторванной шапки» из Phase 63 — каждый таб владеет своим селектором над своими графиками). Под ним 4 секции сверху вниз. Дефолт периода — как в других табах (напр. 30 дней).

### Секция 1 — Пульс (adoption/здоровье)

KPI-строка за период + 2 графика (recharts, паттерн DAU из Phase 61).

| Метрика | Определение |
|---------|-------------|
| Сообщений (юзер) | `count(role='user')` за период |
| Уник. юзеров | `count(distinct conversation.userId)` за период |
| Диалогов | `count(distinct conversationId)` (или новых `AssistantConversation` за период) |
| Ср. сообщений на диалог | сообщений / диалогов |
| График: сообщения/день | line, бакет по МСК-дню |
| График: уник.юзеры/день | line (DAU ассистента) |

### Секция 2 — Качество/продукт

Доли за период (с числом) + список проблемных.

| Метрика | Определение (на `role='assistant'`) |
|---------|-------------------------------------|
| Off-domain rate | `category='off_domain'` / все ответы |
| Доля жалоб | `category='complaint'` / все ответы |
| Fallback-rate | `navLinks::text LIKE '%/support%'` / все ответы |
| **Список последних проблемных** | последние N (напр. 50) ответов где `category IN ('off_domain','complaint')` ИЛИ fallback → показать: текст запроса юзера (предыдущая user-строка), метку (off-domain / жалоба / fallback), дату. Пагинация не нужна в v1 — просто последние N. |

Опционально мини-тренд off-domain rate по дням, если дёшево.

### Секция 3 — Спрос (о чём спрашивают)

| Метрика | Определение (на `role='assistant'`) |
|---------|-------------------------------------|
| Разбивка по `category` | bar: material / platform_help / complaint / off_domain |
| Топ материалов | развернуть `materialIds` → count по id → топ N с названием (джойн к `Material`) |
| Топ уроков | развернуть `lessonIds` → топ N (джойн к `Lesson`) |
| Топ задач | развернуть `jobIds` → топ N (джойн к `Job`) |

### Секция 4 — Апселл (давление квоты)

Считаем «упёрся в лимит» по факту квотного правила: юзер, у кого за МСК-день `count(role='assistant' AND inDomain=true) >= FREE_DAILY`.

| Метрика | Определение |
|---------|-------------|
| Free-юзеров упёрлись в лимит | distinct free-юзеров, достигших `>=5` inDomain-ответов хотя бы в один день периода |
| Повторные «упиральщики» | из них те, кто упёрся в `>= N` разных дней |
| Распределение дневной нагрузки | сколько free-юзеро-дней пришлось на 1 / 2 / 3 / 4 / 5 inDomain-ответов (bar) |
| **Список кандидатов на апселл** | топ free-юзеров по суммарному объёму inDomain-ответов за период: email + счётчик + сколько дней упирался. Actionable — «кому предложить платное». |

## Технические решения и известные приближения

1. **free vs paid — ретроспективная классификация.** Статус подписки меняется во времени; исторически «был ли юзер free в конкретный день» точно не восстановить дёшево. **v1-упрощение:** классифицируем по **текущему** tier юзера (нет активной подписки и не админ = free) через тот же путь, что `assistant-quota.ts` (`getUserActiveSubscriptions` / `getUserAdminBypass`), либо batch-эквивалент. Помечено как known approximation в UI-подписи секции («по текущему статусу подписки»).
2. **«Упёрся в лимит» = `>=5` inDomain-ответов в день** — прямое следствие квотного правила (не эвристика; ровно то, что считает `getAssistantQuota`).
3. **Пороги 5/50** — импорт `FREE_DAILY`/`PAID_DAILY` из `assistant-quota.ts`.
4. **МСК-дневные бакеты** — переиспользовать `startOfMskDay` (или его логику в SQL: сдвиг на +3ч перед `date_trunc`).
5. **Раскрытие массивов** (`materialIds`/`lessonIds`/`jobIds`) для топов — `unnest(...)` + `group by` в raw SQL, затем джойн к соответствующим таблицам за названиями (или обогащение в JS вторым запросом).

## Архитектура кода (паттерн Phase 63)

- **Роутер:** новый суброутер `packages/api/src/routers/admin-analytics-assistant.ts` (или процедуры в существующем `admin-analytics.ts`). Процедуры `admin.analytics.assistant.*`: `getPulse`, `getQuality`, `getProblemMessages`, `getDemand`, `getUpsell`. Каждая принимает `{ from, to }`. Тонкие: fetch (raw SQL `groupBy`) → pure fn → enrich.
- **Чистые функции** (`packages/api/src/utils/`, юнит-тесты изолированно, паттерн Phase 63): бакетизация по дням, вычисление долей, свод распределения нагрузки, ранжирование топов/кандидатов. Тест-юзеры и `role`-фильтр — на уровне запроса, но границы (division-by-zero при пустом периоде и т.п.) покрыть в pure fn.
- **Страница:** `apps/web/src/app/(admin)/admin/analytics/assistant/page.tsx` + строка в `apps/web/src/components/admin/AnalyticsTabs.tsx`.
- **Графики:** recharts (как в существующих табах). Селектор периода — реюз того же компонента, что в revenue/funnel.

## Приватность / безопасность

- Все процедуры под тем же admin-guard, что остальной `admin.analytics.*`.
- Секция 2 показывает **текст запросов юзеров** (только проблемные) и Секция 4 — **email**. Это admin-only, консистентно с реестром клиентов Phase 63 (там уже email+телефон). Полный вьюер диалогов (весь текст) осознанно вне v1.
- Только SELECT. Никаких DDL/миграций/`prisma push`. localhost dev читает ПРОД Supabase → любые проверки только чтением.

## Тестирование

- Pure-утилы: unit (Vitest) — бакеты, доли, распределение, ранжирование, пустой период.
- Роутер-процедуры: по возможности лёгкий интеграционный тест на фикстурах (как в Phase 63), иначе — доверие pure-функциям + ручная сверка на проде через `pnpm dev`.
- `pnpm --filter web build` локально **до** деплоя (ловит server-only-в-client, чего `tsc` не ловит). Все новые импорты в client-компонентах из `@mpstats/*` — через `import type`, если тянут server-only.

## Деплой (стандартный)

staging build-gate `--no-cache web` (dev-режим ≠ prod-build) → owner UAT → merge `--no-ff` master → прод `--no-cache web` + recreate + smoke internal+public 200. Read-only фича, откат = `git revert -m 1 <merge>` (данные не трогаются).

## Открытые вопросы к ревью спеки

- ОК ли v1-упрощение free/paid по текущему статусу (а не историческому)? Если нужна историческая точность — это отдельный, заметно больший объём (реконструкция по `Subscription` периодам).
- Достаточно ли «последних N» в списке проблемных без фильтров/пагинации для v1?
