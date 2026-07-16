# Trial 2-for-1 Offer — Phase A (offer engine) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend engine that grants active-trial users a one-time PLATFORM offer — first payment 2990 ₽ opens a 60-day first period (instead of 30), then normal 2990 ₽/30d recurrent — auto-resolved from trial state, once per person. No UI in this phase (verified by unit tests + a real-card UAT through the existing `/pricing` flow).

**Architecture:** The offer is a "first-period modifier", not a discount and not a new plan. A new `resolveApplicableOffer` service decides eligibility. `billing.initiatePayment` stamps `Subscription.offerFirstPeriodDays=60` on the PENDING row and computes the CP `recurrentStartDate` off 60 days. The `handlePaymentSuccess` webhook honors that field for the first period (recurrent renewals stay on `plan.intervalDays=30`) and burns a one-per-user `OfferRedemption`. A new `offer.getState` query is the shared contract consumed later by Phase B (banner) and Phase C (pricing page). Reuses the trial-stacking + `recurrent.startDate` infra already shipped for discount codes (v1.29).

**Tech Stack:** TypeScript, Prisma (Supabase Postgres), tRPC, Vitest. CloudPayments recurrent via existing `openPaymentWidget`.

**Spec:** `docs/superpowers/specs/2026-07-15-trial-2for1-offer-design.md` (§3).

**Refinement vs spec (read before starting):** The shipped webhook already *stacks* the paid period after an active trial (`handlePaymentSuccess` lines 83-108: `periodStart = trialEnd` when a trial is running). This plan reuses that stacking, so the offer's 60-day first period begins where the trial ends (during an active trial) or at payment time (during the 24h grace, when the trial row already expired). Net effect for an active-trial user: trial days play out, then 60 paid days — slightly more generous than "60 days from payment", and it reuses the existing period/recurrent sync verbatim.

---

## File Structure

- **Create** `scripts/migrations/add-offer-redemption.ts` — additive DB migration (OWNER runs on prod Supabase). New `OfferRedemption` table + `Subscription.offerFirstPeriodDays` column.
- **Modify** `packages/db/prisma/schema.prisma` — mirror the two additive changes so the Prisma client types match the DB.
- **Create** `packages/api/src/services/offer/resolve.ts` — `resolveApplicableOffer` + offer constants.
- **Create** `packages/api/src/services/offer/resolve.test.ts` — unit tests (hand-rolled fake prisma, no DB).
- **Modify** `packages/api/src/routers/billing.ts` — resolve offer in `initiatePayment`; stamp `offerFirstPeriodDays`; compute `recurrentStartDate` off the offer's first-period length.
- **Modify** `apps/web/src/lib/cloudpayments/subscription-service.ts` — `handlePaymentSuccess` honors `offerFirstPeriodDays` for the first period and writes `OfferRedemption`.
- **Create** `apps/web/src/lib/cloudpayments/__tests__/offer-first-period.test.ts` — webhook period-length unit test.
- **Create** `packages/api/src/routers/offer.ts` — `offerRouter.getState`.
- **Modify** `packages/api/src/root.ts` — register `offer: offerRouter`.
- **Create** `packages/api/src/routers/__tests__/offer-get-state.test.ts` — getState state-machine test.

**Migration safety (CLAUDE.md — read FIRST):** localhost reads PROD Supabase. NEVER `prisma migrate`/`prisma db push`. DB changes ship ONLY via the additive tsx script (Task 1), run by the owner against prod with `SUPABASE_MGMT_TOKEN`. The `schema.prisma` edit + `prisma generate` only keep the client types in sync — they do not touch the DB.

---

### Task 1: DB migration — `OfferRedemption` + `Subscription.offerFirstPeriodDays`

**Files:**
- Create: `scripts/migrations/add-offer-redemption.ts`
- Modify: `packages/db/prisma/schema.prisma` (Subscription model ~286-310; add model after PromoActivation ~399)

- [ ] **Step 1: Write the additive migration script**

Create `scripts/migrations/add-offer-redemption.ts` (mirror of `scripts/migrations/add-material-embedding.ts`):

