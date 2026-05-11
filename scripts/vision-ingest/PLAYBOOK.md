# Vision Ingest Playbook

Operational guide for running a vision-RAG ingest sprint on MAAL.

> **Audience:** engineer running the pipeline. Assumes familiarity with `ARCHITECTURE.md`.
> **Last sprint:** Sprint 2C (2026-05-11) — 79 lessons of `03_ai` ingested, 88.9% smoke accuracy.
> **Next sprint:** Sprint 3 — full platform (~351 remaining lessons across 4 courses).

---

## 0. Prerequisites

### Required tools (all in PATH)

| Tool | Verify | Notes |
|------|--------|-------|
| `ffmpeg` ≥6.x | `ffmpeg -version` | Frame extraction |
| `ffprobe` ≥6.x | `ffprobe -version` | Video duration |
| Node 22.x+ | `node --version` | Pipeline runtime |
| `tsx` ≥4.21 | `npx tsx --version` | Workspace dep, no install needed |
| `git` | `git --version` | Worktree + branch hygiene |

### Required env vars (in `.env` at worktree root)

```
DATABASE_URL=postgresql://...           # Direct Postgres for content_chunk INSERTs
SUPABASE_MGMT_TOKEN=sbp_...             # Management API (SQL queries via /v1/projects/{ref}/database/query)
SUPABASE_PROJECT_REF=saecuecevicwjkpmaoot
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...    # Storage uploads (lesson-frames bucket)
OPENROUTER_VISION_KEY=sk-or-v1-...      # VLM + embeddings (can reuse OPENROUTER_API_KEY value)
OPENROUTER_DEFAULT_MODEL=openai/gpt-4.1-mini   # Production default (validated Sprint 2)
```

> **Get tokens from:** `MAAL/.env` (DATABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENROUTER_API_KEY), memory `reference_supabase_mgmt.md` (SUPABASE_MGMT_TOKEN).
> **Never commit `.env`.** `.gitignore` covers it.

### Baseline state to verify before starting

```bash
# Branch is sprint-specific, NOT master
git branch --show-current   # expect: phase-55-sprint-N or similar

# Working tree clean
git status                   # expect: clean

# DB scope target
curl -sX POST "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_MGMT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT COUNT(*) FROM \"Lesson\" l WHERE l.\"isHidden\"=false AND NOT EXISTS (SELECT 1 FROM content_chunk c WHERE c.lesson_id = l.id AND c.source_type = '\''academy_video_frame'\'');"}'
```

---

## 1. Pipeline phases & gates

Each phase has a **gate** — explicit go/no-go check before proceeding. Gates exist because individual steps cost real money (VLM) or real time (frame extraction). Failing fast at a gate saves both.

```
┌─────────┐   gate 1     ┌──────────┐   gate 2    ┌─────────┐   gate 3   ┌────────┐
│ SELECT  │ ───────────▶ │ VALIDATE │ ──────────▶ │ INGEST  │ ─────────▶ │ SMOKE  │
└─────────┘  scope OK?   └──────────┘  pre-flight └─────────┘  ≥80% acc  └────────┘
                                       OK?                                    │
                                                                              ▼
                                                                        ┌───────────┐
                                                                        │ DECISION  │
                                                                        │ commit/PR │
                                                                        └───────────┘
```

---

## 2. Phase: SELECT

Map local video files → DB lesson IDs.

```bash
# Set sprint suffix (used by all downstream scripts)
export INGEST_SUFFIX=sprint3

# Run v4 selector (DB-persisted, LLM-judged confidence)
npx tsx --env-file=.env scripts/vision-ingest/select-v4.ts
```

Writes `results/selected-${SUFFIX}-lessons.json`.

### What v4 does (high-level)

1. Discover canonical modules from DB (`SELECT DISTINCT regexp_replace(id, '^(...)_\d+$', '\1')`)
2. For each module, multi-strategy candidate generation:
   - Positional (alphabetic file sort ↔ `order` asc)
   - Word-overlap (Latin + Cyrillic translit)
   - Brand/keyword matching (VPN, ChatGPT, MPSTATS, Krea, etc.)
   - Filename-prefix → lesson `order` correlation
