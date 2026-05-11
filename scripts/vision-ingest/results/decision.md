# Phase 55 Sprint 2B — Vision Pilot Decision

**Дата:** 2026-05-07 (pipeline) / 2026-05-11 (smoke + verdict)
**Ветка:** `phase-55-sprint-2`
**Verdict:** **GO Sprint 2C + model switch** — после RETRY (фиксы A1-A3+B1+B2) и model swap эксперимента: переключение `OPENROUTER_DEFAULT_MODEL` на `openai/gpt-4.1-mini` даёт 84% accuracy (выше порога 70%) при ×1.5 цены от nano. Архитектура Sprint 2 (foundation + vision pipeline + few-shot) подтверждена. См. секцию «RETRY Results» ниже.

---

## Success Criteria

| SC | Criterion | Status | Evidence |
|----|-----------|--------|----------|
| SC1 | Schema migration applied (`source_type`, `trust_tier`) | ✅ | Migration committed and applied to shared DB |
| SC2 | Profiles abstraction works | ✅ | 4/4 unit tests passing (`academy-lesson` profile) |
| SC3 | Frames pipeline ran on 10 lessons w/o errors | ✅ | 10/10 lessons processed; 185 frames extracted; 0 ffmpeg failures |
| SC4 | Phash dedup active | ✅ | 185 → 148 frames (20.0% reduction) |
| SC5 | Frame chunks stored in DB alongside audio | ✅ | 148 frame chunks + 5710 audio chunks = 5858 total |
| SC6 | Mixed retrieval surfaces frame chunks | ⚠ Partial | Frame chunks ловятся (mpstats.io URL ✓, KlingAI 5сек ✓, кастомный GPT редактор ✓), но vague visual queries без keyword-якорей пропускают frames (см. Q1 m04: "какие сервисы показаны" → галл MPSTATS+ChatGPT) |
| SC7 | Generation context distinguishes sources | ✅ | `buildContextWithSources` labels `[АУДИО]` vs `[ЭКРАН]`; 24/24 unit tests passing |
| SC8 | Q&A accuracy ≥70% on pilot checklist | ❌ 41% | Smoke на 3 уроках, 11 вопросов: 4 Y + 1 Partial + 6 N. Урок 4 (m01_intro_001) не прошёл — `lesson_hidden=true` (изменено 08-11.05) |
| SC9 | Total cost ≤$3 | ✅ | $0.2256 (VLM $0.2254 + embedding ~$0.0002) — **92% under budget** |

---

## Pipeline Metrics

| Метрика | Значение |
|---------|----------|
| Уроков обработано | 10 / 10 |
| Кадров извлечено (до dedup) | 185 |
| Кадров после phash dedup | 148 |
| Сокращение от dedup | 20.0% |
| VLM-запросов (gpt-4.1-mini) | 148 |
| VLM ошибок / parse-fails | 0 / 0 |
| VLM cost | $0.2254 |
| Embedding cost (148 × ~50 tok × $0.020/1M) | ~$0.0002 |
| **Total cost** | **$0.2256** |
| Кадров загружено в Supabase Storage (`lesson-frames`) | 148 |
| Frame chunks вставлено в `content_chunk` (`source_type='academy_video_frame'`) | 148 |
| Audio chunks (baseline) | 5710 |
| Total chunks в DB | 5858 |

---

## Per-Category Accuracy (Smoke 2026-05-11)

Smoke на 3 из 4 запланированных уроков (урок 4 hidden). 11 вопросов из 25 чеклиста.

| Категория | Y / Partial / N | Accuracy | Notes |
|-----------|-----------------|----------|-------|
| Cat 1 — URL/визуальное на экране | 1 / 0 / 2 | 33% | Точная mpstats.io ссылка с d1/d2 ✓; "какие сервисы показаны" в KlingAI-уроке → галл MPSTATS+ChatGPT ❌; "тайм-код переключения" → нет ответа ❌ |
| Cat 2 — Числа в таблицах/графиках | 1 / 0 / 1 | 50% | KlingAI длительность 5 сек ✓; выручка ниши Держателей (121 016 906 ₽ есть в frame @ 04:00) → "не указана" ❌ |
| Cat 3 — Названия инструментов/UI | 1 / 1 / 0 | 75% | Кастомный GPT редактор + DALL·E ✓; "3 инструмента помимо MPSTATS" → Wordstat правильно, Google Trends галлюцинация (в frames Google Sheets) |
| Cat 4 — Audio-only | — / — / — | n/a | Skipped — урок 4 hidden |
| Cat 5 — Mixed | 1 / 0 / 0 | 100% | Проект vs агент в ChatGPT — детальный правильный ответ, источники mixed (audio range + frame instant) ✓ |
| **Total (3 урока)** | **4 / 1 / 6** | **41%** | Ниже порога 70% |

