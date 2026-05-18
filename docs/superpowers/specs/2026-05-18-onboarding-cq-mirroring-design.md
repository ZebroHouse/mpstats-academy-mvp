# Onboarding → CarrotQuest Mirroring — Design

**Date:** 2026-05-18
**Status:** Approved
**Branch:** `phase-56-entry-flow` (follow-up to Phase 56 Entry Flow Redesign)

## Problem

Phase 56 added a `/welcome` onboarding wizard that collects user qualification
(`marketplaces`, `experienceLevel`, `goals`, `goalText`) and persists it to
`UserProfile`. The data lands in Supabase but is **never mirrored to CarrotQuest** —
unlike every other qualification signal in the codebase (`pa_phone`,
`pa_registration_completed`, referral `pa_*` events), which flows to CQ for
segmentation and automation. Code review flagged this as WR-03.

Without CQ mirroring, the team cannot segment users by marketplace/experience/goal
in CQ, nor trigger CQ automations (e.g. goal-tailored onboarding emails).

## Goal

When a user completes the `/welcome` wizard (or edits qualification on `/profile`),
their answers are mirrored to CarrotQuest as user properties, and the first
wizard completion fires a `pa_onboarding_completed` event.

## Decisions

1. **Properties + event.** Mirror via `setUserProps` for segmentation AND fire a
   `pa_onboarding_completed` event — matches the existing referral/registration
   pattern, and gives the CQ team an automation trigger for the future.
2. **Sync on every `complete` call.** `onboarding.complete` is the shared mutation
   for both the wizard and the `/profile` editor. Properties update on every call
   so CQ never drifts from the DB. The `pa_onboarding_completed` **event** fires
   only on the *first* completion (when `onboardingCompletedAt` was previously
   `null`) — a profile edit is not a "completion".
3. **Single code point inside the tRPC mutation.** Mirroring lives in
   `onboarding.complete`, so it automatically covers both the wizard and profile
   edits with no risk of a future caller forgetting to instrument.
4. **Best-effort.** A CQ failure must never break onboarding. The CQ call is
   wrapped in its own `try/catch`; failures are logged, the mutation still succeeds.

## Architecture

The existing CQ client (`apps/web/src/lib/carrotquest/client.ts`) cannot be
imported from `packages/api` (apps depend on packages, not the reverse). To keep
mirroring in a single code point — the `complete` mutation in `packages/api` — a
thin CQ helper is added to `packages/api`, following the precedent of the existing
`packages/api/src/utils/cloudpayments.ts` (packages/api already owns external-service
HTTP utilities).

Rejected alternative: firing CQ from the web layer at two client call sites
(`welcome/page.tsx` + `QualificationSection.tsx`). Rejected because it duplicates
the instrumentation and drifts if a future `complete` caller is added.

## Components

### `packages/api/src/utils/carrotquest.ts` (new, ~50 lines)

A minimal server-side CQ helper — only what `onboarding.complete` needs:

- `cqSetUserProps(userId: string, props: Record<string, string>): Promise<void>`
- `cqTrackEvent(userId: string, event: string): Promise<void>`

Implementation notes:
- `POST` form-encoded (`application/x-www-form-urlencoded`) to
  `https://api.carrotquest.io/v1` — CQ API is NOT JSON.
- `setUserProps` → `/users/{userId}/props` with
  `operations=[{op:'update_or_create',key,value}]`, `by_user_id=true`.
- `trackEvent` → `/users/{userId}/events` with `event`, `by_user_id=true`.
- API key from `process.env.CARROTQUEST_API_KEY`. If missing → no-op (safe for
  dev/staging, mirrors the existing client's behavior).
- Throws on non-2xx / network error so the caller's `catch` can log it.

### `packages/api/src/routers/onboarding.ts` — `complete` mutation

After the successful `userProfile.update`:

1. Immediately before the `update` (and after `ensureUserProfile`), the mutation
   does a `findUnique` selecting only `onboardingCompletedAt` to capture the prior
   value: `wasFirstCompletion = prior?.onboardingCompletedAt == null`.
2. In a separate `try/catch` (CQ failure is non-fatal):
   - `cqSetUserProps(ctx.user.id, { pa_marketplaces, pa_experience, pa_goals, pa_goal_text })`
   - if `wasFirstCompletion` → `cqTrackEvent(ctx.user.id, 'pa_onboarding_completed')`

Property encoding:
- `pa_marketplaces` — `input.marketplaces.join(', ')` (e.g. `"WB, OZON"`)
- `pa_experience` — `input.experienceLevel ?? ''`
- `pa_goals` — `input.goals.join(', ')`
- `pa_goal_text` — `input.goalText ?? ''`

### `apps/web/src/lib/carrotquest/types.ts`

Add `pa_onboarding_completed` to the `CQEventName` union. (The new packages/api
helper takes a plain `string` for the event, but the web-side type union is the
project's registry of event names and should stay complete.)

## Data Flow

```
/welcome wizard  ─┐
                   ├─→ trpc.onboarding.complete ─→ userProfile.update (DB)
/profile editor  ─┘                              └─→ [try/catch best-effort]
                                                       cqSetUserProps(pa_marketplaces, …)
                                                       if first completion:
                                                         cqTrackEvent(pa_onboarding_completed)
```

## Error Handling

- CQ helper throws `CQApiError` / `CQNetworkError` (or plain `Error`) on failure.
- The `complete` mutation catches CQ errors in a dedicated block, logs them
  (`console.error`; Sentry breadcrumb if Sentry is available in `packages/api`),
  and returns the profile normally. The DB write is already committed — the user's
  onboarding is not blocked by a CQ outage.
- Missing `CARROTQUEST_API_KEY` → helper is a silent no-op.

## Testing

Unit tests in `packages/api/src/routers/__tests__/onboarding.test.ts`:

1. `complete` calls `cqSetUserProps` with the 4 `pa_*` properties correctly encoded
   (arrays comma-joined).
2. `pa_onboarding_completed` event fires when the prior `onboardingCompletedAt`
   was `null` (first completion).
3. `pa_onboarding_completed` event does NOT fire when `onboardingCompletedAt` was
   already set (profile edit).
4. A thrown CQ error does not fail the mutation — `complete` still returns the
   updated profile.

The CQ helper is mocked in tests (no real HTTP).

## Out of Scope

- Moving the existing `apps/web` CQ client into a shared package (unrelated refactor).
- CQ automation rules / email templates keyed to `pa_onboarding_completed` — that
  is CQ-team-side configuration.
- Backfilling CQ for users who completed the wizard before this ships.
