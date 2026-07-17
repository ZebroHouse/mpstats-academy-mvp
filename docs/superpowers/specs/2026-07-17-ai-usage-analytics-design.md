# Сквозная аналитика AI-запросов (drawer-ассистент + чат в уроках)

**Дата:** 2026-07-17
**Автор:** brainstorm-сессия (owner + Claude)
**Статус:** design approved (объём «побогаче»; миграция + переименование таба — decided), ждёт ревью спеки
**Ветка:** `feature/ai-usage-analytics` (от `origin/master` `3f577c3` — включает зашипленный таб «Ассистент»)

## Проблема

Таб «Ассистент» (`3f577c3`) меряет **только** сквозной drawer-ассистент (`AssistantMessage`). Второй AI-канал — **чат внутри урока** (`ai.chat`, RAG по контенту урока) — **не персистит вообще ничего**: процедура зовёт `generateChatResponse` и возвращает ответ, в БД не пишет. Модель `ChatMessage` в схеме есть, но **дормантная (0 строк, никто никогда не писал)**. → У owner нет сквозного понимания, пользуются ли AI-функциями вообще и где промахи.

## Цель

1. **Начать персистить чат в уроках forward-only** (истории нет — бэкафилл невозможен, подтверждено; важно, чтобы данные копились с этого момента).
2. Дать **сквозную картину AI-запросов** в аналитике: drawer-ассистент + чат-в-уроках вместе, с сигналами качества чата (доля «нет ответа» → сигнал к RAG-покрытию уроков).

**Не-цели (v1, бэклог):**
- Ретро-бэкафилл истории чата (её физически нет).
- Полный вьюер диалогов чата целиком.
- Объединение «один юзер across surfaces» в единый граф активности.

## Текущее состояние (verified)

- **`packages/api/src/routers/ai.ts` `chat` procedure** (`chatProcedure`, наследует `protectedProcedure` → `ctx.user.id` доступен): `.mutation` зовёт `generateChatResponse(lessonId, message, history)` и возвращает `{ content, sources, model }`. **Ничего не пишет в БД.**
- **`generateChatResponse` (`packages/ai/src/generation.ts`)** возвращает `GenerationResult { content, sources: SourceCitation[], model }`. `sources` = цитаты из найденных чанков (`relevantChunks`); при пустом первом проходе есть fallback `threshold:0` (recall-fix). Явного флага «нет ответа» НЕТ — выводим из `sources.length` + фразы-отказа.
- **`ChatMessage` (schema.prisma:449)** — дормантная: `id, userId, lessonId, role (MessageRole), content, createdAt`, FK на `UserProfile`, `@@index([userId, lessonId])`. **0 строк на проде** (проверено). Не путать с `ai/src/generation.ts` `interface ChatMessage {role,content}` — это тип истории для LLM, не модель БД.

## Часть 1 — Персист чата в уроках

### Схема (единственная миграция, additive, на пустой dormant-таблице)

Добавить в `ChatMessage` 3 nullable/default-колонки (для сигналов качества на `assistant`-строке):

```prisma
model ChatMessage {
  id          String      @id @default(cuid())
  userId      String
  lessonId    String
  role        MessageRole
  content     String
  model       String?     // модель ответа (assistant-строка)
  sourceCount Int?        // число RAG-цитат (assistant-строка); 0 = нет грундинга
  noAnswer    Boolean     @default(false) // assistant не нашёл ответ (эвристика)
  createdAt   DateTime    @default(now())
  user        UserProfile @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, lessonId])
  @@index([createdAt])   // для дневных агрегатов аналитики
}
```

**Применение миграции:** через Supabase Mgmt API (additive-only, паттерн `reference_supabase_migration_via_mgmt_api.md`) — `ALTER TABLE "ChatMessage" ADD COLUMN ...` × 3 + `CREATE INDEX ... "ChatMessage"("createdAt")` + запись в `_prisma_migrations`. Таблица пустая → нулевой риск. **НЕ** `prisma db push`.

### Запись в `ai.chat` (best-effort, hot path)

После `generateChatResponse`, до `return`, обёрнутая в `try/catch` (ошибка записи НЕ ломает и НЕ задерживает ответ юзеру — best-effort, паттерн лидов/CQ):

- **user-строка:** `{ userId: ctx.user.id, lessonId, role: 'user', content: message }`.
- **assistant-строка:** `{ userId, lessonId, role: 'assistant', content: result.content, model: result.model, sourceCount: result.sources.length, noAnswer }`.
- `noAnswer = result.sources.length === 0 || isRefusalAnswer(result.content)`.
- `isRefusalAnswer` — pure-хелпер, матчит известные фразы-отказа («в этом фрагменте урока ответа нет», «ответа нет в контексте», «не удалось сгенерировать ответ» и т.п., case-insensitive). Эвристика, комментарий в коде. Юнит-тестируется отдельно.
- Обе вставки — один `createMany` (2 строки) для атомарности/дешевизны. `createdAt` дефолтный.

