# Discount Promo Codes + Ambassador Discounts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admin-issued codes grant a **discount on purchase** (percent or fixed ₽), on the first payment only, for both `PromoCode` (entered at `/pricing`) and ambassador `ReferralCode` (auto-applied at first purchase).

**Architecture:** Additive Prisma fields on `PromoCode`/`ReferralCode`/`Referral` (no new tables). One pure function computes the discounted amount; one DB service resolves which discount applies for a user+plan. The discount is applied at the single price chokepoint (`billing.initiatePayment`), the recurrent charge is pinned to full price via the CloudPayments widget's `recurrent.amount`, and redemption is recorded only on payment success (webhook `pay`).

**Tech Stack:** Next.js 14 App Router, tRPC, Prisma (Supabase Postgres), Vitest, CloudPayments widget, Supabase Management API (for the additive migration).

**Reference spec:** `docs/superpowers/specs/2026-07-13-discount-promo-codes-design.md`

**Branch:** `feature/discount-promo-codes` (worktree at `.claude/worktrees/discount-promo-codes/`). All paths below are relative to the repo root **inside this worktree** — every Read/Edit/Write MUST use an absolute path containing `.claude/worktrees/discount-promo-codes/`.

---

## File Structure

**Create:**
- `packages/api/src/utils/discount.ts` — pure logic: `MIN_CHARGE_RUB`, `DiscountType`, `computeDiscountedAmount`, `pickDiscount`.
- `packages/api/src/utils/discount.test.ts` — unit tests for the above.
- `packages/api/src/services/discount/resolve.ts` — DB orchestrator `resolveApplicableDiscount` (fetch candidates → `pickDiscount` → `computeDiscountedAmount`).
- `apps/web/src/lib/cloudpayments/consume-discount.ts` — pure `shouldConsumeAmbassadorDiscount`.
- `apps/web/src/lib/cloudpayments/consume-discount.test.ts` — unit tests.
- `scripts/migrate/2026-07-13-add-discount-fields.ts` — additive migration via Supabase Mgmt API.

**Modify:**
- `packages/db/prisma/schema.prisma` — `enum DiscountType`; `discountType`/`discountValue` on `PromoCode` and `ReferralCode`; `discountConsumedAt` on `Referral`.
- `packages/api/src/routers/billing.ts` — `initiatePayment` (apply discount + return `recurrentAmount`), new `getApplicableDiscount` query.
- `packages/api/src/routers/promo.ts` — `validate` returns `kind` + discount; `activate` rejects discount codes; `createPromoCode` accepts discount mode.
- `packages/api/src/routers/referral.ts` — `createAmbassadorCode` accepts optional discount fields.
- `apps/web/src/lib/cloudpayments/subscription-service.ts` — `handlePaymentSuccess` records redemption.
- `apps/web/src/app/pricing/page.tsx` — discount-code branch + ambassador preview + `recurrent.amount`.
- `apps/web/src/app/(main)/billing/page.tsx` — pass `recurrent.amount`.
- `apps/web/src/app/(admin)/admin/billing-test/page.tsx` — pass `recurrent.amount`.
- Admin promo-code form (locate in Task 12) — discount-mode inputs.
- `apps/web/src/app/(admin)/admin/referrals/codes/*` — ambassador discount inputs.

**Commands (run from worktree root):**
- Backend tests: `pnpm --filter @mpstats/api test`
- Single test file: `pnpm --filter @mpstats/api test src/utils/discount.test.ts`
- Web tests: `pnpm --filter web test <path>`
- Typecheck all: `pnpm typecheck`

---

## Wave 1 — Data model + pure discount logic

### Task 1: Pure discount math (`computeDiscountedAmount` + `pickDiscount`)

**Files:**
- Create: `packages/api/src/utils/discount.ts`
- Test: `packages/api/src/utils/discount.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/src/utils/discount.test.ts
import { describe, it, expect } from 'vitest';
import {
  computeDiscountedAmount,
  pickDiscount,
  MIN_CHARGE_RUB,
  type DiscountCandidate,
} from './discount';

describe('computeDiscountedAmount', () => {
  it('returns base price when discount is null', () => {
    expect(computeDiscountedAmount(2990, null)).toBe(2990);
  });

  it('applies percent discount with rounding', () => {
    // 20% of 2990 = 598 → 2990 - 598 = 2392
    expect(computeDiscountedAmount(2990, { type: 'PERCENT', value: 20 })).toBe(2392);
  });

  it('rounds percent to nearest ruble', () => {
    // 33% of 1990 = 656.7 → round 657 → 1990 - 657 = 1333
    expect(computeDiscountedAmount(1990, { type: 'PERCENT', value: 33 })).toBe(1333);
  });

  it('applies fixed discount in rubles', () => {
    expect(computeDiscountedAmount(2990, { type: 'FIXED', value: 500 })).toBe(2490);
  });

  it('clamps to MIN_CHARGE_RUB when fixed exceeds price', () => {
    expect(computeDiscountedAmount(2990, { type: 'FIXED', value: 5000 })).toBe(MIN_CHARGE_RUB);
  });

  it('clamps to MIN_CHARGE_RUB when percent >= 100', () => {
    expect(computeDiscountedAmount(2990, { type: 'PERCENT', value: 100 })).toBe(MIN_CHARGE_RUB);
  });
});

describe('pickDiscount', () => {
  const promo: DiscountCandidate = { source: 'promo', type: 'PERCENT', value: 10, label: 'PROMO-X', promoCodeId: 'p1' };
  const amb: DiscountCandidate = { source: 'ambassador', type: 'FIXED', value: 500, label: 'Blogger' };

  it('prefers the entered promo over ambassador', () => {
    expect(pickDiscount(promo, amb)).toBe(promo);
  });

  it('falls back to ambassador when no promo', () => {
    expect(pickDiscount(null, amb)).toBe(amb);
  });

  it('returns null when neither applies', () => {
    expect(pickDiscount(null, null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mpstats/api test src/utils/discount.test.ts`
