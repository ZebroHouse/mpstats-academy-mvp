# Phase 58: Diagnostic on Jobs - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-26
**Phase:** 58-diagnostic-on-jobs
**Areas discussed:** Matching algorithm, Recommendation count + UI, Legacy migration, Re-diagnostic merge

---

## Matching Algorithm (диагностика → джобы)

| Option | Description | Selected |
|--------|-------------|----------|
| `Job.axes` (canonical-5) | Прямой матч по 5 осям, сигнал уже готов в diagnostic.ts | ✓ |
| `Job.skillBlocks` (32 блока) | Точнее, но требует перепроектирования вопросов диагностики — out of scope | |
| Гибрид axes-фильтр + score | Axes-фильтр + ranking по перекрытию | |
| Track B `intent.resolve` | Синтетический запрос → LLM-движок | |

**User's choice:** `Job.axes` — прямой матч по canonical-5.
**Notes:** Самый низкий риск. Сигнал готов в `getRecommendedLessonsFromGaps`, не требует перепроектирования вопросов или LLM-вызовов. `skillBlocks` и `intent.resolve` зарезервированы как future enhancement в Deferred Ideas.

---

## Ranking внутри axes-match

| Option | Description | Selected |
|--------|-------------|----------|
| Порог по доле ошибок + weighted score | weak axis = correctRate < 0.6, magic-порог | |
| Top-N слабых осей + ровный вес | top-2 хуже всех + ranking по перекрытию | |
| Гибрид: top-N по нехватке + ranking по весу | top-2 слабых + Σ(1−correctRate) | ✓ |

**User's choice:** «Бери наиболее подходящий для нас вариант» → Claude выбрал гибрид.
**Notes:** Гибрид всегда выдаёт результат (даже у юзера-отличника), weighted score даёт чёткое предпочтение multi-axis джобам без магических порогов. Tiebreaker — `Job.id ASC` (детерминированно).

---

## Recommendation Count + UI

| Option | Description | Selected |
|--------|-------------|----------|
| Top-3 с явным порядком 1-2-3 | Три карточки пронумерованы | ✓ |
| Top-1 + 2-3 вторичных | Главная карточка «Старт здесь» + альтернативы | |
| Top-3 равнозначных | Без явного порядка | |

**User's choice:** Top-3 с явным порядком.
**Notes:** Owner акцентировал «явный порядок 1-2-3 — начни с этого» как baseline UX-смысл.

---

## CTA-композиция «Добавить в трек»

| Option | Description | Selected |
|--------|-------------|----------|
| Bulk «Добавить все 3» + per-card «+ В трек» | Combo: один accelerator + per-card toggle | ✓ |
| Только «+ В трек» на каждой карточке | Без bulk-CTA | |
| Checkbox'ы по умолчанию выбраны + бот.кнопка | Возможность снять до bulk-add | |

**User's choice:** «Ты реши» → Claude выбрал combo.
**Notes:** Matches Phase 57 pattern на `/learn/job/[slug]` (per-card «+ В трек» уже работает). Bulk-CTA — accelerator для оптимального пути. После bulk-add — редирект на `/learn/track`.

---

## Legacy LearningPath Migration (~170 flat-format users)

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-rebuild при первом визите на /learn/track | Прозрачно для юзера | ✓ |
| Показать flat-трек + CTA «Обновить до плейбуков» | User-control | |
| Batch-migration скрипт всех при деплое | Big-bang | |

**User's choice:** Auto-rebuild + жёсткие гарантии сохранения прогресса и ручных добавлений.
**Notes:** Owner: «нам важно не потерять то что у него лежит в мои уроки, и прогресс по урокам». Малая активная база, большинство неактивны — делаем «как нам проще + не теряем прогресс активных», без сложного UX-промпта. Зафиксированы D-07 (LessonProgress не трогаем — отдельная таблица) и D-08 (ручные lessonIds мигрируют в `'custom'` секцию).

---

## Re-diagnostic Merge Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Union: новые рекомендации добавляются к addedJobs | Старые сохраняются | ✓ |
| Overwrite: addedJobs пересобирается с нуля | Старые ручные исчезают | |
| Явный выбор юзеру через попап | Гибко, но фрикция на редкий сценарий | |

**User's choice:** Union.
**Notes:** На экране результатов перепрохождения карточки джоб уже в треке показывают «В треке ✓» маркер (reuse Phase 57 Track B hotfix), bulk-CTA добавляет только новые.

---

## Claude's Discretion

- Точная форма ranking-tiebreaker'а (id ASC vs lessonCount DESC vs marketplace-предпочтение из onboarding) — планировщик выберет на основе тестов.
- Дизайн нумерации 1-2-3 на карточках (бейдж, рамка, цвет) — UI-уровень, ui-phase или иплементация по образцу Phase 57.
- Размер popup'а / редирект-времени после bulk-add — мелкая UX-полировка.
- Точное место в коде, где детектится flat-format и запускается auto-rebuild (в роутере `learning.ts` или в отдельной утилите) — планировщик решит.
- Fallback при auto-rebuild: если detection «ручных добавлений» ненадёжен — класть ВСЕ старые lessonIds в `'custom'` (избыточно, но безопасно).

## Deferred Ideas

- `Job.skillBlocks`-based matching (32 блока) — требует перепроектирования вопросов или LLM-классификации; future enhancement.
- Track B `intent.resolve` интеграция в диагностику — альтернативный путь матчинга через свободный текст; future.
- Marketplace-aware ranking (учёт `UserProfile.marketplaces[]` из Phase 56) — next-итерация Phase 58.
- Diagnostic как лид-магнит (unauth flow) — отдельная фаза, не блокирует.
- Удаление возможности «+ Урок в трек» — НЕ делаем, ручные уроки сохраняются.
- UI-promo «Перепройди диагностику» после long inactivity — engagement-кейс.
