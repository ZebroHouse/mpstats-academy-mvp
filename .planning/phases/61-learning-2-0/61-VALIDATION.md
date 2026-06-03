---
phase: 61
slug: learning-2-0
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-03
---

# Phase 61 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `61-RESEARCH.md` § Validation Architecture + § Security Domain.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (unit, api + web), Playwright (e2e) |
| **Config file** | existing — `pnpm test`, `pnpm test:e2e` (see CLAUDE.md Commands) |
| **Quick run command** | `pnpm test <module>` (Vitest, file-scoped) |
| **Full suite command** | `pnpm test && pnpm typecheck` |
| **Estimated runtime** | ~60–120 seconds (api 123 + web 205 baseline at Phase 59 v2) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test <affected module>`
- **After every plan wave:** Run `pnpm test && pnpm typecheck` (full)
- **Before `/gsd:verify-work`:** Full suite green + staging QA (`--no-cache` rebuild + bundle content-check) BEFORE merge to master
- **Max feedback latency:** ~120 seconds

---

## Per-Task Verification Map

> Wave 0 stubs created before implementation; rows filled by planner per plan.

| Behavior | Wave | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|----------|------|------------|-----------------|-----------|-------------------|-------------|--------|
| `favorite.{add,remove,list,isFavorited}` CRUD | D | T-IDOR-fav | Always scopes by `ctx.user.id`, never from input | unit | `pnpm test favorite` | ❌ W0 (new router) | ⬜ pending |
| Idempotent data-migration track→favorites (re-run, no dupes) | D | — | `@@unique([userId,itemType,itemId])` enforced | unit | `pnpm test migrate-track-to-favorites` | ❌ W0 | ⬜ pending |
| `LessonProgress` untouched after migration | D | — | Row count snapshot before/after equal | unit | `pnpm test migrate-track-to-favorites` | ❌ W0 | ⬜ pending |
| `material.listForUser` ACL + `isHidden` filter + type filter | C | T-info-hidden | `isHidden:false` (+ `course.isHidden:false`); download ACL `getSignedUrl` unweakened | unit | `pnpm test material` | ⚠️ extend existing | ⬜ pending |
| `AgentSearch` scope routing (solutions vs library) | B | — | N/A | unit | `pnpm test AgentSearch` | ❌ W0 | ⬜ pending |
| Redirect `/learn/track`→`/learn/plan`, `/learn`→default (server redirect) | A | — | N/A | e2e | `pnpm test:e2e learn-redirect` | ❌ W0 | ⬜ pending |
| Onboarding tour anchors not broken under new structure | A/E | — | N/A | manual + e2e | UAT-style | ❌ W0 (manual) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/api/src/routers/__tests__/favorite.test.ts` — CRUD + isFavorited batch + IDOR scope
- [ ] `scripts/__tests__/migrate-track-to-favorites.test.ts` — idempotency + `LessonProgress` untouched
- [ ] `apps/web/.../AgentSearch.test.tsx` — scope routing (solutions→intent.resolve, library→ai.searchLessons)
- [ ] e2e `learn-redirect` — `/learn` default + `/learn/track`→`/learn/plan`
- [ ] extend existing `material` test — `listForUser` (isHidden + type filter + standalone inclusion)

---

## Manual-Only Verifications

| Behavior | Why Manual | Test Instructions |
|----------|------------|-------------------|
| Submenu «Обучение» active-state + MobileNav UX | Visual/interaction (4 sub-items, A3 open question) | Click each sub-item; confirm `pathname.startsWith` active highlight; mobile nav reachable |
| Hero search + dashboard 3-entry layout | Visual fidelity vs slides 6/17 + ui-brand | Staging visual QA per UI-SPEC contract |
| Standalone material download (A1) | Depends on owner ACL decision | If externalUrl-only: confirm storagePath-standalone is not surfaced for download |

---

## Validation Sign-Off

- [ ] All implementation tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags in commands
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter (planner sets after task map is complete)

**Approval:** pending
