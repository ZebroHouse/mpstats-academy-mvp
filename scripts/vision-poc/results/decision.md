# Phase 55 Sprint 1 PoC — Decision

**Date:** 2026-05-07
**Verdict:** ✅ **GO Sprint 2 (Pilot)**

## SC Results

| # | Критерий | Verdict | Детали |
|---|---|---|---|
| **SC1** | pipeline works | ✅ PASS | Все 4 скрипта (select / extract / vlm / ocr) + analyze отработали без ошибок на 3 видео. 81/81 VLM calls, 27/27 OCR calls. |
| **SC2** | frames extraction sane | ✅ PASS | short=7 / medium=10 / long=10 (после adaptive cap). Cap 120 не активировался. |
| **SC3** | cost extrapolation | ⚠ ACCEPTABLE | gpt-4.1-mini: $0.0394 на 27 кадров → ~$17.5 на full pass (12K кадров). Roadmap-прикидка $5-13 — превышение в 1.4x от верхней границы. Принято: качество оправдывает. |
| **SC4** | best-model halluc ≤20% | ✅ PASS | gpt-4.1-mini: **3.7%** (1.0/27 халц по моей разметке) — большой запас до порога. |
| **SC5** | OCR vs VLM | **VLM-only** | OCR: 0/10 на URL, ~50% на числах. VLM: 9/10 URL, ~95% числа. **Tesseract удаляется из Sprint 2 pipeline** — упрощение архитектуры. |
| **SC6** | downstream-acceptable accuracy | ✅ PASS | **87.5%** (15Y / 5P / 0N из 20 questions, gate 70%) — заполнено product owner'ом 2026-05-07. См. `mila-package/checklist.md`. |

## Why we skipped Mila for SC6

Изначальный план привлекал тестера Милу для оценки accuracy на 20 вопросах. По обсуждению 2026-05-07 решили **скипнуть** Милу в Sprint 1 потому что:

1. **Дублирование** — я (Claude) уже прошёл 27 кадров с разметкой галлюцинаций (объективная оценка extraction quality). Мила бы делала то же на тех же артефактах без нового сигнала.
2. **Нерелевантный контекст** — Mila's value-add это **domain expertise при тестировании реальных Q&A на live ассистенте**. В Sprint 1 vision не интегрирован в прод, тестировать нечего, она бы оценивала extraction в вакууме.
3. **Когда нужна Мила** — Sprint 2 Pilot на 87 уроках с подключённым vision-RAG: реальный Q&A flow, реальные пользовательские сценарии, domain-проверка.

Чек-лист заполнен product owner'ом — он принимающая сторона по «достаточно ли качества для Sprint 2», и его accept в 87.5% — тот самый сигнал который нужен для GO.

## Selected Model

**Победитель:** `openai/gpt-4.1-mini`

**Обоснование:**
- Lowest hallucination rate: **3.7%** vs 5.6% (Gemini 3.1 Lite preview) vs 14.8% (Gemini 2.5 Lite)
- **Best на сложных таблицах и UI:** Gemini 2.5 Lite **систематически фабриковал числа** на нагруженных кабинетах MPSTATS / Telegram чатах — а это ровно тот use-case который phase 55 закрывает
- Best-frame counts: gpt-4.1-mini=10, gemini-2.5=9, gemini-3.1=8 (но gemini-2.5 побеждает только на простых talking-head слайдах, где tie-breaker = «cheapest»)
- Прогноз стоимости full-pass (~12K кадров платформы): **~$17.5** — за пределами roadmap-прикидки, но обоснованно: экономия $12 на дешёвом Lite не оправдывает отвечать юзеру выдуманными числами

## Rejected Candidates

- **`google/gemini-2.5-flash-lite`** ($0.012 на 27 кадров → ~$5 full pass): hallucination 14.8% — высокий риск систематически врать на UI-кадрах. Использует JSON-парсинг fail rate 1.2% (1/81). **Отвергнута на качество.**
- **`google/gemini-3.1-flash-lite-preview`** ($0.026 на 27 кадров → ~$11 full pass): hallucination 5.6%. Близко к gpt-4.1-mini, лучше всех ловит tabs/tools при множественных, но **preview-статус** означает риск deprecation/rate-limit/цены. Для production ingest это нестабильно. **Отвергнута на статус preview.**
- **Tesseract OCR**: 0/10 на URL, ~50% на числах. **Дропается из Sprint 2 pipeline** — VLM сам справляется с OCR-задачей на современных моделях.

## Architecture Lessons

