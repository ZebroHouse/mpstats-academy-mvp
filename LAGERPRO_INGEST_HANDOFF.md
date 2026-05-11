# LagerPro Ingest — Handoff to MAAL

**Date:** 2026-05-08
**From:** Academy Courses / LagerPro pipeline (E:/LagerPro)
**To:** MAAL (this repo)
**Status:** ✅ Production — 2299 new chunks in `content_chunk`, ready for retrieval

---

## TL;DR

5 курсов LagerPro (внешний автор) транскрибированы и залиты в общий RAG. В таблице `content_chunk` теперь живёт **на 2299 records больше** чем раньше:

- `source_type='external_course_lagerpro'`
- `trust_tier=2`
- `metadata->>course_id` ∈ {`diagnostika`, `immunitet`, `reklama`, `start`, `tovar`}

Это **первый non-academy источник** в общей БД. Sprint 2A фаза 55 (миграция `content_chunk` со столбцами `source_type` + `trust_tier`) был предусловием — он завершён, проверен через `verify-only`, upload прошёл чисто.

---

## Что MAAL должен поправить в Sprint 2B

### 1. Retrieval profiles — filter обязателен везде

Если ничего не менять, in-lesson assistant начнёт галлюцинировать ответами из LagerPro. Это противоречит идее `academy-strict` (см. `E:/Academy Courses/VISION_RAG_AGENT.md` §5).

**Минимальная защита (HARD REQUIREMENT для Sprint 2B):**

В коде retrieval, который используется in-lesson AI assistant и любым academy-only сценарием:

```typescript
// MAAL/packages/rag/src/retrieve.ts (или где у тебя сейчас RAG layer)
.eq('source_type', 'academy_audio')
// либо .in('source_type', ['academy_audio', 'academy_video_frame'])
```

**Без этого фильтра** in-lesson чат будет смешивать академические уроки с LagerPro — это конкретный риск ухудшения качества и потенциального юридического вопроса (см. §3 ниже про obfuscation).

### 2. Добавить retrieval-профили (рекомендация, не блокер)

Реализация по §5 `VISION_RAG_AGENT.md`:

| Profile | Filter | Use case |
|---|---|---|
| `academy-lesson` | `source_type='academy_audio' AND metadata->>lesson_id=?` | In-lesson AI assistant (текущий) |
| `academy-broad` | `source_type IN ('academy_audio', 'academy_video_frame')` | Свободный чат в академии |
| `agent-broad` | `valid_until IS NULL OR valid_until > now()` | Широкий агентный продукт (видит академию + LagerPro + будущие источники) |

`trust_tier` использовать как вес в ранжировании (tier 1 boost), не как hard filter — это сохранит академический приоритет для свободного чата.

### 3. ⚠️ Obfuscation policy для LagerPro

**Правило (жёсткое):**
LagerPro chunks нельзя цитировать с указанием источника. В user-facing ответе:
- **Не упоминать** "Слово малых", "LagerPro", автора, оригинальные русские названия курсов/модулей.
- **Синтезировать/парафразировать** знание, не вставлять прямые цитаты.
- На вопрос "откуда ты это знаешь" — отвечать про "внутренние материалы платформы", не называть LagerPro.

**Почему:** Контент собран из открытых источников, но лицензионного договора на атрибуцию нет. См. `E:/Academy Courses/EXTERNAL_COURSE_TRANSCRIPTION.md` §1.

**Что уже сделано на pipeline-стороне:**
- В `content_chunk.metadata` хранятся **только**: `course_slug='lagerpro'`, `course_id` (slug, не русское имя), `module_id` (slug), `topic_id` (slug), `lecture_order`, `lecture_filename` (ASCII).
- **Нигде в БД нет** имени автора, URL источника, оригинальных русских названий курсов/модулей/уроков.
- Так что MAAL не может случайно их раскрыть через retrieval — там просто нечего раскрывать.

**Что нужно проверить в MAAL:**
- LLM system prompt в свободном чате должен явно запрещать называть источник, если retrieved chunk имеет `trust_tier=2` или `source_type LIKE 'external_course_%'`. Лучше — добавить отдельный flag в контекст для LLM.
- Если в будущем добавишь human-readable course/lecture title в любой metadata field — он не должен попадать в LLM-промпт.

### 4. (Optional, не блокер) — Trust-aware ranking

Если просто бросить LagerPro в agent-broad без веса — академия и LagerPro будут конкурировать на равных. Это нормально для агентного продукта (LagerPro иногда полезнее по специфике WB чем академия), но если хочешь сохранить академический приоритет: добавь в SQL поле бустинга `score * (1 + (2 - trust_tier) * 0.3)` или подобное — tier 1 получит ×1.3, tier 2 ×1.0.

---

## Verification (можно проверить прямо сейчас)

```sql
-- Total
SELECT COUNT(*) FROM content_chunk WHERE source_type = 'external_course_lagerpro';
-- 2299

-- Per course
SELECT metadata->>'course_id' AS course, COUNT(*) AS chunks
FROM content_chunk
WHERE source_type = 'external_course_lagerpro'
GROUP BY metadata->>'course_id'
ORDER BY course;
-- diagnostika 394, immunitet 308, reklama 551, start 266, tovar 780

-- Sample (визуально проверить что русский, timecodes, метадата)
SELECT id, lesson_id, timecode_start, timecode_end, metadata, LEFT(content, 150)
FROM content_chunk
WHERE source_type = 'external_course_lagerpro'
ORDER BY random()
LIMIT 5;

-- Sanity: trust_tier consistency
SELECT trust_tier, COUNT(*)
FROM content_chunk
WHERE source_type = 'external_course_lagerpro'
GROUP BY trust_tier;
-- 2 | 2299  (ровно одна строка, tier=2)
```

---

## Pipeline metrics (для context)

| Stage | Result |
|---|---|
| Lessons | 103/103 (0 failed) |
| Audio transcribed | 76.0 hours |
| Total chunks | 2,299 (avg 772 tokens) |
| Embedding model | openai/text-embedding-3-small (1536d) — same as academy |
| Cost | $0.031 total (embeddings only) |
| Whisper config | large-v3, float16, beam=5, word_timestamps, vad_filter — **identical to academy_audio**, so retrieval-quality is comparable |

Embedding модель и chunking config **те же что у академии** — это сознательно, чтобы embeddings были в одном vector space и HNSW retrieval работал кросс-источниково без перекалибровки.

---

## Что ещё впереди (для контекста Sprint 2B+)

Из `VISION_RAG_AGENT.md`:
- **Wave 2:** видео-кадры академии (`source_type='academy_video_frame'`) — отдельный пайплайн на стороне Academy Courses, не блокирует MAAL
- **Wave 4:** auto-refresh оферт WB/Ozon (`marketplace_offer_*`, trust_tier=3) — потребует от MAAL поддержку `valid_until` колонки для версионирования
- **Wave 5:** публичный `/v1/query` endpoint — отдельный сервис, MAAL не трогает

LagerPro = первый и пока единственный внешний источник. Остальные waves — на потом.

---

## Контакты / референсы

- Pipeline scripts: `E:/LagerPro/_workspace/scripts/`
- Pipeline log: `E:/LagerPro/UPLOAD_LOG.md`
- Pipeline plan: `E:/LagerPro/TRANSCRIPTION_PLAN.md`
- External-course spec (для будущих внешних курсов): `E:/Academy Courses/EXTERNAL_COURSE_TRANSCRIPTION.md`
- Architecture vision: `E:/Academy Courses/VISION_RAG_AGENT.md`
- Owner: Zebrosha (zebrosha@gmail.com)
