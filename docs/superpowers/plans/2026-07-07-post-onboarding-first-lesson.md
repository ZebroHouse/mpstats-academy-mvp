# Post-Onboarding First Lesson — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After the onboarding wizard, drop new users onto the storefront with a directive "Твой первый урок" hero (resolved from their goal×marketplace answers) and move the diagnostic to an after-value CTA — killing the two-choice fork that leaks 55% of onboarded users before they open any lesson.

**Architecture:** A pure resolver maps (goals, marketplaces) → a single lessonId via a methodologist-approved table. A new thin tRPC query `dashboard.getFirstLesson` returns the hero lesson only for cold users. The wizard loses its fork and hard-navigates to `/dashboard`. The lesson-completion modal gains an optional diagnostic invite gated on `hasCompletedDiagnostic`.

**Tech Stack:** Next.js 14 App Router, tRPC, Prisma, Vitest, Tailwind. All additive — no DB migration.

**Spec:** `docs/superpowers/specs/2026-07-07-post-onboarding-first-lesson-design.md`
**Mapping source:** `docs/first-lesson-shortlist-2026-07-07.md`
**Branch:** `feature/post-onboarding-first-lesson` (already created; spec + shortlist committed there).

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `packages/api/src/utils/first-lesson.ts` | Pure resolver + goal×MP→lessonId map + fallback const | Create |
| `packages/api/src/utils/__tests__/first-lesson.test.ts` | Resolver unit tests | Create |
| `packages/api/src/routers/dashboard.ts` | Add `getFirstLesson` procedure + `HeroLesson` type | Modify |
| `packages/api/src/routers/__tests__/dashboard.test.ts` | `getFirstLesson` procedure tests | Modify |
| `apps/web/src/components/dashboard/HeroFirstLesson.tsx` | Storefront hero card (cold users only) | Create |
| `apps/web/src/app/(main)/dashboard/page.tsx` | Render hero above shelves | Modify |
| `apps/web/src/app/welcome/page.tsx` | Remove fork; finish → `/dashboard` | Modify |
| `apps/web/src/components/welcome/ForkScreen.tsx` | Dead after fork removal | Delete |
| `apps/web/tests/unit/welcome-page.test.tsx` | Update fork-navigation tests | Modify |
| `apps/web/src/components/learning/LessonCompletionModal.tsx` | Optional diagnostic CTA | Modify |
| `apps/web/src/app/(main)/learn/[id]/page.tsx` | Pass `showDiagnosticCta` | Modify |

---

## Task 1: First-lesson resolver (pure)

**Files:**
- Create: `packages/api/src/utils/first-lesson.ts`
- Test: `packages/api/src/utils/__tests__/first-lesson.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/api/src/utils/__tests__/first-lesson.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveFirstLesson, FIRST_LESSON_FALLBACK_ID } from '../first-lesson';

describe('resolveFirstLesson', () => {
  it('ANALYTICS × WB → sales forecast', () => {
    expect(resolveFirstLesson(['ANALYTICS'], ['WB'])).toBe('skill_analytics_sales_forecast_001');
  });
  it('ANALYTICS × OZON-only → seller rating', () => {
    expect(resolveFirstLesson(['ANALYTICS'], ['OZON'])).toBe('05_ozon_m03_promotion_003');
  });
  it('both marketplaces → WB wins', () => {
    expect(resolveFirstLesson(['ADS'], ['WB', 'OZON'])).toBe('skill_marketing_seo_optimization_001');
  });
  it('ADS × OZON reuses the same SEO lesson', () => {
    expect(resolveFirstLesson(['ADS'], ['OZON'])).toBe('skill_marketing_seo_optimization_001');
  });
  it('SALES × OZON → Ozon SEO principles', () => {
    expect(resolveFirstLesson(['SALES'], ['OZON'])).toBe('05_ozon_m02_product_card_004');
  });
  it('multi-goal picks highest priority (ANALYTICS over OPERATIONS)', () => {
    expect(resolveFirstLesson(['OPERATIONS', 'ANALYTICS'], ['WB'])).toBe('skill_analytics_sales_forecast_001');
  });
  it('NEW_MARKETPLACE loses to any concrete goal', () => {
    expect(resolveFirstLesson(['NEW_MARKETPLACE', 'CONTENT'], ['WB'])).toBe('03_ai_m03_visual_009');
  });
  it('NEW_MARKETPLACE alone → beginner analytics intro', () => {
    expect(resolveFirstLesson(['NEW_MARKETPLACE'], ['WB'])).toBe('01_analytics_m01_start_002');
  });
  it('no goals / free-text only → ANALYTICS fallback (WB)', () => {
    expect(resolveFirstLesson([], ['WB'])).toBe(FIRST_LESSON_FALLBACK_ID);
  });
  it('no marketplace → defaults to WB', () => {
    expect(resolveFirstLesson(['FINANCE'], [])).toBe('01_analytics_m02_economics_001');
  });
  it('Stepanova case: all 7 goals + [OZON,WB] → analytics sales forecast (WB)', () => {
    expect(
      resolveFirstLesson(
        ['ADS', 'SALES', 'CONTENT', 'ANALYTICS', 'OPERATIONS', 'FINANCE', 'NEW_MARKETPLACE'],
        ['OZON', 'WB'],
      ),
    ).toBe('skill_analytics_sales_forecast_001');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mpstats/api test -- first-lesson`
