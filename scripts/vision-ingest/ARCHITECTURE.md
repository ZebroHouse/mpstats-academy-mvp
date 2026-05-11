# Vision RAG — Architecture

**Status:** Sprint 2C shipped (89/440 lessons of `03_ai` indexed).
**Last updated:** 2026-05-11 (after Sprint 2C smoke verdict `decision-sprint2c.md`).
**Audience:** Engineers maintaining or extending the vision-RAG pipeline.

This document is the source of truth for *how the vision-RAG system works end-to-end*. Decision logs (`results/decision.md`, `results/decision-sprint2c.md`) cover *why* specific choices were made and what shipped — read them alongside this doc, not instead of it.

---

## 1. Overview & Goals

### What "vision RAG" is

Every lesson on `platform.mpstats.academy` is a 5–60 minute talking-head + screen-share video. Until Phase 55 the AI chat ("Спроси урок") only saw the **Whisper audio transcript** — so it could discuss what the speaker *said* but not what was *on screen*: dashboards, URLs, tables of numbers, tool icons, slide bullets.

Vision RAG closes that gap. At ingest time we:

1. Sample one frame every 60 seconds from the lesson's local MP4.
2. De-duplicate visually identical frames (long static slides → 1 frame).
3. Have a VLM (`gpt-4.1-mini` via OpenRouter) describe each remaining frame as JSON `{ summary, urls, numbers, tools, other }`.
4. Embed the textual rendering of that JSON with `text-embedding-3-small` (same model as audio chunks → one vector space).
5. Insert as a new row in `content_chunk` with `source_type='academy_video_frame'`, `trust_tier=1`, timecode = frame's PTS.

At query time the chat retrieval pulls both audio and frame chunks for the lesson, the prompt labels them `[АУДИО]` vs `[ЭКРАН]`, and a few-shot section of the system prompt teaches the LLM to ground numbers/URLs/tool names verbatim from `[ЭКРАН]` rows.

### Why frames, not audio-only

Three concrete user pain points motivated the phase:

- *"Какая ссылка показана на экране?"* — speaker often shows a URL but doesn't read it.
- *"Какая выручка у ниши на скрине?"* — numbers in MPSTATS dashboards are never spoken in full.
- *"Какие инструменты используются?"* — tool icons / app names visible but spoken once 10 minutes earlier.

Sprint 2 pilot (10 lessons) confirmed these become answerable. Sprint 2C smoke (18 questions across 6 lessons) hit 88.9% accuracy — pattern works.

### Non-goals

- We do **not** OCR frames as a separate step. The VLM does both "describe" and "extract on-screen text" in one call. OCR was tried and dropped in Sprint 2 (see `decision.md`).
- We do **not** stream-process video. Pipeline is offline batch, run from owner's PC against local MP4s in `E:/Academy Courses/`.
- We do **not** version frame chunks. Re-running the pipeline `UPSERTs` by chunk id.

---

## 2. Data Flow

