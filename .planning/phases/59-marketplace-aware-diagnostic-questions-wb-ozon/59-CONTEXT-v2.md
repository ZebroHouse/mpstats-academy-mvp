---
phase: 59-marketplace-aware-diagnostic-questions-wb-ozon
version: 2
supersedes: 59-CONTEXT.md (LLM-generation premise)
date: 2026-06-01
---

# Phase 59 CONTEXT v2 — Methodology Pivot to Static Deck

## What changed (2026-06-01)

Команда методологов вместо LLM-генерируемого банка вопросов подготовила **30 готовых вопросов**:
- **15 WB-вопросов** (Q1-Q15) — `methodology-decks/doc-1-wb.md`
- **15 Ozon-вопросов** (Q16-Q30) — `methodology-decks/doc-2-ozon.md`

Структура каждой колоды: 5 компетенций × 3 уровня сложности.
- Оси (axes): Аналитика → `ANALYTICS`, Маркетинг → `MARKETING`, Контент → `CONTENT`, Операции → `OPERATIONS`, Финансы → `FINANCE`
- Уровни (levels): 1 (Новичок) / 2 (Средний) / 3 (Опытный)

**Источники правды:**
- `.planning/phases/59-.../methodology-decks/doc-1-wb.md` (parsed MD)
- `.planning/phases/59-.../methodology-decks/doc-1-wb-raw.json` (Google Docs API JSON)
- `.planning/phases/59-.../methodology-decks/doc-2-ozon.md`
- `.planning/phases/59-.../methodology-decks/doc-2-ozon-raw.json`

## Live decisions (D-* numbering supersedes v1)

| ID | Decision | Rationale |
|----|----------|-----------|
| D-V2-01 | Static deck of 30 questions = единственный источник вопросов в `startSession` для marketplace-aware пути. LLM-генератор (`generateDiagnosticQuestions`, `QuestionBank` таблица) остаётся в коде, но не вызывается из runtime. | Методологи дают предсказуемый, ревьюируемый контент. LLM-путь dormant — может пригодиться позже. |
| D-V2-02 | Хранение: TypeScript-константа `packages/api/src/diagnostic/static-deck.ts`, типизированный экспорт `STATIC_DECK: { wb: StaticQuestion[]; ozon: StaticQuestion[] }`. | Owner pick: typecheck + PR review + no DB roundtrip. |
| D-V2-03 | Длина диагностики — **15 вопросов** для всех типов юзеров (WB-only, Ozon-only, BOTH). | Предсказуемый UX, сравнимый score-вектор. |
| D-V2-04 | BOTH-юзер: для каждого из 15 (axis, level) слотов детерминированно выбираем WB или Ozon через seeded RNG, с условием суммарного баланса 7-8 от каждого MP. | Все 5×3 оси/уровни покрыты, длина та же. |
| D-V2-05 | Правильный ответ в исходнике — всегда option A (индекс 0). На уровне презентации шаффлим опции через seedable RNG (seed = `sessionId + questionId`). После шаффла `correctIndex` = позиция, куда уехал исходный индекс 0. | Юзер не может угадать по позиции; reproducible при F5; scoring работает на уже-сдвинутом `correctIndex` без изменения `submitAnswer`. |
| D-V2-06 | Persist shuffled questions в `DiagnosticSession.questions` (Json) как и раньше — `submitAnswer` читает оттуда, его не трогаем. Шаффл happens в `startSession` до записи. | Минимум изменений в hot path. Уже работающий scoring остаётся. |
| D-V2-07 | Phase 58 helper `computeEffectiveMarketplaces` переиспользуется (без дубля). Пустой/невалидный `userMarketplaces` → fallback `['WB','OZON']` → BOTH-логика. | Phase 58 backfill уже выставил `{WB,OZON}`-only на ~200 юзерах, но defense-in-depth для legacy/anon. |
| D-V2-08 | Бейдж «Про Wildberries / Про Ozon» на карточке вопроса (из 59-02) показываем **всегда** для BOTH-юзера (на каждом вопросе помечен `marketplace`), для single-MP юзера НЕ показываем (нет смысла — все вопросы одного MP). | Уже сделано в 59-02 для mix-users; меняем только когда BOTH = true. |
| D-V2-09 | `pa_diagnostic_pool_size` в CarrotQuest (из 59-02) теперь всегда = 15 (или 30 для BOTH если выберем вариант A, но мы выбрали B). Лид-проп остаётся в коде, но станет константой `15`. | Сохраняем для совместимости с CQ-дашбордом. |
| D-V2-10 | Плана 59-03 (Google Sheet tagger) и 59-04 (prod DELETE + prewarm) **выкидываются полностью**. Контент готов, банк не нужно генерировать, DELETE не нужен (можем оставить таблицу `QuestionBank` пустой или с устаревшими данными — не используется). | Методология сменилась — старые планы беспредметны. |

## Что осталось из v1 (валидно)

- **D-01..D-07 (v1)** про marketplace-тэг на типе `DiagnosticQuestion`, zod-схему, prompt и мок-тегирование — реализовано в плане 59-01, остаётся в коде.
- **CQ-событие `pa_diagnostic_completed` + lead props** (59-02) — остаётся.
- **`getQuestionsFromBank` marketplace-filter** (59-02) — остаётся как fallback, но primary path теперь static-deck.

## Carry-over from Phase 58 (на проде)

- `UserProfile.marketplaces: string[]` ⊆ `{WB, OZON}` (backfilled)
- `computeEffectiveMarketplaces([])` → `['WB','OZON']`
- Wizard step 2 → 2 опции (WB, Ozon, multi-select)
- `Job.marketplace` фильтр на джобах — отдельная история, **не трогаем**

## New plans

- **59-03** — Static deck + balanced picker + seeded option shuffle (pure utilities, fully testable, `autonomous: true`)
- **59-04** — Wire static-deck path into `diagnostic.startSession`, retire LLM-bank call, update tests, ensure BOTH-юзер UX (always-show badge) (`autonomous: true`)

(Old 59-03 «Google Sheet tagger» и 59-04 «prod DELETE» — archived, see `_archive/v1-plans/`)