```ts
// Аддитивно: OfferRedemption table + Subscription.offerFirstPeriodDays. Idempotent. НЕ запускать локально.
// Запуск (owner, prod): NODE_OPTIONS=--dns-result-order=ipv4first SUPABASE_MGMT_TOKEN=... npx tsx scripts/migrations/add-offer-redemption.ts
const PROJECT_REF = 'saecuecevicwjkpmaoot';
const TOKEN = process.env.SUPABASE_MGMT_TOKEN;

async function run(sql: string) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  if (!TOKEN) throw new Error('SUPABASE_MGMT_TOKEN не задан');
  await run(`ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "offerFirstPeriodDays" integer;`);
  await run(`
    CREATE TABLE IF NOT EXISTS "OfferRedemption" (
      "id" text PRIMARY KEY,
      "userId" text NOT NULL UNIQUE,
      "subscriptionId" text NOT NULL,
      "offerKey" text NOT NULL,
      "redeemedAt" timestamp(3) NOT NULL DEFAULT now()
    );
  `);
  await run(`CREATE INDEX IF NOT EXISTS "OfferRedemption_userId_idx" ON "OfferRedemption" ("userId");`);
  console.log('OK: Subscription.offerFirstPeriodDays + OfferRedemption added');
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Mirror the changes in `schema.prisma`**

In `model Subscription` (after `promoCodeId String?`, ~line 295) add:

```prisma
  offerFirstPeriodDays Int? // 60 when the trial 2-for-1 offer applies; null = normal plan.intervalDays
```

and add the relation field inside `model Subscription` (after `promoActivation PromoActivation?`):

```prisma
  offerRedemption OfferRedemption?
```

After `model PromoActivation { ... }` (~line 399) add the new model:

```prisma
model OfferRedemption {
  id             String   @id @default(cuid())
  userId         String   @unique
  subscriptionId String   @unique
  offerKey       String // "trial_2for1"
  redeemedAt     DateTime @default(now())

  user         UserProfile  @relation(fields: [userId], references: [id])
  subscription Subscription @relation(fields: [subscriptionId], references: [id])

  @@index([userId])
}
```

Add the back-relation on `UserProfile` (find `model UserProfile`, add near its other relation lists):

```prisma
  offerRedemption OfferRedemption?
```

- [ ] **Step 3: Regenerate the Prisma client**

Run: `pnpm db:generate`
Expected: "Generated Prisma Client" with no errors.
If it fails on a version mismatch (known gotcha), run: `npx prisma@5.22.0 generate --schema packages/db/prisma/schema.prisma`

- [ ] **Step 4: Typecheck the db package**

Run: `pnpm --filter @mpstats/db typecheck`
Expected: exit 0 (the new model/field compile).

- [ ] **Step 5: Commit**

```bash
git add scripts/migrations/add-offer-redemption.ts packages/db/prisma/schema.prisma
git commit -m "feat(billing): schema — OfferRedemption + Subscription.offerFirstPeriodDays"
```

> **OWNER ACTION (not a code step):** before Phase A can be smoke-tested with a real card, the owner runs the migration against prod:
> `NODE_OPTIONS=--dns-result-order=ipv4first SUPABASE_MGMT_TOKEN=<token> npx tsx scripts/migrations/add-offer-redemption.ts`
> Unit tests (Tasks 2, 4, 5) use a fake prisma and do NOT need the real column.

---

### Task 2: `resolveApplicableOffer` service

**Files:**
- Create: `packages/api/src/services/offer/resolve.ts`
- Test: `packages/api/src/services/offer/resolve.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/api/src/services/offer/resolve.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveApplicableOffer, OFFER_FIRST_PERIOD_DAYS } from './resolve';

const DAY = 24 * 60 * 60 * 1000;

// Minimal fake prisma: only the methods resolveApplicableOffer calls.
function fakePrisma(opts: {
  trialEnd?: Date | null;         // latest TRIAL sub's currentPeriodEnd, null = no trial
  paidActive?: boolean;           // an ACTIVE/PAST_DUE PLATFORM sub with periodEnd > now
  redeemed?: boolean;             // OfferRedemption exists for user
}) {
  return {
    subscription: {
      findFirst: async ({ where }: any) => {
        if (where.status === 'TRIAL') {
          return opts.trialEnd ? { currentPeriodEnd: opts.trialEnd } : null;
        }
        // paid-active lookup: status in [ACTIVE, PAST_DUE]
        return opts.paidActive ? { id: 'paid1' } : null;
      },
    },
    offerRedemption: {
      findUnique: async () => (opts.redeemed ? { id: 'r1' } : null),
    },
  } as any;
}