Expected: FAIL — cannot resolve module `../first-lesson`.

- [ ] **Step 3: Write the resolver**

Create `packages/api/src/utils/first-lesson.ts`:

```ts
// Pure resolver: wizard answers (goals, marketplaces) → the single "first lesson" id.
// Mapping approved by methodologists 2026-07-07 (docs/first-lesson-shortlist-2026-07-07.md).
// No IO — unit-tested in isolation.

const FIRST_LESSON_MAP: Record<string, { WB: string; OZON: string }> = {
  ANALYTICS:       { WB: 'skill_analytics_sales_forecast_001',     OZON: '05_ozon_m03_promotion_003' },
  SALES:           { WB: 'skill_analytics_sales_forecast_001',     OZON: '05_ozon_m02_product_card_004' },
  ADS:             { WB: 'skill_marketing_seo_optimization_001',   OZON: 'skill_marketing_seo_optimization_001' },
  CONTENT:         { WB: '03_ai_m03_visual_009',                   OZON: '03_ai_m03_visual_009' },
  FINANCE:         { WB: '01_analytics_m02_economics_001',         OZON: '01_analytics_m02_economics_001' },
  OPERATIONS:      { WB: '01_analytics_m04_product_selection_007', OZON: '05_ozon_m03_promotion_003' },
  NEW_MARKETPLACE: { WB: '01_analytics_m01_start_002',             OZON: '05_ozon_m03_promotion_003' },
};

// Highest-priority goal present wins. Order = strength of the first-lesson hook
// (short / high-engagement first); NEW_MARKETPLACE is the fallback (only wins alone).
const GOAL_PRIORITY = ['ANALYTICS', 'SALES', 'ADS', 'CONTENT', 'FINANCE', 'OPERATIONS', 'NEW_MARKETPLACE'] as const;

// ANALYTICS×WB — universal default when no goal matches or the mapped lesson is gone.
export const FIRST_LESSON_FALLBACK_ID = 'skill_analytics_sales_forecast_001';

/**
 * Resolve the hero "first lesson" from wizard answers.
 * Marketplace: OZON only if OZON selected AND WB not selected; otherwise WB.
 * Goal: highest-priority goal present; ANALYTICS if none match.
 * Always returns a lessonId (existence/visibility is checked by the caller).
 */
export function resolveFirstLesson(goals: string[], marketplaces: string[]): string {
  const mp: 'WB' | 'OZON' =
    marketplaces.includes('OZON') && !marketplaces.includes('WB') ? 'OZON' : 'WB';
  const goal = GOAL_PRIORITY.find((g) => goals.includes(g)) ?? 'ANALYTICS';
  return FIRST_LESSON_MAP[goal][mp];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mpstats/api test -- first-lesson`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/utils/first-lesson.ts packages/api/src/utils/__tests__/first-lesson.test.ts