**Гоча:** `ctx.user.id` — мутация сейчас его не читает (использует только `input`). Добавить деструктуризацию `ctx`. Оставить возврат `{ content, sources, model }` без изменений (контракт фронта не трогаем).

## Часть 2 — Аналитика: таб «AI-запросы»

Переименовать таб `/admin/analytics/assistant` label «Ассистент» → **«AI-запросы»** (href оставить `/assistant` — не ломаем ссылки/роут). Под тем же селектором периода. Тест-юзеры исключены везде (`ChatMessage.userId → UserProfile.isTest=false`, join как в ассистенте).

**Новый порядок секций на странице:**

1. **Сквозной топ-лайн (новая, сверху)** — суммарно за период: всего AI-запросов (assistant user-msgs + lesson-chat user-msgs) + разбивка по каналам (ассистент / чат-в-уроках) + график запросов/день по обоим каналам (две линии или стэк).
2. **Ассистент** — существующие 4 секции (Пульс/Качество/Спрос/Апселл), без изменений.
3. **Чат в уроках (новая)**:
   - KPI: запросов, уник.юзеров; график запросов/день.
   - **Качество:** доля «нет ответа» (`noAnswer=true` / все assistant-ответы) + доля «без источников» (`sourceCount=0`) — сигнал к RAG-покрытию.
   - **Топ уроков по числу вопросов** (group by `lessonId`, join `Lesson.title`, топ N).
   - **Последние «нет ответа»** — список последних N `noAnswer`-ответов: текст вопроса юзера (предыдущая user-строка того же `userId`+`lessonId`) + название урока + дата. Actionable: какие уроки не дотягивают.

### Процедуры (в `admin-analytics-assistant.ts` или новый `admin-analytics-lesson-chat.ts`, mount под `admin.analytics.assistant.*` или новый namespace)

- `getLessonChatPulse({from,to})` → KPI + `messagesByDay` (user-role по МСК-дню) + топ уроков.
- `getLessonChatQuality({from,to})` → noAnswer rate, noGrounding (`sourceCount=0`) rate.
- `getLessonChatUnanswered({from,to,limit})` → последние N `noAnswer` с текстом вопроса + `Lesson.title`.
- `getCrossCutting({from,to})` → суммарно + per-surface split (assistant user-msgs vs lesson-chat user-msgs) + daily по обоим. (Либо считать split на клиенте из getPulse+getLessonChatPulse — решить в плане; отдельная процедура чище для дневного совмещённого графика.)

### Пары «вопрос ↔ ответ» в чате

В `ChatMessage` НЕТ `conversationId` (в отличие от `AssistantMessage`). Диалог группируется по `(userId, lessonId)`. Для «последних нет-ответа» пара = `noAnswer` assistant-строка + непосредственно предшествующая user-строка того же `userId`+`lessonId` (`LATERAL`, `createdAt <= m.createdAt ORDER BY createdAt DESC LIMIT 1`). Аналог `getProblemMessages` ассистента.

## Переиспользование

Pure-утилы из аналитики ассистента (`packages/api/src/utils/assistant-analytics.ts`): `enumerateMskDays`, `fillDaySeries`, `computeQuality`, `mskDayKey`, `labelProblem` (или его вариант) — переиспользуем. Новый pure-хелпер `isRefusalAnswer` — в `packages/ai/src/` (рядом с генерацией) или в утилах API; юнит-тест. Процедуры тонкие: raw SQL → pure fn.

## Тест-юзеры / приватность / безопасность

- Исключение тест-юзеров: join `UserProfile.isTest=false` во всех агрегатах.
- Секция «нет ответа» показывает текст вопросов юзеров (admin-only, как список промахов ассистента).
- Аналитика — только SELECT. Персист — `createMany` best-effort (не блокирует ответ).
- **Единственная запись-операция схемы** = additive-миграция на пустую `ChatMessage` (Mgmt API). Никаких `prisma db push`, никаких DDL на непустых таблицах.

## Тестирование

- Pure: `isRefusalAnswer` (фразы vs нормальные ответы), переиспользуемые утилы уже покрыты.
- Персист: юнит на маппинг результата → строки `ChatMessage` (noAnswer-логика, sourceCount). Best-effort try/catch не глотает баги в тестах (тестируем чистую функцию-строитель, вставку мокаем).
- `pnpm --filter web build` до деплоя (server-only-в-client).

## Деплой (стандарт)

staging build-gate `--no-cache web` → owner UAT → merge `--no-ff` master → прод `--no-cache web` + recreate + smoke. Миграция применяется до/при деплое через Mgmt API (additive, невидима старому коду). Откат: `git revert -m 1 <merge>` (колонки аддитивны, данные не трогаются; можно оставить колонки).

## Открытые вопросы к ревью спеки

- `getCrossCutting` отдельной процедурой или суммировать на клиенте? (склоняюсь к отдельной — нужен совмещённый дневной график).
- `noAnswer` эвристика фраз-отказа — достаточно ли `sourceCount=0` + короткий список фраз, или не ловить фразы вовсе в v1 (только `sourceCount=0`)?
