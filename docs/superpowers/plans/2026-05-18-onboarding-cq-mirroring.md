# Onboarding → CarrotQuest Mirroring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mirror `/welcome` wizard qualification answers to CarrotQuest as user properties, and fire a `pa_onboarding_completed` event on first wizard completion.

**Architecture:** A thin server-side CQ helper is added to `packages/api` (precedent: `packages/api/src/utils/cloudpayments.ts`). The `onboarding.complete` tRPC mutation calls it after the DB write — a single code point that automatically covers both the wizard and the `/profile` editor. The CQ call is best-effort: a failure is caught and logged, never blocking onboarding.

**Tech Stack:** TypeScript, tRPC, Vitest, CarrotQuest REST API (form-encoded).

**Spec:** `docs/superpowers/specs/2026-05-18-onboarding-cq-mirroring-design.md`

**Branch:** `phase-56-entry-flow` (already checked out — verify with `git branch --show-current`).

---

## File Structure

| File | Responsibility |
|------|----------------|
| `packages/api/src/utils/carrotquest.ts` | NEW — `cqSetUserProps` + `cqTrackEvent` server-side CQ helpers |
| `apps/web/src/lib/carrotquest/types.ts` | MODIFY — register `pa_onboarding_completed` in `CQEventName` |
| `packages/api/src/routers/onboarding.ts` | MODIFY — call CQ helpers from `complete` mutation |
| `packages/api/src/routers/__tests__/onboarding.test.ts` | MODIFY — 4 new tests for CQ mirroring |

Note on TDD scope: the CQ helper (`carrotquest.ts`) is a pure I/O wrapper with no
branching logic beyond a no-op-when-unconfigured guard. The existing analogous
client (`apps/web/src/lib/carrotquest/client.ts`) has no standalone unit test.
Following that codebase pattern, the helper is verified through the `complete`
mutation tests in Task 3 (where it is mocked), not a separate test file.

---

### Task 1: Create the CarrotQuest server-side helper

**Files:**
- Create: `packages/api/src/utils/carrotquest.ts`

- [ ] **Step 1: Write the helper file**

Create `packages/api/src/utils/carrotquest.ts` with this exact content:

