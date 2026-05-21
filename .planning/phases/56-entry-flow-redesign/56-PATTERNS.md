# Phase 56: Entry Flow Redesign — Pattern Map

**Mapped:** 2026-05-18
**Files analyzed:** 14 (8 new, 6 modified)
**Analogs found:** 14 / 14

## File Classification

| New/Modified File | Status | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|--------|------|-----------|----------------|---------------|
| `packages/db/prisma/schema.prisma` (UserProfile +5 fields) | modify | model | — | `UserProfile.toursCompleted String[]` (line 34) | exact |
| `packages/db/prisma/migrations/2026XXXX_add_onboarding_fields/migration.sql` | new | migration | — | `20260512000000_add_lesson_metadata/migration.sql` | exact |
| `packages/api/src/routers/onboarding.ts` | new | route (tRPC router) | request-response (CRUD) | `packages/api/src/routers/profile.ts` (`update`, `markTourCompleted`) | exact |
| `packages/api/src/root.ts` | modify | config | — | self (router registration list) | exact |
| `packages/api/src/routers/__tests__/onboarding.test.ts` | new | test | — | `packages/api/src/routers/__tests__/referral.test.ts` | exact |
| `apps/web/src/app/welcome/layout.tsx` | new | layout (SSR) | request-response | `apps/web/src/app/pricing/layout.tsx` + `(main)/layout.tsx` (auth block) | role-match |
| `apps/web/src/app/welcome/page.tsx` | new | component (client wizard orchestrator) | event-driven (client state) | no in-repo wizard; pattern from `learn/[id]/page.tsx` (client+trpc mutation) | partial |
| `apps/web/src/components/welcome/WizardStepper.tsx` | new | component | — | `apps/web/src/components/diagnostic/ProgressBar.tsx` | role-match |
| `apps/web/src/components/welcome/StepIntent.tsx` | new | component | event-driven | `DiagnosticGateBanner.tsx` (Card/Button shape) + UI-SPEC | partial |
| `apps/web/src/components/welcome/StepMarketplaces.tsx` | new | component | event-driven | UI-SPEC + `components/ui/card` | partial |
| `apps/web/src/components/welcome/StepExperience.tsx` | new | component | event-driven | UI-SPEC + `components/ui/card` | partial |
| `apps/web/src/components/welcome/ForkScreen.tsx` | new | component | event-driven | `DiagnosticGateBanner.tsx` (Card+CTA) + UI-SPEC | partial |
| `apps/web/src/app/(main)/layout.tsx` (guard branch) | modify | layout (SSR) | request-response | self (`pending_promo` redirect block, lines 41-50) | exact |
| `apps/web/src/app/(main)/learn/[id]/page.tsx` (lines 641-645) | modify | component | — | self (subscription `lesson.locked` branch) | exact |
| `apps/web/src/components/learning/DiagnosticGateBanner.tsx` | modify (repurpose) | component | — | self (blocking → dismissible hint) | exact |

---

## Pattern Assignments

### `packages/db/prisma/schema.prisma` — UserProfile +5 fields (model)

**Analog:** `UserProfile.toursCompleted` — the existing `String[]` array-field precedent.

**Existing array-field pattern** (`schema.prisma:34`):
```prisma
toursCompleted String[] @default([]) // Onboarding tour state (per-user, not per-device): ['dashboard', 'learn', 'lesson']
```

**Add 5 fields inside `model UserProfile` (after `toursCompleted`, line 34):**
```prisma
onboardingCompletedAt DateTime?               // null = show wizard; now() when fork passed
marketplaces          String[]  @default([])  // WB|OZON|YANDEX|ALIEXPRESS|MEGAMARKET|OWN_SHOP|OTHER
experienceLevel       String?                 // PROSPECTING|BEGINNER|STABLE|ADVANCED
goals                 String[]  @default([])  // SALES|ADS|CONTENT|ANALYTICS|OPERATIONS|FINANCE|NEW_MARKETPLACE
goalText              String?                 // free text from step 1
```
> `String[]` over Prisma `enum` — locked by CONTEXT.md and mirrors `toursCompleted`. After edit run `pnpm db:generate` (Pitfall: build fails otherwise).