Expected: FAIL — `Cannot find module './discount'`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/api/src/utils/discount.ts

/** Discount kind stored on codes. Mirrors the Prisma `DiscountType` enum. */
export type DiscountType = 'PERCENT' | 'FIXED';

/**
 * Floor for any charged amount. CloudPayments cannot charge 0 ₽, and a
 * discount must never drive the price to or below zero. Kept as a named
 * constant so the floor is one source of truth across compute + UI preview.
 */
export const MIN_CHARGE_RUB = 1;

export interface DiscountInput {
  type: DiscountType;
  value: number;
}

export interface DiscountCandidate extends DiscountInput {
  source: 'promo' | 'ambassador';
  label: string;
  /** Present only for promo-code discounts — used to record PromoActivation. */
  promoCodeId?: string;
}

/**
 * Reduce `basePrice` by a discount, clamped to MIN_CHARGE_RUB.
 * PERCENT rounds to the nearest whole ruble. Returns basePrice unchanged
 * when discount is null.
 */
export function computeDiscountedAmount(
  basePrice: number,
  discount: DiscountInput | null,
): number {
  if (!discount) return basePrice;
  const reduced =
    discount.type === 'PERCENT'
      ? basePrice - Math.round((basePrice * discount.value) / 100)
      : basePrice - discount.value;
  return Math.max(MIN_CHARGE_RUB, reduced);
}

/**
 * Precedence: an explicitly entered promo discount wins over a pending
 * ambassador discount. No stacking — exactly one discount applies.
 */
