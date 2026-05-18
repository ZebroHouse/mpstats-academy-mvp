# Phase 55 Sprint 3 — Course `04_workshops` Decision

**Date:** 2026-05-15
**Branch:** `phase-55-sprint-3`
**Scope:** 24 visible-unprocessed lessons of `04_workshops` (workshop series w01-w11).
**Verdict:** **GO** — smoke 94.4% (17/18) crushes 80% threshold. Pipeline scales to long-form workshop content; ready to roll out to remaining 4 courses.

---

## Pipeline Metrics

| Metric | Drypilot (5 lessons) | Rest (19 lessons) | Total (24) |
|--------|----------------------|-------------------|------------|
| Raw frames extracted | 551 | 2,143 | 2,694 |
| Frames after phash dedup | 365 | 1,554 | 1,919 |
| Dedup ratio | 33.8% | 27.5% | ~28% avg |
| VLM cost | $0.5207 | $2.1775 | **$2.6982** |
| VLM errors (after resume) | 0 | 0 (12 transient auto-recovered) | 0 |
| Embedding cost | ~$0.0004 | ~$0.0016 | ~$0.0020 |
| Storage objects in `lesson-frames` | 365 | 1,553 (1 missing — non-blocking) | 1,918 |
| Frame chunks in DB | 365 | 1,554 | **1,919** |
| Lessons covered | 5/5 | 19/19 | **24/24** |

> Workshops are 2-2.5h videos vs Sprint 2C 03_ai ~10-20min. After 120-frame cap + ~28% dedup, average is ~80 frames/lesson (vs Sprint 2C 8 frames/lesson).

---

## Success Criteria

| SC | Criterion | Status | Evidence |
|----|-----------|--------|----------|
| SC1 | Selection covers 100% visible-unprocessed lessons | ✅ | 24/24, after 6 manual reviews + w09 swap fix (see Selector section) |
| SC2 | Pipeline runs to completion | ✅ | 0 ffmpeg, 0 VLM, 0 embed errors (transient retried) |
| SC3 | Cost within budget | ✅ | $2.70 (well under per-course budget) |
| SC4 | Smoke accuracy ≥80% | ✅ | **94.4%** (17/18) |
| SC5 | Pipeline idempotent/resumable | ✅ | embed-and-insert.ts patched with `skip-existing` query at startup |

---

## Smoke Test (sprint3-w)

6 lessons × 3 questions = 18 Q&A, auto-generated from VLM frame summaries, LLM-judged.

| Category | Y / P / N | Accuracy |
|----------|-----------|----------|
| url-tool | 2 / 0 / 0 | **100%** |
| number-metric | 15 / 0 / 1 | **94%** |
| hybrid | 0 / 0 / 0 (n/a) | — |
| **Total** | **17 / 0 / 1** | **94.4%** |

Latency: avg 5.3s / p50 5.6s / max 7.6s — within prod envelope.

**Lesson sample:**
- w02_mar_detox_001, w03_apr_growth_001, w04_may_navigator_003
- w05_jun_seo_002, w06_jul_q4_002, w08_sep_100days_001

Model: `openai/gpt-4.1-mini` (prod default).

---

## Selector v4 outcomes

- Pre-existing (P5 dry-run, May 11): **18 lessons** already mapped in `Lesson.metadata.videoSource`.
- Selector v4 produced: 6 low-confidence candidates (score 5.0-5.5, all positional 1:1 but below LLM-judge threshold 8).
- **Manual review caught 1 real swap:** `w09_oct_ai2` — alphabetic file sort (`002_2_den._neyroseti` < `1._1_den._kontent`) inverted day mapping. Fixed in approved CSV.
- 6 mappings imported as `source: human-review` via `import-mappings.ts`.

---

## Pipeline issues encountered (and fixes)

1. **Validator regex too narrow** — `LESSON_ID_RE` hardcoded `m\d+_*`. Workshops use `w\d+_*`. **Fix:** broadened to `[a-z]\d+_*` ([commit b9a6c6c](.)). Covers w (workshops), c (express), m (modules). Re-run: FAIL 0.

2. **Local network flapping** — Multiple OpenRouter/Supabase Storage drops over 24h (firewall? VPN?). Upload-frames retried 4 times to complete (idempotent via `upsert:true`). Embed-and-insert wrapped in retry loop.

3. **Embed-and-insert not resumable** — single pg.Client through 1554 inserts dropped mid-run. Patched with:
   - Retry wrapper around OpenRouter embeddings fetch (4 attempts, exponential backoff)
   - `skip-existing` query at startup: filters out frames whose chunks are already in DB

   Re-run picks up where last left off — embed→insert phase reduced from full 1554 to remaining ~100 on each successive attempt.

   `DATABASE_URL` swapped to `DIRECT_URL` (session mode, port 5432) for the embed-and-insert run — pgbouncer transaction mode (6543) was timing out on long batch inserts.

---

## Backlog inherited / new

- (inherited) Hybrid retrieval re-ranking for abstract list/criteria queries — Phase 56.
- (inherited) Selector v4 already deployed; works for workshops via DB-persisted mappings + manual swap fix.
- (new) **embed-and-insert.ts skip-existing pattern** — should be permanent in the script. Currently patched on Sprint 3 branch.
- (new) **upload-frames-storage.ts retry/skip pattern** — same idempotency gap. Each network blip costs a full re-run. Phase 56 candidate.

---

## Artifacts

- `scripts/vision-ingest/results/selected-sprint3-w-lessons.json` — 24 final selections
- `scripts/vision-ingest/results/low-confidence-sprint3-w-approved.csv` — manual review (6 rows, includes w09 swap fix)
- `scripts/vision-ingest/results/smoke-sprint3-w.md` — full Q&A transcript
- `scripts/vision-ingest/results/smoke-sprint3-w-checklist.md` — score table + verdict
- `scripts/vision-ingest/results/vlm-runs-sprint3-w.json` — merged VLM outputs (gitignored, 1919 frames)
- DB: 1919 new `content_chunk` rows (`source_type='academy_video_frame'`, lesson_ids `04_workshops_*`)
- Supabase Storage `lesson-frames`: 1918 new jpgs (1 missing — non-blocking, embedding present)

---

## Next: 01_analytics → 02_ads → 05_ozon → 06_express

Per playbook: same procedure. Selector v4 should reach high auto-accept rates on standard `mNN_*` modules. 06_express has nested `cNN_*_mNN_*` — may need selector inspection.