---

### `packages/db/prisma/migrations/2026XXXX_add_onboarding_fields/migration.sql` (migration)

**Analog:** `packages/db/prisma/migrations/20260512000000_add_lesson_metadata/migration.sql`

**Full analog content** (the manual-ALTER-on-prod-before-rebuild pattern):
```sql
-- Add multi-purpose metadata JSONB column to Lesson.
-- ...comment block...
ALTER TABLE "Lesson" ADD COLUMN "metadata" JSONB;
```

**Pattern to copy:** one `migration.sql` with additive `ALTER TABLE ... ADD COLUMN` statements, a comment block stating purpose + "Nullable, backwards-compatible." All 5 columns nullable or `DEFAULT ARRAY[]` → no data loss:
```sql
ALTER TABLE "UserProfile" ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3);
ALTER TABLE "UserProfile" ADD COLUMN "marketplaces" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "UserProfile" ADD COLUMN "experienceLevel" TEXT;
ALTER TABLE "UserProfile" ADD COLUMN "goals" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "UserProfile" ADD COLUMN "goalText" TEXT;
```
> Apply to prod **before** rebuild. Run only from MAAL repo, never `--accept-data-loss`. See Shared Patterns → Prod Migration Discipline.

---

### `packages/api/src/routers/onboarding.ts` (tRPC router, request-response/CRUD)

**Analog:** `packages/api/src/routers/profile.ts` — same role (UserProfile read/write router).

**Imports pattern** (`profile.ts:1-5`):
```ts
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { ensureUserProfile } from '../utils/ensure-user-profile';
import { handleDatabaseError } from '../utils/db-errors';
```

**Query procedure pattern** — copy `profile.get` (`profile.ts:144-205`), structure for `onboarding.getState`:
```ts
get: protectedProcedure.query(async ({ ctx }) => {
  try {
    await ensureUserProfile(ctx.prisma, ctx.user);
    const profile = await ctx.prisma.userProfile.findUnique({
      where: { id: ctx.user.id },
      include: { skillProfile: true },
    });
    // ...
    return profile;
  } catch (error) {
    handleDatabaseError(error);
  }
}),
```
> For `getState` use `select: { onboardingCompletedAt, marketplaces, experienceLevel, goals, goalText }` instead of `include`.

**Mutation procedure pattern** — copy `profile.update` (`profile.ts:415-434`): zod `.input()`, `ensureUserProfile`, `userProfile.update` with hard `where: { id: ctx.user.id }`, try/catch + `handleDatabaseError`:
```ts
update: protectedProcedure
  .input(
    z.object({
      name: z.string().min(1).max(100).optional(),
      avatarUrl: z.string().url().optional().nullable(),
      phone: z.string().regex(/^\+[1-9]\d{9,14}$/, 'Некорректный номер телефона').optional(),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    try {
      await ensureUserProfile(ctx.prisma, ctx.user);
      const profile = await ctx.prisma.userProfile.update({
        where: { id: ctx.user.id },
        data: input,
      });
      return profile;
    } catch (error) {
      handleDatabaseError(error);
    }
  }),
```

**Whitelist-input pattern** — copy `markTourCompleted` (`profile.ts:438-439`) which uses `z.enum([...])` to constrain accepted strings:
```ts
markTourCompleted: protectedProcedure
  .input(z.object({ page: z.enum(['dashboard', 'learn', 'lesson']) }))
```
> For `onboarding.complete`: `z.array(z.enum(MARKETPLACES))`, `z.enum(EXPERIENCE).nullable().optional()`, `z.array(z.enum(GOALS))`, `z.string().trim().max(500).optional()`. Whitelist enums reject tampered keys (Security V5). In `.mutation`, set `data: { ...input, onboardingCompletedAt: new Date() }`.

---

### `packages/api/src/root.ts` (config)

**Analog:** self — the existing router registration list.