```
                      OFFLINE INGEST PIPELINE (one-time per lesson)
                      ──────────────────────────────────────────────

  E:/Academy Courses/03_ai/m02_neuroanalytics/03_lecture.mp4
            │
            │  scripts/vision-ingest/select-sprint2c-v3.ts
            │  (positional alphabetic-vs-order match, manual override)
            ▼
  results/selected-sprint2c-lessons.json
            │  [{ localPath, lessonId, durationSeconds }, ...]
            │
            │  extract-frames-prod.ts   ffmpeg fps=1/60, cap 120/video
            ▼
  results/frames/<lessonId>/frame_001_00-00.jpg ...
  results/frames-manifest-sprint2c.json
            │
            │  dedup-frames.ts          dhash 8x8 + hamming ≤5 = duplicate
            ▼
  results/frames/<lessonId>/  (15–20% fewer jpgs)
  results/frames-manifest-sprint2c.json  (mutated in place)
            │
            │  vlm-describe.ts          gpt-4.1-mini, concurrency=5
            │                           append-per-frame JSONL → resumable
            ▼
  results/vlm-runs-sprint2c.jsonl   (one line per frame)
  results/vlm-runs-sprint2c.json    (assembled at end of run)
            │
            ├─►  upload-frames-storage.ts  → Supabase Storage `lesson-frames/<lessonId>/frame_NNN_MM-SS.jpg`
            │
            └─►  embed-and-insert.ts
                       │  text-embedding-3-small (1536d) via OpenRouter
                       │  INSERT content_chunk (source_type='academy_video_frame', trust_tier=1)
                       ▼
                  Supabase Postgres
                  (HNSW index on embedding)


                      RUNTIME (per chat message, ~5s)
                      ───────────────────────────────

  User: "какая ссылка показана на экране"
            │
            │  apps/web → tRPC → packages/api → @mpstats/ai
            │
            ▼
  generateChatResponse(lessonId, message, history)
            │
            │  retrieve('academy-lesson', { query, lessonId })
            │    ├─ Pass 1: searchChunks(threshold=0.5, sourceTypes=[audio,frame], tier=[1])
            │    └─ Pass 2 (only if isVisualQuery): searchChunks(threshold=0.3,
            │                                           sourceTypes=[frame], tier=[1])
            │    └─ Merge dedupe-by-id, sort by similarity, cap at limit=8
            │
            ▼
  buildContextWithSources(chunks)
            │  [1] (АУДИО 02:14-02:34, 78%) …transcript text…
            │  [4] (ЭКРАН @ 04:00, 71%) Сводка по предмету.
            │       URLs: https://mpstats.io/wb/item/463891248?d1=02.07.2025&d2=29.09.2025
            │       Numbers: 121 016 906 ₽ | 28 621 563 ₽ | 70 247 шт
            │
            ▼
  openrouter.chat.completions.create({
    model: OPENROUTER_DEFAULT_MODEL = 'openai/gpt-4.1-mini',
    messages: [system_prompt_with_few_shot, ...history, user_msg],
    temperature: 0.3,
  })
            │
            ▼
  fixBrandNames(content) → { content, sources[], model }
            │
            ▼
  Chat UI renders answer + clickable source citations (timecoded)
```

---

## 3. Schema

### 3.1 `Lesson` (Prisma `Lesson`, table `Lesson`)