3. **LLM judge** (gpt-4.1-mini) rates each (file, lesson) candidate confidence 0-10 with rationale
4. ≥8 → auto-accept. <8 → flag for human review (written to `results/low-confidence-${SUFFIX}.csv`)
5. Pre-existing `Lesson.metadata.videoSource` mappings (from prior sprints) take precedence — selector won't re-resolve

### Human-in-the-loop for low-confidence

```bash
# Open the CSV. Each row: lessonId, file_candidate_path, llm_confidence, llm_rationale.
# Fix mappings manually (edit file_candidate_path), save.

# Import approved mappings back into DB
npx tsx --env-file=.env scripts/vision-ingest/import-mappings.ts \
  --input results/low-confidence-${INGEST_SUFFIX}-approved.csv

# Re-run selector — it'll pick up DB-persisted mappings now
npx tsx --env-file=.env scripts/vision-ingest/select-v4.ts
```

---

## 3. Gate 1: VALIDATE selection

```bash
npx tsx --env-file=.env scripts/vision-ingest/validate-selection.ts
```

### Checks performed

| Check | Pass condition |
|-------|----------------|
| **Scope match** | Selected count == DB unprocessed-visible count |
| **No duplicates** | All `lessonId` values unique |
| **No false positives** | Every selected lessonId exists in DB AND is `isHidden=false` AND has no `academy_video_frame` chunks |
| **No missing** | Every DB unprocessed-visible lessonId is in selection (or explicitly excluded with reason) |
| **Per-module sanity** | Per-module file count ≈ visible-unprocessed lesson count (±20% tolerance flag warning) |
| **Spot-check overlap** | Random 3 lessons per module — Latin+Cyrillic translit word overlap > 0 with title |
| **Local files exist** | Every `localPath` resolves on disk |
| **Durations sane** | All durations 60s ≤ X ≤ 7200s (no truncated / corrupt videos) |

### Outcomes

- **Exit 0:** all green — proceed to gate 2 or ingest
- **Exit 1:** any check failed — DO NOT run ingest. Fix selection, re-run validator
- **Exit 2:** warnings only (e.g., off-by-1 module) — manual review before proceeding

---

## 4. Gate 2: SMALL-BATCH DRY-RUN (new courses only)

For courses never ingested before, run a 3-5 lesson dry-run to catch course-specific issues (filename conventions, ffmpeg codec problems, unusual durations) before spending $$ on full ingest.

```bash
# Extract first 5 lessons of the sprint
node -e "const sel = require('./scripts/vision-ingest/results/selected-${INGEST_SUFFIX}-lessons.json'); require('fs').writeFileSync('./scripts/vision-ingest/results/selected-${INGEST_SUFFIX}-drypilot-lessons.json', JSON.stringify(sel.slice(0, 5), null, 2));"

# Run mini-ingest
INGEST_SUFFIX=${INGEST_SUFFIX}-drypilot npx tsx --env-file=.env scripts/vision-ingest/extract-frames-prod.ts
INGEST_SUFFIX=${INGEST_SUFFIX}-drypilot npx tsx --env-file=.env scripts/vision-ingest/dedup-frames.ts
INGEST_SUFFIX=${INGEST_SUFFIX}-drypilot npx tsx --env-file=.env scripts/vision-ingest/vlm-describe.ts
INGEST_SUFFIX=${INGEST_SUFFIX}-drypilot npx tsx --env-file=.env scripts/vision-ingest/upload-frames-storage.ts
INGEST_SUFFIX=${INGEST_SUFFIX}-drypilot npx tsx --env-file=.env scripts/vision-ingest/embed-and-insert.ts
```

### Dry-run pass conditions

