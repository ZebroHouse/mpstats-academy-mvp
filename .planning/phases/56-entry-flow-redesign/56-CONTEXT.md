# Phase 56: Entry Flow Redesign — Context

**Gathered:** 2026-05-18
**Status:** Ready for planning
**Source:** PRD Express Path (docs/superpowers/specs/2026-05-18-entry-flow-redesign-design.md)

<domain>
## Phase Boundary

Replace the diagnostic-first entry experience with a comfortable, choice-driven onboarding. A one-time `/welcome` wizard (intent+goals → marketplaces → experience → fork) runs between registration and the product. The mandatory diagnostic gate is removed so lessons are reachable on subscription alone. Qualification data is collected and stored on `UserProfile`.

The phase delivers: the `/welcome` route + wizard UI, 5 new `UserProfile` fields + migration, an `onboarding` tRPC router, a `(main)`-layout guard, removal of the hard diagnostic gate on the lesson page, and qualification editing in `/profile`.
</domain>

<decisions>
## Implementation Decisions

All items below are locked decisions from the design spec.

### Flow & Routing
- New flow: Registration (DOI / Yandex OAuth) → `/welcome` wizard → fork → `/diagnostic` or `/learn`. Subsequent logins → `/dashboard` as today.
- `/welcome` is a **standalone route outside the `(main)` route group**, with a minimal fullscreen layout (no main sidebar/navigation).
- Wizard state is held **client-side**; a single `onboarding.complete` tRPC mutation persists everything at the end. Abandoning mid-wizard loses client state — wizard restarts on next login (no per-step server save).
- Guard lives in the **server-component layout of the `(main)` group**: authenticated user with `onboardingCompletedAt == null` → redirect to `/welcome`. Guard is in the layout, not edge-middleware (needs a DB query; Prisma in edge-middleware is unreliable). Because `/welcome` is outside `(main)`, no path exception is needed.
- `/auth/confirm` and `/auth/callback` keep redirecting to `/dashboard`; the `(main)` guard intercepts and routes to `/welcome` when needed.
- Existing ~200 users have `onboardingCompletedAt == null` → they see the wizard once on their next login.

### Wizard Screens
- **Step 1 — Intent + Goals.** Assistant greets the user by name. Question: "Зачем вы пришли в Академию?" — an optional free-text field plus 7 multi-select goal chips: Увеличить продажи · Снизить расходы на рекламу / настроить продвижение · Улучшить карточки товара · Разобраться в аналитике и нишах · Навести порядок в операциях и логистике · Финансы и юнит-экономика · Выйти на новый маркетплейс.
  - On submit: an **honest one-line reframe** ("Поняли — хотите …"). The reframe is a **simple client-side template** (echo of picked chips or typed text), **no LLM call** in this phase. The platform must NOT imitate solving the task.
- **Step 2 — Marketplaces.** "Выберите маркетплейсы, на которых работаете" — **multi-select**: Wildberries · Ozon · Яндекс Маркет · AliExpress · Мегамаркет · Свой интернет-магазин · Другое.
- **Step 3 — Experience.** Single-select: Только присматриваюсь / Новичок / Есть стабильные продажи / Опытный селлер.
- **Fork (final screen).** Two **equal** cards: 🟪 "Пройти диагностику" → `/diagnostic`; 🟩 "Перейти в обучение" → `/learn` (current catalog). Honest footer line: "В любой момент можно пройти диагностику или изменить путь в настройках профиля." Clicking either card → `onboarding.complete` mutation → navigation.
- Stepper shows 3 steps (step 1 = first). The fork is the finale, not numbered.

### Data Model
- 5 new fields on `UserProfile` (`packages/db/prisma/schema.prisma`): `onboardingCompletedAt DateTime?`, `marketplaces String[]`, `experienceLevel String?`, `goals String[]`, `goalText String?`.
- Values use stable string keys (e.g. `WB`, `OZON`, `OWN_SHOP`; `PROSPECTING`, `BEGINNER`, `STABLE`, `ADVANCED`; `SALES`, `ADS`, `CONTENT`, `ANALYTICS`, `OPERATIONS`, `FINANCE`, `NEW_MARKETPLACE`). Prisma enum vs `String[]` is a planning-stage choice — `String[]` mirrors the existing `toursCompleted` pattern.
- `onboardingCompletedAt == null` is the signal to show the wizard; set to `now()` when the fork is passed.
- Schema migration runs on prod **before** rebuild (recurring lesson — Phase 28).