export function pickDiscount(
  entered: DiscountCandidate | null,
  ambassador: DiscountCandidate | null,
): DiscountCandidate | null {
  return entered ?? ambassador ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mpstats/api test src/utils/discount.test.ts`
Expected: PASS (12 assertions across 2 describes).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/utils/discount.ts packages/api/src/utils/discount.test.ts
git commit -m "feat(billing): pure discount math (computeDiscountedAmount + pickDiscount)"
```

---

### Task 2: Prisma schema — discount fields

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Add the `DiscountType` enum**

Add near the other enums (e.g. right above `model PromoCode` at line 361):

```prisma
enum DiscountType {
  PERCENT
  FIXED
}
```

- [ ] **Step 2: Add fields to `PromoCode`**

In `model PromoCode` (line 361), add two nullable fields after `durationDays`:

```prisma
  durationDays  Int
  discountType  DiscountType?
  discountValue Int?
```

(Keep `durationDays Int` NOT NULL. A discount code stores `durationDays = 0` and a non-null `discountType`; a duration code stores `discountType = null`.)

- [ ] **Step 3: Add fields to `ReferralCode`**

In `model ReferralCode` (line 638), add after `refereeTrialDays`:

```prisma
  refereeTrialDays Int
  discountType     DiscountType?
  discountValue    Int?
```

- [ ] **Step 4: Add field to `Referral`**

In `model Referral` (line 592), add after `convertedAt`:

```prisma
  discountConsumedAt DateTime?
```

- [ ] **Step 5: Generate the Prisma client (NO db push)**

Run: `pnpm --filter @mpstats/db db:generate`
Expected: Prisma client regenerates with the new fields, no errors.

> ⚠️ Do NOT run `prisma db push`/`migrate` — this repo shares the prod Supabase DB. Schema goes live via the Mgmt-API script in Task 3.

- [ ] **Step 6: Commit**

```bash
git add packages/db/prisma/schema.prisma
git commit -m "feat(db): additive discount fields on PromoCode/ReferralCode/Referral"
```

---

### Task 3: Additive migration script (Supabase Mgmt API)

**Files:**
- Create: `scripts/migrate/2026-07-13-add-discount-fields.ts`

Follow the established pattern documented in memory `reference_supabase_migration_via_mgmt_api.md` (compute checksum → POST split DDL to `POST .../database/query` → INSERT a `_prisma_migrations` row). Do NOT run this script during implementation — it is executed by the owner against prod at deploy time. Author it and commit it.

- [ ] **Step 1: Write the migration script**

```ts
// scripts/migrate/2026-07-13-add-discount-fields.ts
//
// Additive migration: discount fields for promo + ambassador codes.
// Run manually at deploy time (owner-gated). Requires SUPABASE_MGMT_TOKEN
// and project ref saecuecevicwjkpmaoot. Pattern: reference_supabase_migration_via_mgmt_api.
//
// Usage: NODE_OPTIONS=--dns-result-order=ipv4first npx tsx scripts/migrate/2026-07-13-add-discount-fields.ts

const PROJECT_REF = 'saecuecevicwjkpmaoot';
const TOKEN = process.env.SUPABASE_MGMT_TOKEN;
if (!TOKEN) throw new Error('SUPABASE_MGMT_TOKEN not set');

const STATEMENTS = [
  `CREATE TYPE "DiscountType" AS ENUM ('PERCENT', 'FIXED');`,
  `ALTER TABLE "PromoCode" ADD COLUMN "discountType" "DiscountType", ADD COLUMN "discountValue" INTEGER;`,
  `ALTER TABLE "ReferralCode" ADD COLUMN "discountType" "DiscountType", ADD COLUMN "discountValue" INTEGER;`,
  `ALTER TABLE "Referral" ADD COLUMN "discountConsumedAt" TIMESTAMP(3);`,
];

async function runQuery(query: string): Promise<void> {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    },
  );
  if (!res.ok) throw new Error(`Query failed (${res.status}): ${await res.text()}`);
}

async function main() {
  for (const stmt of STATEMENTS) {
    console.log('Applying:', stmt);
    await runQuery(stmt);
  }
  // Record the migration so `prisma migrate status` stays consistent.
  const migrationName = '20260713000000_add_discount_fields';
  await runQuery(`
    INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
    VALUES (gen_random_uuid()::text, 'manual-mgmt-api', '${migrationName}', now(), now(), 1)
    ON CONFLICT DO NOTHING;
  `);
  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors introduced by the new script.

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate/2026-07-13-add-discount-fields.ts
git commit -m "chore(db): additive discount-fields migration script (Mgmt API)"
```

---

## Wave 2 — Backend application

### Task 4: `resolveApplicableDiscount` service

**Files:**
- Create: `packages/api/src/services/discount/resolve.ts`

This is a thin DB orchestrator (matches the repo convention of DB-touching services being covered via the procedures that call them; the tested logic lives in `discount.ts`).

- [ ] **Step 1: Write the implementation**

```ts
// packages/api/src/services/discount/resolve.ts
import type { PrismaClient, SubscriptionType } from '@mpstats/db';
import {
  computeDiscountedAmount,
  pickDiscount,
  type DiscountCandidate,
} from '../../utils/discount';

export interface ResolvedDiscount {
  source: 'promo' | 'ambassador';
  type: 'PERCENT' | 'FIXED';
  value: number;
  label: string;
  promoCodeId?: string;
  originalPrice: number;
  discountedPrice: number;
}

/**
 * Resolve the single discount that applies for `userId` buying `planType`.
 * Precedence: a valid entered promo-discount code > a pending ambassador
 * discount. Returns null when no discount applies.
 *
 * `basePrice` is the resolved public plan price (caller already has the plan).
 */
export async function resolveApplicableDiscount(args: {
  prisma: PrismaClient;
  userId: string;
  planType: SubscriptionType;
  basePrice: number;
  enteredCode?: string | null;
}): Promise<ResolvedDiscount | null> {
  const { prisma, userId, planType, basePrice, enteredCode } = args;
  const now = new Date();

  // --- Candidate A: entered promo-discount code ---
  let entered: DiscountCandidate | null = null;
  if (enteredCode) {
    const promo = await prisma.promoCode.findUnique({
      where: { code: enteredCode },
      select: {
        id: true,
        planType: true,
        discountType: true,
        discountValue: true,
        isActive: true,
        expiresAt: true,
        maxUses: true,
        currentUses: true,
      },
    });
    const alreadyUsed = promo
      ? await prisma.promoActivation.findUnique({
          where: { promoCodeId_userId: { promoCodeId: promo.id, userId } },
          select: { id: true },
        })
      : null;
    const promoValid =
      promo &&
      promo.isActive &&
      promo.discountType != null &&
      promo.discountValue != null &&
      promo.planType === planType &&
      (!promo.expiresAt || promo.expiresAt >= now) &&
      promo.currentUses < promo.maxUses &&
      !alreadyUsed;
    if (promoValid && promo) {
      entered = {
        source: 'promo',
        type: promo.discountType!,
        value: promo.discountValue!,
        label: enteredCode,
        promoCodeId: promo.id,
      };
    }
  }

  // --- Candidate B: pending ambassador discount ---
  let ambassador: DiscountCandidate | null = null;
  const referral = await prisma.referral.findFirst({
    where: {
      referredUserId: userId,
      discountConsumedAt: null,
      codeId: { not: null },
    },
    select: {
      referralCode: {
        select: {
          discountType: true,
          discountValue: true,
          isActive: true,
          expiresAt: true,
          label: true,
        },
      },
    },
  });
  const rc = referral?.referralCode;
  if (
    rc &&
    rc.isActive &&
    rc.discountType != null &&
    rc.discountValue != null &&
    (!rc.expiresAt || rc.expiresAt >= now)
  ) {
    ambassador = {
      source: 'ambassador',
      type: rc.discountType,
      value: rc.discountValue,
      label: rc.label,
    };
  }

  const chosen = pickDiscount(entered, ambassador);
  if (!chosen) return null;

  return {
    source: chosen.source,
    type: chosen.type,
    value: chosen.value,
    label: chosen.label,
    promoCodeId: chosen.promoCodeId,
    originalPrice: basePrice,
    discountedPrice: computeDiscountedAmount(basePrice, {
      type: chosen.type,
      value: chosen.value,
    }),
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @mpstats/api typecheck` (or `pnpm typecheck`)
Expected: no errors. If `SubscriptionType`/`PrismaClient` are not exported from `@mpstats/db`, import types from `@mpstats/db/client` — grep an existing service (e.g. `packages/api/src/services/referral/activation.ts`) for the correct import path and match it.

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/services/discount/resolve.ts
git commit -m "feat(billing): resolveApplicableDiscount service (promo > ambassador)"
```

---

### Task 5: Apply discount in `billing.initiatePayment`

**Files:**
- Modify: `packages/api/src/routers/billing.ts:70-228`

- [ ] **Step 1: Add import + input field**

At the top of the file, add:

```ts
import { resolveApplicableDiscount } from '../services/discount/resolve';
```

Extend the `initiatePayment` input (currently `billing.ts:71-76`) with an optional code:

```ts
    .input(
      z.object({
        planType: z.enum(['COURSE', 'PLATFORM']),
        courseId: z.string().optional(),
        promoCode: z
          .string()
          .min(1)
          .max(50)
          .transform((s) => s.trim().toUpperCase())
          .optional(),
      }),
    )
```

- [ ] **Step 2: Resolve the discount before creating the payment**

Immediately after the `plan` is resolved and validated (`billing.ts:100-105`, right after the `if (!plan) throw` block), insert:

```ts
      // Resolve an applicable discount (entered promo-discount code > pending
      // ambassador discount). Charged amount is the discounted price; the
      // recurrent charge is always pinned to full plan.price below.
      const discount = await resolveApplicableDiscount({
        prisma: ctx.prisma,
        userId: ctx.user.id,
        planType: input.planType,
        basePrice: plan.price,
        enteredCode: input.promoCode,
      });
      const firstAmount = discount ? discount.discountedPrice : plan.price;
```

- [ ] **Step 3: Use `firstAmount` for the pending payment, receipt, and set `promoCodeId`**

Change the PENDING subscription create (`billing.ts:164-173`) to persist the promo link when the discount came from a promo code:

```ts
      const subscription = await ctx.prisma.subscription.create({
        data: {
          userId: ctx.user.id,
          planId: plan.id,
          courseId: input.courseId ?? null,
          status: 'PENDING',
          currentPeriodStart: now,
          currentPeriodEnd: now,
          promoCodeId: discount?.source === 'promo' ? discount.promoCodeId : null,
        },
      });
```

Change the PENDING payment amount (`billing.ts:176-182`) from `plan.price` to `firstAmount`:

```ts
      await ctx.prisma.payment.create({
        data: {
          subscriptionId: subscription.id,
          amount: firstAmount,
          status: 'PENDING',
        },
      });
```

Change the receipt (`billing.ts:184-189`) to bill the discounted amount:

```ts
      const receipt = buildReceipt({
        plan: { type: plan.type, intervalDays: plan.intervalDays },
        user: { email: ctx.user.email },
        amount: firstAmount,
        courseTitle,
      });
```

- [ ] **Step 4: Return `amount: firstAmount` + `recurrentAmount: plan.price`**

Change the return object (`billing.ts:219-227`):

```ts
      return {
        subscriptionId: subscription.id,
        amount: firstAmount,
        recurrentAmount: plan.price,
        planName: plan.name,
        description,
        userId: ctx.user.id,
        receipt,
        recurrentStartDate,
        discountApplied: discount
          ? { source: discount.source, label: discount.label, originalPrice: discount.originalPrice }
          : null,
      };
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @mpstats/api typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/routers/billing.ts
git commit -m "feat(billing): apply discount to first payment, pin recurrent to full price"
```

---

### Task 6: `billing.getApplicableDiscount` query (UI preview)

**Files:**
- Modify: `packages/api/src/routers/billing.ts`

- [ ] **Step 1: Add the query**

Add a new procedure inside `billingRouter` (e.g. right after `getSubscription`, `billing.ts:64`):

```ts
  /**
   * Preview the discount that would apply for the current user + plan.
   * Used by /pricing to show the reduced price (entered code or the user's
   * pending ambassador discount). Does not mutate anything.
   */
  getApplicableDiscount: protectedProcedure
    .input(
      z.object({
        planType: z.enum(['COURSE', 'PLATFORM']),
        code: z
          .string()
          .min(1)
          .max(50)
          .transform((s) => s.trim().toUpperCase())
          .optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const enabled = await isFeatureEnabled('billing_enabled');
      if (!enabled) return null;

      const plan = await ctx.prisma.subscriptionPlan.findFirst({
        where: { type: input.planType, hidden: false, isActive: true },
      });
      if (!plan) return null;

      const discount = await resolveApplicableDiscount({
        prisma: ctx.prisma,
        userId: ctx.user.id,
        planType: input.planType,
        basePrice: plan.price,
        enteredCode: input.code,
      });
      if (!discount) return null;

      return {
        source: discount.source,
        label: discount.label,
        type: discount.type,
        value: discount.value,
        originalPrice: discount.originalPrice,
        discountedPrice: discount.discountedPrice,
      };
    }),
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @mpstats/api typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/routers/billing.ts
git commit -m "feat(billing): getApplicableDiscount preview query"
```

---

### Task 7: `promo.validate` returns kind + discount; `activate` rejects discount codes

**Files:**
- Modify: `packages/api/src/routers/promo.ts:16-50` (validate), `promo.ts:63-114` (activate)

- [ ] **Step 1: Extend `validate` select + return**

In `validate` (`promo.ts:19-32`), add `discountType`/`discountValue` to the `select`:

```ts
        select: {
          id: true,
          planType: true,
          courseId: true,
          durationDays: true,
          discountType: true,
          discountValue: true,
          isActive: true,
          expiresAt: true,
          maxUses: true,
          currentUses: true,
          course: { select: { title: true } },
        },
```

Change the success return (`promo.ts:44-49`) to include a `kind` discriminator:

```ts
      const isDiscount = promo.discountType != null && promo.discountValue != null;
      return {
        valid: true as const,
        kind: isDiscount ? ('discount' as const) : ('duration' as const),
        planType: promo.planType,
        courseTitle: promo.course?.title || null,
        durationDays: promo.durationDays,
        discountType: promo.discountType,
        discountValue: promo.discountValue,
      };
```

- [ ] **Step 2: Reject discount codes in `activate`**

In `activate`, right after Step 1 finds the promo and checks `isActive` (`promo.ts:73-75`), add a guard:

```ts
      // Discount codes are not "activated" — they are applied at payment time.
      if (promo.discountType != null) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Это скидочный код — примените его при оплате',
        });
      }
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @mpstats/api typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/routers/promo.ts
git commit -m "feat(promo): validate returns kind+discount; activate rejects discount codes"
```

---

### Task 8: `promo.createPromoCode` — discount mode

**Files:**
- Modify: `packages/api/src/routers/promo.ts:205-256`

- [ ] **Step 1: Extend the input schema**

Change `createPromoCode` input (`promo.ts:206-219`) to make `durationDays` optional and add discount fields with a refinement:

```ts
    .input(
      z
        .object({
          code: z
            .string()
            .min(3)
            .max(50)
            .transform((s) => s.trim().toUpperCase())
            .optional(),
          planType: z.enum(['COURSE', 'PLATFORM']),
          courseId: z.string().optional(),
          durationDays: z.number().int().min(1).max(365).optional(),
          discountType: z.enum(['PERCENT', 'FIXED']).optional(),
          discountValue: z.number().int().positive().optional(),
          maxUses: z.number().int().min(1).max(100000).default(1),
          expiresAt: z.string().datetime().optional(),
        })
        .refine(
          (d) =>
            (d.durationDays != null) !==
            (d.discountType != null && d.discountValue != null),
          { message: 'Укажите либо длительность (дни), либо скидку (тип + значение) — но не оба' },
        )
        .refine(
          (d) => d.discountType !== 'PERCENT' || (d.discountValue ?? 0) <= 100,
          { message: 'Процент скидки не может превышать 100' },
        ),
    )