- ffmpeg returns 0 for all 5 videos
- VLM final errors = 0 (after resume)
- All 5 lessons appear in DB with frame chunks: `SELECT lesson_id, COUNT(*) FROM content_chunk WHERE source_type='academy_video_frame' GROUP BY lesson_id;`
- Spot-check 1 lesson via prod chat → frames cited

**If dry-run fails:** investigate (likely course-specific issue), fix, re-run. Do NOT proceed to full sprint.

**If dry-run passes:** proceed. Note: dry-run chunks ARE in production. They count toward sprint coverage.

---

## 5. Phase: INGEST (full pipeline)

```bash
# 5.1 Extract frames (1 fps/60s, cap 120/video) — ~10-15 min for 80 lessons
npx tsx --env-file=.env scripts/vision-ingest/extract-frames-prod.ts \
  > scripts/vision-ingest/results/logs/01-extract.log 2>&1 &

# 5.2 Perceptual hash dedup (~15-20% reduction) — ~2 min
npx tsx --env-file=.env scripts/vision-ingest/dedup-frames.ts \
  > scripts/vision-ingest/results/logs/02-dedup.log 2>&1

# 5.3 VLM describe — ~10-40 min depending on rate-limits; resumable
npx tsx --env-file=.env scripts/vision-ingest/vlm-describe.ts \
  > scripts/vision-ingest/results/logs/03-vlm.log 2>&1
# If interrupted, re-run — picks up from JSONL where it left off.

# 5.4 Storage upload — ~5-10 min
npx tsx --env-file=.env scripts/vision-ingest/upload-frames-storage.ts \
  > scripts/vision-ingest/results/logs/04-upload.log 2>&1

# 5.5 Embed + INSERT — ~3-5 min
npx tsx --env-file=.env scripts/vision-ingest/embed-and-insert.ts \
  > scripts/vision-ingest/results/logs/05-embed-insert.log 2>&1
```

### Per-step expectations

| Step | Typical | Red flags |
|------|---------|-----------|
| extract | ~10s/video, 0 errors | ffmpeg non-zero exit (codec issue / corrupted source) |
| dedup | <2 min, 15-20% reduction | <5% (slides-heavy unusual) or >40% (broken phash) |
| VLM | 0 errors after resume retry | >5% errors after retry (rate-limit or model issue) |
| upload | 0 failed | Storage 4xx (auth issue) |
| embed-insert | 100% inserted, 0 errors | Postgres conflicts (lesson_id mismatch) |

### Verify DB state after ingest

```sql
-- New chunks count
SELECT COUNT(*) FROM content_chunk WHERE source_type='academy_video_frame';
-- Should be (prev_total + new_lessons_count × avg_frames_per_lesson ≈ 8-10)

-- Per-lesson coverage
SELECT lesson_id, COUNT(*) AS frames
FROM content_chunk
WHERE source_type='academy_video_frame' AND lesson_id LIKE 'COURSE_%'
GROUP BY lesson_id
ORDER BY frames DESC;
```

---

## 6. Gate 3: SMOKE TEST

```bash
NODE_OPTIONS='--conditions=react-server' \
OPENROUTER_DEFAULT_MODEL=openai/gpt-4.1-mini \
  npx tsx --env-file=.env scripts/vision-ingest/smoke-baseline.ts \
  --suffix ${INGEST_SUFFIX} \
  --lessons 6 --questions-per-lesson 3
```

### What smoke-baseline does

1. Picks 6 lessons from sprint selection (diverse modules)
2. For each, auto-generates 3 questions from VLM frame summaries (URL-tool / number-metric / hybrid)
3. Runs `generateChatResponse` per question
4. LLM-judge scores each answer Y/Partial/N against expected fact
5. Writes `results/smoke-${SUFFIX}.md` with full transcript + tally

### Threshold

- **≥80% accuracy:** PASS — proceed to decision document
- **70-79%:** marginal — manual review of failures, may proceed with caveats
- **<70%:** FAIL — do NOT ship. Investigate retrieval / generation / question quality

