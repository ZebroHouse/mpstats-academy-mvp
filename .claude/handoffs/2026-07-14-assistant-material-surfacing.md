# Handoff — AI-ассистент: material-surfacing (реализация) + staging UAT концьержа

**Дата:** 2026-07-14
**Ветка:** `feature/ai-assistant` (worktree `.claude/worktrees/ai-assistant`)
**Для:** новой сессии — контекст текущей подсох.

---

## ⚠️ ГЛАВНОЕ: что НЕ протестировано

**Концьерж-слой v1.1 полностью РЕАЛИЗОВАН на этой ветке, но НЕ протестирован на staging.** Все юнит/typecheck зелёные (см. ниже), но живого UAT не было. Material-surfacing строится **поверх непроверенного концьержа**. → **Тестируем ВСЁ вместе на staging** после реализации материалов (не раньше).

Плюс **пендинг-гейт:** owner ещё **не вычитал карту концьержа** `packages/ai/src/assistant/concierge/platform-map.ts` (35 client-facing записей). Вычитку сделать до прод-релиза.

---

## Что уже сделано на ветке (готово, но не UAT'нуто)

### Концьерж-слой + хребет `category` (реализован в сессии 2026-07-13/14)
Spec: `docs/superpowers/specs/2026-07-13-assistant-concierge-design.md`
План: `docs/superpowers/plans/2026-07-13-assistant-concierge.md` (все 17 задач A1–D4 done, per-task + холистическое ревью пройдено)
- **Хребет:** `gate.ts` возвращает `category` (`material|platform_help|complaint|off_domain`); `inDomain` производный; аддит. колонки `AssistantMessage.category` + `navLinks` (миграция-скрипт `scripts/migrations/add-assistant-category.ts` — **ещё НЕ прогнан на БД**).
- **Движок концьержа** `packages/ai/src/assistant/concierge/`: карта-конфиг (35 записей, `platform-map.ts`) + committed вектора (`platform-map.embeddings.ts`), pure cosine top-K матчер (порог **0.40** откалиброван), grounded LLM-синтез (whitelist deep-links), живой резолвер каталога курсов, оркестратор. Промах → честный отказ + `/support`.
- **Фронт:** nav-карточка в `AssistantCards.tsx`, прокидка `navLinks` в `AssistantConversation.tsx`, FAQ `/support` из карты (`getFaqItems`).
- **Тесты на момент завершения:** typecheck 6/6, ai 106/106, api 414/414, web 408/409 (1 = известный yandex-oauth флейк, зелёный в изоляции).
- Инвентарь продуктовой поверхности (для карты): `docs/superpowers/plans/concierge-map-inventory.md`.

---

## Задача новой сессии: реализовать material-surfacing

**Spec:** `docs/superpowers/specs/2026-07-14-assistant-material-surfacing-design.md`
**План:** `docs/superpowers/plans/2026-07-14-assistant-material-surfacing.md` (13 задач, 4 фазы, TDD)

**Суть:** ассистент проактивно подмешивает материалы базы знаний (чек-листы/таблицы/памятки/презентации/сервисы) карточкой в `material`-ветке — по назначению. `Material.embedding` в БД, кап ≤2 + порог (анти-спам), гейтинг доступа по родительскому уроку (залочен → paywall).

**Как исполнять:** subagent-driven (как делали концьерж) — свежий coder-субагент на задачу + spec-ревью + quality-ревью. Фазы:
- **M-A** (ai): типы → `Material.embedding` схема+миграция+embed-скрипт → `searchMaterialsByEmbedding` → интеграция в пайплайн (material-only) → synthesize whitelist (кап 2).
- **M-B** (api): батч-резолвер доступа (`material-access.ts`, зеркало D-23 ACL) → миграция `materialIds` + роутер персист/гейтинг.
- **M-C** (web): карточка материала (open/download/locked) → прокидка в Conversation.
- **M-D**: калибровка порога (нужна БД с эмбеддингами → на staging) + холистика + staging UAT.

**Ключевые решения (не пере-обсуждать):** охват = материалы привязанные к урокам non-hidden; триггер проактивный только в `material`-ветке (не concierge/off_domain/complaint); гейтинг = показывать с учётом доступа (залочен → замок+`/billing`, URL не течёт); индексация в БД (не в репо); кап ≤2.