**Current pattern** (`root.ts:12,25`):
```ts
import { referralRouter } from './routers/referral';

export const appRouter = router({
  // ...
  referral: referralRouter,
});
```
**Add:** `import { onboardingRouter } from './routers/onboarding';` + `onboarding: onboardingRouter,` line.

---

### `packages/api/src/routers/__tests__/onboarding.test.ts` (test)

**Analog:** `packages/api/src/routers/__tests__/referral.test.ts`

**ctx stub + caller pattern** (`referral.test.ts:30-50`):
```ts
// protectedProcedure fires ctx.prisma.userProfile.findUnique (lastActiveAt debounce).
// Provide a minimal stub so the middleware doesn't crash.
const ctxPrismaStub = {
  userProfile: {
    findUnique: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue({}),
  },
};
const ctx = { user: { id: 'user-1' }, prisma: ctxPrismaStub as any };

function caller() {
  return referralRouter.createCaller(ctx as any);
}

beforeEach(() => {
  vi.clearAllMocks();
});
```
> For `onboarding.test.ts` add `upsert: vi.fn().mockResolvedValue({})` to the stub (`ensureUserProfile` calls upsert). Test cases: `complete` sets `onboardingCompletedAt` (Date) + persists `marketplaces`/`goals`; `getState` returns saved fields.

---

### `apps/web/src/app/welcome/layout.tsx` (SSR layout)

**Analog:** `apps/web/src/app/pricing/layout.tsx` (standalone-route-outside-`(main)` precedent) + `(main)/layout.tsx` auth block.

**Standalone layout precedent** — `pricing/layout.tsx` is a trivial top-level layout proving routes outside `(main)` get their own chrome.

**Auth-guard pattern to copy** (`(main)/layout.tsx:1-2,29-35`):
```ts
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
// ...
const supabase = await createClient();
const { data } = await supabase.auth.getUser();
const user = data?.user;
if (!user) {
  redirect('/login');
}
```
> `welcome/layout.tsx` is a Server Component: do the `getUser()` → `redirect('/login')` check (middleware does not protect `/welcome` — Pitfall 3), then render a fullscreen wrapper `<div className="flex min-h-screen items-center justify-center bg-mp-gray-50 px-4 py-12">`. No sidebar / no `Sidebar`/`MobileNav`/`UserNav` imports.

---

### `apps/web/src/app/welcome/page.tsx` (client wizard orchestrator)

**Analog:** no in-repo reusable wizard. Closest client-component + tRPC-mutation + `useRouter` pattern: `learn/[id]/page.tsx`.

**Client + trpc + router imports** (`learn/[id]/page.tsx:1-4,17,23`):
```ts
'use client';
import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { toast } from 'sonner';
```

**Mutation + navigate-on-success pattern** (build from RESEARCH Pattern 4 — locked):
```ts
const [step, setStep] = useState<1 | 2 | 3 | 'fork'>(1);
// ...accumulated answer state via useState...
const complete = trpc.onboarding.complete.useMutation({
  onError: () => toast.error('Не удалось сохранить ответы. Попробуйте ещё раз.'),
});
const finish = (dest: '/diagnostic' | '/learn') => {
  complete.mutate(
    { goals, goalText, marketplaces, experienceLevel },
    { onSuccess: () => router.push(dest) }, // navigate ONLY on success — Pitfall 4
  );
};
```
> Client-side `useState` stepper, single final mutation. `router.push` strictly inside `onSuccess` (avoids redirect-loop). Texts/tokens strictly per UI-SPEC Copywriting Contract.

---

### `apps/web/src/components/welcome/WizardStepper.tsx` (component)

**Analog:** `apps/web/src/components/diagnostic/ProgressBar.tsx`

**Full analog** — the progress-bar primitive to base the segmented stepper on:
```tsx
'use client';
import { cn } from '@/lib/utils';

export function ProgressBar({ current, total, className }: ProgressBarProps) {
  const percent = Math.round((current / total) * 100);
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex justify-between text-sm"> ... </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className="h-full bg-blue-600 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
```
> Reuse `h-2 rounded-full` track + `cn()`. Phase 56 wants **3 equal segments** (not a single bar). Use design-system tokens, not legacy `bg-blue-600`/`bg-gray-200`: active/done segment `bg-mp-blue-500`, future `bg-mp-gray-200`, labels `1. Цели · 2. Маркетплейсы · 3. Опыт` (UI-SPEC). Mobile: `hidden sm:flex` labels + "Шаг N из 3".