git commit -m "feat(onboarding): first-lesson resolver (goal×marketplace → lessonId)"
```

---

## Task 2: `dashboard.getFirstLesson` procedure

**Files:**
- Modify: `packages/api/src/routers/dashboard.ts`
- Test: `packages/api/src/routers/__tests__/dashboard.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/api/src/routers/__tests__/dashboard.test.ts` (after the existing `describe('dashboard.getStorefront', …)` block). The `makeCtx` helper already mocks `userProfile.findUnique` and `lessonProgress.count`; add a `lesson.findFirst` mock per test.

```ts
describe('dashboard.getFirstLesson', () => {
  const heroRow = { id: 'skill_analytics_sales_forecast_001', title: 'Планирование продаж на Wildberries', duration: 6, courseId: '01_analytics' };

  it('cold user, ANALYTICS×WB → returns mapped hero lesson', async () => {
    const ctx = makeCtx({ goals: ['ANALYTICS'], marketplaces: ['WB'], progressCount: 0 });
    ctx.prisma.lesson.findFirst = vi.fn().mockResolvedValue(heroRow);
    const res = await dashboardRouter.createCaller(ctx).getFirstLesson();
    expect(res).toEqual(heroRow);
    expect(ctx.prisma.lesson.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'skill_analytics_sales_forecast_001' }) }),
    );
  });

  it('returning user (progressCount > 0) → null (no hero)', async () => {
    const ctx = makeCtx({ goals: ['ANALYTICS'], marketplaces: ['WB'], progressCount: 3 });
    ctx.prisma.lesson.findFirst = vi.fn().mockResolvedValue(heroRow);
    const res = await dashboardRouter.createCaller(ctx).getFirstLesson();
    expect(res).toBeNull();
    expect(ctx.prisma.lesson.findFirst).not.toHaveBeenCalled();
  });

  it('mapped lesson hidden/missing → falls back to ANALYTICS×WB lesson', async () => {
    const ctx = makeCtx({ goals: ['OPERATIONS'], marketplaces: ['WB'], progressCount: 0 });
    const findFirst = vi.fn()
      .mockResolvedValueOnce(null)      // mapped OPERATIONS lesson gone
      .mockResolvedValueOnce(heroRow);  // fallback resolves
    ctx.prisma.lesson.findFirst = findFirst;
    const res = await dashboardRouter.createCaller(ctx).getFirstLesson();
    expect(res).toEqual(heroRow);
    expect(findFirst).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mpstats/api test -- dashboard`
Expected: FAIL — `getFirstLesson` is not a function on the caller.

- [ ] **Step 3: Add the type and procedure**

In `packages/api/src/routers/dashboard.ts`:

3a. Add the resolver import to the top import group (near line 8-12):

```ts
import { resolveFirstLesson, FIRST_LESSON_FALLBACK_ID } from '../utils/first-lesson';
```

3b. Add the `HeroLesson` type just below `AccessCtx` (after line 28):

```ts
interface HeroLesson {
  id: string;
  title: string;
  duration: number;
  courseId: string;
}
```

3c. Add the procedure inside `dashboardRouter`, immediately after the `getStorefront` procedure closes (after its `}),` — around line 178), before `getCollection`:

```ts
  // Cold-user hero: the single "first lesson" to land on right after onboarding.
  // Returns null for returning users (they see «Продолжить» instead) and when the
  // mapped + fallback lessons are both unavailable.
  getFirstLesson: protectedProcedure.query(async ({ ctx }): Promise<HeroLesson | null> => {
    try {
      const userId = ctx.user.id;
      const [profile, progressCount] = await Promise.all([
        ctx.prisma.userProfile.findUnique({ where: { id: userId }, select: { goals: true, marketplaces: true } }),
        ctx.prisma.lessonProgress.count({ where: { path: { userId }, status: { in: ['IN_PROGRESS', 'COMPLETED'] } } }),
      ]);
      if (progressCount > 0) return null;

      const goals = (profile?.goals ?? []) as string[];
      const marketplaces = (profile?.marketplaces ?? []) as string[];
      const lessonId = resolveFirstLesson(goals, marketplaces);

      const load = (id: string) =>
        ctx.prisma.lesson.findFirst({
          where: { id, isHidden: false, course: { isHidden: false } },
          select: { id: true, title: true, duration: true, courseId: true },
        });

      let lesson = await load(lessonId);
      if (!lesson && lessonId !== FIRST_LESSON_FALLBACK_ID) lesson = await load(FIRST_LESSON_FALLBACK_ID);
      if (!lesson) return null;

      return { id: lesson.id, title: lesson.title, duration: lesson.duration ?? 0, courseId: lesson.courseId };
    } catch (e) {
      throw handleDatabaseError(e);
    }
  }),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mpstats/api test -- dashboard`
Expected: PASS (existing getStorefront tests + 3 new getFirstLesson tests).

- [ ] **Step 5: Typecheck the API package**

Run: `pnpm --filter @mpstats/api typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/routers/dashboard.ts packages/api/src/routers/__tests__/dashboard.test.ts
git commit -m "feat(onboarding): dashboard.getFirstLesson hero query"
```

---

## Task 3: Remove wizard fork → route to /dashboard

**Files:**
- Modify: `apps/web/src/app/welcome/page.tsx`
- Delete: `apps/web/src/components/welcome/ForkScreen.tsx`
- Test: `apps/web/tests/unit/welcome-page.test.tsx`

- [ ] **Step 1: Update the fork-navigation tests first (they encode the new behaviour)**

In `apps/web/tests/unit/welcome-page.test.tsx`, the three navigation tests currently drive the wizard to the fork and click a fork card. Update them so the final step 3 button (now labelled **`Начать обучение`**) triggers completion + navigation. Apply these exact replacements:

- Replace every `fireEvent.click(getByRole('button', { name: 'Пройти диагностику' }));` and `fireEvent.click(getByRole('button', { name: 'Перейти в обучение' }));` with:
  ```ts
  fireEvent.click(getByRole('button', { name: 'Начать обучение' }));
  ```
- Replace `expect(assignMock).toHaveBeenCalledWith('/diagnostic');` with:
  ```ts
  expect(assignMock).toHaveBeenCalledWith('/dashboard');
  ```
  (both occurrences — the default-navigation test and the absolute-URL-rejection test)
- The `?next=` override test (asserts `assignMock` called with the partner path) keeps its `expect(...).toHaveBeenCalledWith('<partner path>')` — only its fork-card click changes to the `Начать обучение` click above.
- Update the file's header comment (lines ~5-14) to say the wizard now completes on step 3 and hard-navigates to `/dashboard` (no fork).

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter web test -- welcome-page`
Expected: FAIL — button `Начать обучение` not found / still navigates to `/diagnostic`.