Source: `packages/db/prisma/schema.prisma` lines 142–175. Fields relevant to vision RAG:

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String @id` | Manifest-style key e.g. `03_ai_m02_neuroanalytics_003`. Vision-ingest uses this verbatim as `content_chunk.lesson_id` AND as the Supabase Storage folder name. |
| `courseId` | `String` | e.g. `03_ai`. Selectors filter by this. |
| `title` | `String` | Used only for selector diagnostics, never indexed. |
| `order` | `Int @default(0)` | Source-of-truth lesson position **within the course**. v3 selector matches files to lessons by sorting files alphabetically and DB lessons by `order ASC`. |
| `isHidden` | `Boolean @default(false)` | `searchChunks` joins `Lesson` and filters `l."isHidden" = false` unless `includeHidden=true`. Vision ingest treats hidden lessons as out-of-scope (skipped at selector layer). |
| `metadata` | — | Not used by vision RAG. (`Lesson` does not have an explicit `metadata` field; ad-hoc data goes into `skillBlocks`, `topics`, etc.) |
| `skillCategory` / `skillBlocks` / `topics` | various | Used by retrieval/recommendation elsewhere, irrelevant to vision RAG. |

There is **no FK** between `Lesson.id` and `content_chunk.lesson_id` (see comment line 170 of schema). Vision-ingest is responsible for never inserting a `lesson_id` that doesn't exist in `Lesson`.

### 3.2 `content_chunk` (Prisma `ContentChunk`, table `content_chunk`)

Source: `packages/db/prisma/schema.prisma` lines 347–366. Shared table for **all** RAG chunks (audio + frames + external courses).

| Column (snake_case) | Type | Vision-frame value | Notes |
|---------------------|------|--------------------|-------|
| `id` | `text PK` | `<lessonId>_frame_NNN`, e.g. `03_ai_m02_neuroanalytics_003_frame_007` | `embed-and-insert.ts` uses this id; `ON CONFLICT (id) DO UPDATE` makes the upload idempotent. |
| `lesson_id` | `text` | `Lesson.id` | Indexed; used by `lessonId LIKE '<id>%'` in `searchChunks`. |
| `content` | `text` | `[ЭКРАН @ 04:00] Сводка по предмету.. URLs: …. Numbers: …. Tools: …. Other: ….` | Built by `buildContent()` in `embed-and-insert.ts`. Note: `content` has the `[ЭКРАН @ tc]` prefix; `buildEmbeddingText()` strips it so it doesn't pollute the vector. |
| `embedding` | `vector(1536)` | `text-embedding-3-small` output | Same model and dimensionality as audio chunks — frames live in the same vector space and HNSW index. |
| `timecode_start` | `int` | `Math.round(frame.pts)` seconds | Frames are instantaneous, so start = end. |
| `timecode_end` | `int` | same as start | |
| `token_count` | `int` | `Math.ceil(contents.length / 4)` (approx) | Not used in retrieval; bookkeeping only. |
| `metadata` | `jsonb` | `{ frame_path, pts, vlm_model, vlm_response }` | `vlm_response` carries the full parsed JSON so we can re-render `content` later without re-calling the VLM. |
| `skill_category` | `enum` | NULL for frames | Audio chunks may carry this; frames don't. |
| `source_type` | `text @default 'academy_audio'` | `'academy_video_frame'` | Indexed. Used by retrieval profiles. |
| `trust_tier` | `smallint @default 1` | `1` | Indexed. Used by retrieval profiles. |
| `created_at` | `timestamptz @default now()` | — | Bookkeeping. |

### 3.3 Source types and trust tiers (cross-source table)

| `source_type` | `trust_tier` | Owner | Producer | Cite to user? |
|---------------|--------------|-------|----------|---------------|
| `academy_audio` | 1 | MAAL | Whisper transcribe pipeline (Academy Courses repo) | ✅ Yes |
| `academy_video_frame` | 1 | MAAL | This pipeline (`scripts/vision-ingest/`) | ✅ Yes |
| `external_course_lagerpro` | 2 | External (read-only ingest) | `E:/LagerPro/_workspace/scripts/` | ❌ **No** — obfuscated (see §8) |

`trust_tier=1` = "authoritative MPSTATS Academy content, OK to cite directly". `trust_tier=2` = "external, paraphrase only, never name the source". Future tiers reserved for `marketplace_offer_*` (auto-refreshed WB/Ozon T&Cs, planned in `VISION_RAG_AGENT.md`).

### 3.4 Supabase Storage bucket `lesson-frames`

```
lesson-frames/
├── 03_ai_m02_neuroanalytics_003/
│   ├── frame_001_00-00.jpg
│   ├── frame_002_01-00.jpg
│   └── …
├── 03_ai_m03_visual_008/
│   └── …
```

- Bucket name: `lesson-frames` (constant: `INGEST_CONFIG.storage_bucket`).
- File naming: `frame_NNN_MM-SS.jpg` (zero-padded seq + timecode with `-` instead of `:` for filesystem safety).
- Upload uses `upsert: true` → re-runs are idempotent.
- The chat UI does **not** currently render frames — only their textual descriptions feed the LLM. Storage is kept so we can later show "see screenshot at 04:00" links.

---

## 4. Retrieval Profiles

Source: `packages/ai/src/profiles.ts`.

### 4.1 `academy-lesson` profile

```typescript
export const PROFILES = {
  'academy-lesson': {
    name: 'academy-lesson',
    sourceTypes: ['academy_audio', 'academy_video_frame'],
    trustTiers: [1],
    maxResults: 8,
    threshold: 0.5,
  },
} as const satisfies Record<string, RetrievalProfile>;
```

This is the **only** profile in production. Used by `generateChatResponse()` for every in-lesson AI chat. Two hard guarantees:

- **`trustTiers: [1]`** excludes LagerPro (`trust_tier=2`) at the SQL level — chat will never see external content.
- **`sourceTypes` restricted to academy** — defence in depth; even if a new tier-1 source slips in, profile filters it out.

The `lessonId` parameter is passed separately by the caller and applied as `c.lesson_id LIKE '<lessonId>%'` in `searchChunks`. Scoping is currently lesson-strict.

### 4.2 `isVisualQuery()` detector

```typescript
const VISUAL_QUERY_PATTERN = /(экран|ссылк|число|урл|url|интерфейс|показ|выручк|инструмент|таблиц|график|какая ссылк|на каком|какой|где находит|видн|изображен|скрин|кадр|слайд|кнопк|меню|меньше|больше|кол(-|и)?ч|сколько)/i;

export function isVisualQuery(query: string): boolean {
  return VISUAL_QUERY_PATTERN.test(query);
}
```

Keyword regex (Russian). Triggers a second-pass retrieval call in `retrieve()`:

```typescript
// Pass 2: if visual query, boost frame recall with lower threshold
if (!isVisualQuery(options.query)) return baseResults;