---

### `apps/web/src/components/welcome/StepIntent.tsx` / `StepMarketplaces.tsx` / `StepExperience.tsx` / `ForkScreen.tsx` (components)

**Analog:** `DiagnosticGateBanner.tsx` (Card + CTA Button composition) + shadcn `ui/` primitives. No closer in-repo step/chip component — these are net-new, driven by UI-SPEC.

**Card + Button composition pattern** (`DiagnosticGateBanner.tsx:1-9,24-28`):
```tsx
'use client';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
// ...
<Card className="shadow-mp-card border-mp-blue-200 ...">
  <CardContent className="...">
    <Link href="/diagnostic"><Button size="lg">Начать диагностику</Button></Link>
  </CardContent>
</Card>
```

**Primitives available** (`apps/web/src/components/ui/`): `button`, `card`, `badge`, `textarea`, `checkbox`, `dialog`, `skeleton`, `sonner`. No new shadcn blocks (UI-SPEC Registry Safety).

> Each step component: `'use client'`, props = current value + onChange, render selectable chips/cards. Selected state: `border-2 border-mp-blue-500 bg-mp-blue-50`, unselected: `border-mp-gray-200 bg-white`. `ForkScreen`: 2 equal-height `Card`s via `flex flex-col` + CTA `mt-auto` (Shared Pattern → Equal-Height Cards). All strings/tokens from UI-SPEC — Color, Typography, Copywriting Contract sections are the authority. Icons: `lucide-react`.

---

### `apps/web/src/app/(main)/layout.tsx` — guard branch (SSR layout, MODIFY)

**Analog:** self — the existing `pending_promo` redirect block (`(main)/layout.tsx:41-50`).

**Existing redirect-after-DB-query pattern to mirror** (`(main)/layout.tsx:41-50,53-56`):
```ts
const pendingPromo = user.user_metadata?.pending_promo;
if (typeof pendingPromo === 'string' && pendingPromo.length > 0) {
  const activeSub = await prisma.subscription.findFirst({
    where: { userId: user.id, status: { in: ['ACTIVE', 'PAST_DUE'] } },
    select: { id: true },
  });
  if (!activeSub) {
    redirect(`/pricing?promo=${encodeURIComponent(pendingPromo)}`);
  }
}

// Fetch UserProfile for UserNav (single source of truth per D-04, D-05)
const profile = await prisma.userProfile.findUnique({
  where: { id: user.id },
  select: { name: true, avatarUrl: true },
});
```
**Change:** add `onboardingCompletedAt: true` to the existing `select`, then after the fetch (before `return`):
```ts
if (profile && profile.onboardingCompletedAt === null) {
  redirect('/welcome');
}
```
> One extra `select` field, zero new round-trips. `redirect()` throws — place after all `await`, before `return`. Uses `prisma` from `@mpstats/db` (already imported line 5 — Pitfall 5).

---

### `apps/web/src/app/(main)/learn/[id]/page.tsx` — lines 641-645 (de-gating, MODIFY)

**Analog:** self — the surrounding ternary; the `lesson.locked → <LockOverlay/>` branch is the pattern that **stays**.

