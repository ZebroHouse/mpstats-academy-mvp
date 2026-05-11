# scripts/vision-ingest/

Phase 55 — production vision-RAG ingest pipeline.

Throwaway PoC scripts live in `scripts/vision-poc/` (Sprint 1 reference). This folder is the production-grade evolution.

## Quick start

```bash
# 1. Setup env (see PLAYBOOK §0)
export INGEST_SUFFIX=sprintN

# 2. Selection + validation (gate 1)
npx tsx --env-file=.env scripts/vision-ingest/select-v4.ts
npx tsx --env-file=.env scripts/vision-ingest/validate-selection.ts || exit 1

# 3. Pipeline (extract → dedup → VLM → upload → embed)
for step in extract-frames-prod dedup-frames vlm-describe upload-frames-storage embed-and-insert; do
  npx tsx --env-file=.env scripts/vision-ingest/${step}.ts \
    > scripts/vision-ingest/results/logs/${step}.log 2>&1 || break
done

# 4. Smoke + decision (gate 3)
OPENROUTER_DEFAULT_MODEL=openai/gpt-4.1-mini \
  npx tsx --env-file=.env scripts/vision-ingest/smoke-baseline.ts --suffix ${INGEST_SUFFIX}
```

**FULL PROCEDURE → see [`PLAYBOOK.md`](./PLAYBOOK.md). DO NOT skip the gates.**

## Documents

| Doc | Purpose |
|-----|---------|
| [`PLAYBOOK.md`](./PLAYBOOK.md) | Operational guide: env, 7-step procedure, 3 gates, rollback, cost model, troubleshooting |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | System design: data flow, schema, retrieval profiles, generation, VLM prompt design |
| [`results/decision.md`](./results/decision.md) | Sprint 2 verdict (pilot) |
| [`results/decision-sprint2c.md`](./results/decision-sprint2c.md) | Sprint 2C verdict (10→89 lessons) |
| `MAAL/.claude/memory/vision-ingest-safety.md` | 7 codified safety rules from Sprint 2/2C incidents |

## Scripts

| Script | Purpose | Resumable? |
|--------|---------|-----------|
| `select-v4.ts` (planned) | Map local videos → lesson IDs with LLM judge + DB-persisted mappings | Yes |
| `select-sprint2c-lessons.ts` / `v2` / `v3` | Sprint 2C selector iterations (kept for historical reference) | — |
| `apply-manual-overrides.ts` | Sprint 2C one-off correction for m01_intro / m08 mappings | — |
| `validate-selection.ts` (planned) | Pre-flight gate — exit 1 on scope mismatch / missing files / duplicates | — |
| `extract-frames-prod.ts` | ffmpeg @ 1 fps/60s, cap 120/video | Recreates per lesson |
| `dedup-frames.ts` | dhash hamming dedup (~15-20% reduction) | Recreates from manifest |
| `vlm-describe.ts` | OpenRouter VLM → JSON {summary, urls, numbers, tools}. Concurrency=5, 60s timeout | **Yes (JSONL append)** |
| `upload-frames-storage.ts` | Upload dedup'd jpgs to Supabase Storage `lesson-frames` bucket | `upsert: true` |
| `embed-and-insert.ts` | `text-embedding-3-small` → INSERT into `content_chunk` (`source_type='academy_video_frame'`) | Idempotent INSERT |
| `smoke-baseline.ts` (planned) | Auto-generate questions from VLM frame summaries + LLM-judge score | — |
| `smoke-test-sprint2c.ts` | Sprint 2C manual smoke (18Q on 6 lessons) | — |

## Parametrization via `INGEST_SUFFIX`

All 5 pipeline scripts read/write artifacts namespaced by `INGEST_SUFFIX` env var:

| Suffix unset (pilot) | Suffix=`sprint2c` |
|----------------------|-------------------|
| `selected-pilot-lessons.json` | `selected-sprint2c-lessons.json` |
| `frames-manifest.json` | `frames-manifest-sprint2c.json` |
| `vlm-runs.json` + `.jsonl` | `vlm-runs-sprint2c.json` + `.jsonl` |

Different sprints don't collide. Pilot artifacts remain untouched on Sprint 2C run.

## State (as of 2026-05-11)

- **DB:** 792 frame chunks across 89 lessons of `03_ai`. Source: `content_chunk` where `source_type='academy_video_frame'`.
- **Storage:** ~792 jpgs in Supabase `lesson-frames` bucket.
- **Production model:** `OPENROUTER_DEFAULT_MODEL=openai/gpt-4.1-mini` (selector + chat + VLM).
- **Smoke baseline:** 88.9% on Sprint 2C (16/18, threshold ≥80%).

## Dependencies

- `ffmpeg` ≥6.x + `ffprobe` in PATH (frame extraction + duration probing)
- `sharp` (npm) — perceptual hash for dedup
- Node 22.x+, tsx ≥4.21
- Env: `DATABASE_URL`, `SUPABASE_MGMT_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_VISION_KEY`, `OPENROUTER_DEFAULT_MODEL`

See [PLAYBOOK §0](./PLAYBOOK.md#0-prerequisites) for full env setup.