### tRPC API
- New `onboarding` router in `packages/api/src/routers/`: `getState` (query — returns `onboardingCompletedAt` + saved qualification) and `complete` (mutation — accepts `{ marketplaces, experienceLevel, goals, goalText }`, saves to `UserProfile`, sets `onboardingCompletedAt = now()`).

### Diagnostic De-gating
- Remove the `hasDiagnostic === false → <DiagnosticGateBanner/>` branch in `apps/web/src/app/(main)/learn/[id]/page.tsx:641-645`. The lesson renders for everyone; only the subscription branch `lesson.locked → <LockOverlay/>` remains.
- Repurpose `DiagnosticGateBanner` from a blocking banner into a **non-blocking, dismissible hint card** above the player ("Пройди диагностику — соберём персональный трек"). Shown only when `hasCompletedDiagnostic === false`; after dismissal it does not return (flag in `localStorage`). The video is always available.
- Server procedure `learning.getLesson` already returns the lesson regardless — the gate is purely client-side; the fix is client-only.
- The `/learn` catalog's track-suggestion banner is already non-blocking — not required to change.

### Profile
- Qualification data is editable later on the `/profile` page (reuses the same value sets).

### Claude's Discretion
- Exact component file structure for the wizard and its step components.
- Whether qualification fields use Prisma enums or `String[]` (spec recommends `String[]` per `toursCompleted` precedent).
- Visual styling within the Academy design system; the prototype slides (ПРОТОТИП 03) are the visual reference.
- Test file organization (unit + E2E).
- The exact shape of the `localStorage` dismissal flag for the diagnostic hint.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design contract
- `docs/superpowers/specs/2026-05-18-entry-flow-redesign-design.md` — full design spec: flow, screens, data model, routing, de-gating, API, testing plan.

### Code to modify / extend
- `apps/web/src/app/(main)/learn/[id]/page.tsx` — lesson page; lines ~641-645 hold the hard diagnostic gate to remove.
- `apps/web/src/components/learning/DiagnosticGateBanner.tsx` — blocking banner to repurpose into a dismissible hint.
- `packages/db/prisma/schema.prisma` — `UserProfile` model; add 5 fields (existing `toursCompleted String[]` is the array-field precedent).
- `apps/web/src/middleware.ts` — current protected-routes list; understand auth routing before adding the layout guard.
- `apps/web/src/app/auth/confirm/route.ts` and `apps/web/src/app/auth/callback/route.ts` — post-auth redirects (both target `/dashboard`).
- `packages/api/src/routers/` — location for the new `onboarding` router; `diagnostic.ts` exposes `hasCompletedDiagnostic`.
- `apps/web/src/app/(main)/` — layout for the guard; `dashboard/`, `diagnostic/`, `learn/`, `profile/` routes.

### Project rules
- `MAAL/CLAUDE.md` — PROD DATABASE SAFETY rules (schema migration discipline), tech stack, deploy flow, gotchas (`@prisma/client` import, `@mpstats/db` re-exports).
</canonical_refs>

<specifics>
## Specific Ideas

- Goal chips on step 1 ARE the structured goals — there is no separate "цели" step (step 1 absorbs it). Wizard is 3 steps total.
- Marketplaces step is multi-select and explicitly includes "Свой интернет-магазин" (owner addition; not in the original prototype).
- The prototype's slide-12 "AI chat" framing is deliberately rejected — it implied an answer it never gave (bait-and-switch). Step 1 keeps the soft entry but is honest about being a setup step.
- Subscription gating (`lesson.locked` / `LockOverlay`) is a separate, independent gate from the diagnostic gate — it must stay intact.
</specifics>

<deferred>
## Deferred Ideas

- Redesign of the "Обучение" section / library / playbooks — separate next task (staging rollout).
- Variant 3 of step 1 — turn the intent screen into a real 1-turn AI assistant that answers with matched lessons/playbooks — deferred until catalog search is reliable. Recorded in memory `entry-flow-screen1-v3-future`.
- Dashboard counters / community block — that is НАПРАВЛЕНИЕ 06, a separate phase.
- Diagnostic as a lead-magnet outside the product perimeter — future.

</deferred>

---

*Phase: 56-entry-flow-redesign*
*Context gathered: 2026-05-18 via PRD Express Path*