**Current code** (`learn/[id]/page.tsx:641-645`):
```tsx
{lesson.locked ? (
  <LockOverlay lessonTitle={lesson.title} />
) : hasDiagnostic === false ? (
  <DiagnosticGateBanner />        // ← blocking branch REMOVED
) : (
<div className="grid lg:grid-cols-3 gap-6">
```
**Change to** — drop the `hasDiagnostic` ternary branch; lesson always renders unless `lesson.locked`. Move the (now non-blocking) `DiagnosticGateBanner` above the player inside the left column:
```tsx
{lesson.locked ? (
  <LockOverlay lessonTitle={lesson.title} />
) : (
<div className="grid lg:grid-cols-3 gap-6">
  <div className="lg:col-span-2 space-y-4">
    {hasDiagnostic === false && <DiagnosticGateBanner />}
    <Card data-tour="lesson-video" ...>...</Card>
```
> `hasDiagnostic` comes from `trpc.diagnostic.hasCompletedDiagnostic.useQuery()` (`learn/[id]/page.tsx:302`) — procedure unchanged. `lesson.locked`/`LockOverlay` is the independent subscription gate — DO NOT touch (STATE `[20-02]`). `DiagnosticGateBanner` import already on line 11. Note `DiagnosticHint` (line 12) is a different existing component (Errors-section hints) — not affected.

---

### `apps/web/src/components/learning/DiagnosticGateBanner.tsx` (repurpose blocking → dismissible hint, MODIFY)

**Analog:** self — current blocking banner is the starting point; repurpose, do not delete (still imported in `learn/[id]/page.tsx:11`).

**Current blocking version** (`DiagnosticGateBanner.tsx`, full file, 32 lines):
```tsx
'use client';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function DiagnosticGateBanner() {
  return (
    <Card className="shadow-mp-card border-mp-blue-200 bg-gradient-to-br from-mp-blue-50 to-white">
      <CardContent className="py-12 text-center">   {/* py-12 = blocking full-bleed */}
        {/* 16x16 lock icon, inline SVG */}
        <h2 className="text-heading ...">Пройди диагностику, чтобы получить доступ</h2>
        <p ...>Диагностика определит твои сильные и слабые стороны ...</p>
        <Link href="/diagnostic"><Button size="lg">Начать диагностику</Button></Link>
      </CardContent>
    </Card>
  );
}
```
**Repurpose per UI-SPEC "Хинт-карточка диагностики на уроке":**
- Compact card: `border-l-4 border-mp-blue-500 bg-mp-blue-50`, padding `p-4` (NOT `py-12`).
- Layout `flex items-start gap-3`: `lucide Sparkles` icon (`text-mp-blue-600`) left, text center, close button right.
- Title `text-heading-sm`: «Пройди диагностику — соберём персональный трек». Subtext `text-body-sm text-mp-gray-600`. CTA `Button variant="link"` size sm «Пройти →».
- Close: `Button variant="ghost" size="icon"` with `lucide X`, `aria-label="Закрыть подсказку"`.
- Dismissal: `localStorage` flag `diagnosticHintDismissed=true`; component returns `null` when set. Needs `useState`+`useEffect` (read flag client-side). Replace inline SVG with `lucide-react` (UI-SPEC: new code uses lucide).

---

## Shared Patterns

### Prod Migration Discipline
**Source:** `CLAUDE.md` (3 levels) PROD DATABASE SAFETY + migration `20260512000000_add_lesson_metadata`
**Apply to:** schema.prisma change + migration.sql
- Run `prisma db push` / migration **only from the MAAL repo** (declares all 24+ tables).
- Verify `DATABASE_URL` points at the intended DB; prod ref = `saecuecevicwjkpmaoot`.
- **Never** `--accept-data-loss` against prod.
- Apply migration on prod **before** `git pull && docker compose build` (Pitfall 2 — Phase 28 recurring lesson).
- On VPS use `npx prisma@5.22.0` (global is 7.x — incompatible).
- After schema edit run `pnpm db:generate` locally + in deploy chain.

### tRPC protectedProcedure + error handling
**Source:** `packages/api/src/routers/profile.ts` (every procedure)
**Apply to:** `onboarding.ts` — both `getState` and `complete`
```ts
protectedProcedure.query/.mutation(async ({ ctx, input }) => {
  try {
    await ensureUserProfile(ctx.prisma, ctx.user);
    // ...ctx.prisma.userProfile.{findUnique|update} with where: { id: ctx.user.id }
  } catch (error) {
    handleDatabaseError(error);
  }
})
```
- `ensureUserProfile(ctx.prisma, ctx.user)` before any write (creates profile if missing).
- `handleDatabaseError(error)` in the catch — never a hand-rolled try/catch mapping.
- Hard `where: { id: ctx.user.id }` — userId from server session, never from input (Security V4).

