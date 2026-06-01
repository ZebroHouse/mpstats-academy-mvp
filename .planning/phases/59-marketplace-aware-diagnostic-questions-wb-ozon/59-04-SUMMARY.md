---
phase: 59-marketplace-aware-diagnostic-questions-wb-ozon
plan: 04
date: 2026-06-01
executor: orchestrator-inline (worktree spawning blocked by sandbox — fell back to direct edit on phase-59 branch)
---

# 59-04 SUMMARY — Static deck wired into diagnostic.startSession

## What shipped

`diagnostic.startSession` now sources its 15 questions from the static deck assembled by Plan 59-03, replacing the LLM-bank path that existed since Phase 59 v1 (59-02). The LLM bank functions in `packages/api/src/utils/question-bank.ts` are marked `@deprecated` and kept dormant for potential future admin-driven generation.

### Files modified

- `packages/api/src/routers/diagnostic.ts` — startSession rewire
- `packages/api/src/routers/__tests__/diagnostic.test.ts` — test refresh
- `packages/api/src/utils/question-bank.ts` — @deprecated header

### Files NOT modified (deliberately)

- `apps/web/src/components/diagnostic/Question.tsx` — existing badge logic (`userMarketplaces.length === 2 && question.marketplace !== 'BOTH'`) is already exactly what plan 59-04 Task 2 wanted. Static deck only emits 'WB' or 'OZON' marketplace, so condition resolves correctly. Tests `apps/web/src/components/diagnostic/__tests__/Question.test.tsx` (7/7) confirm.
- `submitAnswer` / `getResults` / scoring — `correctIndex` in persisted `session.questions` is already the shuffled-position after `shuffleOptions` runs in startSession. Scoring continues to work unchanged.
- `packages/db/prisma/schema.prisma` — D-V2-* decisions are all schemaless.

## Acceptance evidence

### Tests

| Suite | Before | After | Delta |
|-------|--------|-------|-------|
| `@mpstats/api` (full) | 121 | **123** | +2 net (3 added in startSession, 0 removed; 1 of the original 2 startSession tests was reframed for new API) |
| `web` (full) | 205 | **205** | 0 regression |
| `src/diagnostic/*` (59-03 utilities) | 20 | **20** | unchanged |
| `src/routers/__tests__/diagnostic.test.ts` | 6 | **8** | +2 (sessionSeed propagation + persisted-shape) |

Typecheck: all 6 packages green via `pnpm typecheck`.

### New behavior

- `pickDeckForUser(userProfile.marketplaces, session.id)` deterministic per session
- `shuffleOptions(staticQuestion, session.id)` deterministic per (sessionId, questionId)
- Mapping: StaticQuestion → DiagnosticQuestion
  - `prompt` → `question`
  - `axis` → `skillCategory`
  - `level: 1|2|3` → `difficulty: 'EASY'|'MEDIUM'|'HARD'`
  - `marketplace`, `id`, `explanation` passthrough
  - `options` = shuffled, `correctIndex` = position of canonical-correct after shuffle
- `sourceData` no longer attached on save (static deck has no RAG source tracing — that was an LLM-bank feature for Phase 23 wrong-answer lesson linking; static deck explanations are self-contained)

### What stayed identical (regression-safe)

- CarrotQuest fire-and-forget on diagnostic completion (`pa_diagnostic_completed`, `pa_diagnostic_marketplaces`, `pa_diagnostic_pool_size`) — Test 3-6 in diagnostic.test.ts still pass; pool size now always 15.
- Question.tsx badge logic — Test 1-7 still pass.
- Phase 58 `recommendedJobs` in `getResults` — untouched.
- `submitAnswer` scoring — untouched.
- Rate limiter, `ensureUserProfile`, `IN_PROGRESS` cleanup — untouched.

## Implementation notes

### sessionId-as-seed: create-then-update pattern

Because `pickDeckForUser` and `shuffleOptions` both seed off `session.id`, the session row is created first with `questions: []`, then updated with the assembled (already-shuffled) `DiagnosticQuestion[]` after the pure-function pass. Two queries instead of one, but keeps the seed contract clean and avoids reaching for an external cuid generator.

### Mock-fallback retained

If `pickDeckForUser`/`shuffleOptions` ever throws (it shouldn't — both are pure functions over a static const, no I/O), startSession falls back to `getBalancedQuestions(15)` from `../mocks/questions.ts`. Loud `console.error` so the issue surfaces in logs. This mirrors the defensive style of the prior LLM path.

### Deviations from PLAN

1. **Inline orchestrator implementation, not subagent.** Claude Code's `isolation="worktree"` Agent spawn could not be coerced onto base SHA `0b96300f` — it kept basing worktrees off master HEAD. Per the previous agent's halt-report, the sandbox blocked `git reset --hard` to the orchestrator-supplied base. Falling back to a direct inline edit on `phase-59-marketplace-aware-diagnostic` branch was the cleanest path. Plan 59-04 is small enough (~80 LOC of router edits + test refresh) that one focused commit is more legible than a multi-commit TDD chain anyway.
2. **Question.tsx untouched.** Plan Task 2 anticipated a UI edit but the badge condition was already correct from 59-02 work. Skipped the edit; existing tests cover the BOTH-user case with both WB and OZON questions.
3. **`getMockQuestionsForCategory` import dropped from diagnostic.ts** — the symbol is no longer reachable from this file after the rewire; left a single `getBalancedQuestions` import for the defensive mock fallback path.

## Cross-AI handoff notes

- Static deck content is the single source of methodology truth. Methodology team can amend `packages/api/src/diagnostic/static-deck.ts` directly; CI typecheck + the 7 tests in `src/diagnostic/static-deck.test.ts` enforce shape constraints (5×3 matrix, no duplicate IDs, 4 unique options each, etc.).
- The `QuestionBank` Prisma model and its existing rows on prod (set up earlier in Phase 59 v1 mock-tag pass) remain in the database but are never queried at runtime. Safe to leave as-is; cleanup is non-urgent.
- `pa_diagnostic_pool_size` in CarrotQuest leadprop is now constant (= 15) — flag for CQ dashboard team in case any analytics segment was keyed on variable pool sizes.

## Plan→reality alignment

Plan 59-04 had 4 tasks:
- Task 1 (rewire startSession + tests) — ✅ done
- Task 2 (Question.tsx badge for BOTH user + tests) — ✅ no-op (already correct from 59-02)
- Task 3 (mark LLM-bank @deprecated + cleanup imports) — ✅ done
- Task 4 (full test sweep + SUMMARY) — ✅ done (this file)

## Self-Check: PASSED