- [ ] **Step 3: Rewire the wizard**

In `apps/web/src/app/welcome/page.tsx`:

3a. Remove the ForkScreen import (line 13): delete `import { ForkScreen } from '@/components/welcome/ForkScreen';`

3b. Change the Step type (line 17):
```ts
type Step = 1 | 2 | 3;
```

3c. Replace the `finish` function (lines 79-93) with:
```ts
  const finish = () => {
    // No fork any more — everyone lands on the storefront, where a cold user gets
    // the «Твой первый урок» hero. Partner ?next= still overrides. Hard navigation
    // (window.location.assign) is intentional — see comment at top.
    const finalDest = nextPath ?? '/dashboard';
    complete.mutate(
      {
        goals: goals as never,
        goalText,
        marketplaces: marketplaces as never,
        experienceLevel: experienceLevel as never,
      },
      { onSuccess: () => window.location.assign(finalDest) },
    );
  };
```

3d. Simplify `canAdvance` (lines 97-104) — drop the fork branch:
```ts
  const canAdvance =
    step === 1
      ? goals.length > 0 || goalText.trim().length > 0
      : step === 2
        ? marketplaces.length > 0
        : experienceLevel !== null;
```

3e. In the JSX, delete the `data-fork` machinery and the fork render block. Replace the `<Card …>` opening tag (line 116) with:
```tsx
    <Card className="w-full max-w-2xl">
```
Replace `{step !== 'fork' && <WizardStepper current={step} />}` (line 118) with:
```tsx
        <WizardStepper current={step} />
```
Delete the entire fork block (lines 145-151):
```tsx
        {step === 'fork' && (
          <ForkScreen
            userName={userName}
            isSaving={complete.isPending}
            onChoose={finish}
          />
        )}
```