---

## Architecture Observations (Smoke 2026-05-11)

**Что подтверждено работает:**
- Frame chunks физически в DB и retrieval их находит (источники с `MM:00 - MM:00` инстантовыми timecodes)
- Точные factual cites: URL-ы с query-параметрами (`mpstats.io/wb/item/463891248?d1=02.07.2025&d2=29.09.2025`), числа (5 секунд KlingAI), tools (DALL·E)
- Mixed контекст качественно синтезируется (проект vs агент — детальный ответ из audio range + frame instant)

**Что выявлено как баг:**
- **Vague visual queries без keyword-якорей пропускают frame chunks.** Q «какие сервисы показаны» в уроке про KlingAI → галлюцинация «MPSTATS и ChatGPT» вместо retrieval frame-чанков с RunwayML/KlingAI. Embedding модель видимо хуже мэтчит `[ЭКРАН @ MM:SS] описание...` чем audio chunks с теми же ключевиками
- **Visual hint в query игнорируется.** Добавление «на экране» в Q1b дало «нет информации» вместо буста frame source
- **Numbers retrieval слабый.** Выручка ниши есть в frame @ 04:00 (121 016 906 ₽), но retrieval не подтянул. Embedding не дружит с числовыми query
- **Hidden lesson в пилоте.** `m01_intro_001.isHidden` стал `true` между Task 8 (07.05) и smoke (11.05). Task 8's `resolveLessonId` SQL не фильтровал `isHidden=false`

---

## Decision Rationale

Pipeline mechanics работают (extract → dedup → VLM → embed → INSERT, 0 ошибок, $0.23). Foundation (Sprint 2A) и storage layer (Sprint 2B) подтверждены. Bottleneck — **retrieval ранжирование**: frame chunks теряют конкуренцию embeddingу audio когда query не содержит явных visual-якорей. Это блокирует core value proposition (вопросы про экран → ответы из экрана), поэтому **Sprint 2C на full 03_ai (87 уроков) преждевременен** — мы умножим текущую проблему на 8.7×.

Идём в **RETRY** с целевыми фиксами retrieval, потом повторный smoke на тех же 4 уроках по тем же 11 вопросам. Если ≥70% — GO Sprint 2C. Если <70% — пересматривать архитектуру (hybrid keyword+vector, OCR layer, separate frames index).

## RETRY Action Plan

| # | Фикс | Файл | Стоимость |
|---|------|------|-----------|
| A1 | Embed по `summary + extracted` без `[ЭКРАН @ MM:SS]` префикса. Content для генерации остаётся с префиксом. UPDATE 148 row embeddings. | `scripts/vision-ingest/embed-and-insert.ts` + повторный run | ~$0.0002 (повторный embed) |
| A2 | Hybrid retrieval: keyword detector (экран/ссылк/число/url/интерфейс/показ/выручк/инструмент) → lower threshold для frame chunks при match | `packages/ai/src/profiles.ts` или новый helper | 0 |
| A3 | System prompt усилить: «ОБЯЗАТЕЛЬНО цитируй ЭКРАН-источник если он в контексте и вопрос визуальный» | `packages/ai/src/generation.ts` | 0 |
| A4 | Task 8 `resolveLessonId` SQL: добавить `AND "isHidden" = false` в фильтр; перевыбрать пилотный урок взамен `m01_intro_001` | `scripts/vision-ingest/select-pilot-lessons.ts` + JSON refresh | 0 |
| A5 | `platformUrl` шаблон в JSON: `/learn/${id}` (single-segment) вместо `/learn/03_ai/${id}` | `select-pilot-lessons.ts` + JSON | 0 |

