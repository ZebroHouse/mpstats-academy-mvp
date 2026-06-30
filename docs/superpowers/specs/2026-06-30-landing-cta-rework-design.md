# Landing CTA rework — design

**Date:** 2026-06-30
**Status:** approved (owner), implementing
**Branch:** `worktree-landing-cta-rework`

## Problem

On the marketing landing (`/`):
1. The hero "Пройти диагностику" button is an anchor to `#cta` (the footer CTA
   section) — it just scrolls to another identical button instead of doing
   anything. Same for the mid-page CTA and the StickyCTA.
2. The footer CTA button is hardcoded `/diagnostic` (auth-gated → bare login for
   guests).
3. The floating StickyCTA never hides — it scrolls under the footer and duplicates
   the footer CTA section's message ("Начните с бесплатной AI-диагностики").
4. The header username links to `/profile`; for an authed visitor on marketing
   pages "click my name" should mean "enter the product", not open the profile.

## Goal

Re-frame the landing around a trust-first primary CTA ("Попробовать бесплатно",
leaning on the new 3-day no-card trial) with the diagnostic as a secondary,
story-positioned CTA. Make every CTA actually route somewhere, auth-aware, and fix
the sticky bar.

## CTA model

Two CTA types, derived from auth state (the landing is already a client component):

| Surface | Guest | Authed |
|---|---|---|
| **Primary** — hero, footer CTA (section 9) button, StickyCTA button | «Попробовать бесплатно» → `/register` | «Перейти в обучение» → `/dashboard` |
| **Diagnostic** — mid CTA (section «Начните с бесплатной диагностики», before pricing) | «Пройти диагностику» → `/skill-test` | «Пройти диагностику» → `/diagnostic` |
| **Header button** (`V8Header`) | «Попробовать бесплатно» → `/register` | «Пройти диагностику» → `/diagnostic` (unchanged) |
| **Header username** (`V8Header`) | — | → `/dashboard` (was `/profile`) |

Copy decisions (owner): change only the button labels — section headings stay
("Начните с бесплатной AI-диагностики" etc.). No "3 дня / без карты" details — just
"бесплатно". Profile stays reachable from inside the product (the `(main)` header).

## Shared helper

`apps/web/src/lib/marketing-cta.ts`:

```
getMarketingCta(isAuthed: boolean): {
  primary:    { label: string; href: string };
  diagnostic: { label: string; href: string };
}
```

Used by both the landing page (primary in hero/footer/sticky, diagnostic in mid)
and `V8Header` (so the guest/authed branch lives in one tested place). `isAuthed`
is read client-side (the existing `createClient().auth.getUser()` pattern, as in
`/skill-test`). Default render before auth resolves: treat as guest (the marketing
default), then update — no flash to a product route for guests.

## StickyCTA fix

`apps/web/src/components/v8/StickyCTA.tsx`:
- Keep the scroll-in (`scrollY > showAfter`).
- Add `hideWhenId?: string`: observe that element with IntersectionObserver; when
  it intersects the viewport, force the bar hidden. The landing passes the footer
  CTA section's id (`cta`) so the bar disappears exactly when the final, same-
  message block is on screen — no overlap with the footer, no duplicate.
- Visibility = `scrolledPast && !finalSectionVisible`. Extract this to a pure
  predicate `computeStickyVisible(scrolledPast, finalVisible)` for unit testing.

## Landing wiring (`app/page.tsx`)

- Add `isAuthed` state + `const cta = getMarketingCta(isAuthed)`.
- Hero primary button: `#cta` → `cta.primary` (label + href). Keep the secondary
  "Посмотреть тарифы" anchor.
- Mid CTA button: `#cta` → `cta.diagnostic`.
- Footer CTA (section 9) button: `/diagnostic` → `cta.primary` (heading unchanged).
- StickyCTA: button → `cta.primary`; pass `hideWhenId="cta"`. Title/subtitle mirror
  the footer CTA (already close) — unchanged.

## Testing

- Unit `marketing-cta.test.ts`: guest vs authed → correct labels + hrefs for both
  primary and diagnostic.
- Unit `sticky-visible.test.ts`: `computeStickyVisible` truth table.
- Build-gate on staging + visual check (sticky hides at the footer CTA; CTAs route
  correctly for guest and authed). No migrations — visual/behaviour only.

## Rollout

One PR, staging build-gate → merge → prod `build --no-cache web`. Parallel storefront
feature already merged (`4bc08b4`); this touches `app/page.tsx`, `V8Header`,
`StickyCTA`, new lib — no overlap with the storefront `/dashboard` work.