```typescript
/**
 * Server-side CarrotQuest helper for packages/api.
 *
 * Mirrors the apps/web CQ client's wire format (form-encoded POST, Token auth,
 * by_user_id=true so Supabase UUIDs can be passed directly) but is intentionally
 * minimal — only the two operations onboarding.complete needs.
 *
 * If CARROTQUEST_API_KEY is missing, every call is a no-op (safe for dev/staging).
 * On a non-2xx response the request throws so the caller can log it; callers that
 * want fire-and-forget must wrap calls in their own try/catch.
 *
 * Docs: https://carrotquest.io/developers/
 */

const CQ_API_BASE = 'https://api.carrotquest.io/v1';

async function cqRequest(
  path: string,
  formFields: Record<string, string>,
): Promise<void> {
  const apiKey = process.env.CARROTQUEST_API_KEY;
  if (!apiKey) return; // no-op when unconfigured (dev/staging)

  const response = await fetch(`${CQ_API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Token ${apiKey}`,
    },
    body: new URLSearchParams(formFields).toString(),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `[CarrotQuest] API error ${response.status} on ${path}: ${text.slice(0, 200)}`,
    );
  }
}

/**
 * Set user properties (segmentation data). CQ expects
 * operations=[{op,key,value}]. Values are stringified.
 */
export async function cqSetUserProps(
  userId: string,
  props: Record<string, string>,
): Promise<void> {
  const operations = Object.entries(props).map(([key, value]) => ({
    op: 'update_or_create',
    key,
    value: String(value),
  }));
  await cqRequest(`/users/${userId}/props`, {
    operations: JSON.stringify(operations),
    by_user_id: 'true',
  });
}

/** Track a named event for a user — used to trigger CQ automation rules. */
export async function cqTrackEvent(
  userId: string,
  event: string,
): Promise<void> {
  await cqRequest(`/users/${userId}/events`, {
    event,
    by_user_id: 'true',
  });
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm --filter @mpstats/api typecheck`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/utils/carrotquest.ts
git commit -m "feat(56): add server-side CarrotQuest helper for packages/api"
```

---

### Task 2: Register the `pa_onboarding_completed` event name

**Files:**
- Modify: `apps/web/src/lib/carrotquest/types.ts`

- [ ] **Step 1: Add the event to the `CQEventName` union**

In `apps/web/src/lib/carrotquest/types.ts`, find the `Referral (Phase 53A)` block at the end of the `CQEventName` union:

```typescript
  // Referral (Phase 53A)
  | 'pa_referral_trial_started'
  | 'pa_referral_friend_registered'
  | 'pa_referral_friend_paid';
```

Replace it with (adds an Onboarding block, keeps the trailing `;` on the last line):

```typescript
  // Referral (Phase 53A)
  | 'pa_referral_trial_started'
  | 'pa_referral_friend_registered'
  | 'pa_referral_friend_paid'
  // Onboarding (Phase 56)
  | 'pa_onboarding_completed';
```

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm --filter @mpstats/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/carrotquest/types.ts
git commit -m "feat(56): register pa_onboarding_completed CQ event name"
```

---

### Task 3: Wire CQ mirroring into `onboarding.complete` (TDD)

**Files:**
- Modify: `packages/api/src/routers/onboarding.ts`
- Test: `packages/api/src/routers/__tests__/onboarding.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/api/src/routers/__tests__/onboarding.test.ts`:

(a) At the very top of the file, BEFORE the existing
`import { onboardingRouter } from '../onboarding';` line, add the CQ module mock
and import (`vi.mock` is hoisted by Vitest, so placement above the router import
is what matters):

```typescript
vi.mock('../../utils/carrotquest', () => ({
  cqSetUserProps: vi.fn().mockResolvedValue(undefined),
  cqTrackEvent: vi.fn().mockResolvedValue(undefined),
}));
import { cqSetUserProps, cqTrackEvent } from '../../utils/carrotquest';
```

Note: the existing first line is `import { describe, it, expect, vi, beforeEach } from 'vitest';` — keep it. `vi` is already imported there.

(b) Inside the existing `describe('onboarding.complete', ...)` block, after the
`accepts a null experienceLevel` test, add these 4 tests:

```typescript
  it('mirrors qualification to CarrotQuest as pa_* props', async () => {
    await caller().complete({
      marketplaces: ['WB', 'OZON'],
      experienceLevel: 'BEGINNER',
      goals: ['SALES', 'ADS'],
      goalText: 'хочу выйти на маркетплейсы',
    });

    expect(cqSetUserProps).toHaveBeenCalledTimes(1);
    expect(cqSetUserProps).toHaveBeenCalledWith('user-1', {
      pa_marketplaces: 'WB, OZON',
      pa_experience: 'BEGINNER',
      pa_goals: 'SALES, ADS',
      pa_goal_text: 'хочу выйти на маркетплейсы',
    });
  });

  it('fires pa_onboarding_completed on the first completion', async () => {
    // Default findUnique stub returns null for the onboardingCompletedAt read
    // → wasFirstCompletion is true.
    await caller().complete({ marketplaces: ['WB'] });

    expect(cqTrackEvent).toHaveBeenCalledTimes(1);
    expect(cqTrackEvent).toHaveBeenCalledWith('user-1', 'pa_onboarding_completed');
  });

  it('does NOT fire pa_onboarding_completed when onboarding was already done', async () => {
    // Profile edit: prior onboardingCompletedAt is already set.
    ctxPrismaStub.userProfile.findUnique.mockImplementation((args: any) =>
      args?.select?.lastActiveAt
        ? Promise.resolve({ lastActiveAt: new Date() })
        : args?.select?.onboardingCompletedAt
          ? Promise.resolve({ onboardingCompletedAt: new Date('2026-01-01') })
          : Promise.resolve(null),
    );

    await caller().complete({ marketplaces: ['OZON'] });

    expect(cqSetUserProps).toHaveBeenCalledTimes(1); // props still synced
    expect(cqTrackEvent).not.toHaveBeenCalled();     // but no completion event
  });

  it('still completes when the CarrotQuest call fails', async () => {
    vi.mocked(cqSetUserProps).mockRejectedValueOnce(new Error('CQ down'));

    const result = caller().complete({ marketplaces: ['WB'] });

    await expect(result).resolves.not.toThrow();
    expect(ctxPrismaStub.userProfile.update).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @mpstats/api test -- onboarding`
Expected: FAIL — the 4 new tests fail because `cqSetUserProps` / `cqTrackEvent`
are never called by the current `complete` mutation (assertions like
`expected "cqSetUserProps" to be called 1 times, but got 0 times`).

- [ ] **Step 3: Implement CQ mirroring in the `complete` mutation**

In `packages/api/src/routers/onboarding.ts`:

(a) Add the helper import. After the existing import line
`import { handleDatabaseError } from '../utils/db-errors';`, add:

```typescript
import { cqSetUserProps, cqTrackEvent } from '../utils/carrotquest';
```

(b) Replace the entire `.mutation(...)` body of `complete` (the current arrow
function passed to `.mutation`) with this:

```typescript
    .mutation(async ({ ctx, input }) => {
      try {
        await ensureUserProfile(ctx.prisma, ctx.user);

        // Capture prior state so the completion event fires only once.
        const prior = await ctx.prisma.userProfile.findUnique({
          where: { id: ctx.user.id },
          select: { onboardingCompletedAt: true },
        });
        const wasFirstCompletion = prior?.onboardingCompletedAt == null;

        const profile = await ctx.prisma.userProfile.update({
          where: { id: ctx.user.id },
          data: { ...input, onboardingCompletedAt: new Date() },
        });

        // Mirror qualification to CarrotQuest — best-effort, never blocks
        // onboarding. The DB write above is already committed.
        try {
          await cqSetUserProps(ctx.user.id, {
            pa_marketplaces: input.marketplaces.join(', '),
            pa_experience: input.experienceLevel ?? '',
            pa_goals: input.goals.join(', '),
            pa_goal_text: input.goalText ?? '',
          });
          if (wasFirstCompletion) {
            await cqTrackEvent(ctx.user.id, 'pa_onboarding_completed');
          }
        } catch (cqError) {
          console.error(
            '[onboarding.complete] CarrotQuest mirror failed:',
            cqError,
          );
        }

        return profile;
      } catch (error) {
        handleDatabaseError(error);
      }
    }),
```

Note: `input.marketplaces` and `input.goals` are always arrays (schema has
`.default([])`). `experienceLevel` and `goalText` are `string | null | undefined`
→ `?? ''` normalizes them for the string-only props map.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @mpstats/api test -- onboarding`
Expected: PASS — all onboarding tests green (3 pre-existing `complete` tests +
4 new + 1 `getState` = 8).

- [ ] **Step 5: Run the full api suite and typecheck for regressions**

Run: `pnpm --filter @mpstats/api test`
Expected: PASS — full suite green (the 4 new tests bring the file to 8; suite
total was 32, now 36).

Run: `pnpm typecheck`
Expected: PASS — all 6 workspace tasks green.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/routers/onboarding.ts packages/api/src/routers/__tests__/onboarding.test.ts
git commit -m "feat(56): mirror onboarding qualification to CarrotQuest

onboarding.complete now syncs marketplaces/experience/goals/goalText to
CQ user props on every call (covers wizard + /profile edits) and fires
pa_onboarding_completed on the first completion only. Best-effort: a CQ
failure is logged, never blocks onboarding."
```

---

## Self-Review

- **Spec coverage:** CQ helper (Task 1) ✓; `pa_onboarding_completed` registered (Task 2) ✓; mirroring in `complete` with first-completion detection (Task 3) ✓; 4 tests from the spec's Testing section (Task 3 Step 1) ✓; best-effort error handling (Task 3 Step 3 inner try/catch) ✓.
- **Placeholders:** none — every step has complete code or an exact command.
- **Type consistency:** `cqSetUserProps(userId, Record<string,string>)` and `cqTrackEvent(userId, string)` defined in Task 1 are called with matching signatures in Task 3; the test mock in Task 3 Step 1 mocks the same two exports.
- **Out-of-scope honored:** no CQ-client move, no automation rules, no backfill.