```

- [ ] **Step 2: Persist discount fields**

Change the `create` data (`promo.ts:244-255`):

```ts
      return ctx.prisma.promoCode.create({
        data: {
          code,
          planType: input.planType,
          courseId: input.courseId || null,
          durationDays: input.durationDays ?? 0,
          discountType: input.discountType ?? null,
          discountValue: input.discountValue ?? null,
          maxUses: input.maxUses,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          isActive: true,
          createdBy: ctx.user!.id,
        },
      });
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @mpstats/api typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/routers/promo.ts
git commit -m "feat(promo): createPromoCode supports discount mode (percent/fixed)"
```

---

### Task 9: `referral.createAmbassadorCode` — optional discount

**Files:**
- Modify: `packages/api/src/routers/referral.ts` (the `createAmbassadorCode` mutation, ~lines 77-130 per the code map)

- [ ] **Step 1: Read the file first**

Run: `grep -n "createAmbassadorCode" packages/api/src/routers/referral.ts` and Read the mutation to see its exact input schema and `create` data block.

- [ ] **Step 2: Add optional discount fields to the input**

Add to the input `z.object({ ... })` (alongside `refereeTrialDays`):

```ts
        discountType: z.enum(['PERCENT', 'FIXED']).optional(),
        discountValue: z.number().int().positive().optional(),
