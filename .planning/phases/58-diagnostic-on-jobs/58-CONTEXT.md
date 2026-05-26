# Phase 58: Diagnostic on Jobs — Context

**Gathered:** 2026-05-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Диагностика рекомендует **целые джобы (плейбуки)** на основе 5-axis weakness-профиля вместо россыпи отдельных уроков. Экран результатов отдаёт top-3 джобы в явном порядке с bulk-CTA «Добавить все в трек». `learning.getRecommendedPath` строит путь из `JobLesson[]` через `addedJobs[]`. Перепрохождение диагностики мержится с уже добавленными вручную плейбуками (union, не overwrite). Легаси юзеры на flat-формате `LearningPath` автоматически переводятся на job-aware sectioned-формат при первом визите на `/learn/track`, прогресс по урокам и кастомные ручные добавления сохраняются.

</domain>

<decisions>
## Implementation Decisions

### Matching Algorithm (диагностика → джобы)

- **D-01:** Матчинг строится на `Job.axes` (canonical-5), НЕ на `Job.skillBlocks` и НЕ на Track B `intent.resolve`. Причина: `diagnostic.ts` уже выдаёт weakness-профиль по 5 осям через `getRecommendedLessonsFromGaps`, сигнал готов и не требует перепроектирования вопросов или LLM-вызовов. `skillBlocks`-матчинг и `intent.resolve` зарезервированы как future enhancement.
- **D-02:** Определение «слабая ось» + ранжирование джоб — **гибрид top-N + weighted score**:
  - Берём **top-2 оси с худшим `correctRate`** (всегда даёт результат, даже у юзера с хорошим профилем). Magic-порога вида `< 0.6` не вводим.
  - **Job score = Σ (1 − correctRate)** по пересекающимся осям (`Job.axes ∩ weakAxes`). Джоба `axes=[FINANCE, ANALYTICS]` для юзера слабого в обеих побеждает однооcевую джобу.
  - Tiebreaker — `Job.id ASC` (детерминированно).

### Recommendation Count + UI

- **D-03:** Экран результатов диагностики показывает **top-3 джобы с явным порядком 1-2-3** (нумерация на карточках, «начни с этого плейбука»). Не top-1, не top-N по порогу — три карточки баланс между выбором и фокусом.
- **D-04:** CTA-композиция: **одна большая кнопка «Добавить все 3 в трек»** сверху + **per-card «+ В трек» toggle** на каждой карточке (паттерн из Phase 57 `/learn/job/[slug]`). После bulk-add — редирект на `/learn/track`.
- **D-05:** Карточка джобы на экране результатов = `/learn/job/[slug]`-карточка из Phase 57 (тот же компонент `JobDetail`-summary). НЕ изобретаем новый layout.

### Legacy LearningPath Migration (~170 flat-format users)

- **D-06:** Стратегия — **auto-rebuild при первом визите на `/learn/track`**. `learning.getRecommendedPath` детектирует flat-format (`Array.isArray(parsed)`) → читает последний `DiagnosticResult` юзера → запускает Phase 58 matching → записывает sectioned-format + `addedJobs[]` → отдаёт ответ. Юзер не видит UI-промпта, переход прозрачный.
- **D-07:** **Жёсткая гарантия 1: `LessonProgress` НЕ ТРОГАЕМ.** Это отдельная таблица, прогресс по урокам сохраняется автоматически независимо от формы `LearningPath`.
- **D-08:** **Жёсткая гарантия 2: уроки, которые юзер добавил руками поверх AI-рекомендаций**, при auto-rebuild **мигрируют в `'custom'`-секцию нового sectioned-формата**. Детекция: сравнить старый flat `lesson IDs` с тем, что выдаёт текущий matching для последнего `DiagnosticResult` — разница и есть «ручные добавления». Если detection ненадёжен — fallback: класть ВСЕ старые `lessonIds` в `'custom'` (избыточно, но безопасно).
- **D-09:** Если у юзера нет `DiagnosticResult` (теоретически невозможно при flat-format, но защитимся) — оставляем как есть, не падаем. `LearningPath` продолжает работать через старую flat-ветку в `learning.ts:391-424`.

### Re-diagnostic Merge Strategy

