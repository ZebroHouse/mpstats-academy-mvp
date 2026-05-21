---
phase: 56-entry-flow-redesign
reviewed: 2026-05-18T00:00:00Z
depth: standard
files_reviewed: 20
files_reviewed_list:
  - apps/web/src/app/(main)/layout.tsx
  - apps/web/src/app/(main)/learn/[id]/page.tsx
  - apps/web/src/app/(main)/profile/page.tsx
  - apps/web/src/app/welcome/layout.tsx
  - apps/web/src/app/welcome/page.tsx
  - apps/web/src/components/learning/DiagnosticGateBanner.tsx
  - apps/web/src/components/profile/QualificationSection.tsx
  - apps/web/src/components/welcome/ForkScreen.tsx
  - apps/web/src/components/welcome/StepExperience.tsx
  - apps/web/src/components/welcome/StepIntent.tsx
  - apps/web/src/components/welcome/StepMarketplaces.tsx
  - apps/web/src/components/welcome/WizardStepper.tsx
  - apps/web/src/components/welcome/options.ts
  - apps/web/src/middleware.ts
  - apps/web/tests/e2e/phase-56-entry-flow.spec.ts
  - packages/api/src/root.ts
  - packages/api/src/routers/__tests__/onboarding.test.ts
  - packages/api/src/routers/onboarding.ts
  - packages/db/prisma/migrations/20260518000000_add_onboarding_fields/migration.sql
  - packages/db/prisma/schema.prisma
findings:
  critical: 0
  warning: 4
  info: 5
  total: 9
status: issues_found
---

# Phase 56: Code Review Report

**Reviewed:** 2026-05-18T00:00:00Z
**Depth:** standard
**Files Reviewed:** 20
**Status:** issues_found

## Summary

Phase 56 ships a `/welcome` onboarding wizard, an `onboarding` tRPC router, a `(main)`-layout
guard that bounces non-onboarded users to the wizard, and de-gating of the lesson page (the
diagnostic banner is now a dismissible hint instead of a blocker).

Auth/access-control is solid in the core path: `onboarding.complete` hard-binds the write to
`ctx.user.id` (never trusts input), z.enum whitelists reject tampered keys, and the migration is
purely additive (nullable / DEFAULT columns — backwards-compatible, zero data-loss). The wizard
correctly defers `router.push` to `onSuccess`, so a failed save will not strand a user with a
`null` `onboardingCompletedAt`.

No Critical issues. The findings below are correctness gaps around two redirect edge cases (the
`onboardingCompletedAt` guard is silently skipped when the `UserProfile` row does not yet exist,
and `/welcome` has no escape hatch if the wizard's own profile query fails), a CQ analytics gap,
and minor quality items.

## Warnings

### WR-01: Onboarding guard is skipped when the UserProfile row does not exist yet

**File:** `apps/web/src/app/(main)/layout.tsx:53-62`
**Issue:** The guard only fires when `profile` is truthy:
```ts
const profile = await prisma.userProfile.findUnique({ where: { id: user.id }, select: {...} });
if (profile && profile.onboardingCompletedAt === null) {
  redirect('/welcome');
}
```
`UserProfile` is created lazily — `ensureUserProfile` runs only inside tRPC procedures, not in
this layout. A freshly authenticated user (notably a first-time Yandex OAuth login that lands
directly on a `(main)` route before any tRPC call) can have `profile === null`. In that case the
guard is skipped entirely and the user reaches `/learn` / `/dashboard` without ever seeing the
wizard — the exact thing the phase is meant to enforce. Email-DOI users are usually safe because
`/auth/callback` triggers tRPC calls first, but the layout should not depend on that ordering.
**Fix:** Treat a missing profile the same as a non-onboarded one, e.g.:
```ts
if (!profile || profile.onboardingCompletedAt === null) {
  redirect('/welcome');
}
```
The `/welcome` wizard's `onboarding.complete` mutation already calls `ensureUserProfile`, so the
row gets created there. (If `null` profile must still render the layout for some flow, gate on
that flow explicitly rather than relying on the falsy short-circuit.)

### WR-02: `/welcome` has no recovery path if `profile.get` fails or stays loading

**File:** `apps/web/src/app/welcome/page.tsx:34-39`
**Issue:** `WelcomePage` reads `trpc.profile.get` only for the first-name greeting and never
inspects `onboardingCompletedAt`. That part is fine. The real gap: the only way out of `/welcome`
is the fork's `onboarding.complete` succeeding. If that mutation persistently fails (DB blip,
network), the user sees a toast and is stuck on `/welcome` with no other navigation — and the
`(main)` guard will re-bounce them here on any attempt to leave. There is no "skip for now" or
retry-to-dashboard affordance. For a guard that gates the *entire* authenticated app this is a
hard lockout on transient backend failure.
**Fix:** Either (a) let `complete` retry a couple of times before surfacing the error, or (b) add
a low-emphasis escape (e.g. on repeated failure, allow proceeding to `/learn` and let the guard
re-prompt later). At minimum, confirm `handleDatabaseError` maps to a retryable tRPC error so the
client `retry` default applies.

### WR-03: Onboarding wizard answers are not sent to CarrotQuest

**File:** `apps/web/src/app/welcome/page.tsx:41-51`, `packages/api/src/routers/onboarding.ts:47-58`
**Issue:** `onboarding.complete` persists `goals` / `marketplaces` / `experienceLevel` to
`UserProfile` but emits no analytics event. Every other qualification-style signal in this
codebase (registration, DOI, billing) is mirrored to CarrotQuest via `setUserProps` / `pa_*`
events (see CLAUDE.md "CQ Integration"). The single most valuable segmentation data the platform
collects — why the user came and where they sell — never reaches CQ, so it cannot drive
automations or segments. This is a product/instrumentation gap, not a crash, hence Warning.
**Fix:** In the `complete` mutation, after the successful `update`, fire a CQ `pa_onboarding_*`
event with the qualification props (mirror the pattern in the billing/DOI webhooks). Confirm with
the phase owner whether CQ instrumentation was intentionally deferred; if so, downgrade to a
tracked backlog item.