describe('resolveApplicableOffer', () => {
  it('returns 60-day offer for an active-trial PLATFORM user', async () => {
    const trialEnd = new Date(Date.now() + 2 * DAY);
    const offer = await resolveApplicableOffer({
      prisma: fakePrisma({ trialEnd }),
      userId: 'u1',
      planType: 'PLATFORM',
      suppressForDiscount: false,
    });
    expect(offer).not.toBeNull();
    expect(offer!.firstPeriodDays).toBe(OFFER_FIRST_PERIOD_DAYS);
    expect(offer!.trialEnd.getTime()).toBe(trialEnd.getTime());
    expect(offer!.inGrace).toBe(false);
  });

  it('returns offer in the 24h grace window after trial end', async () => {
    const trialEnd = new Date(Date.now() - 3 * 60 * 60 * 1000); // ended 3h ago
    const offer = await resolveApplicableOffer({
      prisma: fakePrisma({ trialEnd }),
      userId: 'u1', planType: 'PLATFORM', suppressForDiscount: false,
    });
    expect(offer).not.toBeNull();
    expect(offer!.inGrace).toBe(true);
  });

  it('returns null once the 24h grace has passed', async () => {
    const trialEnd = new Date(Date.now() - 25 * 60 * 60 * 1000); // ended 25h ago
    const offer = await resolveApplicableOffer({
      prisma: fakePrisma({ trialEnd }),
      userId: 'u1', planType: 'PLATFORM', suppressForDiscount: false,
    });
    expect(offer).toBeNull();
  });

  it('returns null for COURSE plan', async () => {
    const offer = await resolveApplicableOffer({
      prisma: fakePrisma({ trialEnd: new Date(Date.now() + DAY) }),
      userId: 'u1', planType: 'COURSE', suppressForDiscount: false,
    });
    expect(offer).toBeNull();
  });

  it('returns null when a discount is being applied', async () => {
    const offer = await resolveApplicableOffer({
      prisma: fakePrisma({ trialEnd: new Date(Date.now() + DAY) }),
      userId: 'u1', planType: 'PLATFORM', suppressForDiscount: true,
    });
    expect(offer).toBeNull();
  });

  it('returns null when the offer was already redeemed', async () => {
    const offer = await resolveApplicableOffer({
      prisma: fakePrisma({ trialEnd: new Date(Date.now() + DAY), redeemed: true }),
      userId: 'u1', planType: 'PLATFORM', suppressForDiscount: false,
    });
    expect(offer).toBeNull();
  });

  it('returns null when the user already has an active paid PLATFORM sub', async () => {
    const offer = await resolveApplicableOffer({
      prisma: fakePrisma({ trialEnd: new Date(Date.now() + DAY), paidActive: true }),
      userId: 'u1', planType: 'PLATFORM', suppressForDiscount: false,
    });
    expect(offer).toBeNull();
  });

  it('returns null when the user has no trial at all', async () => {
    const offer = await resolveApplicableOffer({
      prisma: fakePrisma({ trialEnd: null }),
      userId: 'u1', planType: 'PLATFORM', suppressForDiscount: false,
    });
    expect(offer).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/api && npx vitest run src/services/offer/resolve.test.ts`
Expected: FAIL — "Cannot find module './resolve'".

- [ ] **Step 3: Write the implementation**

Create `packages/api/src/services/offer/resolve.ts`:

```ts
import type { PrismaClient, SubscriptionType } from '@mpstats/db';

/** Trial 2-for-1 offer: first paid period is 60 days instead of plan.intervalDays. */
export const OFFER_FIRST_PERIOD_DAYS = 60;
/** Offer stays open for 24h after the trial ends (grace window). */
export const OFFER_GRACE_MS = 24 * 60 * 60 * 1000;
/** Stable key stored on OfferRedemption. */
export const OFFER_KEY = 'trial_2for1';

export interface ResolvedOffer {
  firstPeriodDays: number; // OFFER_FIRST_PERIOD_DAYS
  trialEnd: Date;          // the trial's currentPeriodEnd
  windowEnd: Date;         // trialEnd + OFFER_GRACE_MS (offer closes)
  inGrace: boolean;        // now > trialEnd (still <= windowEnd)
}

/**
 * Decide whether the one-time PLATFORM "2 months for the price of one" offer
 * applies for `userId`. Eligible when ALL hold:
 *  - planType === 'PLATFORM' (COURSE is always normal)
 *  - no discount is being applied (discount wins — spec §3.4)
 *  - the user has a TRIAL subscription whose currentPeriodEnd is within the
 *    window [now, trialEnd + 24h grace]
 *  - the user has no active paid PLATFORM subscription
 *  - the offer has not been redeemed before (OfferRedemption is one-per-user)
 *
 * Server-side source of truth — the browser never decides eligibility.
 */
export async function resolveApplicableOffer(args: {
  prisma: PrismaClient;
  userId: string;
  planType: SubscriptionType;
  suppressForDiscount: boolean;
}): Promise<ResolvedOffer | null> {
  const { prisma, userId, planType, suppressForDiscount } = args;
  if (planType !== 'PLATFORM') return null;
  if (suppressForDiscount) return null;

  const now = new Date();

  // Latest trial (active or recently ended).
  const trial = await prisma.subscription.findFirst({
    where: { userId, status: 'TRIAL' },
    orderBy: { currentPeriodEnd: 'desc' },
    select: { currentPeriodEnd: true },
  });
  if (!trial) return null;

  const trialEnd = trial.currentPeriodEnd;
  const windowEnd = new Date(trialEnd.getTime() + OFFER_GRACE_MS);
  if (now > windowEnd) return null; // trial ended > 24h ago

  // Already redeemed once → never again.
  const redeemed = await prisma.offerRedemption.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (redeemed) return null;

  // Already has an active paid PLATFORM sub → not a trial-conversion target.
  const paid = await prisma.subscription.findFirst({
    where: {
      userId,
      plan: { type: 'PLATFORM' },
      status: { in: ['ACTIVE', 'PAST_DUE'] },
      currentPeriodEnd: { gt: now },
    },
    select: { id: true },
  });
  if (paid) return null;

  return {
    firstPeriodDays: OFFER_FIRST_PERIOD_DAYS,
    trialEnd,
    windowEnd,
    inGrace: now > trialEnd,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/api && npx vitest run src/services/offer/resolve.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/services/offer/resolve.ts packages/api/src/services/offer/resolve.test.ts
git commit -m "feat(billing): resolveApplicableOffer — trial 2-for-1 eligibility"
```

---

### Task 3: Wire the offer into `initiatePayment`

**Files:**
- Modify: `packages/api/src/routers/billing.ts` (imports top; `initiatePayment` ~159-309)

- [ ] **Step 1: Import the resolver**

At the top of `packages/api/src/routers/billing.ts`, next to the discount import (`import { resolveApplicableDiscount } from '../services/discount/resolve';`), add:

```ts
import { resolveApplicableOffer } from '../services/offer/resolve';
```

- [ ] **Step 2: Resolve the offer after the discount**

In `initiatePayment`, right after the `firstAmount` line (currently `const firstAmount = discount ? discount.discountedPrice : plan.price;`, ~line 169) add:

```ts
      // Trial 2-for-1 offer: a 60-day first period instead of plan.intervalDays.
      // Mutually exclusive with discounts (discount wins — spec §3.4).
      const offer = await resolveApplicableOffer({
        prisma: ctx.prisma,
        userId: ctx.user.id,
        planType: input.planType,
        suppressForDiscount: discount != null,
      });
      const firstPeriodDays = offer ? offer.firstPeriodDays : plan.intervalDays;
```

- [ ] **Step 3: Stamp `offerFirstPeriodDays` on the PENDING subscription**

In the `ctx.prisma.subscription.create({ data: { ... } })` call (~line 228-238), add one field inside `data`:

```ts
          offerFirstPeriodDays: offer ? offer.firstPeriodDays : null,
```

- [ ] **Step 4: Compute `recurrentStartDate` off the first-period length**

Replace the existing `recurrentStartDate` block (currently ~289-294):

```ts
      let recurrentStartDate: string | undefined;
      if (activeTrial && activeTrial.currentPeriodEnd > now) {
        const firstChargeAt = new Date(activeTrial.currentPeriodEnd);
        firstChargeAt.setDate(firstChargeAt.getDate() + plan.intervalDays);
        recurrentStartDate = firstChargeAt.toISOString();
      }
```

with:

```ts
      // First auto-charge fires at the end of the first paid period. Base flow:
      // paid days stack after an active trial (see handlePaymentSuccess). Offer
      // flow: the first period is `firstPeriodDays` (60) long — and in the 24h
      // grace the trial row has already expired (no activeTrial), so the period
      // starts now; without an explicit startDate CP would recharge at now+1mo.
      let recurrentStartDate: string | undefined;
      if (activeTrial && activeTrial.currentPeriodEnd > now) {
        const firstChargeAt = new Date(activeTrial.currentPeriodEnd);
        firstChargeAt.setDate(firstChargeAt.getDate() + firstPeriodDays);
        recurrentStartDate = firstChargeAt.toISOString();
      } else if (offer) {
        const firstChargeAt = new Date(now);
        firstChargeAt.setDate(firstChargeAt.getDate() + firstPeriodDays);
        recurrentStartDate = firstChargeAt.toISOString();
      }
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @mpstats/api typecheck`
Expected: exit 0. (`offerFirstPeriodDays` now exists on the Prisma create input from Task 1's `prisma generate`.)

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/routers/billing.ts
git commit -m "feat(billing): apply trial 2-for-1 offer in initiatePayment"
```

---

### Task 4: Webhook honors `offerFirstPeriodDays` + burns `OfferRedemption`

**Files:**
- Modify: `apps/web/src/lib/cloudpayments/subscription-service.ts` (`handlePaymentSuccess` ~66-224)
- Test: `apps/web/src/lib/cloudpayments/__tests__/offer-first-period.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/cloudpayments/__tests__/offer-first-period.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeFirstPeriodEnd } from '../subscription-service';

const DAY = 24 * 60 * 60 * 1000;

describe('computeFirstPeriodEnd', () => {
  it('uses offerFirstPeriodDays (60) when set', () => {
    const start = new Date('2026-07-15T00:00:00.000Z');
    const end = computeFirstPeriodEnd(start, { intervalDays: 30, offerFirstPeriodDays: 60 });
    expect(Math.round((end.getTime() - start.getTime()) / DAY)).toBe(60);
  });

  it('falls back to plan.intervalDays when offer field is null', () => {
    const start = new Date('2026-07-15T00:00:00.000Z');
    const end = computeFirstPeriodEnd(start, { intervalDays: 30, offerFirstPeriodDays: null });
    expect(Math.round((end.getTime() - start.getTime()) / DAY)).toBe(30);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx vitest run src/lib/cloudpayments/__tests__/offer-first-period.test.ts`
Expected: FAIL — `computeFirstPeriodEnd` is not exported.

- [ ] **Step 3: Extract + use a `computeFirstPeriodEnd` helper**

In `apps/web/src/lib/cloudpayments/subscription-service.ts`, add an exported helper above `handlePaymentSuccess` (after the `enrichPayloadWithDbLookup` function, ~line 50):

```ts
/**
 * First paid period length: the trial 2-for-1 offer overrides plan.intervalDays
 * with a 60-day first period (offerFirstPeriodDays). Recurrent renewals still
 * use plan.intervalDays (see decide-recurrent-update.ts) — only the FIRST
 * period is affected.
 */
export function computeFirstPeriodEnd(
  periodStart: Date,
  plan: { intervalDays: number; offerFirstPeriodDays: number | null },
): Date {
  const days = plan.offerFirstPeriodDays ?? plan.intervalDays;
  const end = new Date(periodStart);
  end.setDate(end.getDate() + days);
  return end;
}
```

Then in `handlePaymentSuccess`, replace the period-end computation (currently lines 106-107):

```ts
    const periodEnd = new Date(periodStart);
    periodEnd.setDate(periodEnd.getDate() + subscription.plan.intervalDays);
```

with:

```ts
    const periodEnd = computeFirstPeriodEnd(periodStart, {
      intervalDays: subscription.plan.intervalDays,
      offerFirstPeriodDays: subscription.offerFirstPeriodDays,
    });
```

- [ ] **Step 4: Burn the OfferRedemption on success**

Still in `handlePaymentSuccess`, right after the `console.log('[Subscription] Activated ...')` block (~line 131, before the discount-redemption block) add:

```ts
    // Trial 2-for-1 offer: burn once-per-user. @unique(userId) makes webhook
    // replays idempotent (a second success on the same user is swallowed).
    if (subscription.offerFirstPeriodDays != null) {
      try {
        await prisma.offerRedemption.create({
          data: {
            userId: subscription.userId,
            subscriptionId: subscription.id,
            offerKey: 'trial_2for1',
          },
        });
      } catch (err) {
        console.warn(`[Offer] redemption race for user=${subscription.userId}:`, err);
      }
    }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run src/lib/cloudpayments/__tests__/offer-first-period.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Run the existing trial invariant test (no regression)**

Run: `cd apps/web && npx vitest run src/lib/cloudpayments/__tests__/trial-invariant.test.ts`
Expected: PASS (trial row still never mutated).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/cloudpayments/subscription-service.ts apps/web/src/lib/cloudpayments/__tests__/offer-first-period.test.ts
git commit -m "feat(billing): webhook honors offerFirstPeriodDays + burns OfferRedemption"
```

---

### Task 5: `offer.getState` shared contract

**Files:**
- Create: `packages/api/src/routers/offer.ts`
- Modify: `packages/api/src/root.ts`
- Test: `packages/api/src/routers/__tests__/offer-get-state.test.ts`

- [ ] **Step 1: Write the failing test (pure state deriver)**

Create `packages/api/src/routers/__tests__/offer-get-state.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { deriveOfferState } from '../offer';

const DAY = 24 * 60 * 60 * 1000;

describe('deriveOfferState', () => {
  it('none when no offer resolves', () => {
    expect(deriveOfferState(null)).toEqual({ state: 'none', offerEndsAt: null });
  });

  it('trial_active → counts down to trialEnd', () => {
    const trialEnd = new Date(Date.now() + 2 * DAY);
    const windowEnd = new Date(trialEnd.getTime() + DAY);
    const r = deriveOfferState({ firstPeriodDays: 60, trialEnd, windowEnd, inGrace: false });
    expect(r.state).toBe('trial_active');
    expect(r.offerEndsAt).toBe(trialEnd.toISOString());
  });

  it('grace → counts down to windowEnd', () => {
    const trialEnd = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const windowEnd = new Date(trialEnd.getTime() + DAY);
    const r = deriveOfferState({ firstPeriodDays: 60, trialEnd, windowEnd, inGrace: true });
    expect(r.state).toBe('grace');
    expect(r.offerEndsAt).toBe(windowEnd.toISOString());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/api && npx vitest run src/routers/__tests__/offer-get-state.test.ts`
Expected: FAIL — "Cannot find module '../offer'".

- [ ] **Step 3: Write the router + pure deriver**

Create `packages/api/src/routers/offer.ts`:

```ts
import { router, protectedProcedure } from '../trpc';
import { resolveApplicableOffer, type ResolvedOffer } from '../services/offer/resolve';
import { resolveApplicableDiscount } from '../services/discount/resolve';

export type OfferState = 'trial_active' | 'grace' | 'none';

/** Pure: turn a resolved offer into the banner/pricing display state. */
export function deriveOfferState(
  offer: ResolvedOffer | null,
): { state: OfferState; offerEndsAt: string | null } {
  if (!offer) return { state: 'none', offerEndsAt: null };
  return offer.inGrace
    ? { state: 'grace', offerEndsAt: offer.windowEnd.toISOString() }
    : { state: 'trial_active', offerEndsAt: offer.trialEnd.toISOString() };
}

export const offerRouter = router({
  /**
   * Shared contract for the offer banner (Phase B) and pricing page (Phase C).
   * Server is the source of truth; the client only ticks the timer to offerEndsAt.
   */
  getState: protectedProcedure.query(async ({ ctx }) => {
    // Suppress the offer if a discount would win at checkout (spec §3.4). Look up
    // a pending discount (no entered code — banner context) to stay consistent
    // with initiatePayment.
    const platformPlan = await ctx.prisma.subscriptionPlan.findFirst({
      where: { type: 'PLATFORM', hidden: false, isActive: true },
      select: { price: true },
    });
    const pendingDiscount = platformPlan
      ? await resolveApplicableDiscount({
          prisma: ctx.prisma,
          userId: ctx.user.id,
          planType: 'PLATFORM',
          basePrice: platformPlan.price,
          enteredCode: null,
        })
      : null;

    const offer = await resolveApplicableOffer({
      prisma: ctx.prisma,
      userId: ctx.user.id,
      planType: 'PLATFORM',
      suppressForDiscount: pendingDiscount != null,
    });
    return deriveOfferState(offer);
  }),
});
```

- [ ] **Step 4: Register the router**

In `packages/api/src/root.ts`, add the import after the assistant import (line 19):

```ts
import { offerRouter } from './routers/offer';
```

and add the entry inside `router({ ... })` after `assistant: assistantRouter,` (line 39):

```ts
  offer: offerRouter,
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd packages/api && npx vitest run src/routers/__tests__/offer-get-state.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Typecheck the api package**

Run: `pnpm --filter @mpstats/api typecheck`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/routers/offer.ts packages/api/src/root.ts packages/api/src/routers/__tests__/offer-get-state.test.ts
git commit -m "feat(billing): offer.getState — shared banner/pricing contract"
```

---

### Task 6: Full verification

- [ ] **Step 1: Run the whole api + web test suites**

Run: `pnpm --filter @mpstats/api test && pnpm --filter web test`
Expected: all green, including the 4 new test files and the untouched trial-invariant test.

- [ ] **Step 2: Typecheck the monorepo**

Run: `pnpm typecheck`
Expected: exit 0 across packages.

- [ ] **Step 3: Production build (catches server-only-in-client, per gotcha)**

Run: `pnpm --filter web build`
Expected: build succeeds. (No client component imports the new server code — `offer.getState` is tRPC, `resolve.ts` is server-only.)

- [ ] **Step 4: UAT checklist (owner, after the Task 1 migration is applied on prod)**

Manual, real-card smoke test through the EXISTING `/pricing` "Открыть всё" button as a user with an ACTIVE trial:
- First charge amount = 2 990 ₽.
- New ACTIVE subscription `currentPeriodEnd ≈ trialEnd + 60 days` (stacked) — verify in Supabase / Prisma Studio.
- `Subscription.offerFirstPeriodDays = 60`; one `OfferRedemption` row for the user.
- **Linchpin (CloudPayments dashboard):** the created recurrent has `amount = 2990` (full price) and next charge dated ≈ 60 days out (`recurrentStartDate`), NOT 30.
- Re-open `/pricing` as the same user after paying → `offer.getState` returns `none` (offer consumed); a second purchase attempt does not re-apply the offer.

Document the result in `.claude/memory/project_trial_2for1_offer.md`.

---

## Self-Review

- **Spec coverage (§3):** mechanics 2990→60d→recurrent-from-60 (Tasks 3,4) ✓; auto-apply by trial, PLATFORM only (Task 2) ✓; eligibility window trial+24h grace, server-side (Task 2) ✓; once-per-person `OfferRedemption` (Tasks 1,4) ✓; parallel to base model — base flow untouched when `offer===null` (Tasks 3,4 fallbacks) ✓; discount-vs-offer discount-wins (Task 2 `suppressForDiscount`, Task 5 pending-discount check) ✓; 54-FZ receipts unchanged (full-price recurrent receipt already built in initiatePayment) ✓; `offer.getState` contract (Task 5) ✓. Phase B/C consume it (separate plans).
- **Placeholder scan:** none — every step has concrete code/commands.
- **Type consistency:** `resolveApplicableOffer` returns `ResolvedOffer { firstPeriodDays, trialEnd, windowEnd, inGrace }` (Task 2), consumed unchanged by `deriveOfferState` (Task 5) and by `initiatePayment` via `offer.firstPeriodDays` (Task 3). `offerFirstPeriodDays` field name identical across schema (Task 1), initiatePayment write (Task 3), webhook read (Task 4). `OFFER_FIRST_PERIOD_DAYS=60` single source in resolve.ts.

## Notes / carried to Phase B & C

- `offer.getState` currently returns `trial_active | grace | none`. Phase B adds the `expired` generic-upsell banner state (derived from subscription status, not from the offer resolver) and unmounts `ReferralBanner`.
- Phase C surfaces the offer price framing on the PLATFORM pricing card from `offer.getState`.
- Open (spec §10): exact first-receipt line wording for the 60-day period — the existing `buildReceipt` uses `plan.intervalDays` in its description; confirm whether the first receipt should say "60 дней". Flagged for the owner during UAT.