> Pilot baseline: 84% (16Q). Sprint 2C: 88.9% (18Q). Sprint 3 target: ≥85%.

---

## 7. Phase: DECISION + COMMIT + PR

```bash
# 7.1 Generate decision-${SUFFIX}.md (templated)
npx tsx --env-file=.env scripts/vision-ingest/write-decision.ts --suffix ${INGEST_SUFFIX}

# 7.2 Review the decision doc, edit if needed (verdict, backlog items)

# 7.3 Commit
git add scripts/vision-ingest/results/selected-${INGEST_SUFFIX}-lessons.json \
        scripts/vision-ingest/results/decision-${INGEST_SUFFIX}.md \
        scripts/vision-ingest/results/smoke-${INGEST_SUFFIX}.md \
        scripts/vision-ingest/results/smoke-${INGEST_SUFFIX}-checklist.md
git commit -m "feat(vision-ingest): sprint ${INGEST_SUFFIX} complete — N lessons, smoke X%"

# 7.4 Push + PR
git push -u origin phase-55-sprint-N
gh pr create --title "Phase 55 Sprint N — Vision RAG expansion" --body "$(cat scripts/vision-ingest/results/decision-${INGEST_SUFFIX}.md | head -30)"
```

---

## 8. Rollback procedures

### 8.1 Partial ingest — abort mid-flight

If you need to abort during VLM (most common case):

1. **Stop the script** (Ctrl-C or kill the background task)
2. **Resume later:** re-run `vlm-describe.ts` — JSONL state preserves completed frames
3. **Discard run entirely:** delete `vlm-runs-${SUFFIX}.jsonl` AND `vlm-runs-${SUFFIX}.json` AND `frames-manifest-${SUFFIX}.json`. Frame jpgs in `results/frames/<lessonId>/` stay (regenerate-safe).

### 8.2 Bad ingest — remove all sprint chunks from DB

If smoke fails or you discover wrong mappings AFTER chunks are inserted:

```sql
-- Find lessons just ingested
SELECT DISTINCT lesson_id FROM content_chunk
WHERE source_type='academy_video_frame'
  AND created_at > '2026-05-11 18:00:00';  -- adjust timestamp

-- Delete them (replace lesson_ids list)
DELETE FROM content_chunk
WHERE source_type='academy_video_frame'
  AND lesson_id IN ('lesson_id_1', 'lesson_id_2', ...);
```

```bash
# Delete corresponding Supabase Storage objects
node -e "
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ids = ['lesson_id_1', 'lesson_id_2'];
(async () => {
  for (const id of ids) {
    const { data } = await supabase.storage.from('lesson-frames').list(id);
    await supabase.storage.from('lesson-frames').remove(data.map(f => \`\${id}/\${f.name}\`));
  }
})();
"
```

```bash
# Reset Lesson.metadata.videoSource if you set bad mappings
# (run per-lessonId)
psql $DATABASE_URL -c "UPDATE \"Lesson\" SET metadata = metadata - 'videoSource' WHERE id IN ('lesson_id_1', ...);"
```

### 8.3 Wrong mapping discovered after ship

If a smoke or user report reveals wrong file→lesson mapping (e.g., frames from `lessonA` indexed under `lessonB`):

1. Delete bad chunks for affected lessons (8.2)
2. Update `Lesson.metadata.videoSource` to correct file (DB or via `import-mappings.ts`)
3. Re-run ingest for those specific lessons (use a custom selection JSON containing only the affected lessons)
4. Document in decision-${SUFFIX}-amendment.md

---

## 9. Cost model

Reference: Sprint 2C actuals → $0.94 for 79 lessons × ~8 frames/lesson avg = 644 frames.