### Input validation (zod whitelist)
**Source:** `profile.ts:438` (`markTourCompleted` — `z.enum`), `profile.ts:417-421` (`update` — typed `z.object`)
**Apply to:** `onboarding.complete` input schema
- `z.enum([...])` for `marketplaces` / `goals` / `experienceLevel` values (rejects tampered keys).
- `z.string().trim().max(500)` for `goalText` (XSS/DoS bound — Security V5).

### `@mpstats/db` import (never `@prisma/client`)
**Source:** `(main)/layout.tsx:5` (`import { prisma } from '@mpstats/db'`), `referral.test.ts:9` (`vi.mock('@mpstats/db/client', ...)`)
**Apply to:** layout guard (`@mpstats/db`), router (`@mpstats/db/client` types), test mock.
> Direct `@prisma/client` import in `apps/web` breaks vite resolve (Pitfall 5).

### Client component + sonner toast on mutation error
**Source:** `learn/[id]/page.tsx:23` + UI-SPEC States Contract
**Apply to:** `welcome/page.tsx`, repurposed `DiagnosticGateBanner.tsx`
- `import { toast } from 'sonner';` — `toast.error('...')` in mutation `onError`.
- Navigate (`router.push`) strictly in `onSuccess`.

### Equal-height cards
**Source:** STATE `[19-02]` — `CardFooter + mt-auto` pattern
**Apply to:** `ForkScreen.tsx` two fork cards
- `Card` + `flex flex-col`; CTA `Button` pinned with `mt-auto` so both cards align regardless of body length.

### Design tokens (MPSTATS, not raw Tailwind)
**Source:** UI-SPEC Color / Typography / Spacing sections (authoritative)
**Apply to:** all new `welcome/` components + repurposed banner
- Accent `mp-blue-500`; second accent `mp-green-500` (fork green card only).
- Selected: `border-2 border-mp-blue-500 bg-mp-blue-50`; unselected: `border-mp-gray-200 bg-white`.
- Icons: `lucide-react` (UI-SPEC — new code uses lucide, not inline SVG).
- All user-facing strings Russian, exact copy from UI-SPEC Copywriting Contract.

---

## No Analog Found

No file is fully without an analog. The four step components (`StepIntent`, `StepMarketplaces`, `StepExperience`, `ForkScreen`) and `welcome/page.tsx` are **partial-match only** — the repo has no reusable multi-step wizard / chip / option-card component. For these, the planner should:
- Reuse shadcn `ui/` primitives (`card`, `button`, `badge`, `textarea`, `checkbox`) for composition.
- Follow `DiagnosticGateBanner.tsx` for the Card+Button shape and `'use client'` convention.
- Treat **UI-SPEC.md** (Component Inventory, Color, Typography, Copywriting) as the authoritative spec for all visual/interaction detail.
- Note: `diagnostic/session/page.tsx` is a **server-driven** multi-step (state in DB) — explicitly NOT the pattern for this client-side wizard.

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `welcome/page.tsx` | client wizard orchestrator | event-driven | No in-repo client-side `useState` stepper; build from RESEARCH Pattern 4 |
| `components/welcome/Step*.tsx`, `ForkScreen.tsx` | components | event-driven | No chip / option-card / fork component exists; UI-SPEC-driven |

---

## Metadata

**Analog search scope:** `apps/web/src/app/`, `apps/web/src/components/`, `packages/api/src/routers/`, `packages/db/prisma/`
**Files scanned:** 12 read in full or targeted (layout.tsx, profile.ts, DiagnosticGateBanner.tsx, ProgressBar.tsx, learn/[id]/page.tsx ×3 ranges, root.ts, schema.prisma, add_lesson_metadata migration, middleware.ts, referral.test.ts, pricing/layout.tsx, profile/page.tsx)
**Pattern extraction date:** 2026-05-18
</content>
</invoke>
