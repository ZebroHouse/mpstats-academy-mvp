---
phase: 59-marketplace-aware-diagnostic-questions-wb-ozon
plan: 02
subsystem: diagnostic
tags: [phase-59, runtime, diagnostic, carrotquest, ui-badge]
requires:
  - .planning/phases/59-marketplace-aware-diagnostic-questions-wb-ozon/59-01-SUMMARY.md (marketplace field on DiagnosticQuestion)
  - .planning/phases/59-marketplace-aware-diagnostic-questions-wb-ozon/59-CONTEXT.md (D-04, D-09, D-11)
provides:
  - getQuestionsFromBank(prisma, count, userMarketplaces) with marketplace filter + defensive default
  - diagnostic.startSession reads UserProfile.marketplaces and routes it through the bank filter
  - diagnostic.submitAnswer fires pa_diagnostic_completed via CQ on completion (lead-props + event)
  - CQEventName union extended with pa_diagnostic_completed
  - DiagnosticSessionState shared type extended with optional userMarketplaces
  - Question card renders Про Wildberries / Про Ozon badge for mix-users on non-BOTH questions
affects:
  - packages/api/src/utils/question-bank.ts
  - packages/api/src/utils/__tests__/question-bank.test.ts
  - packages/api/src/routers/diagnostic.ts
  - packages/api/src/routers/__tests__/diagnostic.test.ts
  - packages/shared/src/types/index.ts
  - apps/web/src/lib/carrotquest/types.ts
  - apps/web/src/components/diagnostic/Question.tsx
  - apps/web/src/components/diagnostic/__tests__/Question.test.tsx
  - apps/web/src/app/(main)/diagnostic/session/page.tsx
tech-stack:
  added: []
  patterns: [zod-discriminator-reuse, vitest-prisma-stub, trpc-createcaller, testing-library-react]
key-files:
  created:
    - packages/api/src/utils/__tests__/question-bank.test.ts
    - packages/api/src/routers/__tests__/diagnostic.test.ts
    - apps/web/src/components/diagnostic/__tests__/Question.test.tsx
  modified:
    - packages/api/src/utils/question-bank.ts
    - packages/api/src/routers/diagnostic.ts
    - packages/shared/src/types/index.ts
    - apps/web/src/lib/carrotquest/types.ts
    - apps/web/src/components/diagnostic/Question.tsx
    - apps/web/src/app/(main)/diagnostic/session/page.tsx
decisions:
  - Reused computeEffectiveMarketplaces from job-matcher in bank filter (no duplicate fallback).
  - Used Badge variant 'outline-default' (closest existing variant — Badge component does not export plain 'outline').
  - getSessionState extends to expose userMarketplaces via a cheap single-field UserProfile select; no shared fetch with startSession because the procedures run on different invocations.
metrics:
  duration_minutes: 30
  completed_date: 2026-05-28
---

# Phase 59 Plan 02: Marketplace-aware runtime wiring Summary

Threads the Wave-1 `marketplace` data shape end-to-end through the diagnostic runtime: bank filter, startSession call site, submitAnswer CQ event, and a mix-user question-card badge. WB-only users stop getting OZON questions, mix-users see which marketplace each question is about, and the CQ team gets `pa_diagnostic_marketplaces` + `pa_diagnostic_pool_size` lead-props plus the new `pa_diagnostic_completed` event on the lead row.

## Task Commits

| Task | Name                                                                                  | Commit    | Files                                                                                                              |
| ---- | ------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------ |
| 1 RED   | failing tests for getQuestionsFromBank marketplace filter                          | `a2edc3b` | `packages/api/src/utils/__tests__/question-bank.test.ts`                                                           |
| 1 GREEN | filter getQuestionsFromBank by user marketplaces                                   | `bc94d4c` | `packages/api/src/utils/question-bank.ts`                                                                          |
| 2 RED   | failing tests for startSession marketplaces + CQ event                             | `e214bbb` | `packages/api/src/routers/__tests__/diagnostic.test.ts`                                                            |
| 2 GREEN | wire startSession marketplaces + fire pa_diagnostic_completed CQ event             | `4a1c334` | `packages/api/src/routers/diagnostic.ts`, `apps/web/src/lib/carrotquest/types.ts`                                  |
| 3 RED   | failing tests for Question marketplace badge                                       | `7074700` | `apps/web/src/components/diagnostic/__tests__/Question.test.tsx`                                                   |
| 3 GREEN | render marketplace badge on Question card for mix-users                            | `17ad848` | `apps/web/src/components/diagnostic/Question.tsx`, `apps/web/src/app/(main)/diagnostic/session/page.tsx`, `packages/shared/src/types/index.ts`, `packages/api/src/routers/diagnostic.ts` (getSessionState extension) |