| Lesson | Что применить в Sprint 2 |
|---|---|
| **Scene-detect 0.3 не работает на screen-recording лекциях** | Используем **fixed-interval 60s** как baseline. Adaptive cap 120 кадров остаётся защитой для мульти-часовых воркшопов. |
| **OCR-fusion избыточна** — VLM сам справляется с URL/числами | **Удаляем tesseract** из Sprint 2 pipeline. Один источник вместо двух — проще архитектура, меньше кода. Cost saving symbolic. |
| **Promt v1 ловит ~85% числовой точности на таблицах** | Sprint 2: добавить в промпт явные правила для plot-tables («если виден диапазон цен с ₽, проверь множитель», «при наценке без явной валюты не дописывай ₽»). |
| **Audio-only данные (имя спикера, объявления акций) — вне scope frame-chunks** | Mixed retrieval (5 transcript + 3 frame) уже планируется. Sprint 2 проверит что transcript chunks подтягиваются параллельно. |
| **Workshop 1ч45м даёт 105 кадров на 60s интервале** | Sub-sample не активировался. Для платформы с ~440 уроками средней 30 мин — медиана будет ~30 кадров/урок, 90-pct ~150 (длинные воркшопы). Реальный full pass: **~12K кадров, не 20K** (упрощённая оценка из roadmap была завышена). |
| **JSON parse failure rate 1.2%** | Sprint 2 нужен retry при parse failure (один re-attempt с явной просьбой «верни строго JSON»). |

## Cost Reality Check

Roadmap-прикидка Phase 55 (2026-05-05): **«<$10 единоразово на всю платформу + ~$0.05 на каждый новый урок»**.

После PoC реальная цифра на gpt-4.1-mini: **~$17.5 на полный пасс**, ~$0.04-0.05 на новый урок (зависит от длительности).

- Full-pass превысил оценку в 1.75x — пересмотрим бюджет в Sprint 2 spec на $20 floor
- Per-lesson цена попадает в роадмеп-прикидку точно

Это всё ещё в zoom очень дёшево относительно value: ~$17 единоразово, чтобы все 440 уроков научились отвечать про экран.

## Next Steps

- [x] Sprint 1 завершён, артефакты закоммичены, gate decision зафиксирован
- [ ] Открыть PR ветки `phase-55-sprint-1-poc` в master (артефакты должны быть в репо как доказательство решения)
- [ ] **Sprint 2 (Pilot)** — отдельный спек `docs/superpowers/specs/2026-05-07-phase-55-sprint-2-pilot-design.md`. Scope:
   - Schema migration: `content_chunk.source_type` enum + `frame_url` + metadata
   - Production-grade extract+VLM pipeline (gpt-4.1-mini, без tesseract)
   - Embedding (text-embedding-3-small) + INSERT в Supabase
   - Mixed retrieval update (`packages/ai/src/retrieval.ts`)
   - Context builder для кадров (`packages/ai/src/generation.ts`)
   - **Pilot на 1 курсе (`03_ai`, 87 уроков)** — Мила здесь подключается с реальным Q&A на live ассистенте
   - Gate: ≥70% accuracy на новом контрольном датасете от Милы → Sprint 3 (Production)
- [ ] **Sprint 3 (Production)** — full pass на всех ~440 уроках + интеграция в auto-ingest нового урока + UI tooltip с превью кадра + удаление дисклеймера в чате

## Artifacts Inventory

- `docs/superpowers/specs/2026-05-06-phase-55-sprint-1-poc-design.md` — спек
- `docs/superpowers/plans/2026-05-06-phase-55-sprint-1-poc.md` — план
- `scripts/vision-poc/{config,select-videos,extract-frames,run-vlm,run-ocr,analyze}.ts` — pipeline scripts
- `scripts/vision-poc/prompts/frame-describe.txt` — VLM промпт v1
- `scripts/vision-poc/results/comparison.md` — ручной анализ 27 кадров × 3 моделей
- `scripts/vision-poc/results/mila-package/{instructions,checklist}.md` — пакет валидации (заполнено product owner)
- `scripts/vision-poc/results/decision.md` — этот файл

Gitignored (бинарные/служебные, локально на машине):
- `scripts/vision-poc/results/frames/` — 27 JPEG, ~3 МБ
- `scripts/vision-poc/results/{selected-videos,frames-manifest,vlm-runs,ocr-runs}.json` — raw debug data
- `scripts/vision-poc/tessdata/` — eng/rus traineddata (~7.7 МБ)

Throwaway-папка `scripts/vision-poc/` будет архивирована/удалена после Sprint 3.