### WR-04: `experienceLevel` reset to `null` is silently dropped on profile re-save

**File:** `apps/web/src/components/profile/QualificationSection.tsx:63-70`, `apps/web/src/app/welcome/page.tsx:41-51`
**Issue:** `goalText` is sent as `goalText.trim() || undefined` — an empty string becomes
`undefined`. Combined with the router schema (`goalText: z.string().optional()`, no `.nullable()`),
clearing the free-text field on the profile edit screen and saving will *not* clear the stored
value: `undefined` is omitted from the Prisma `update` `data`, so the previous `goalText` persists.
The user thinks they erased it; the DB still has it. `experienceLevel` does not have this bug
(schema allows `.nullable()` and the component passes `null`), but `goalText` does.
**Fix:** Send `goalText: goalText.trim()` (empty string, not `undefined`) and make the schema
`z.string().trim().max(500).nullable().optional()` — or explicitly map `'' -> null`. Then a
cleared field actually clears in the DB.

## Info

### IN-01: `as never` casts in wizard discard real type safety

**File:** `apps/web/src/app/welcome/page.tsx:43-47`, `apps/web/src/components/profile/QualificationSection.tsx:65-67`
**Issue:** `goals as never`, `marketplaces as never`, `experienceLevel as never` force-cast the
component's `string[]` / `string | null` state into the tRPC input type. This silences the
compiler entirely — if an option key in `options.ts` ever drifts from the `z.enum` whitelist in
`onboarding.ts`, TypeScript will not catch it; the mismatch only surfaces at runtime as a Zod
rejection. The keys *are* currently locked by the `GoalOption`/`MarketplaceOption` union types in
`options.ts`, so this is safe today, just fragile.
**Fix:** Type the wizard state with the actual key unions (`GoalOption['key'][]`,
`MarketplaceOption['key'][]`, `ExperienceOption['key'] | null`) and drop the casts. The inferred
tRPC input type then matches without coercion.

### IN-02: Step navigation arithmetic relies on numeric coercion of a union type

**File:** `apps/web/src/app/welcome/page.tsx:104-114`
**Issue:** `setStep((s) => (s === 3 ? 'fork' : ((s as number) + 1) as Step))` and the symmetric
back handler do arithmetic on `Step = 1 | 2 | 3 | 'fork'`. The `'fork'` branch is unreachable here
(the Back/Next buttons render only when `step !== 'fork'`), so it works, but the `as number` /
`as Step` casts make an illegal state (`'fork' + 1`) merely improbable rather than impossible.
**Fix:** Model the stepper as a numeric index with an explicit `goNext`/`goBack` that clamps, or
use a small step array. Minor — current code is correct, just brittle.

### IN-03: `DiagnosticGateBanner` JSDoc says "над плеером урока" but copy was de-gated

**File:** `apps/web/src/components/learning/DiagnosticGateBanner.tsx:11-15`
**Issue:** The component name (`...GateBanner`) and the lesson-page comment
(`{/* Non-blocking diagnostic hint (dismissible) */}`, learn/[id]/page.tsx:647-648) both still
carry "gate" language even though Phase 56 explicitly turned this from a blocker into a dismissible
hint. The name will mislead future readers into thinking it still gates content.
**Fix:** Rename to `DiagnosticHintBanner` (or similar) for accuracy. Non-blocking; do it whenever
the file is next touched.

### IN-04: E2E "no repeat" test is order-dependent and will silently no-op after first run

**File:** `apps/web/tests/e2e/phase-56-entry-flow.spec.ts:85-106`
**Issue:** The "wizard does not reappear" test only exercises the wizard branch the *first* time
the standard tester runs it (when `onboardingCompletedAt` is still `null`). On every subsequent
run the `if (page.url().includes('/welcome'))` block is skipped and the test only asserts the
already-onboarded state. That is acceptable, but it means the wizard-completion path for the
standard tester is covered exactly once ever, and a regression that re-nulls `onboardingCompletedAt`
would flip the test back into the wizard branch unexpectedly. The two real wizard tests
(`new user ...`) `test.skip` whenever `TEST_NEW_USER_*` env is absent — i.e. they do not run in a
default CI invocation.
**Fix:** Document in CI config / phase notes that `TEST_NEW_USER_EMAIL` / `TEST_NEW_USER_PASSWORD`
must be set for the wizard path to be exercised, otherwise only the degenerate branch runs.
Consider seeding a throwaway non-onboarded user per-run instead of relying on env.

### IN-05: Migration is not wrapped in an explicit transaction

**File:** `packages/db/prisma/migrations/20260518000000_add_onboarding_fields/migration.sql:6-10`
**Issue:** Five sequential `ALTER TABLE ADD COLUMN` statements. Each is individually additive and
safe (nullable / DEFAULT, no rewrite of existing rows for the nullable ones), and `prisma migrate`
runs the file in a transaction by default — so this is informational only. On a 158-user prod
table the `DEFAULT ARRAY[]::TEXT[]` columns are cheap. No action strictly required.
**Fix:** None needed. Noted only so the prod-touching migration is on record as reviewed and
confirmed backwards-compatible per the CLAUDE.md DB-safety rules.

---

_Reviewed: 2026-05-18T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