- **D-10:** Перепрохождение диагностики использует **union-merge**: `addedJobs[] = Array.from(new Set([...previous, ...newRecommended]))`. Старые ручные/AI-добавленные плейбуки сохраняются, новые рекомендации просто добавляются. Юзер сам убирает лишнее через «Убрать из трека» (`learning.removeJobFromTrack`).
- **D-11:** На экране результатов перепрохождения карточки джоб, **уже находящиеся в треке** (`isInTrack: true`), показывают маркер «В треке ✓» (зелёный — re-use Phase 57 marker), их кнопка «+ В трек» disabled или скрыта. Bulk-CTA «Добавить все 3» добавляет только те, что ещё не в треке.

### Claude's Discretion

- Точная форма ranking-tiebreaker'а (id ASC vs lessonCount DESC vs marketplace-предпочтение из onboarding) — планировщик выберет на основе тестов.
- Дизайн нумерации 1-2-3 на карточках (бейдж, рамка, цвет) — UI-уровень, ui-phase или иплементация по образцу Phase 57.
- Размер popup'а / редирект-времени после bulk-add — мелкая UX-полировка.
- Точное место в коде, где детектится flat-format и запускается auto-rebuild (в роутере `learning.ts` или в отдельной утилите) — планировщик решит.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 57 (foundation Phase 58 строится поверх)

- `docs/superpowers/specs/2026-05-18-library-redesign-design.md` — Дизайн Phase 57. §3 модель сущностей (Job, JobLesson), §4 схема `Job` (axes/skillBlocks/embedding), §8 мост к диагностике, §11 явно говорит «Phase 58 — отдельный спек».
- `.claude/memory/project_phase57_library_redesign.md` — ship-лог Phase 57: что в проде, какие миграции применены, PR #8/#9 разница.
- `packages/db/prisma/schema.prisma` — модели `Job`, `JobLesson`, `LearningPath.addedJobs Json`, `Lesson.isHidden`, `LessonProgress`. Канонический источник схемы.

### Track B (опциональный потребитель в будущем, не для Phase 58 MVP)

- `docs/superpowers/specs/2026-05-20-agentic-search-design.md` — `intent.resolve` движок. Не используется в Phase 58 по решению D-01, но архитектура «свободный текст → джобы» зафиксирована тут.
- `.claude/memory/project_track_b_agentic_search.md` — ship-лог Track B, в т.ч. broad-query detector и hallucination guardrail (паттерн для будущих job-ranking улучшений).

### Текущая диагностика — реализация для refactor

- `packages/api/src/routers/diagnostic.ts` — текущая логика. Ключевые функции для Phase 58:
  - `submitResults` / `getRecommendations` — где меняем `recommendedLessons` → `recommendedJobs`.
  - `getRecommendedLessonsFromGaps` (~line 320+) — текущий axes-based matcher уроков, заменяется на job-matcher.
  - `CATEGORY_KEY_MAP` — маппинг `skillCategory` enum → canonical-5 axes-keys.
- `packages/api/src/routers/learning.ts` §line 277-424 — обе ветки `getRecommendedPath` (sectioned v2 и legacy flat). Место для auto-rebuild flat → sectioned (D-06).
- `apps/web/src/components/learning/AgentSearch.tsx` — subscribe-паттерн на `learning.getRecommendedPath` (для reactive isInTrack), reuse-able для экрана результатов диагностики.

### Платформенные правила

- `MAAL/CLAUDE.md` — секция «🚨 PROD DATABASE SAFETY». Любые DB-изменения в этой фазе должны идти через MAAL prisma schema only, без `--accept-data-loss`. Phase 58 — additive изменения тулинга только (`LearningPath.addedJobs[]` уже есть из Phase 57; новых колонок не предвидится).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`Job.axes` Json** — уже задекларировано в Phase 57 schema. 29 джоб засидены с `axes` из canonical-5. Готовое поле для матчинга.
- **`LearningPath.addedJobs Json`** + tRPC `learning.addJobToTrack`/`removeJobFromTrack` — добавлено в Phase 57 polish. Phase 58 переиспользует целиком; новые мутации не нужны.
- **`JobDetail` card** на `/learn/job/[slug]` — уже отображает «+ В трек» toggle с invalidate `getRecommendedPath`. Тот же компонент (или его summary-версия) идёт на экран результатов диагностики.
- **«В треке ✓» маркер** (зелёный) из Phase 57 / Track B hotfix `820c5b8` — отдельный от amber «Рекомендовано диагностикой». Применяется в Phase 58 при re-диагностике (D-11).
- **`getRecommendedLessonsFromGaps`** — функциональный паттерн «gap-driven recommendation». Phase 58 строит свой `getRecommendedJobsFromGaps` по аналогии.