---

## RETRY Results (2026-05-11 evening)

### Round 1 — фиксы A1+A2+A3 + B1 prompt v2 + B2 few-shot
7 общих вопросов (m04+m07): test 1 = 36% → test 2/3/4 = 57-64%. Accuracy выросла ~+25% от base, но **застряла на 60-65%** — ниже порога 70%. Few-shot частично помог (Q9 ограничения GPT теперь точно цитируются), частично навредил (token leak MPSTATS в Q1). Capability ceiling **gpt-4.1-nano**.

### Round 2 — model swap experiments (headless smoke, 16 questions)

Тестировали 5 моделей на одних query+context (та же ветка, тот же prompt с few-shot, тот же retrieval):

| Модель | Accuracy 10q | Accuracy 16q | Avg latency | Max latency | Output $/1M |
|--------|--------------|--------------|-------------|-------------|-------------|
| gpt-4.1-nano (baseline) | 60% | — | 2-5с | 5с | $0.40 |
| **gpt-4.1-mini** ⭐ | **85%** | **84%** | **4-6с** | 9с | $0.60 |
| gpt-4.1 (full) | 85% | — | 2-5с | 5с | $8.00 |
| DeepSeek V4 Flash | 95% | **94%** | 17-37с | **68с** ❌ | $0.28 |
| Qwen3.6 35B A3B | 85% | — | 9-77с | 77с ❌ | $1.00 |
| Gemma 4 31B | — | — | — | — | unavailable on OpenRouter |

**Key findings:**

1. **DeepSeek V4 Flash** даёт лучший accuracy (94%) и дешевле mini, но latency 17-68с — **dealbreaker** для chat-UI (юзер уйдёт). Сильнее в reasoning (Q11 объясняет что значит каждое число, Q15 синтезирует «зачем» из audio + цифры с экрана).

2. **gpt-4.1-mini** — best UX trade-off: 84% accuracy, latency 4-6с, output cost $0.60. Сильнее DeepSeek в number-extraction (Q12 вытащил `121 016 906 ₽` точно — DeepSeek дал только название метрик).

3. **gpt-4.1 full** не оправдывает x13 цены — тот же 85% accuracy что mini.

4. **Qwen3.6 35B A3B** — latency unacceptable (77с на одном Q5).

### Production decision

**Switch `OPENROUTER_DEFAULT_MODEL` на `openai/gpt-4.1-mini`.**

Cost vs nano:
- nano: $0.10 in / $0.40 out per 1M
- mini: $0.15 in / $0.60 out per 1M
- **Ratio: x1.5** на обоих направлениях

Per-query estimate (≈1500 in + 200 out tokens):
- nano: $0.00023 / query
- mini: $0.00035 / query
- Delta: +$0.00012 / query → **+$1.20 per 10 000 queries** (negligible)

Accuracy +24% (60% → 84%). UX без регрессии (latency 4-6с vs nano 2-5с).

### Backlog (Phase 56 — RAG Quality v1.8+)

1. **Hybrid model routing** через `isVisualQuery()` (уже реализован в `packages/ai/src/profiles.ts`):
   - audio-only concept queries → nano (60% но достаточно для простых концептов, дёшево)
   - visual-mixed queries → mini (best UX)
   - explanatory queries требующие deep reasoning → DeepSeek V4 Flash с timeout 30с + fallback на mini
2. **Retrieval miss fix** на Q6-type (выручка ниши не попадает в top-8 даже с lower frame threshold)
3. **Query expansion** перед embedding: «выручка» → «выручка, оборот, продажи, ₽» — для лучшего semantic recall чисел

---

## Artifacts

- Selected lessons: `scripts/vision-ingest/results/selected-pilot-lessons.json` (10 lessons)
- VLM run results: `scripts/vision-ingest/results/vlm-runs.json` (148 frames, gitignored)
- Q&A checklist: `scripts/vision-ingest/results/pilot-qna-checklist.md` (25 questions)
- This decision: `scripts/vision-ingest/results/decision.md`
- DB state: 148 frame chunks + 5710 audio chunks in `content_chunk`
- Supabase Storage: 148 frames in `lesson-frames` bucket
- Cost: $0.2256 total (≤$3 budget)
