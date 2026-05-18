# Phase 55 Sprint 3 — Course `06_express` Decision

**Date:** 2026-05-17
**Branch:** `phase-55-sprint-3`
**Scope:** 64 visible-unprocessed `06_express_*` lessons (nested `cNN_*_mNN_*` structure).
**Verdict:** **GO** — smoke 100% (18/18).

## Pipeline Metrics

| Metric | Drypilot (5) | Rest (59) | Single (1) | Total (64) |
|---|---|---|---|---|
| Raw frames | 197 | 1,237 | 1 | 1,435 |
| After dedup | 166 | 932 | 1 | 1,099 |
| VLM cost | $0.2417 | $1.3842 | $0.0014 | **$1.6273** |
| VLM final state | 0 err | 1 parse-fail | 0 err | 1 frame dropped |
| Chunks in DB | 166 | 931 | 1 | **1,098** |
| Lessons covered | 5/5 | 58/59 → 59/59* | 1/1 | **64/64** |

\* One lesson `c04_product_choice_m01_start_004` is a 27-second clip ("Материалы и внешние ссылки"). `extract-frames-prod.ts` `fps=1/60` sampling produces 0 frames for sub-60s videos. Handled with a one-off single-frame grab at t=13s (`INGEST_SUFFIX=sprint3-exp-single`), VLM-described and inserted normally → lesson covered.

## Smoke (sprint3-exp)

| Category | Y/P/N | Accuracy |
|---|---|---|
| url-tool | 1/0/0 | **100%** |
| number-metric | 17/0/0 | **100%** |
| **Total** | **18/0/0** | **100%** |

Latency avg 3.6s.

## Selector / Validator — nested module support

`06_express` is the only course with **nested module IDs**: `06_express_c01_ai_content_m01_content_001` (outer c-block + inner m-block). This broke the validator:
- `inferModuleSlug` rewritten to return the **innermost** `<letter>\d+_slug` token (matches selector's `module` field)
- Check 8 SQL `LIKE` pattern changed `${course}_${mod}_%` → `${course}_%${mod}_%` so the `%` absorbs the outer block

After fixes: FAIL 0, WARN 1 (the 27s duration outlier — expected). Selector itself handled nesting fine — 64/64 auto-accepted, 0 low-confidence.

## Known limitation

1 frame (`c02_seo_m04_strategies_017_frame_012`) is a persistent VLM parse-fail (model returns non-JSON even on retry). 0.1% of the course; the lesson has many other frames. Accepted.

Cumulative Sprint 3 cost: $8.44 (5 courses + smokes).
