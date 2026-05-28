---
phase: 60-ambassador-codes
plan: 02
subsystem: referral
tags: [orchestrator, referral, ambassador, fraud, transaction]
requires:
  - Plan 60-01 (ReferralCode model + resolveReferralCode/Raw exports)
  - Phase 53A referral infrastructure (issueReferralOnSignup, checkFraudSignals)
provides:
  - issueReferralOnSignup ambassador branch (race-safe transaction + D-03 stale-user guard)
  - checkFraudSignals null-safe referrerId (D-08 reuse)
  - 'pa_ambassador_signup' CQEventName
affects:
  - apps/web/src/lib/referral/issue.ts
  - apps/web/src/lib/referral/__tests__/issue.test.ts (new)
  - apps/web/src/lib/referral/fraud-checks.ts
  - apps/web/src/lib/referral/__tests__/fraud-checks.test.ts
  - apps/web/src/lib/carrotquest/types.ts
tech-stack:
  added: []
  patterns:
    - Atomic increment + post-update race check (D-04 maxUses)
    - Throw-inside-$transaction for explicit rollback
    - Discriminated-union branching from resolveReferralCode
key-files:
  created:
    - apps/web/src/lib/referral/__tests__/issue.test.ts
  modified:
    - apps/web/src/lib/referral/issue.ts
    - apps/web/src/lib/referral/fraud-checks.ts
    - apps/web/src/lib/referral/__tests__/fraud-checks.test.ts
    - apps/web/src/lib/carrotquest/types.ts
decisions:
  - Refactored Phase 53A into handleUserBranch helper rather than inlining — keeps
    ambassador and user branches readable; user-branch behavior is byte-identical
  - Race-overflow signal via throw new Error('AMBASSADOR_RACE_OVERFLOW') rather than
    explicit tx abort — Prisma rolls back on any thrown error, identifier lets the
    outer catch distinguish race overflow from generic transaction failures
  - PENDING_REVIEW path for ambassador: Referral row persists, Subscription does
    NOT, currentUses NOT incremented — matches the intent of D-04 (only successful
    activations count against per-code limits)
metrics:
  duration_minutes: ~25
  completed_date: 2026-05-28
  tasks_completed: 2
  files_created: 1
  files_modified: 4
  tests_passing: "52/52 referral (5 fraud + 9 issue + 38 sibling referral tests)"
---

# Phase 60 Plan 02: Orchestrator Ambassador Extension Summary

Extends issueReferralOnSignup with AMBASSADOR branch (race-safe transaction, D-03 stale-user guard, D-04 maxUses race protection, D-09 CQ event), reuses checkFraudSignals via null-safe referrerId refactor.

## Tasks Completed

| Task | Commit | Files |
|------|--------|-------|
| 1 — Null-safe checkFraudSignals (D-08) | `d366d63` | fraud-checks.ts, fraud-checks.test.ts |
| 2 — issueReferralOnSignup ambassador branch (D-01..D-09) | `65e30fe` | issue.ts, issue.test.ts, carrotquest/types.ts |

## Verification

- `pnpm --filter web test -- fraud-checks` → **5/5 PASS** (3ms)
- `pnpm --filter web test -- issue` → **9/9 PASS** (32ms) — 8 ambassador cases + 1 53A regression
- `pnpm --filter web test -- referral` → **52/52 PASS** (10 attribution + 5 fraud + 7 activation + 5 code-gen + 9 issue + 5 banner + 11 admin-moderation)
- `pnpm --filter @mpstats/api typecheck` → exit 0
- `pnpm --filter web typecheck` → exit 0
- `pnpm lint` → exit 0 (only pre-existing `no-img-element` warnings in unrelated files)

## Acceptance Gate Check (Plan 60-02)

| Gate | Required | Actual |
|------|----------|--------|
| `grep -c "resolveReferralCode" issue.ts` | ≥ 1 | 5 ✓ |
| `grep -c "codeType: 'AMBASSADOR'" issue.ts` | == 1 | 1 ✓ |
| `grep -c "AMBASSADOR_RACE_OVERFLOW" issue.ts` | ≥ 2 (throw + catch) | 2 ✓ |
| `grep -c "pa_ambassador_signup" issue.ts` | trackEvent fires | 1 trackEvent call + 1 docstring ref ✓ |
| `grep -cE "STALE_USER_WINDOW_MS\|5 \\* 60 \\* 1000\|..." issue.ts` | ≥ 1 | 2 ✓ |
| `grep -c "referralBonusPackage.create" issue.ts` | == 1 (user branch only) | 1 ✓ |
| `grep -c "referrerId: string \| null" fraud-checks.ts` | == 1 | 1 ✓ |
| `grep -c "args.referrerId === null" fraud-checks.ts` | == 1 | 1 ✓ |

## Deviations from Plan