3f. Replace the whole nav-buttons block (currently `{step !== 'fork' && ( … )}`, lines 153-181) with an always-rendered version where step 3's primary button finishes:
```tsx
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              className={step === 1 ? 'invisible' : ''}
              onClick={() => setStep((s) => (s - 1) as Step)}
            >
              ← Назад
            </Button>
            <Button
              variant="default"
              disabled={!canAdvance || complete.isPending}
              onClick={() => {
                if (step === 1) return advanceFromStep1();
                if (step === 2) return setStep(3);
                return finish();
              }}
            >
              {complete.isPending
                ? 'Сохраняем…'
                : step === 1
                  ? 'Продолжить'
                  : step === 2
                    ? 'Далее →'
                    : 'Начать обучение'}
            </Button>
          </div>
          <p className="text-center text-caption text-mp-gray-400">
            {canAdvance
              ? 'Ответы помогут персонализировать ваш опыт.'
              : 'Выберите хотя бы один вариант, чтобы продолжить.'}
          </p>
        </div>
```

- [ ] **Step 4: Delete the now-dead ForkScreen**

```bash
git rm apps/web/src/components/welcome/ForkScreen.tsx
```

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm --filter web test -- welcome-page`
Expected: PASS (navigation tests hit `/dashboard`, required-answer gating still green).
Run: `pnpm --filter web typecheck`
Expected: no errors (no dangling `ForkScreen` / `'fork'` references).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/welcome/page.tsx apps/web/tests/unit/welcome-page.test.tsx
git commit -m "feat(onboarding): remove wizard fork, complete to /dashboard"
```

---

## Task 4: Hero component on the storefront

**Files:**
- Create: `apps/web/src/components/dashboard/HeroFirstLesson.tsx`
- Modify: `apps/web/src/app/(main)/dashboard/page.tsx`

- [ ] **Step 1: Create the hero component**

Create `apps/web/src/components/dashboard/HeroFirstLesson.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { Play } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';

/**
 * Cold-user hero: one big directive card → the mapped first lesson.
 * Renders nothing when the query returns null (returning users / no lesson),
 * so it can sit unconditionally in the dashboard layout.
 */
export function HeroFirstLesson() {
  const { data: hero } = trpc.dashboard.getFirstLesson.useQuery();
  if (!hero) return null;

  return (
    <Link
      href={`/learn/${hero.id}`}
      data-tour="dashboard-first-lesson"
      className="group flex items-center justify-between gap-4 rounded-2xl p-5 sm:p-6 text-white transition-all hover:-translate-y-0.5 hover:shadow-lg animate-slide-up"
      style={{ backgroundColor: '#2C4FF8' }}
    >
      <div className="min-w-0">
        <p className="text-body-sm font-medium text-white/70">Твой первый урок</p>
        <p className="mt-1 truncate text-heading-sm font-bold sm:text-heading-xl">{hero.title}</p>
        {hero.duration > 0 && (
          <p className="mt-1 text-body-sm text-white/70">{hero.duration} мин · начни прямо сейчас</p>
        )}
      </div>
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/20 transition-transform group-hover:scale-105">
        <Play className="h-6 w-6 translate-x-0.5 fill-current" />
      </span>
    </Link>
  );
}
```

- [ ] **Step 2: Render it on the dashboard**

In `apps/web/src/app/(main)/dashboard/page.tsx`:

2a. Add the import near the other component imports (after line 10):
```tsx
import { HeroFirstLesson } from '@/components/dashboard/HeroFirstLesson';
```

