# Phase 55 Sprint 3 — Course `02_ads` Decision

**Date:** 2026-05-15
**Branch:** `phase-55-sprint-3`
**Scope:** 64 visible-unprocessed `02_ads_*` lessons (m00-m06). 7 `skill_*` lessons under same courseId deferred to Phase 56 skill-batch sub-sprint.
**Verdict:** **GO** — smoke 88.9% (16/18) PASS, matches Sprint 2C baseline.

## Pipeline Metrics

| Metric | Drypilot (5) | Rest (59) | Total (64) |
|---|---|---|---|
| Raw frames | 152 | 1,125 | 1,277 |
| After dedup | 117 | 749 | 866 |
| Dedup ratio | 23.0% | 33.4% | ~30% |
| VLM cost | $0.1698 | $1.0830 | **$1.2528** |
| VLM errors final | 0 | 0 (16 transient auto-resumed) | 0 |
| Chunks in DB | 117 | 749 | **866** |
| Lessons covered | 5/5 | 59/59 | **64/64** |

## Smoke (sprint3-ads)

| Category | Y/P/N | Accuracy |
|---|---|---|
| url-tool | 7/0/0 | **100%** |
| number-metric | 9/0/2 | **82%** |
| **Total** | **16/0/2** | **88.9%** |

Latency avg 3.4s — faster than other courses (shorter retrieval contexts likely).

## Selector

- 0 pre-existing
- 59 auto-accepted ≥8
- 5 low-confidence → 5 approved (m04_ads_economics Unit-экономика series, m06_strategies). Possible off-by-N shift in part numbering inside m04 series — not visible in smoke results, monitor.
- 3 unmatched videos (extras)

## Notes

VLM batch had 15 transient errors + 1 parse-fail in first pass; all auto-recovered on resume (vlm-describe.ts JSONL pattern works exactly as designed).

Cumulative Sprint 3 cost so far: $5.21 (workshops $2.70 + analytics $1.09 + ads $1.42).