---

## Деплой / миграции (важно)

**ДВЕ группы аддитивных миграций прогоняются на staging ВМЕСТЕ, одним заходом, перед общим UAT:**
1. Концьерж: `scripts/migrations/add-assistant-category.ts` (`category` + `navLinks` на `AssistantMessage`).
2. Материалы: `scripts/migrations/add-material-embedding.ts` (`Material.embedding` + ivfflat index + `AssistantMessage.materialIds`).

Плюс **backfill эмбеддингов материалов**: `embed-materials.ts` по всем non-hidden материалам (embedding-only, дёшево).

Все миграции — через Supabase Mgmt API (`reference_supabase_migration_via_mgmt_api.md`, токен `SUPABASE_MGMT_TOKEN`). **Аддитивны, прод-коду до релиза невидимы.** НИКОГДА `prisma db push/migrate` против прод-БД.

**Staging-деплой:** по `.claude/memory/staging-workflow.md` (`git checkout feature/ai-assistant` на VPS → `docker compose -p maal-staging -f docker-compose.staging.yml up -d --build web` → content-check → `git checkout master` после). `ASSISTANT_ENABLED=true` только на staging.

**Прод (когда owner решит):** пакетом v1.0 + концьерж + материалы. merge `--no-ff` → master + прод-билд `--no-cache web` + флаг `ASSISTANT_ENABLED` отдельно. Откат: revert merge (миграции аддитивны, безвредны) / не включать флаг.

---

## Гочи

- **Worktree-дисциплина:** работать ТОЛЬКО в `.claude/worktrees/ai-assistant` (ветка `feature/ai-assistant`), все bash-команды `cd "<worktree>" && ...`, все пути абсолютные с сегментом `.claude/worktrees/ai-assistant/`. Main-tree `MAAL/` на ветке `feature/tochka-oauth-login` с битым residue `packages/ai/src/assistant/` → tsc/тесты оттуда дают ЛОЖНЫЕ TS2307. Субагенты в прошлой сессии несколько раз ловили эту гочу.
- **`feature/tochka-oauth-login` НЕ мержить** — residue ассистента (см. память `MEMORY.md`).
- **vitest TDZ:** моки через `vi.hoisted(() => ({...}))`, если `vi.mock`-фабрика ссылается на top-level const.
- **server-only в цепочке openrouter:** `packages/ai/vitest.config.ts` уже содержит `resolve.conditions:['react-server']` (добавлено в концьерж-сессии) — тесты, тянущие openrouter, работают.
- **Кириллица в API из Windows bash:** `node -e`/`tsx` с `fetch(...JSON.stringify())`, не `curl -d`.
- **Локальные ai-скрипты:** `NODE_OPTIONS=--dns-result-order=ipv4first npx tsx --conditions=react-server ...`; эмбеддинг требует `OPENROUTER_API_KEY` (в `MAAL/.env`, worktree сорсит из main-tree `.env`).
- **Материалы гейтятся по доступу к уроку** (D-23 ACL): материал доступен ⟺ ≥1 видимый родительский урок доступен. Реюз `isLessonAccessible`+`getUserActiveSubscriptions`+`getFirstJobLessonIds`+`getUserAdminBypass` (batched, без N+1). Образец — `material.getSignedUrl` (`packages/api/src/routers/material.ts:464`).
- **Favorite полиморфна** — `itemType:'MATERIAL'` поддерживается (сердечко на карточке материала).

---

## Стартовое сообщение для новой сессии (скопировать)

> Продолжаем AI-ассистента на ветке `feature/ai-assistant` (worktree `.claude/worktrees/ai-assistant`). Прочитай handoff `.claude/handoffs/2026-07-14-assistant-material-surfacing.md` — там всё. Кратко: концьерж-слой реализован но НЕ протестирован на staging; теперь реализуй **material-surfacing** по плану `docs/superpowers/plans/2026-07-14-assistant-material-surfacing.md` (subagent-driven TDD, как делали концьерж). После реализации — staging UAT концьержа + материалов ВМЕСТЕ (две группы миграций прогнать совместно). Owner-вычитка карты концьержа `platform-map.ts` — отдельный пендинг-гейт до прода. Начинай с Phase M-A Task MA1.
