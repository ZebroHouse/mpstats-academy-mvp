# Phase 55 Sprint 3 — Full-Platform Vision-RAG Ingest — Final Decision

**Date:** 2026-05-15 → 2026-05-17
**Branch:** `phase-55-sprint-3`
**Scope:** Roll out vision-RAG frame indexing to the 5 remaining active courses (04_workshops, 01_analytics, 02_ads, 05_ozon, 06_express).
**Verdict:** **COMPLETE** — 268 lessons ingested across 5 courses, every course smoke ≥88.9%. Platform vision coverage now **356/389 visible lessons (91.5%)** — exceeds the 80% threshold for removing the in-chat "ассистент не видит экран" disclaimer.

---

## Per-course results

| Course | Lessons | Frame chunks | Smoke | VLM cost |
|--------|---------|--------------|-------|----------|
| 04_workshops | 24/24 | 1,919 | 94.4% (17/18) | $2.70 |
| 01_analytics | 40/40 | 735 | 100% (18/18) | $1.09 |
| 02_ads | 64/64 | 866 | 88.9% (16/18) | $1.25 |
| 05_ozon | 76/76 | 1,165 | 88.9% (16/18) | $1.68 |
| 06_express | 64/64 | 1,098 | 100% (18/18) | $1.63 |
| **Total** | **268/268** | **5,783** | **avg 94.4%** | **$8.34** |

Smokes + selector LLM judge: ~$0.11. **Sprint 3 total ≈ $8.45** (budget $10).

---

## Platform coverage

| Metric | Count |
|--------|-------|
| Visible lessons (platform-wide) | 389 |
| With vision frames after Sprint 3 | 356 (**91.5%**) |
| Uncovered | 33 — all `skill_*` synthetic lessons |

Pre-Sprint-3 baseline was 89 lessons (03_ai pilot + Sprint 2C). Sprint 3 added 268. Vision coverage went 89 → 357 indexed (356 distinct visible).

---

## Success Criteria

| SC | Criterion | Status |
|----|-----------|--------|
| SC1 | All 5 courses' module-lessons covered | ✅ 268/268 |
| SC2 | Every course smoke ≥80% | ✅ min 88.9% |
| SC3 | Cost within budget | ✅ $8.45 / $10 |
| SC4 | Platform coverage >80% (disclaimer removal gate) | ✅ 91.5% |
| SC5 | Pipeline idempotent/resumable through network failures | ✅ — see below |

---

## Scope decision: `skill_*` lessons deferred

33 visible lessons platform-wide carry `skill_*` IDs (e.g. `skill_analytics_assortment_001`) while sharing a regular `courseId` (`01_analytics`, `02_ads`, ...). These are skill-batch synthetic Lesson rows from the 21.04/24.04 skill-classification passes — they re-tag existing course content into skill-block views. They have no independent video files; the selector cannot map them positionally.

**Deferred to Phase 56** as a dedicated "skill-frame linkage" task: rather than re-ingesting, the skill_* lessons should *reference* the frame chunks of their source module-lessons (a lesson_id alias or a shared-chunk lookup). This is a retrieval-layer change, not an ingest run.

Impact: in-lesson chat for the 33 skill_* lessons keeps audio-only RAG until Phase 56. 91.5% of the platform has full vision.

---

## Pipeline hardening done during Sprint 3

The local network was severely unstable across the multi-day run (firewall/VPN dropping large POSTs — uploads reset at ~64 KB). The pipeline was hardened so this never cost data or money:

1. **Validator (`validate-selection.ts`)**
   - `LESSON_ID_RE` broadened `m\d+` → `[a-z]\d+` (workshops `w*`, express `c*`).
   - `inferModuleSlug` rewritten to return the innermost module token (nested `cNN_*_mNN_*` IDs).
   - Check 8 SQL `LIKE` pattern absorbs the outer block for nested IDs.

2. **`embed-and-insert.ts`**
   - OpenRouter embed fetch wrapped in 4-attempt retry + `AbortController` 60s timeout.
   - Skip-existing query at startup → fully resumable; re-runs only process missing chunks.
   - Run against `DIRECT_URL` (session-mode Postgres) for stable long batch inserts.

3. **`upload-frames-storage.ts`**
   - Per-lesson storage `list()` → skip already-uploaded frames.
   - Per-file 4-attempt retry with backoff.
   - Re-runs converge instead of restarting from zero.

All three idempotency patterns proved out: across ~6 network-induced interruptions, zero VLM re-spend, zero data loss.

---

## Known limitations

- 1 frame (`06_express c02_seo_m04_strategies_017_frame_012`) is a permanent VLM JSON parse-fail — 0.1% of that course, lesson well-covered otherwise.
- `c04_product_choice_m01_start_004` (27s clip): `fps=1/60` extraction yields 0 frames for sub-60s videos. Handled with a one-off single-frame grab. **Backlog:** `extract-frames-prod.ts` should always emit ≥1 frame regardless of duration.
- Storage upload `upsert:true` re-uploads were wasteful before the skip-existing patch — now fixed.

---

## Recommended follow-ups

1. **Remove the chat disclaimer** "ассистент отвечает по аудио, не видит экран" — coverage 91.5% clears the bar. UI string in lesson chat component.
2. **Phase 56 — skill_* frame linkage** (33 lessons) — retrieval-layer aliasing, no re-ingest.
3. **Phase 56 inherited** — hybrid retrieval re-ranking for abstract list/criteria queries (the recurring number-metric smoke misses).
4. `extract-frames-prod.ts` — guarantee ≥1 frame for sub-interval videos.

---

## Artifacts

Per-course: `decision-sprint3-{w,a,ads,ozon,exp}.md`, `selected-sprint3-*-lessons.json`, `smoke-sprint3-*.md` + checklists.
DB: 5,783 new `content_chunk` rows (`source_type='academy_video_frame'`).
Supabase Storage `lesson-frames`: ~5,780 new jpgs.
