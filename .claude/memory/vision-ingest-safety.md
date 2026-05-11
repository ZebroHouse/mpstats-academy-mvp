# Vision Ingest Safety Rules

Codified safety rules for the Phase 55 vision-RAG ingest pipeline (`scripts/vision-ingest/`).
Each rule traces to an actual incident or near-miss in Sprint 2 / Sprint 2C.
**Authoritative for all future sprints. Cross-AI (Claude / Codex / Gemini).**

> See also: `scripts/vision-ingest/PLAYBOOK.md` (operational guide), `scripts/vision-ingest/ARCHITECTURE.md` (system design).

---

## Rule 1: AbortController timeout on every external API fetch

**What:** every `fetch()` to OpenRouter / Supabase API / etc. MUST wrap in `AbortController` with explicit timeout (60s default, 30s for embedding batches).

**Why:** Sprint 2C first VLM run hung 40 minutes on a single frame (frame 142/644) before being noticed. No timeout → infinite wait on a stuck connection. Wasted 40 min wall-time and $0 of API spend (call never billed), but the worker was permanently blocked.

**How to apply:** in any new ingest script that does external API calls:
```ts
const ctl = new AbortController();
const timer = setTimeout(() => ctl.abort(), 60_000);
try {
  const res = await fetch(url, { signal: ctl.signal, ... });
  // ...
} finally {
  clearTimeout(timer);
}
```

**Verify:** grep `scripts/vision-ingest/*.ts` for `fetch(` without `signal:` nearby → bug.

---

## Rule 2: Resumable ingest via per-record JSONL append

**What:** any pipeline step that processes N records (frames, lessons, embeddings) MUST append each result to a `.jsonl` file as it completes, AND on startup MUST read the JSONL to skip already-completed records.

**Why:** Sprint 2C first VLM run produced 137 successful results then hung. Old script accumulated results in memory and wrote JSON only at the end → all 137 lost when process killed. Cost $0.21 of redundant retry.

**How to apply:** see `vlm-describe.ts` after Sprint 2C rewrite:
```ts
// On startup
const doneIds = new Set<string>();
if (existsSync(jsonlPath)) {
  for (const line of readFileSync(jsonlPath, 'utf8').split('\n').filter(Boolean)) {
    const r = JSON.parse(line);
    if (!r.error && r.response) doneIds.add(r.frameId);  // only successes count as done
  }
}

// Per record
appendFileSync(jsonlPath, JSON.stringify(result) + '\n');
```

Successful records are skipped; errored records are retried. Final aggregated JSON is built from JSONL at end.

**Verify:** any new pipeline script processing >50 items should follow this pattern. Reviewer: ask "what happens if killed at 50%?"

---

## Rule 3: Pre-flight selection validation before ingest

**What:** every sprint MUST run `validate-selection.ts` (or equivalent gate) before starting the cost-incurring pipeline steps. Validation must hard-fail (exit 1) on:
- scope mismatch (selected count != DB unprocessed-visible count)
- duplicate lessonIds
- selected lessonIds not in DB or `isHidden=true`
- local video files missing on disk

**Why:** Sprint 2C v1 selector silently produced 53/79 coverage AND 1 duplicate. Caught only by post-hoc node script comparing to DB. Without that catch, pipeline would have ingested wrong-lesson frames OR partial coverage AND we'd ship "complete" without realizing.

**How to apply:** run `scripts/vision-ingest/validate-selection.ts` as part of `PLAYBOOK.md` gate 1. CI-style: exit 1 blocks the next pipeline step.

**Verify:** before any `extract-frames-prod.ts` invocation, the validator must have passed for the same `INGEST_SUFFIX`.

---

## Rule 4: Small-batch dry-run on new courses

**What:** when starting ingest on a course that has never been ingested before, FIRST run pipeline on 3-5 lessons of that course, verify smoke, only THEN run full sprint.

**Why:** courses have different filename conventions, ffmpeg-incompatible codecs, hidden lesson distributions. Sprint 2 / Sprint 2C only ran `03_ai` so we don't know surprises in `01_*`, `02_*`, `04_*`. Catching a course-specific bug on 5 lessons costs $0.06; catching it on 100 lessons after smoke fails costs $5 + 3 hours of analysis.

**How to apply:** `PLAYBOOK.md` §4 documents the dry-run procedure. Use `INGEST_SUFFIX=sprintN-drypilot` to isolate artifacts.

**Verify:** any sprint that touches new courses must have a dry-run committed (`results/decision-${SUFFIX}-drypilot.md`) before full-sprint commits.

---