2b. Render `<HeroFirstLesson />` between the greeting `DarkIsland` IIFE block and the entry-buttons grid — i.e. insert it immediately after the closing `})()}` of the greeting block (line 136) and before the `{/* Compact entry row … */}` comment (line 138):
```tsx
      <HeroFirstLesson />

```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/dashboard/HeroFirstLesson.tsx apps/web/src/app/\(main\)/dashboard/page.tsx
git commit -m "feat(onboarding): «Твой первый урок» hero on storefront"
```

---

## Task 5: After-value diagnostic CTA on lesson completion

**Files:**
- Modify: `apps/web/src/components/learning/LessonCompletionModal.tsx`
- Modify: `apps/web/src/app/(main)/learn/[id]/page.tsx`

- [ ] **Step 1: Add the optional CTA to the modal**

In `apps/web/src/components/learning/LessonCompletionModal.tsx`:

1a. Extend `Props` (lines 6-11):
```ts
interface Props {
  kind: LessonContextKind;
  label: string;
  returnHref: string;
  onStay: () => void;
  showDiagnosticCta?: boolean;
}
```

1b. Update the signature (line 35):
```ts
export function LessonCompletionModal({ kind, label, returnHref, onStay, showDiagnosticCta }: Props) {
```

1c. Inside the buttons stack (`<div className="mt-6 flex flex-col gap-2">`), insert the diagnostic invite as the FIRST secondary action — immediately after the primary `<Link>` (after line 72, the closing `</Link>` of the primary button, before the `{kind === 'plan' ? …}` block):
```tsx
          {showDiagnosticCta && (
            <Link
              href="/diagnostic"
              className="w-full rounded-xl bg-mp-green-50 px-4 py-3 font-medium text-mp-green-700 hover:bg-mp-green-100 transition-colors"
            >
              Собрать персональный план → диагностика (10 мин)
            </Link>
          )}
```

- [ ] **Step 2: Pass the flag from the lesson page**

In `apps/web/src/app/(main)/learn/[id]/page.tsx`:

2a. Add the diagnostic-status query near the other `trpc.*.useQuery()` calls in the component body (co-locate with existing queries around the `showCompletionModal` state, ~line 284):
```tsx
  const { data: hasDiagnostic } = trpc.diagnostic.hasCompletedDiagnostic.useQuery();
```

2b. Pass the prop on the modal (the `<LessonCompletionModal …>` at lines 1061-1066):
```tsx
        <LessonCompletionModal
          kind={lessonCtx.kind}
          label={lessonCtx.label}
          returnHref={lessonCtx.returnHref}
          onStay={() => setShowCompletionModal(false)}
          showDiagnosticCta={hasDiagnostic === false}
        />
```
(`hasDiagnostic === false` — strictly false, so the CTA stays hidden while the query is loading/undefined and for users who already completed a diagnostic.)

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/learning/LessonCompletionModal.tsx apps/web/src/app/\(main\)/learn/\[id\]/page.tsx
git commit -m "feat(onboarding): after-value diagnostic CTA on lesson completion"
```

---

## Task 6: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suites**

Run: `pnpm --filter @mpstats/api test`
Expected: all pass (incl. first-lesson + getFirstLesson).
Run: `pnpm --filter web test`
Expected: all pass (welcome-page updated; 1 known pre-existing `yandex-oauth` flake under load is acceptable).

- [ ] **Step 2: Typecheck the whole repo**

Run: `pnpm typecheck`
Expected: all packages green.

- [ ] **Step 3: Manual smoke of the resolver mapping (optional but recommended)**

Confirm each of the 8 mapped lessonIds exists and is visible on prod-Supabase (they were resolved from prod on 2026-07-07; re-verify only if a re-seed happened since). Spot-check one:
```bash
# expects a single visible lesson row for skill_analytics_sales_forecast_001
```
(Use the Supabase Mgmt API query endpoint; see `reference_supabase_mgmt.md`.)

- [ ] **Step 4: Final commit / branch status**

```bash
git status   # working tree clean, branch feature/post-onboarding-first-lesson ahead of master
git log --oneline master..HEAD
```

---

## Deploy (after review, outside this plan)

Per the standard runbook: staging (`docker compose -p maal-staging … up -d --build`, content-check the `getFirstLesson` marker in the bundle) → owner UAT of the new wizard→hero flow → merge `--no-ff` to master → prod `build --no-cache web` + recreate + smoke (`/` 200, `/api/health` 200) + verify hero renders for a fresh cold account. Additive, no migration. **Rollback:** `git revert -m 1 <merge>` + redeploy.

## Self-review notes

- **Spec coverage:** resolver+mapping (Task 1), hero query with returning-guard + fallback (Task 2), fork removal → /dashboard (Task 3), hero on storefront (Task 4), after-value diagnostic gated on `hasCompletedDiagnostic` (Task 5), diagnostic-button-on-storefront already exists (`dashboard/page.tsx:35`, verified — no task needed). Access via base-trial is covered by the already-shipped `/auth/callback` fix.
- **`intent.resolve` prefetch:** left intact in the wizard (`advanceFromStep1`) — it writes to sessionStorage for `/learn` AgentSearch and is harmless on the `/dashboard` path; not worth touching in this plan.
- **Type consistency:** `resolveFirstLesson` returns `string`; `getFirstLesson` returns `HeroLesson | null`; frontend infers via tRPC. Lesson route confirmed `/learn/{id}`.