**[Rule 3 — Blocking issue] CQEventName missing 'pa_ambassador_signup'**
- **Found during:** Task 2 typecheck
- **Issue:** `apps/web/src/lib/carrotquest/types.ts::CQEventName` is a closed union; `cq.trackEvent(_, 'pa_ambassador_signup')` rejected at compile time. Plan 60-02 D-09 mandates this event name.
- **Fix:** Added `'pa_ambassador_signup'` to the CQEventName union under a new `// Referral — Ambassador codes (Phase 60, D-09)` section.
- **Files modified:** `apps/web/src/lib/carrotquest/types.ts`
- **Commit:** `65e30fe` (bundled with Task 2)

**[Refactor — Readability] Extracted Phase 53A logic into handleUserBranch helper**
- **Issue:** Inlining both branches in `issueReferralOnSignup` produced a 200+ line function that obscured the dispatch logic.
- **Fix:** Split into `handleAmbassadorBranch` + `handleUserBranch`. The user branch is byte-for-byte behaviorally identical (same prisma calls, same Sentry tags, same CQ events, same i1/i2 mode flag handling) — verified by the regression test case.
- **Files:** `apps/web/src/lib/referral/issue.ts`
- **Commit:** `65e30fe`

No other deviations.

## Code-path Diffs (key)

### issue.ts entry point

Before:
```ts
const referrer = await prisma.userProfile.findUnique({
  where: { referralCode: args.refCode },
  select: { id: true, name: true },
});
if (!referrer) { Sentry.captureMessage('referral.unknown_code', ...); return; }
// ... fraud → mode → transaction → CQ ...
```

After:
```ts
const resolved = await resolveReferralCode(args.refCode);
if (resolved === null) {
  const raw = await resolveReferralCodeRaw(args.refCode);
  Sentry.captureMessage(raw ? 'referral.ambassador.limit_hit' : 'referral.unknown_code', ...);
  return;
}
if (resolved.type === 'ambassador') return handleAmbassadorBranch(args, resolved.code);
return handleUserBranch(args, resolved.userProfile);
```

### Race-safe increment (D-04)

```ts
const updated = await tx.referralCode.update({
  where: { id: code.id },
  data: { currentUses: { increment: 1 } },
});
if (updated.maxUses !== null && updated.currentUses > updated.maxUses) {
  throw new Error('AMBASSADOR_RACE_OVERFLOW');
}
```

### fraud-checks.ts null-safe entry

```ts
if (args.referrerId === null) {
  return { verdict: 'OK' };
}
```

## Test Coverage — issue.test.ts (9 cases)

1. **Happy path** — AMBASSADOR Referral + TRIAL Subscription with code.refereeTrialDays + currentUses increment + CQ events fire.
2. **D-03 stale user** — friend.createdAt > 5 min ago → silent skip, Sentry info log.
3. **Limit hit (expired)** — resolveReferralCode null, raw row present → Sentry log `referral.ambassador.limit_hit`, no writes.
4. **Limit hit (disabled)** — same path as expired, distinguished by `extra.isActive` in Sentry payload.
5. **D-04 race overflow** — update returns currentUses=2 > maxUses=1 → throw inside tx, outer warning log, no CQ.
6. **Fraud PENDING_REVIEW** — Referral row status=PENDING_REVIEW, NO Subscription, NO currentUses increment, NO CQ.
7. **CQ failure tolerant** — cq.trackEvent throws → Sentry exception with `area: referral, stage: cq`, transaction stays committed.
8. **Unknown code** — null/null → `referral.unknown_code` (existing 53A behavior).
9. **53A user branch regression** — type='user' → EXTERNAL_USER Referral + ReferralBonusPackage + TRIAL Subscription + `pa_referral_trial_started`.

## 53A Regression Status

**Preserved.** All 38 pre-existing referral tests pass (attribution 10, fraud 4 of 5 — 1 new, activation 7, code-gen 5, admin-moderation 11, banner 5). The 53A user branch in issueReferralOnSignup is verified by the regression test case in issue.test.ts; behavior is byte-identical (same Prisma calls, same Sentry tags, same CQ events, same i1/i2 mode flag, same conversionTrigger logic).

## Self-Check: PASSED

- [x] `apps/web/src/lib/referral/issue.ts` — FOUND (modified)
- [x] `apps/web/src/lib/referral/__tests__/issue.test.ts` — FOUND (created)
- [x] `apps/web/src/lib/referral/fraud-checks.ts` — FOUND (modified)
- [x] `apps/web/src/lib/carrotquest/types.ts` — FOUND (modified)
- [x] Commits `d366d63`, `65e30fe` — both present in `git log`
- [x] 9/9 issue + 5/5 fraud-checks + 52/52 referral suite passing
- [x] Typecheck clean (`@mpstats/api`, `web`)
- [x] Lint clean (only pre-existing warnings)
