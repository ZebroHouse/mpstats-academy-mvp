# Phase 55 Sprint 3 — Course `05_ozon` Decision

**Date:** 2026-05-15
**Branch:** `phase-55-sprint-3`
**Scope:** 76 visible-unprocessed `05_ozon_*` lessons (m00-m07).
**Verdict:** **GO** — smoke 88.9% (16/18) PASS.

## Pipeline Metrics

| Metric | Drypilot (5) | Rest (71) | Total (76) |
|---|---|---|---|
| Raw frames | 104 | 1,430 | 1,534 |
| After dedup | 93 | 1,072 | 1,165 |
| Dedup ratio | 10.6% | 25.0% | ~24% |
| VLM cost | $0.1525 | $1.5247 | **$1.6772** |
| VLM errors final | 0 | 0 | 0 |
| Chunks in DB | 93 | 1,072 | **1,165** |
| Storage objects | 93 | 1,072 | 1,165 |
| Lessons covered | 5/5 | 71/71 | **76/76** |

## Smoke (sprint3-ozon)

| Category | Y/P/N | Accuracy |
|---|---|---|
| url-tool | 3/0/0 | **100%** |
| number-metric | 13/0/2 | **87%** |
| **Total** | **16/0/2** | **88.9%** |

Latency avg 12.8s / max 20.7s — higher than other courses (ozon lessons have denser frame coverage; retrieval context larger). Within acceptable envelope but flagged.

## Selector

- 0 pre-existing
- 74 auto-accepted ≥8 (high heuristic, no LLM judge calls needed)
- 2 low-confidence → 2 approved (m00 ассортимент part-2, m04 Q&A эфир — both clear topic matches)
- 0 unmatched videos — clean 1:1 course

## Run notes

Heavy local network instability during upload-storage — required `upload-frames-storage.ts` patch with **skip-existing** (lists storage per lesson, skips already-uploaded) + per-file 4-retry. After patch, upload converged across 3 passes (631 → +remaining → all 1072 confirmed in storage). Embed-and-insert (RAG-critical, reads VLM jsonl not storage) was run first and completed cleanly — RAG coverage never depended on the storage upload finishing.

Cumulative Sprint 3 cost: $6.87 (workshops $2.70 + analytics $1.09 + ads $1.25 + ozon $1.68 + smokes ~$0.15).