```

If the input uses `.strict()` (Phase 60 pattern), keep it — just add the two keys. Add a refinement so a PERCENT value can't exceed 100:

```ts
        .refine(
          (d) => d.discountType !== 'PERCENT' || (d.discountValue ?? 0) <= 100,
          { message: 'Процент скидки не может превышать 100' },
        )
```

(Also require both-or-neither: `(d.discountType == null) === (d.discountValue == null)`.)

- [ ] **Step 3: Persist to the `referralCode.create` data**

Add to the `create` data block:

```ts
        discountType: input.discountType ?? null,
        discountValue: input.discountValue ?? null,
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @mpstats/api typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routers/referral.ts
git commit -m "feat(referral): ambassador codes can grant an optional discount"
```

---

## Wave 3 — Consume-on-success (webhook)

### Task 10: Pure `shouldConsumeAmbassadorDiscount`

**Files:**
- Create: `apps/web/src/lib/cloudpayments/consume-discount.ts`
- Test: `apps/web/src/lib/cloudpayments/consume-discount.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/cloudpayments/consume-discount.test.ts
import { describe, it, expect } from 'vitest';
import { shouldConsumeAmbassadorDiscount } from './consume-discount';

describe('shouldConsumeAmbassadorDiscount', () => {
  it('true when paid below full and no promo code on the subscription', () => {
    expect(shouldConsumeAmbassadorDiscount({ paidAmount: 2490, planPrice: 2990, promoCodeId: null })).toBe(true);
  });

  it('false when paid the full price', () => {
    expect(shouldConsumeAmbassadorDiscount({ paidAmount: 2990, planPrice: 2990, promoCodeId: null })).toBe(false);
  });

  it('false when a promo code was applied (that path consumes separately)', () => {
    expect(shouldConsumeAmbassadorDiscount({ paidAmount: 2490, planPrice: 2990, promoCodeId: 'p1' })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test src/lib/cloudpayments/consume-discount.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// apps/web/src/lib/cloudpayments/consume-discount.ts

/**
 * Whether a successful payment should burn the user's pending ambassador
 * discount. Ambassador discounts leave no marker on the subscription (unlike
 * promo codes, which set `promoCodeId`), so we re-derive: the charge came in
 * below full plan price AND no promo code was attached → the reduction can
 * only have come from the ambassador discount.
 */
export function shouldConsumeAmbassadorDiscount(args: {
  paidAmount: number;
  planPrice: number;
  promoCodeId: string | null;
}): boolean {
  return args.promoCodeId == null && args.paidAmount < args.planPrice;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test src/lib/cloudpayments/consume-discount.test.ts`
Expected: PASS (3 assertions).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/cloudpayments/consume-discount.ts apps/web/src/lib/cloudpayments/consume-discount.test.ts
git commit -m "feat(billing): pure shouldConsumeAmbassadorDiscount helper"
```

---

### Task 11: Record redemption in `handlePaymentSuccess`

**Files:**
- Modify: `apps/web/src/lib/cloudpayments/subscription-service.ts:65-140`

- [ ] **Step 1: Add the import**

At the top of `subscription-service.ts`:

```ts
import { shouldConsumeAmbassadorDiscount } from './consume-discount';
```

- [ ] **Step 2: Include `promoCodeId` when loading the subscription**

The subscription is loaded at `subscription-service.ts:70-73` with `include: { plan: true }`. `promoCodeId` is a scalar and is already returned by `findUnique` — no change needed to the query. Confirm `subscription.promoCodeId` and `subscription.plan.price` are both available.

- [ ] **Step 3: Add the redemption block**

After the subscription is activated (right after the `console.log(...Activated...)` at `subscription-service.ts:126-130`, and before the fire-and-forget email at line 132), insert:

```ts
    // --- Record discount redemption (consume-on-success) ---
    // Promo-discount code: the PENDING sub carries promoCodeId (set in
    // initiatePayment). Burn it exactly once via PromoActivation's
    // @@unique([promoCodeId, userId]) guard.
    if (subscription.promoCodeId) {
      const promo = await prisma.promoCode.findUnique({
        where: { id: subscription.promoCodeId },
        select: { id: true, discountType: true },
      });
      if (promo?.discountType) {
        const already = await prisma.promoActivation.findUnique({
          where: {
            promoCodeId_userId: { promoCodeId: promo.id, userId: subscription.userId },
          },
          select: { id: true },
        });
        if (!already) {
          try {
            await prisma.$transaction([
              prisma.promoActivation.create({
                data: {
                  promoCodeId: promo.id,
                  userId: subscription.userId,
                  subscriptionId: subscription.id,
                },
              }),
              prisma.promoCode.update({
                where: { id: promo.id },
                data: { currentUses: { increment: 1 } },
              }),
            ]);
          } catch (err) {
            // Unique race on webhook replay — already consumed, safe to ignore.
            console.warn(
              `[Discount] promo activation race for sub=${subscription.id}:`,
              err,
            );
          }
        }
      }
    } else if (
      shouldConsumeAmbassadorDiscount({
        paidAmount: payment.amount,
        planPrice: subscription.plan.price,
        promoCodeId: subscription.promoCodeId,
      })
    ) {
      // Ambassador discount: mark the user's pending referral row consumed.
      const pending = await prisma.referral.findFirst({
        where: {
          referredUserId: subscription.userId,
          discountConsumedAt: null,
          codeId: { not: null },
          referralCode: { discountType: { not: null } },
        },
        select: { id: true },
      });
      if (pending) {
        await prisma.referral.update({
          where: { id: pending.id },
          data: { discountConsumedAt: now },
        });
      }
    }
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter web typecheck` (or `pnpm typecheck`)
Expected: no errors. (`now` is already defined at `subscription-service.ts:82`.)

- [ ] **Step 5: Run the web test suite for the touched area**

Run: `pnpm --filter web test src/lib/cloudpayments`
Expected: PASS (existing cloudpayments tests + the new consume-discount test).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/cloudpayments/subscription-service.ts
git commit -m "feat(billing): record discount redemption on payment success"
```

---

## Wave 4 — Frontend

### Task 12: Admin promo-code form — discount mode

**Files:**
- Modify: the admin promo-code create form (locate in Step 1).

- [ ] **Step 1: Locate the form**

Run: `grep -rln "createPromoCode\|promo.getPromoCodes\|durationDays" apps/web/src/app/(admin)` and Read the promo-code admin page/component. Identify the create form and the `createPromoCode` mutation call.

- [ ] **Step 2: Add a mode toggle**

Add a "Тип кода" selector with two options: **«Дни доступа»** (existing `durationDays` input) and **«Скидка»** (new inputs: discount type `%`/`₽` + value). Store mode in local state. Only one input group is visible at a time.

- [ ] **Step 3: Wire the mutation payload**

When mode = «Дни»: call `createPromoCode.mutate({ ..., durationDays })` (unchanged).
When mode = «Скидка»: call `createPromoCode.mutate({ ..., discountType, discountValue })` (omit `durationDays`).
Match the exact input contract from Task 8. Client-side: for PERCENT, cap the value input at 100.

- [ ] **Step 4: Show discount in the codes list**

In the promo-codes table, render the code's grant: `${durationDays} дн.` for duration codes, or `−${discountValue}%` / `−${discountValue} ₽` for discount codes (branch on `discountType`). Add `discountType`/`discountValue` to whatever `getPromoCodes` select the table reads if they aren't already returned (the router returns the full row, so they will be present after Task 2).

- [ ] **Step 5: Typecheck + build the app once**

Run: `pnpm --filter web typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/\(admin\)
git commit -m "feat(admin): promo-code form supports discount mode + list display"
```

---

### Task 13: Admin ambassador-code form — discount fields

**Files:**
- Modify: `apps/web/src/app/(admin)/admin/referrals/codes/` (page + form component)

- [ ] **Step 1: Locate the form**

Run: `grep -rln "createAmbassadorCode\|refereeTrialDays" apps/web/src/app/(admin)/admin/referrals` and Read the create form.

- [ ] **Step 2: Add optional discount inputs**

Alongside «Дней триала» (`refereeTrialDays`), add an optional discount group: type `%`/`₽` + value, with a clear "необязательно" label. Ambassador codes may grant days AND/OR a discount.

- [ ] **Step 3: Wire the mutation payload**

Pass `discountType`/`discountValue` to `createAmbassadorCode.mutate(...)` only when the discount group is filled; omit both otherwise. Match the Task 9 contract. Cap PERCENT at 100 client-side.

- [ ] **Step 4: Show discount in the codes list**

In the ambassador-codes table, if `discountType` is set, render `+ скидка −${discountValue}%` / `−${discountValue} ₽` next to the trial-days column.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/\(admin\)/admin/referrals
git commit -m "feat(admin): ambassador-code form supports optional discount"
```

---

### Task 14: `/pricing` — discount-code branch + ambassador preview + recurrent pin

**Files:**
- Modify: `apps/web/src/app/pricing/page.tsx`

Context: the page already has `promoCode` state, `handlePromoApply`, and an `activatePromo` mutation for **duration** codes (`page.tsx:278+`). The existing `handlePayment` (`page.tsx:233-276`) calls `initiatePayment` then `openPaymentWidget` with `recurrent: { interval:'Month', period:1, startDate }` (no `amount`).

- [ ] **Step 1: Route the entered code by kind**

Change `handlePromoApply` so it first calls `trpc.promo.validate`. If `validate` returns `kind === 'duration'` (or the code isn't found) → keep the existing activate flow. If `kind === 'discount'` → store the code in a new `discountCode` state (do NOT activate), and show a preview using `getApplicableDiscount`. Use `const { data: discountPreview } = trpc.billing.getApplicableDiscount.useQuery({ planType, code: discountCode ?? undefined }, { enabled: isAuthenticated })`.

- [ ] **Step 2: Show ambassador/preview banner**

Even with no entered code, call `getApplicableDiscount({ planType })` on mount for authenticated users. If it returns a discount (`source === 'ambassador'` or a stored entered code), render a small banner near the plan price: `«Скидка N% по коду {label} — {discountedPrice} ₽ вместо {originalPrice} ₽»`. Reuse `pluralizeDays`-style formatting only if needed (not required here).

- [ ] **Step 3: Pass the code into payment + pin recurrent**

In `handlePayment` (`page.tsx:241-255`), pass the stored discount code and the returned recurrent amount:

```ts
      const result = await initiatePayment.mutateAsync({
        planType,
        courseId: planType === 'COURSE' ? selectedCourseId : undefined,
        promoCode: discountCode ?? undefined,
      });

      const success = await openPaymentWidget({
        publicId: process.env.NEXT_PUBLIC_CLOUDPAYMENTS_PUBLIC_ID!,
        description: result.description,
        amount: result.amount,
        currency: 'RUB',
        accountId: result.userId,
        invoiceId: result.subscriptionId,
        recurrent: {
          interval: 'Month',
          period: 1,
          amount: result.recurrentAmount, // full plan price — discount is first-payment only
          startDate: result.recurrentStartDate,
        },
        receipt: result.receipt,
      });
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/pricing/page.tsx
git commit -m "feat(pricing): discount-code branch + ambassador preview + recurrent pinned to full price"
```

---

### Task 15: Pin recurrent amount in the other two widget call sites

**Files:**
- Modify: `apps/web/src/app/(main)/billing/page.tsx` (~line 120-136)
- Modify: `apps/web/src/app/(admin)/admin/billing-test/page.tsx` (~line 36-46)

- [ ] **Step 1: `(main)/billing/page.tsx`**

Read the file; it calls `initiatePayment` then `openPaymentWidget`. Add `amount: result.recurrentAmount` inside the `recurrent` object (mirroring Task 14 Step 3). This file goes through `initiatePayment`, so `recurrentAmount` is returned; a discount entered elsewhere would also apply here consistently.

- [ ] **Step 2: `(admin)/admin/billing-test/page.tsx`**

This uses `initiateTestPayment`, which does NOT return `recurrentAmount` (no discount path). Add `amount: result.amount` inside the `recurrent` object so its recurrent equals its (full) first charge — behavior unchanged, just explicit.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/\(main\)/billing/page.tsx apps/web/src/app/\(admin\)/admin/billing-test/page.tsx
git commit -m "feat(billing): pin recurrent.amount explicitly at remaining widget call sites"
```

---

## Wave 5 — Verification

### Task 16: Full test + typecheck sweep

- [ ] **Step 1: Run all backend + web tests**

Run: `pnpm --filter @mpstats/api test && pnpm --filter web test`
Expected: all green (the pre-existing `yandex-oauth` web flake may appear under load — rerun in isolation to confirm it's the known flake, not a regression).

- [ ] **Step 2: Typecheck the whole repo**

Run: `pnpm typecheck`
Expected: 0 errors across all packages.

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: no new errors.

- [ ] **Step 4: Final commit (if any fixups)**

```bash
git add -A
git commit -m "test(billing): verify discount feature suite green"
```

---

## Deployment notes (owner-gated, not part of implementation)

1. Apply the additive migration to prod Supabase: `NODE_OPTIONS=--dns-result-order=ipv4first npx tsx scripts/migrate/2026-07-13-add-discount-fields.ts` (needs `SUPABASE_MGMT_TOKEN`).
2. **Verify the CloudPayments linchpin on staging** before prod: create a discount code, buy with it on staging, confirm CP registers the recurrent at **full** price (not the discounted first charge). If CP does not honor a differing `recurrent.amount`, fall back to plan B (non-recurrent first charge + separate recurrent registration) — see spec.
3. Merge `feature/discount-promo-codes` → master only after the owner's other in-flight work clears master (per owner: "закончить пару процессов").
4. Rollback: `git revert -m 1 <merge>` + redeploy. The migration is additive (nullable columns) — safe to leave in place.