| Sprint scale | Lessons | Frames (est) | VLM cost | Embed cost | Storage | Total |
|--------------|---------|--------------|----------|------------|---------|-------|
| 1 dry-pilot | 5 | ~40 | $0.06 | <$0.001 | trivial | **$0.06** |
| Course-size | ~80 | ~640 | $0.94 | $0.001 | trivial | **$0.94** |
| Sprint 3 (4 courses) | ~351 | ~2800 | $4.10 | $0.003 | trivial | **$4.10** |
| Full re-ingest | 440 | ~3520 | $5.16 | $0.004 | trivial | **$5.16** |

**Pricing inputs (verify on OpenRouter at sprint time):**
- `openai/gpt-4.1-mini`: $0.40 / 1M input tokens, $1.60 / 1M output. ~1500/200 tokens per frame → $0.0014-0.0016/frame.
- `openai/text-embedding-3-small`: $0.020 / 1M tokens. ~50 tokens per chunk → $0.000001/chunk.
- Supabase Storage: $0.021/GB-month. 644 jpgs × ~80KB = 50MB → $0.001/month.

---

## 10. Troubleshooting

### "fetch failed" / "operation aborted" in VLM

**Cause:** transient OpenRouter rate-limit OR network blip.
**Fix:** vlm-describe.ts has 60s timeout + JSONL resume. Re-run the same command — errored frames re-attempted, successful frames skipped.

### Selector picks wrong file for a lesson

**Diagnose:** check the LLM judge rationale in `results/low-confidence-${SUFFIX}.csv` if confidence < 8. If confidence ≥ 8 but still wrong: bug in candidate generation, manually override via `Lesson.metadata.videoSource`.
**Fix:** put correct mapping in CSV review file, run `import-mappings.ts`, re-run selector.

### ffmpeg "codec not found"

**Cause:** course has unusual video codec (HEVC, etc.).
**Fix:** install full ffmpeg build (`gyan.dev` on Windows). If still failing, convert source video to H.264 first.

### Embedding INSERT fails with vector dimension mismatch

**Cause:** content_chunk.embedding is `vector(1536)`. Embedding model returned different size.
**Fix:** verify `OPENROUTER_EMBEDDING_MODEL=text-embedding-3-small` (1536d). text-embedding-3-large is 3072d → won't fit.

### Smoke accuracy below threshold

**Diagnose:** read `results/smoke-${SUFFIX}.md`. Categorize fails:
- All categories suffer → likely a system-wide regression (model change, prompt change). Roll back.
- Only `hybrid` suffers (>50%) → known issue (Phase 56 backlog). Document, may still ship if other categories hold.
- One specific module's lessons fail → wrong mapping for those lessons. Spot-check selection JSON for that module.

### Pipeline left frames in local `results/frames/` taking disk space

```bash
# Safe to delete after sprint is shipped (regeneratable from source videos)
rm -rf scripts/vision-ingest/results/frames/
```

---

## 11. Quick reference

```bash
# Sprint launch
git checkout -b phase-55-sprint-N
export INGEST_SUFFIX=sprintN

# Selection + validation
npx tsx --env-file=.env scripts/vision-ingest/select-v4.ts
npx tsx --env-file=.env scripts/vision-ingest/validate-selection.ts || exit 1

# Optional dry-run (new courses)
# ... see §4 ...

# Ingest (run each, check log, proceed if green)
for step in extract-frames-prod dedup-frames vlm-describe upload-frames-storage embed-and-insert; do
  npx tsx --env-file=.env scripts/vision-ingest/${step}.ts \
    > scripts/vision-ingest/results/logs/${step}.log 2>&1 || break
done

# Smoke + decision
npx tsx --env-file=.env scripts/vision-ingest/smoke-baseline.ts --suffix ${INGEST_SUFFIX}
# Read smoke-${INGEST_SUFFIX}.md, write decision-${INGEST_SUFFIX}.md, commit, PR
```

---

## See also

- `ARCHITECTURE.md` — how vision RAG works internally
- `results/decision-sprint2c.md` — last sprint's outcome and lessons
- `MAAL/.claude/memory/feedback_vision_ingest_safety.md` — codified safety rules
- `MAAL/CLAUDE.md` — project-wide gotchas