const frameResults = await searchChunks({
  query, lessonId, limit, threshold: 0.3,
  sourceTypes: ['academy_video_frame'], trustTiers: profile.trustTiers,
});
// Merge: dedupe by id, sort by similarity desc, cap at limit
```

**Why two passes:** abstract "criteria/list" questions about visual content embedded badly against frame descriptions in Sprint 2 smoke. Boosting recall (threshold 0.5 → 0.3) on a frame-only second pass, then re-ranking by similarity desc and deduping, was the smallest fix that lifted accuracy without flooding context with weak frames on non-visual queries.

### 4.3 Embeddings

`text-embedding-3-small`, 1536 dims, via OpenRouter (`packages/ai/src/embeddings.ts` for query side; `scripts/vision-ingest/embed-and-insert.ts` for ingest side). Both audio and frame chunks use this model — critical so HNSW retrieval works across types without per-type calibration.

---

## 5. Generation

Source: `packages/ai/src/generation.ts`.

### 5.1 `buildContextWithSources()`

```typescript
export function buildContextWithSources(chunks: ChunkSearchResult[]): string {
  return chunks.map((chunk, i) => {
    const idx = i + 1;
    const rel = `${(chunk.similarity * 100).toFixed(0)}%`;
    if (chunk.source_type === 'academy_video_frame') {
      return `[${idx}] (ЭКРАН @ ${formatTimecode(chunk.timecode_start)}, relevance: ${rel})\n${chunk.content}`;
    }
    return `[${idx}] (АУДИО ${formatTimecode(chunk.timecode_start)}-${formatTimecode(chunk.timecode_end)}, relevance: ${rel})\n${chunk.content}`;
  }).join('\n\n');
}
```

Audio chunks get a time **range**; frame chunks get a single `@ tc` instant. The `[АУДИО]`/`[ЭКРАН]` Russian labels are deliberate — the system prompt references them by name in the few-shot section.

### 5.2 System prompt (chat)

Full text in `generation.ts` lines 220–299. Key elements:

1. **Context block introduction** explains the two source types and that `АУДИО` = what was said, `ЭКРАН` = what was shown.
2. **Routing rules**:
   - URL / link / domain → look in `ЭКРАН` first
   - Numbers / metrics / table cells → `ЭКРАН`
   - Tool / button / UI section names → `ЭКРАН`
   - Concepts / explanations / ideas → `АУДИО`
   - If answer exists in both → cite both
3. **Anti-hallucination rules**:
   - "ЧИСЛА И ЦИФРЫ: цитируй ОДИН конкретный источник, НЕ смешивай числа из разных кадров" — prevents averaging across unrelated tables.
   - "СТРУКТУРИРОВАННЫЕ ФАКТЫ В ЭКРАН-ИСТОЧНИКАХ: …используй их ВЕРБАТИМ без перефразирования" — for `URLs:` / `Numbers:` / `Tools:` lines from the VLM output.
4. **Glossary** of brand-name canonical spellings (used both here and in `fixBrandNames()` post-processor for fixing Whisper transliterations).
5. **Few-shot block** — 4 worked examples (number, tool list, URL, audio-only concept) with explicit ✅ ХОРОШО / ❌ ПЛОХО patterns. This is doing the heaviest lifting on grounding quality.

### 5.3 Production model

```typescript
chat: process.env.OPENROUTER_DEFAULT_MODEL || 'openai/gpt-4.1-nano',
fallback: process.env.OPENROUTER_FALLBACK_MODEL || 'qwen/qwen3.5-flash-02-23',
```

Defaults in `packages/ai/src/openrouter.ts` say `gpt-4.1-nano`, but **production runs `gpt-4.1-mini`** via the `OPENROUTER_DEFAULT_MODEL` env var (set on the VPS docker-compose). Sprint 2 RETRY (see `decision.md`) showed mini hit 84% smoke accuracy where nano hit 41% — the architecture (frames + few-shot) was correct but nano lacked the instruction-following to honour the routing rules. Mini is ~1.5× the cost of nano and is the production default until further notice.

`MODEL_CONFIG.ragTemperature = 0.3` — generation.ts line 313.

### 5.4 Entry point

`packages/ai/src/index.ts` exports `generateChatResponse` from `./generation`. Callers (currently only `packages/api/src/routers/ai.ts` → tRPC `ai.chat` mutation) pass `lessonId`, `message`, `history`. The history is sliced to the last 10 messages.

---

## 6. VLM Pipeline

All scripts live in `scripts/vision-ingest/` and are TypeScript. Shared constants are in `config.ts`. All scripts honour an `INGEST_SUFFIX` env var that namespaces input/output filenames — pilot ran without suffix, Sprint 2C ran with `INGEST_SUFFIX=sprint2c`, Sprint 3 will follow.

### 6.1 Selector (`select-pilot-lessons.ts`, `select-sprint2c-{lessons,v2,v3}.ts`, `apply-manual-overrides.ts`)

**Job:** map local video files in `E:/Academy Courses/<course>/<module>/*.mp4` to `Lesson.id`s in the DB.

**Current state (Sprint 2C):** positional alphabetic-vs-`order` match (`select-sprint2c-v3.ts`) — sort files alphabetically per module, sort DB lessons by `(courseId, order)`, zip. Edge cases (interleaved hidden lessons, scrambled module endings) are handed off to `apply-manual-overrides.ts` which carries a hand-verified file→lesson dict.

**Outcome:** Sprint 2C had 7/9 modules clean-positional + 2 modules needing manual override (m01_intro, m08_neurointegrator).

**Sprint 3 problem:** 440 lessons across 4 courses with messier naming. Positional alone won't survive. Backlog item for Phase 56: filename↔lessonId mapping table in admin, OR a 2-pass resolver (positional + LLM disambiguator). See `decision-sprint2c.md` §"Selector evolution".

### 6.2 Frame extraction (`extract-frames-prod.ts`)

```
ffmpeg -y -i <localPath> -vf "fps=1/60,showinfo" -fps_mode vfr -pix_fmt yuvj420p -q:v 3 tmp_%04d.jpg
```

- One frame every 60s (constant: `frame_interval_seconds`).
- Hard cap 120 frames per video (`frames_cap_per_video`) — exceeded videos get evenly downsampled via `pickEvenly()`. A 4h video would otherwise produce 240 frames; cap protects the budget on long lessons.
- PTS timestamps are scraped from `-vf showinfo`'s stderr (`pts_time:NNN.NN`) and used to name files `frame_NNN_MM-SS.jpg` and to populate `pts` in the manifest.
- Output: `results/frames/<lessonId>/` + `results/frames-manifest[-<suffix>].json`.

### 6.3 Dedup (`dedup-frames.ts`)

dhash (8×8 difference hash via `sharp` greyscale + 9×8 resize), hamming distance against the **last kept** frame. Distance ≤ `phash_hamming_threshold` (=5) → drop.

- Pairwise-sequential, not all-pairs — a slowly-evolving slide deck gets collapsed to a representative each time the slide changes.
- Sprint 2 pilot: 185 → 148 (20%). Sprint 2C: 762 → 644 (15.5%). Dedup ratio depends on lesson style — talking-head heavy lessons dedup more aggressively.
- Mutates `frames-manifest-*.json` in place; deleted jpgs are unlinked from disk.

### 6.4 VLM describe (`vlm-describe.ts`)

For each remaining frame:

1. Base64-encode the JPG as a `data:image/jpeg;base64,…` URL.
2. POST to `https://openrouter.ai/api/v1/chat/completions` with `{ model: 'openai/gpt-4.1-mini', max_tokens: 800, messages: [{ user, content: [text=prompt, image_url] }] }`.
3. Parse the response as JSON `{ type, summary, extracted: { urls, numbers, tools, other } }`. If non-JSON, retry once with a stricter prompt.
4. Append the result (one JSON object per line) to `results/vlm-runs-<suffix>.jsonl` **before** moving to the next frame.

Concurrency: 5 workers (`CONCURRENCY = 5`). 60s per-request timeout via `AbortController`. **Resume logic** at start of run: read existing JSONL, skip frames whose `frameId` already has a successful (non-error) response. This was added in Sprint 2C after a serial-mode run hung at 142/644 — see `decision-sprint2c.md` §"VLM runner rewrite". The JSONL is the durable artifact; the `vlm-runs-<suffix>.json` summary is assembled at the end of the run.

**Pricing (gpt-4.1-mini):** `$0.40 / 1M` input tokens, `$1.60 / 1M` output tokens. Per-frame cost ≈ $0.0015 (Sprint 2C average $0.94 / 644 frames).

**Prompt** lives in `scripts/vision-ingest/prompts/frame-describe.txt`. Key constraints:

- Return STRICT JSON, no markdown fences (a retry with stricter wording catches the cases where the VLM defaults to fenced output).
- `type` ∈ `{slide, screen, talking_head, diagram, code, other}` — used for downstream filtering ideas (not yet).
- `extracted.numbers` excludes timecodes and system clocks (rule in prompt) so we don't pollute embedding with junk.
- Talking-head frames return empty `extracted` and a fixed summary — they still produce a chunk but it embeds weakly so retrieval ignores them.

### 6.5 Upload to Storage (`upload-frames-storage.ts`)

For each frame in the manifest: read JPG, upload to `lesson-frames/<lessonId>/frame_NNN_MM-SS.jpg` with `contentType: 'image/jpeg', upsert: true`. Uses `SUPABASE_SERVICE_ROLE_KEY` (no RLS bypass needed — bucket is service-role only).

### 6.6 Embed + insert (`embed-and-insert.ts`)

Reads `vlm-runs-<suffix>.json`, filters to `!error && response`. For each valid frame:

- `buildContent()` produces the `content` column: `[ЭКРАН @ tc] summary. URLs: …. Numbers: …. Tools: …. Other: ….`
- `buildEmbeddingText()` produces a near-identical string **without** the `[ЭКРАН @ tc]` prefix — the prefix is a presentational marker, not semantic content.

Batches of 50 strings → `POST /v1/embeddings { model: 'openai/text-embedding-3-small', input: [...] }`. 500ms delay between batches (`embedding_rate_limit_delay_ms`).

Inserts one row per frame using `pg` direct connection (raw INSERT, not Prisma — Prisma's pgvector support requires `Unsupported`). `ON CONFLICT (id) DO UPDATE SET content, embedding, metadata` → fully idempotent: re-running the whole pipeline overwrites in place.

### 6.7 Smoke tests (`smoke-test-chat.ts`, `smoke-test-sprint2c.ts`)

Headless Q&A runners. Read a Q checklist (`pilot-qna-checklist.md`, `sprint2c-smoke-checklist.md`), call `generateChatResponse` per question, dump answers + sources to a markdown file for manual grading. Used to derive the accuracy numbers in `decision*.md`.

---

## 7. Cost Model

### Per-frame (gpt-4.1-mini @ pricing 2026-05)

| Step | Cost per frame | Notes |
|------|----------------|-------|
| VLM describe | $0.00146 avg | ~$0.94 / 644 frames in Sprint 2C. Image input dominates; output is small (≤800 tokens). |
| Embedding | ~$0.0000015 | text-embedding-3-small @ $0.020/1M tokens, ~50 tokens/frame |
| Storage | negligible | JPG ~50–100 KB; Supabase Storage costs are network-egress driven, not at-rest. |
| DB insert | negligible | One `content_chunk` row per frame. |
| **Total** | **~$0.00146 / frame** | |

### Per-lesson

Sprint 2C: 644 frames / 79 lessons = **8.2 frames/lesson average** after dedup, ≈ **$0.012/lesson**.

Variance: a 5-minute talking-head lesson costs $0.003; a 50-minute screen-share lesson hits the 120-frame cap and costs $0.18.

### Per-sprint actuals and projection

| Phase | Lessons | Frames (after dedup) | VLM $ | Embed $ | Total $ |
|-------|---------|----------------------|-------|---------|---------|
| Sprint 2 (pilot) | 10 | 148 | $0.2254 | ~$0.0002 | **$0.226** |
| Sprint 2C | 79 | 644 | $0.9388 | ~$0.0009 | **$0.940** |
| Sprint 3 (projected, full platform) | ~351 (440 − 89 already done) | ~2900 | ~$4.2 | ~$0.004 | **~$4.2** |

Projection uses Sprint 2C unit cost ($0.012/lesson) × remaining lesson count. Easily fits inside any reasonable sprint budget.

### Recurring costs

Pipeline runs **once per lesson lifetime** (or on demand if a lesson's video is re-recorded). There are no recurring vision costs at runtime — runtime cost is dominated by chat LLM tokens, which is a Phase 56 concern (hybrid routing in `decision-sprint2c.md` backlog).

---

## 8. Trust & Filtering Policy

### 8.1 The LagerPro problem

LagerPro is a paid external course set we transcribed and indexed for an unrelated agentic product (see `LAGERPRO_INGEST_HANDOFF.md`). It lives in the **same** `content_chunk` table as academy content, with:

- `source_type='external_course_lagerpro'`
- `trust_tier=2`
- `metadata->>'course_id'` ∈ `{diagnostika, immunitet, reklama, start, tovar}`

2299 chunks. Same embedding model (`text-embedding-3-small`) and chunking config as academy_audio so it occupies the same vector space.

### 8.2 Why in-lesson chat must never see it

Three reasons:

1. **Topical drift.** LagerPro is Wildberries-specific seller training. An in-lesson chat for a course on neural networks should not mix in WB-listing advice.
2. **Attribution risk.** Per `LAGERPRO_INGEST_HANDOFF.md` §3, LagerPro chunks cannot be cited with their source (no licensing agreement). The metadata in the DB has been pre-stripped of author names and original Russian course titles, but the safest defence is "in-lesson chat never sees these chunks at all".
3. **Quality contract.** "Спроси урок" is sold as an MPSTATS Academy product — the answer comes from this lesson. Mixing external content breaks that promise.

### 8.3 How filtering is enforced

Two layers, defence in depth:

**Layer 1 — Profile (always applied for in-lesson chat):**
```typescript
'academy-lesson': { sourceTypes: ['academy_audio', 'academy_video_frame'], trustTiers: [1], ... }
```
`searchChunks` builds:
```sql
AND c.source_type = ANY(ARRAY['academy_audio','academy_video_frame'])
AND c.trust_tier = ANY(ARRAY[1])
```

Either filter alone would exclude LagerPro. Both are applied.

**Layer 2 — Lesson scoping:**
The `lessonId` parameter applies `c.lesson_id LIKE '<lessonId>%'`. LagerPro lesson_ids do not collide with academy lesson_ids (they look like `lagerpro_<slug>_…`), so even without source_type filtering this would prevent retrieval — but we never rely on this alone.

### 8.4 Future: cross-source profiles

`VISION_RAG_AGENT.md` (in `E:/Academy Courses/`) describes a planned `agent-broad` profile for an agentic product that *does* span academy + LagerPro + future sources. That profile is not in MAAL yet. When it lands, it will live next to `academy-lesson` in `profiles.ts` and use trust_tier as a *ranking weight* rather than a hard filter — see `LAGERPRO_INGEST_HANDOFF.md` §4 for the boost formula sketch.

---

## 9. Known Limitations

### 9.1 Abstract list/criteria queries miss frames

**Pattern:** "критерии хорошей подниши", "что должно быть в финальной самопроверке", "признаки X".

Failed Q15 and Q18 in Sprint 2C smoke. The frames *do* contain the answer (chip-lists, bullet rows), but embedding similarity is low because the query has no lexical anchor (no URL, no number, no brand name) that matches the frame description vocabulary.

**Phase 56 backlog:** query expansion ("критерии" → "критерии, признаки, метрики, требования"), or BM25 keyword pass over frame summaries to boost recall on these patterns. See `decision-sprint2c.md` §Backlog item 1.

### 9.2 Selector won't scale across courses

Positional alphabetic-vs-`order` worked for one course at a time with manual fallback for tricky modules. Sprint 3 hits 351 more lessons across courses with inconsistent file naming. Two options on the table (`decision-sprint2c.md` §Backlog item 2):

- Maintain an admin-side mapping table from local-filename → lessonId.
- 2-pass resolver: positional first, then an LLM disambiguator on uncertain matches.

### 9.3 Hidden lessons edge case

Vision-ingest filters out `isHidden=true` lessons at selector time, and `searchChunks` re-filters them at retrieval (via `INNER JOIN Lesson` + `isHidden=false`). If a lesson is hidden **after** ingest, its frames remain in `content_chunk` but become unreachable through chat (which is correct). However, the storage objects under `lesson-frames/<id>/` are not GC'd — minor disk leak, accept.

Conversely, if a lesson is unhidden after the pipeline ran on an earlier batch, ingest must be re-triggered for it — there is no automation watching the `isHidden` flag.

### 9.4 No per-frame visual rendering in chat UI

Storage holds the JPGs but the chat surface does not show them. The LLM answers verbally from the description. This is a deliberate Sprint 2 scope cut — adding screenshot previews requires UI work and source-citation redesign. Left for a future phase.

### 9.5 Talking-head frames produce low-value chunks

We still spend a VLM call on them (it returns `type=talking_head, summary="Говорящая голова, нет визуального контента"`) and still insert a row. They embed weakly so retrieval rarely surfaces them, but they cost ~$0.0015 each. A pre-filter (skip frame if dhash is close to a "talking-head reference frame", or pre-classify via a smaller/cheaper model) could trim ~10% of cost. Not currently prioritised.

### 9.6 Cross-lesson frame leakage impossible by design

`lesson_id LIKE '<lessonId>%'` is exact-prefix; we don't have a way to retrieve frames from a different lesson into the current lesson's chat. This is correct for in-lesson chat but means there is no "this concept also appears in lesson X" capability today. Future feature, not a bug.

---

## 10. Future Directions

### 10.1 Phase 56 — RAG Quality (v1.8+)

Tracked in `decision-sprint2c.md` §Backlog. Concrete items:

1. **Query expansion** for abstract list/criteria queries (§9.1 fix).
2. **Hybrid re-ranking** — combine vector similarity with BM25 keyword score over frame `URLs:`/`Tools:`/`Numbers:` lines.
3. **Hybrid model routing** via `isVisualQuery()` — already prototyped. Idea: route visual queries to gpt-4.1-mini, text-only queries to a cheaper model. Validate cost/accuracy delta in prod.
4. **Selector v4** for cross-course scale (§9.2 fix).
5. **Retrieval miss fix** on specific-number queries that bury the number in a multi-row table.

### 10.2 Sprint 3 — Full platform vision ingest

Roll out the pipeline to the remaining ~351 lessons across the 4 active courses. Pipeline mechanics are validated at 8× scale (10 → 89 lessons in Sprint 2C). Outstanding work:

- Solve §9.2 selector before running.
- Remove the chat disclaimer "ассистент не видит экран" once coverage exceeds ~80% of platform.
- Consider a parallel-ingest harness if total runtime becomes painful (Sprint 2C took ~3h end-to-end including the failed serial VLM run that triggered the rewrite).

### 10.3 Long-term — `VISION_RAG_AGENT.md` vision

This document is the strategic source-of-truth for the multi-product RAG ambition. Lives in `E:/Academy Courses/VISION_RAG_AGENT.md`. Highlights:

- **Wave 4: marketplace-offer auto-refresh.** Scheduled re-ingest of WB/Ozon T&Cs into `content_chunk` with `source_type='marketplace_offer_*'`, `trust_tier=3`, and a `valid_until` column. Requires schema migration to add `valid_until timestamptz` on `content_chunk`.
- **Wave 5: public `/v1/query` endpoint.** Standalone service (not MAAL) that serves cross-source RAG against the same table via an `agent-broad` profile. MAAL's job is just to keep producing high-quality academy chunks; the agent product reads from the same DB.

---

## 11. File Index (quick reference)

| Concern | File |
|---------|------|
| Schema (Lesson, content_chunk) | `packages/db/prisma/schema.prisma` |
| Retrieval profile + isVisualQuery | `packages/ai/src/profiles.ts` |
| SQL vector search | `packages/ai/src/retrieval.ts` |
| Chat generation, system prompt, few-shot | `packages/ai/src/generation.ts` |
| Model defaults, env override | `packages/ai/src/openrouter.ts` |
| Pipeline constants | `scripts/vision-ingest/config.ts` |
| Selector (current) | `scripts/vision-ingest/select-sprint2c-v3.ts` + `apply-manual-overrides.ts` |
| ffmpeg frame extraction | `scripts/vision-ingest/extract-frames-prod.ts` |
| dhash dedup | `scripts/vision-ingest/dedup-frames.ts` |
| VLM describe (resumable) | `scripts/vision-ingest/vlm-describe.ts` |
| VLM prompt | `scripts/vision-ingest/prompts/frame-describe.txt` |
| Storage upload | `scripts/vision-ingest/upload-frames-storage.ts` |
| Embed + DB insert | `scripts/vision-ingest/embed-and-insert.ts` |
| Smoke runner | `scripts/vision-ingest/smoke-test-sprint2c.ts` |
| Sprint 2 verdict | `scripts/vision-ingest/results/decision.md` |
| Sprint 2C verdict | `scripts/vision-ingest/results/decision-sprint2c.md` |
| External-source policy | `../../LAGERPRO_INGEST_HANDOFF.md` (in repo root of `MAAL/`) |
| Strategic vision | `E:/Academy Courses/VISION_RAG_AGENT.md` (outside repo) |

---

_LagerPro handoff doc committed at repo root on `phase-55-sprint-3-prep` (`../../LAGERPRO_INGEST_HANDOFF.md` resolves from this file's location)._