## Rule 5: Hidden-lesson awareness in every query

**What:** every SQL touching the `Lesson` table that's used for ingest/selector logic MUST include `AND "isHidden" = false` (or explicit handling of hidden lessons). Every selection-validation MUST flag if `file_count_in_module > visible_lesson_count_in_module` (suggests hidden lessons interleaved).

**Why:** Sprint 2 selector originally fetched a pilot lesson `03_ai_m01_intro_001` that became `isHidden=true` after selection but before smoke. Smoke failed because the lesson wasn't accessible. Sprint 2C selector v3 mis-mapped m01_intro because 3 hidden lessons were interleaved with visible ones, breaking the positional algorithm.

**How to apply:**
- Selector queries: `WHERE "isHidden" = false` always
- Validator: warn if `module_files > module_visible_lessons` and require explicit drop list
- VLM/smoke: skip lessons that are `isHidden=true` even if previously selected

**Verify:** grep `from "Lesson"` in scripts/vision-ingest/ — every result should have isHidden filter unless explicitly handling hidden case.

---

## Rule 6: Idempotent selector with deterministic mapping

**What:** selector output for a given (course, INGEST_SUFFIX) MUST be deterministic. Re-running selector twice produces byte-identical JSON. Manually-approved mappings persist (via `Lesson.metadata.videoSource` in DB) so they don't need re-resolution.

**Why:** Sprint 2C had non-deterministic resolver behavior (LIKE query result order varied). Re-running v1 selector twice produced slightly different mappings depending on row ordering. This makes regression testing impossible and audit trails unreliable.

**How to apply:**
- Selector v4: persist approved mappings to `Lesson.metadata.videoSource`
- Future runs read existing mappings first; only resolve unmapped lessons
- All DB queries sort explicitly (`ORDER BY "order" ASC, id ASC` for stable tiebreaks)
- Selector writes a hash of its inputs+outputs to log; identical hash on re-run = deterministic

**Verify:** run selector twice in succession; `diff` the two output JSONs → must be empty.

---

## Rule 7: Cost & coverage logging

**What:** every pipeline step MUST log start-time, end-time, records-processed, cost (USD), and errors-encountered. The decision document MUST tabulate these per-step.

**Why:** Sprint 2 decision.md had cost ($0.2256) but Sprint 2C's first VLM run had no cumulative-cost printout — only learned the final $0.94 number from JSON read after completion. Mid-run, no visibility into spend rate. Bad for budget control on bigger sprints.

**How to apply:** every long-running script:
```ts
const t0 = Date.now();
let cumCost = 0;
// ... per record:
cumCost += recordCost;
console.log(`[${i}/${total} eta=${eta}s spent=$${cumCost.toFixed(2)}] ...`);
// ... at end:
console.log(`\nDone in ${((Date.now()-t0)/1000).toFixed(0)}s, cost $${cumCost.toFixed(4)}, ${errors} errors`);
```

Decision documents must include the Sprint 2C-style metrics table comparing sprint cost to budget.

**Verify:** every decision-${SUFFIX}.md has a "Pipeline Metrics" table with cost column.

---

## Application checklist

Before kicking off a new sprint, confirm all 7 rules satisfied:

- [ ] All `fetch()` calls have AbortController + timeout (Rule 1)
- [ ] VLM / embed / upload scripts append JSONL and resume (Rule 2)
- [ ] `validate-selection.ts` passes before ingest (Rule 3)
- [ ] If new course: drypilot 3-5 lessons before full (Rule 4)
- [ ] All Lesson queries include `isHidden=false` (Rule 5)
- [ ] Selector re-run produces identical output; mappings persist in DB (Rule 6)
- [ ] All scripts log cost cumulatively + final tally (Rule 7)

## Incident log

| Date | Incident | Rule it would have prevented |
|------|----------|------------------------------|
| 2026-05-08 (Sprint 2) | Pilot included m01_intro_001 which became hidden between selection and smoke → 1Q skipped | Rule 5 |
| 2026-05-11 (Sprint 2C) | First v1 selector produced 53/79 + 1 duplicate, only caught by post-hoc diff against DB | Rule 3 |
| 2026-05-11 (Sprint 2C) | First VLM run hung 40 min on frame 142, lost 137 in-memory results when killed | Rules 1 + 2 |
| 2026-05-11 (Sprint 2C) | v3 selector mis-mapped m01_intro (5 hidden lessons interleaved) and m08 (last 3 scrambled) → manual override needed | Rules 5 + 6 |
| 2026-05-11 (Sprint 2C) | No mid-run cost visibility during VLM | Rule 7 |
