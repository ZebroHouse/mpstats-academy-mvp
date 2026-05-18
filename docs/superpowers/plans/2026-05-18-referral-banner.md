# Referral Promo Banner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A dismissible top-of-page banner in `(main)` that promotes the referral program and links to `/profile/referral`.

**Architecture:** A pure client component (`ReferralBanner`) — no server data. Visibility is decided client-side from `usePathname()` and a `localStorage` dismissal timestamp. Rendered in `(main)/layout.tsx` above the sticky `<header>`.

**Tech Stack:** Next.js 14 App Router, React client component, Tailwind, Vitest + @testing-library/react, lucide-react.

**Spec:** `docs/superpowers/specs/2026-05-18-referral-banner-design.md`

**Branch:** `feature/referral-banner` (already checked out — verify with `git branch --show-current`).

---

## File Structure

| File | Responsibility |
|------|----------------|
| `apps/web/src/components/referral/ReferralBanner.tsx` | NEW — the client banner component |
| `apps/web/tests/unit/ReferralBanner.test.tsx` | NEW — unit tests for visibility + dismissal |
| `apps/web/src/app/(main)/layout.tsx` | MODIFY — render `<ReferralBanner />` above `<header>` |

---

### Task 1: ReferralBanner component (TDD)

**Files:**
- Create: `apps/web/src/components/referral/ReferralBanner.tsx`
- Test: `apps/web/tests/unit/ReferralBanner.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/tests/unit/ReferralBanner.test.tsx` with this exact content:

```tsx
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';

const mockPathname = vi.fn(() => '/learn');
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
}));

import { ReferralBanner } from '@/components/referral/ReferralBanner';

const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  mockPathname.mockReturnValue('/learn');
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('ReferralBanner', () => {
  it('renders the banner on a normal (main) page with empty localStorage', () => {
    const { getByText } = render(<ReferralBanner />);
    expect(getByText(/Приведи друга/)).toBeDefined();
    expect(getByText('Пригласить друга')).toBeDefined();
  });

  it('renders nothing on /profile/referral', () => {
    mockPathname.mockReturnValue('/profile/referral');
    const { container } = render(<ReferralBanner />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when dismissed less than 14 days ago', () => {
    localStorage.setItem('referralBannerDismissedAt', String(Date.now() - 5 * DAY));
    const { container } = render(<ReferralBanner />);
    expect(container.innerHTML).toBe('');
  });

  it('renders the banner again when the dismissal is older than 14 days', () => {
    localStorage.setItem('referralBannerDismissedAt', String(Date.now() - 15 * DAY));
    const { getByText } = render(<ReferralBanner />);
    expect(getByText(/Приведи друга/)).toBeDefined();
  });

  it('hides the banner and stores a timestamp when × is clicked', () => {
    const { getByLabelText, container } = render(<ReferralBanner />);
    fireEvent.click(getByLabelText('Закрыть'));
    expect(container.innerHTML).toBe('');
    const stored = localStorage.getItem('referralBannerDismissedAt');
    expect(stored).not.toBeNull();
    expect(Number(stored)).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @mpstats/web test -- ReferralBanner`
Expected: FAIL — `Failed to resolve import "@/components/referral/ReferralBanner"` (the component does not exist yet).

- [ ] **Step 3: Write the component**

Create `apps/web/src/components/referral/ReferralBanner.tsx` with this exact content:

```tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Gift, X } from 'lucide-react';

/**
 * In-product promo banner for the referral program (CPO plan ПРОТОТИП 02).
 * Shown to every authenticated (main) user, hidden on /profile/referral,
 * and re-shown 14 days after the user dismisses it.
 */
const DISMISS_KEY = 'referralBannerDismissedAt';
const DISMISS_DURATION_MS = 14 * 24 * 60 * 60 * 1000;

export function ReferralBanner() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // localStorage is unavailable during SSR — read it after mount to avoid a
  // hydration mismatch and a flash of a banner that should be hidden.
  useEffect(() => {
    setMounted(true);
    const raw = localStorage.getItem(DISMISS_KEY);
    if (raw) {
      const ts = Number(raw);
      if (Number.isFinite(ts) && Date.now() - ts < DISMISS_DURATION_MS) {
        setDismissed(true);
      }
    }
  }, []);

  if (!mounted) return null;
  if (pathname === '/profile/referral') return null;
  if (dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
  };

  return (
    <div
      role="region"
      aria-label="Реферальная программа"
      className="flex items-center gap-3 bg-gradient-to-r from-mp-blue-600 to-indigo-600 px-4 py-3 text-white"
    >
      <Gift className="hidden size-8 shrink-0 sm:block" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-tight">
          Приведи друга — получи 14 дней доступа к платформе бесплатно!
        </p>
        <p className="hidden text-xs text-white/80 sm:block">
          Больше друзей — больше пользы для бизнеса и команды.
        </p>
      </div>
      <Link
        href="/profile/referral"
        className="shrink-0 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-mp-blue-700 transition-colors hover:bg-mp-blue-50"
      >
        Пригласить друга
      </Link>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Закрыть"
        className="shrink-0 rounded-md p-1 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
      >
        <X className="size-5" />
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @mpstats/web test -- ReferralBanner`
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @mpstats/web typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/referral/ReferralBanner.tsx apps/web/tests/unit/ReferralBanner.test.tsx
git commit -m "feat(referral-banner): add dismissible ReferralBanner component"
```

---

### Task 2: Render the banner in the `(main)` layout

**Files:**
- Modify: `apps/web/src/app/(main)/layout.tsx`

- [ ] **Step 1: Add the import**

In `apps/web/src/app/(main)/layout.tsx`, after the existing import line
`import { NotificationBell } from '@/components/notifications/NotificationBell';`
add:

```tsx
import { ReferralBanner } from '@/components/referral/ReferralBanner';
```

- [ ] **Step 2: Render the banner above the header**

In the same file, find this block:

```tsx
        <div className="md:ml-64 flex flex-col min-h-screen">
          {/* Header */}
          <header className="h-16 border-b border-mp-gray-200 bg-white/95 backdrop-blur-sm sticky top-0 z-40">
```

Replace it with (insert `<ReferralBanner />` as the first child of the div, before the header):

```tsx
        <div className="md:ml-64 flex flex-col min-h-screen">
          {/* Referral promo banner — above the sticky header, scrolls away */}
          <ReferralBanner />
          {/* Header */}
          <header className="h-16 border-b border-mp-gray-200 bg-white/95 backdrop-blur-sm sticky top-0 z-40">
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @mpstats/web typecheck`
Expected: PASS.

- [ ] **Step 4: Run the web test suite for regressions**

Run: `pnpm --filter @mpstats/web test`
Expected: PASS — full web suite green, including the 5 new `ReferralBanner` tests.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(main)/layout.tsx"
git commit -m "feat(referral-banner): render ReferralBanner in the (main) layout"
```

---

## Self-Review

- **Spec coverage:** component with mounted-guard + pathname + 14-day localStorage logic (Task 1 Step 3) ✓; visual per slide — gradient, gift icon, headline + subtext, white CTA → `/profile/referral`, `×` (Task 1 Step 3) ✓; integration above `<header>` in `(main)` layout (Task 2) ✓; 5 unit tests from the spec's Testing section (Task 1 Step 1) ✓.
- **Placeholder scan:** none — every step has complete code or an exact command.
- **Type consistency:** `DISMISS_KEY` constant `'referralBannerDismissedAt'` matches the literal string the tests seed/read; component export name `ReferralBanner` matches the test import and the layout import.
- **Out-of-scope honored:** no referral-logic changes, no analytics events, no i1/i2 flag coupling.
