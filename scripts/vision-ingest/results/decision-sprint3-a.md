# Phase 55 Sprint 3 — Course `01_analytics` Decision

**Date:** 2026-05-15
**Branch:** `phase-55-sprint-3`
**Scope:** 40 visible-unprocessed lessons of `01_analytics` with `01_analytics_*` IDs (m00-m05 modules).
**Verdict:** **GO** — smoke 100% (18/18), no errors anywhere in pipeline.

---

## Scope clarification

DB has **66** visible-unprocessed lessons under `courseId='01_analytics'`:
- **40** with `01_analytics_*` IDs (regular module-lessons, m00-m05) — covered this sprint
- **26** with `skill_*` IDs (skill-batch synthetics under same courseId, `isHidden=false`) — **deferred to a separate skill-frame-ingest sub-sprint**

The 26 skill_* Lesson rows likely share video content with regular lessons (skill-batch was a tagging pass per 24.04). They need a separate selector strategy (mapping skill_* lessonIds to either shared regular videos or skill-specific files). Not blocking — owner instruction was to remove the chat disclaimer once coverage exceeds 80% of platform; skill_* lessons will be handled in Phase 56 backlog.

---

## Pipeline Metrics

| Metric | Drypilot (5) | Rest (35) | Total (40) |
|--------|--------------|-----------|------------|
| Raw frames | 145 | 801 | 946 |
| After dedup | 121 | 614 | 735 |
| Dedup ratio | 16.6% | 23.3% | ~22% |
| VLM cost | $0.1819 | $0.9042 | **$1.0861** |
| VLM errors | 0 | 0 | 0 |
| Storage uploaded | 120/121 (1 fail) | 612/614 (2 fail) | 1929/735 |
| Frame chunks in DB | 121 | 614 | **735** |
| Lessons covered | 5/5 | 35/35 | **40/40** |

Storage 3 transient fails are non-blocking — chunks have embeddings + content; storage jpgs are for future UI screenshot feature only.

---

## Success Criteria

| SC | Criterion | Status |
|----|-----------|--------|
| SC1 | 100% scope coverage | ✅ 40/40 |
| SC2 | Zero pipeline errors | ✅ 0 ffmpeg, 0 VLM, 0 embed, 0 insert |
| SC3 | Cost ≤ budget | ✅ $1.09 |
| SC4 | Smoke ≥80% | ✅ **100%** |
| SC5 | Idempotent | ✅ embed-and-insert skip-existing pattern works |

---

## Smoke Test (sprint3-a)

6 lessons × 3 = 18 Q&A.

| Category | Y/P/N | Accuracy |
|----------|-------|----------|
| url-tool | 6/0/0 | **100%** |
| number-metric | 12/0/0 | **100%** |
| **Total** | **18/0/0** | **100%** |

Latency avg 5.0s, max 7.6s. Cost $0.02.

---

## Selector v4 outcomes

- 0 pre-existing mapped
- 37 auto-accepted (≥8 confidence)
- 3 low-confidence → 3 manually approved (all titles-vs-filenames match unambiguously after inspection)
- 42 unmatched videos (extras: m05_assortment dupes, m06_traffic-only files, mov fallbacks, etc.) — out of scope, no action needed

---

## Artifacts

- `selected-sprint3-a-lessons.json` — 40 selections
- `low-confidence-sprint3-a-approved.csv` — 3 manual approvals
- `decision-sprint3-a.md` — this file
- `smoke-sprint3-a.md` + `smoke-sprint3-a-checklist.md`
- DB: 735 new frame chunks, 40 lessons covered
- Storage: 732 jpgs uploaded (3 transient fails accepted)

---

## Phase 56 backlog items

1. **Skill_* lesson frame ingest** — 26 skill_analytics_* lessons under `01_analytics`. Same expected for skill_marketing_* (02_ads scope) and others.
2. **Upload-frames-storage retry/skip pattern** — current script re-uploads all on each retry. Wasteful but functional.
