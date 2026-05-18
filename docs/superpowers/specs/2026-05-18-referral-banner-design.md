# Referral Promo Banner — Design

**Date:** 2026-05-18
**Status:** Approved
**Branch:** `feature/referral-banner` (off `master`)
**Source:** CPO plan (Влад Токарев), «План доработки платформы» — ПРОТОТИП 02, slide 10.

## Problem

The referral program (Phase 53A) is live — `/profile/referral` lets a user grab
their referral link, and referred friends get trial days. But nothing on the
platform *promotes* it: a logged-in user has no in-product nudge to invite
friends. The CPO prototype proposes a dismissible top-of-page banner.

## Goal

A dismissible promo banner across the top of every authenticated `(main)` page
that invites the user to share their referral link, linking to the existing
`/profile/referral` page.

## Decisions

1. **Audience: all logged-in users.** No subscription check — anyone inside
   `(main)` (which is already auth-gated) sees it.
2. **Hidden on `/profile/referral`.** Promoting the referral page *on* the
   referral page is pointless.
3. **Dismissal re-shows after 14 days.** The `×` button hides the banner; it
   reappears 14 days later. Long enough not to nag, short enough to re-catch a
   reflexive dismiss.
4. **Copy is hardcoded, including "14 дней".** The owner monitors i1 referral
   dynamics until 2026-05-31 and will move the manual i2 release if needed, so
   the "14 дней" figure stays valid for the banner's lifetime. No coupling to
   the `referral_pay_gated` flag.

## Architecture

The banner is a **pure client component** — no server data is required. It
renders inside `(main)/layout.tsx` above the existing `<header>`. The `(main)`
layout already guarantees the user is authenticated (it `redirect('/login')`s
otherwise), so the banner needs no auth/subscription props.

All visibility state is client-side:
- current path — `usePathname()`
- dismissal — `localStorage`

## Component

### `apps/web/src/components/referral/ReferralBanner.tsx` (new, client component)

`'use client'`. Renders the promo strip, or `null` when it should be hidden.

**Visibility — renders `null` if ANY is true:**
- Not yet mounted (hydration guard — see below).
- `usePathname() === '/profile/referral'`.
- `localStorage` key `referralBannerDismissedAt` holds a timestamp newer than
  14 days ago.

**Hydration guard:** `localStorage` is unavailable during SSR. The component
starts with a `mounted` state of `false`, flips it to `true` in a `useEffect`,
and renders `null` until then. This avoids a server/client markup mismatch and
the flash of a banner that should be hidden. (Same pattern as the existing
`StagingBanner` / `DiagnosticGateBanner`.)

**Dismissal:** the `×` button writes `Date.now()` (as a string) to
`localStorage['referralBannerDismissedAt']` and sets local state so the banner
disappears immediately without a reload.

**Constant:** `DISMISS_DURATION_MS = 14 * 24 * 60 * 60 * 1000`.

### Visual (from slide 10)

Full-width horizontal strip, blue→indigo gradient background, white text:
- Left: a gift icon (`lucide-react` `Gift`).
- Headline (bold, white): «Приведи друга — получи 14 дней доступа к платформе бесплатно!»
- Subtext (smaller, white at lower opacity): «Больше друзей — больше пользы для бизнеса и команды.»
- A white CTA button «Пригласить друга» — a Next.js `<Link href="/profile/referral">`.
- Far right: a `×` icon button (`lucide-react` `X`), accessible label «Закрыть».

Uses the project design tokens (`mp-blue-*`) and existing `Button` component.
Responsive: on narrow screens the subtext may wrap or hide; the headline and
CTA stay visible. Exact Tailwind classes are specified in the implementation plan.

### Integration — `apps/web/src/app/(main)/layout.tsx`

Render `<ReferralBanner />` as the first child inside the
`<div className="md:ml-64 flex flex-col min-h-screen">`, immediately **before**
the `<header>` element. The header is `sticky top-0`; the banner sits above it
in normal flow and scrolls away with the page.

## Data Flow

```
(main)/layout.tsx (server, auth-gated)
  └─ <ReferralBanner />  (client)
       ├─ usePathname()                    → hide on /profile/referral
       ├─ localStorage.referralBannerDismissedAt → hide if < 14d old
       └─ × click → localStorage.referralBannerDismissedAt = Date.now() → hide
       └─ CTA → <Link href="/profile/referral">
```

## Testing

Unit tests in `apps/web/tests/unit/ReferralBanner.test.tsx` (Vitest +
@testing-library/react — precedent: `tests/unit/StagingBanner.test.tsx`):

1. Renders the banner (headline + CTA) for a normal `(main)` path when
   `localStorage` is empty.
2. Renders `null` when `usePathname()` returns `/profile/referral`.
3. Renders `null` when `referralBannerDismissedAt` is a timestamp < 14 days old.
4. Renders the banner when `referralBannerDismissedAt` is > 14 days old.
5. Clicking `×` writes a timestamp to `localStorage` and hides the banner.

`usePathname` is mocked per test; `localStorage` is seeded/cleared per test.

## Out of Scope

- Changing the referral program logic, rewards, or the `/profile/referral` page.
- A/B testing or analytics events for banner impressions/clicks (could be a
  later follow-up).
- Coupling banner copy to the `referral_pay_gated` (i1/i2) flag — decision 4.
- Showing the banner outside `(main)` (marketing pages, `/welcome`, auth pages).