### Established Patterns

- **5-axis weakness-профиль** уже считается в `diagnostic.ts` через `categoryScores[skillCategory]={correct, total}` → `correctRate`. Phase 58 НЕ переписывает scoring — только использует выход.
- **Sectioned `LearningPath` format `{ version: 2, sections: [{ id, lessonIds[] }] }`** — Phase 57 стандарт. `'custom'`-секция всегда сохраняется в `learning.ts:374` даже при empty. Phase 58 пишет sectioned-format при auto-rebuild.
- **tRPC + reactivity через `useUtils().learning.getRecommendedPath.invalidate()`** — Phase 57 паттерн для обновления UI после добавления в трек. Phase 58 экран результатов использует тот же подход.
- **`Lesson.isHidden` DB-level filter** на всех JobLesson includes (PR #9). Phase 58 наследует — рекомендованные джобы автоматически фильтруют скрытые уроки.

### Integration Points

- **`diagnostic.ts:843` (`recommendedPath: getRecommendedLessonsFromGaps(gaps, 5)`)** — основная точка замены: вместо россыпи уроков отдаём `recommendedJobs[]` со score'ами.
- **`learning.ts:391-424` (flat-format ветка `getRecommendedPath`)** — место для auto-rebuild trigger (D-06): детектируем `Array.isArray(parsed)` → пересобираем sectioned + addedJobs → инлайн ответ.
- **Экран результатов диагностики** (`apps/web/src/app/(main)/diagnostic/results/page.tsx` или аналог — уточнить при планировании) — UI-точка для top-3 карточек + bulk-CTA.
- **CarrotQuest эвенты**: при перепрохождении/auto-rebuild можно отстреливать `pa_diagnostic_completed` со свойствами `pa_recommended_jobs_count` — для аналитики конверсии. Не обязательно в MVP, отметить как nice-to-have для CQ-команды.

</code_context>

<specifics>
## Specific Ideas

- **«явный порядок 1-2-3»** на карточках top-3 — owner это подчеркнул как baseline UX-смысл («начни с этого»). Не cards-of-equal-weight.
- **«не паримся»** про edge-кейсы миграции у спящих юзеров — owner отметил, что большая часть базы уже не активна, поэтому стратегия миграции выбирается «как нам проще + не теряем прогресс активных», без сложного UX-промпта про восстановление.
- Phase 58 — про **«синхронизацию ментальной модели платформы»**: после Phase 57 (`/learn` на джобах) и Track B (поиск на джобах) диагностика всё ещё выдавала россыпь уроков — это раскалывало UX. Phase 58 закрывает эту дыру.

</specifics>

<deferred>
## Deferred Ideas

- **`Job.skillBlocks`-based matching** (32 блока, точнее канон-5) — требует перепроектирования вопросов диагностики или LLM-классификации свободных ответов в блоки. Большой скоуп, отложено. Возврат — если axes-matching на проде окажется недостаточно точным.
- **Track B `intent.resolve` интеграция в диагностику** — синтезировать фразу «помоги с финансами и аналитикой» из weakness-профиля и скормить в существующий движок. Альтернативный путь матчинга. Преимущество: переиспользует LLM+embedding-пайплайн. Цена: $0.001/вызов + зависимость от OpenRouter. Возврат — если потребуется ranking более «человеческого» вида с обоснованием.
- **Marketplace-aware ranking** (учёт `UserProfile.marketplaces[]` из Phase 56 онбординга при ranking джоб — WB-юзер не получает Ozon-only джобы наверх) — небольшое улучшение, добавить в next-итерации Phase 58 или future phase.
- **Diagnostic как лид-магнит (unauth flow)** — старая идея (`project_diagnostic_unauth_flow_idea.md`). Не блокирует Phase 58, но если будем делать — Phase 58 матчинг можно переиспользовать без auth.
- **Удаление возможности «+ Урок в трек»** (только джобы) — НЕ делаем. Ручные одиночные уроки сохраняются (D-08), пользователь может продолжать их добавлять.
- **UI-promo «Перепройди диагностику»** для юзеров после long inactivity — отдельный engagement-кейс.

### Reviewed Todos (not folded)

None — `gsd-sdk query todo.match-phase 58` вернул 0 совпадений.

</deferred>

---

*Phase: 58-diagnostic-on-jobs*
*Context gathered: 2026-05-26*