## Test-suite numbers

| Suite              | Before (Plan 59-01 baseline) | After  | Delta |
| ------------------ | ----------------------------- | ------ | ----- |
| `@mpstats/api`     | 67 / 67                       | **81 / 81**  | +14  (8 question-bank + 6 diagnostic) |
| `@mpstats/web`     | 188 / 188                     | **195 / 195** | +7  (Question marketplace badge) |
| `pnpm typecheck`   | exit 0                        | exit 0       | — |

All test-IDs:

- `question-bank.test.ts` — 8/8: WB-only / OZON-only / mix / empty-fallback / defensive default for legacy missing-field / mock-supplement-also-filtered / stale-bank refresh preserved / backwards-compat omitted arg.
- `diagnostic.test.ts` — 6/6: startSession passes marketplaces (WB-only) / passes [] when profile missing / cqSetUserProps with pa_diagnostic_marketplaces+pool_size / cqTrackEvent('pa_diagnostic_completed') AFTER setProps / submitAnswer resolves when CQ throws / CQ fires AFTER $transaction commits.
- `Question.test.tsx` — 7/7: mix+WB → "Про Wildberries" / mix+OZON → "Про Ozon" / mix+BOTH → no badge / WB-only+WB → no badge / OZON-only+OZON → no badge / undefined userMarketplaces → no crash / undefined question.marketplace → no crash.

## Acceptance grep counts

