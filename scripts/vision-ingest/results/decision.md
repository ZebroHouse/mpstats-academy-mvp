# Phase 55 Sprint 2B — Vision Pilot Decision

**Дата:** 2026-05-07
**Ветка:** `phase-55-sprint-2`
**Verdict:** TBD (pending owner Q&A — see SC6, SC8)

---

## Success Criteria

| SC | Criterion | Status | Evidence |
|----|-----------|--------|----------|
| SC1 | Schema migration applied (`source_type`, `trust_tier`) | ✅ | Migration committed and applied to shared DB |
| SC2 | Profiles abstraction works | ✅ | 4/4 unit tests passing (`academy-lesson` profile) |
| SC3 | Frames pipeline ran on 10 lessons w/o errors | ✅ | 10/10 lessons processed; 185 frames extracted; 0 ffmpeg failures |
| SC4 | Phash dedup active | ✅ | 185 → 148 frames (20.0% reduction) |
| SC5 | Frame chunks stored in DB alongside audio | ✅ | 148 frame chunks + 5710 audio chunks = 5858 total |
| SC6 | Mixed retrieval surfaces frame chunks | ⏳ TBD | Pending owner Q&A on staging/prod |
| SC7 | Generation context distinguishes sources | ✅ | `buildContextWithSources` labels `[АУДИО]` vs `[ЭКРАН]`; 24/24 unit tests passing |
| SC8 | Q&A accuracy ≥70% on pilot checklist | ⏳ TBD | Pending owner manual Q&A run (`pilot-qna-checklist.md`) |
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

## Per-Category Accuracy (TBD)

Заполняется после прогона `pilot-qna-checklist.md`.

| Категория | Кол-во | Accuracy | Notes |
|-----------|--------|----------|-------|
| Cat 1 — URL/визуальное на экране | 6 | — | — |
| Cat 2 — Числа в таблицах/графиках | 6 | — | — |
| Cat 3 — Названия инструментов/UI | 4 | — | — |
| Cat 4 — Audio-only концепции | 6 | — | — |
| Cat 5 — Mixed (audio + visual) | 3 | — | — |
| **Total** | **25** | — | — |

---

## Architecture Observations

Открытые вопросы для заполнения owner'ом после Q&A:

- Достаточно ли частоты семплирования 1 кадр / 60 сек для UI-демо такой динамики?
- Нужен ли OCR-слой поверх VLM (был исключён в Sprint 2A) для коротких URL/чисел, которые VLM может пропускать?
- Корректно ли retrieval ранжирует frame-чанки против audio-чанков, или нужна доменная балансировка?
- Достаточен ли префикс `[ЭКРАН]/[АУДИО]` для генератора, или стоит явно выводить тайм-код в контекст?
- Какие категории вопросов проседают сильнее всего (проблема извлечения, retrieval, генерации)?

---

## Decision Rationale

[TBD — fill after owner Q&A test]

---

## Artifacts

- Selected lessons: `scripts/vision-ingest/results/selected-pilot-lessons.json` (10 lessons)
- VLM run results: `scripts/vision-ingest/results/vlm-runs.json` (148 frames, gitignored)
- Q&A checklist: `scripts/vision-ingest/results/pilot-qna-checklist.md` (25 questions)
- This decision: `scripts/vision-ingest/results/decision.md`
- DB state: 148 frame chunks + 5710 audio chunks in `content_chunk`
- Supabase Storage: 148 frames in `lesson-frames` bucket
- Cost: $0.2256 total (≤$3 budget)