| Assertion                                                                            | Count | Source                                                          |
| ------------------------------------------------------------------------------------ | ----- | --------------------------------------------------------------- |
| `computeEffectiveMarketplaces` in `question-bank.ts`                                  | 4 (≥ 1) | `packages/api/src/utils/question-bank.ts`                       |
| `'pa_diagnostic_completed'` in `types.ts`                                             | 1 (== 1) | `apps/web/src/lib/carrotquest/types.ts`                        |
| `pa_diagnostic_marketplaces` in `diagnostic.ts`                                       | 1 (== 1) | `packages/api/src/routers/diagnostic.ts`                       |
| `pa_diagnostic_pool_size` in `diagnostic.ts`                                          | 1 (== 1) | `packages/api/src/routers/diagnostic.ts`                       |
| `'Про Wildberries'` in `Question.tsx`                                                 | 1 (== 1) | `apps/web/src/components/diagnostic/Question.tsx`              |
| `'Про Ozon'` in `Question.tsx`                                                        | 1 (== 1) | `apps/web/src/components/diagnostic/Question.tsx`              |
| `userMarketplaces` in `session/page.tsx`                                              | 1 (≥ 1) | `apps/web/src/app/(main)/diagnostic/session/page.tsx`          |
| `cqSetUserProps` line < `cqTrackEvent` line in diagnostic.ts                          | ✅ ordered | line ~840 setProps, line ~847 trackEvent (props fire first per Pitfall #5) |
| Filter helper reused, NO hand-rolled fallback (`filter.*WB.*OZON` in question-bank.ts) | 0    | confirmed absent                                                |

## Session-query extension — new fetch or shared?

`getSessionState` adds a **new single-field UserProfile fetch** (`select: { marketplaces: true }`) — chosen because:

1. `getSessionState` and `startSession` are independent tRPC procedures on different invocations; they cannot share an in-memory profile read.
2. The fetch is one column, one row, indexed by primary key — sub-millisecond on the prod Supabase pool.
3. Returning it on every poll keeps the badge logic purely client-side; no separate `learning.getUserMarketplaces` round-trip from `/diagnostic/session/page.tsx`.

This trades one extra cheap query per `getSessionState` call against avoiding a second tRPC round-trip from the client. For diagnostic sessions (~15 questions × 1 query per question = ~15 calls/session) the cost is negligible. If telemetry shows latency pressure later, the read can be co-located into the `diagnosticSession.findUnique({ include: { ... } })` via Prisma relation, but the migration cost outweighs current need.

## Deviations from Plan

### 1. Badge variant: `outline-default` (not `outline`)

**Found during:** Task 3 implementation.

**Issue:** plan's `<action>` says `variant="outline"`, but `apps/web/src/components/ui/badge.tsx` does NOT export a plain `outline` variant. The Badge `cva` configuration lists outline variants as `outline-default | outline-primary | outline-success | outline-featured`. Using `variant="outline"` would render the `default` (filled grey) styling because `cva` falls back when the requested key is unknown — visually wrong against D-09's "neutral outline" intent.

**Fix (Rule 1 — auto-fix bug from spec mismatch):** use `variant="outline-default"`, which is the canonical neutral-outline option in the component (border `mp-gray-300`, text `mp-gray-700`, transparent bg).

**Impact:** UI behaviour matches D-09 ("light Badge with neutral outline + label"). No semantic change versus the plan's intent.

**Recommended plan correction:** Phase 59-04 or any future plan that references `<Badge variant="outline" ...>` should use `outline-default` (or any of `outline-{primary|success|featured}` if it wants a coloured outline).

### 2. Diagnostic test file location: `packages/api/src/routers/__tests__/diagnostic.test.ts`

**Found during:** Task 2 RED setup.

**Issue:** plan says "Add tests 1-6 to existing `packages/api/src/routers/__tests__/diagnostic.test.ts` if present, otherwise create it." It did not exist on the wave-2 base, so I created it. Listed in `key-files.created` above for clarity.

### 3. `getSessionState` (and `DiagnosticSessionState` shared type) extended even though plan listed only `Question.tsx` + `session/page.tsx`

**Found during:** Task 3 implementation.

**Issue:** plan's `must_haves.truths` requires "userMarketplaces flows from session page → Question.tsx as a prop; data source is the existing session query extended to expose userMarketplaces." The plan's `files_modified` frontmatter omits `packages/shared/src/types/index.ts` and `packages/api/src/routers/diagnostic.ts` (for the `getSessionState` extension), but extending the response shape implies both. Treated as a required scope clarification, not a deviation in intent. Both files documented under `affects:` above.

### 4. Worktree setup — initial Read/Write tool writes went to the main repo, not the worktree

**Found during:** Task 1 RED commit.

**Issue:** the first `question-bank.test.ts` write landed in `D:/GpT_docs/.../MAAL/packages/api/src/utils/__tests__/` (main repo) rather than the worktree path `D:/GpT_docs/.../MAAL/.claude/worktrees/agent-a480fb189d9c6f43e/packages/api/src/utils/__tests__/`. Caught by `git add` failing with "did not match any files" from the worktree.

**Fix:** moved the file into the worktree path, ran `pnpm install --frozen-lockfile` + `pnpm db:generate` in the worktree (worktrees do not share `node_modules`), and re-verified RED. All subsequent Read/Write calls used the worktree path explicitly.

**Mitigation for future agents:** every Read/Write in worktree mode MUST use the absolute path under `.claude/worktrees/<agent-id>/`. Plain `MAAL/packages/...` paths route to the main repo. The worktree path-safety check (#3099) in the executor prompt would have caught this if the tool reflexively verified path containment; in practice it's still an easy manual error.

### 5. `git reset --hard` at agent startup to correct base divergence (sanctioned by worktree_branch_check)

**Found during:** initial `worktree_branch_check` step. HEAD `f0f2eed` did not contain Plan 59-01's commits (`f9059b1`, `bcb5e14`, etc., which are reachable only from `de9a6a1`). Per the worktree_branch_check spec the executor must reset to the expected base; I ran `git -C <worktree> reset --hard de9a6a1b560d7e1de29bbf9e290dcc1ed9a8fa3e` and verified HEAD afterwards. No work lost (no uncommitted changes in the worktree at startup). Documented here because the executor's `destructive_git_prohibition` otherwise forbids `git reset --hard` outside the worktree_branch_check step.

## Threat-model coverage

All four STRIDE threats in the plan's `<threat_model>` are marked `accept` or `mitigate`. Implementation matches:

- **T-59-02-T (Tampering):** Badge is purely cosmetic; server-side filter reads UserProfile.marketplaces directly. No client-supplied data feeds the filter. ✅
- **T-59-02-I (Information Disclosure):** `pa_diagnostic_marketplaces` re-uses the same data class that onboarding.complete already sends to CQ via `pa_marketplaces`. No new PII class. ✅
- **T-59-02-D (DoS):** CQ outage cannot break submitAnswer — try/catch around setUserProps+trackEvent, `$transaction` commits BEFORE CQ call (Task 2 Test 5 + Test 6 both prove this). ✅
- **T-59-02-R (Repudiation):** DiagnosticSession persistence remains the audit trail; CQ event is analytics-only. ✅

No new threat surface introduced (no new endpoints, no new outbound calls beyond existing CQ channel).

## Acceptance Criteria Status

| Criterion                                                                                       | Status |
| ----------------------------------------------------------------------------------------------- | ------ |
| `computeEffectiveMarketplaces` reused in question-bank.ts                                       | ✅ |
| `userMarketplaces: string[]` parameter present                                                  | ✅ |
| Defensive default for missing marketplace field                                                 | ✅ (`?? 'BOTH'` in `passesFilter`) |
| 8 unit tests in `question-bank.test.ts`                                                         | ✅ (8 `it(` calls) |
| api total tests ≥ Phase-58 baseline 67 + 8 new                                                 | ✅ (81, +8 from Task 1 + 6 from Task 2) |
| No hand-rolled `filter.*WB.*OZON` fallback                                                      | ✅ |
| `pa_diagnostic_completed` in `CQEventName`                                                      | ✅ |
| `getQuestionsFromBank(..., marketplaces)` call site                                             | ✅ |
| `pa_diagnostic_marketplaces` + `pa_diagnostic_pool_size` present once each in diagnostic.ts     | ✅ |
| `cqTrackEvent.*pa_diagnostic_completed` present once                                            | ✅ |
| `cqSetUserProps` line < `cqTrackEvent` line                                                     | ✅ |
| try/catch around CQ pair                                                                         | ✅ |
| `pnpm typecheck` exits 0                                                                        | ✅ |
| `pnpm --filter @mpstats/api test` exits 0                                                       | ✅ |
| No props in `cqTrackEvent('pa_diagnostic_completed', ...)` params                               | ✅ (props go via setUserProps) |
| `Про Wildberries` + `Про Ozon` each once in Question.tsx                                        | ✅ |
| `userMarketplaces` referenced ≥ 2× in Question.tsx                                              | ✅ (3 — prop, render condition, MP_LABEL lookup) |
| `Badge` referenced ≥ 2× (import + render)                                                       | ✅ |
| `userMarketplaces` in session/page.tsx                                                          | ✅ |
| 7 `it(` calls in Question.test.tsx                                                              | ✅ |
| `pnpm --filter web test -- Question` exits 0, 7/7 pass                                          | ✅ |
| `pnpm test` total green                                                                          | ✅ (web 195, api 81) |
| web total ≥ Phase-58 baseline 188 + 7                                                           | ✅ (195) |
| Badge condition uses `=== 2` not `!== 2` or `> 2`                                               | ✅ |

## Self-Check: PASSED

Verified at SUMMARY-write time:

- `packages/api/src/utils/question-bank.ts` contains `computeEffectiveMarketplaces`: **FOUND** (4 occurrences).
- `apps/web/src/lib/carrotquest/types.ts` contains `pa_diagnostic_completed`: **FOUND**.
- `packages/api/src/routers/diagnostic.ts` contains both `pa_diagnostic_marketplaces` and `pa_diagnostic_pool_size`: **FOUND**.
- `apps/web/src/components/diagnostic/Question.tsx` contains `Про Wildberries` and `Про Ozon`: **FOUND**.
- `apps/web/src/app/(main)/diagnostic/session/page.tsx` references `userMarketplaces`: **FOUND**.
- Commits `a2edc3b`, `bc94d4c`, `e214bbb`, `4a1c334`, `7074700`, `17ad848` exist in `git log`: **FOUND**.
- `pnpm typecheck` and `pnpm test` (api + web + ai + shared) all green at commit `17ad848`: **PASSED**.

## Known Stubs / Threat Flags

None introduced. No new endpoints, no new file-access patterns, no schema changes at trust boundaries. The badge is cosmetic-only and the CQ event is supplementary analytics on an existing trust channel.
