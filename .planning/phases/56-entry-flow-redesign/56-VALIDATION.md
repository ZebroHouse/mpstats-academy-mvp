---
phase: 56
slug: entry-flow-redesign
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-18
---

# Phase 56 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^2.1.3 (unit) + Playwright ^1.48.1 (E2E) |
| **Config file** | `vitest.config.ts` (per-package) · `playwright.config.ts` (apps/web) |
| **Quick run command** | `pnpm typecheck` |
| **Full suite command** | `pnpm test && pnpm test:e2e` |
| **Estimated runtime** | ~25s typecheck · ~40s unit · ~90s E2E |

---

## Sampling Rate

- **After every task commit:** Run the task's `<automated>` command (`pnpm typecheck` or filtered variant)
- **After every plan wave:** Run `pnpm test` (unit) — and `pnpm test:e2e -- phase-56-entry-flow` after Wave 3
- **Before `/gsd:verify-work`:** `pnpm test && pnpm test:e2e` must be green
- **Max feedback latency:** ~25 seconds (typecheck); ~90 seconds (E2E, once)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 56-01-01 | 01 | 1 | SC2, SC5 | T-56-01 | UserProfile gains 5 additive nullable/default fields; no existing column altered | typecheck | `pnpm typecheck` | ✅ | ⬜ pending |
| 56-01-02 | 01 | 1 | SC2, SC5 | T-56-01 / T-56-02 / T-56-03 | Hand-written additive `ALTER TABLE` applied to prod; no `prisma db push`, no `--accept-data-loss`; PITR backup taken first | manual | checkpoint:human-action — SQL `information_schema.columns` confirms 5 columns | ✅ | ⬜ pending |
| 56-02-01 | 02 | 2 | SC2 | T-56-04 / T-56-05 / T-56-06 / T-56-07 | `onboarding` router uses `protectedProcedure`, `where: { id: ctx.user.id }`, `z.enum` whitelist, `goalText` max 500 | typecheck | `pnpm --filter @mpstats/api typecheck` | ✅ | ⬜ pending |
| 56-02-02 | 02 | 2 | SC2 | T-56-04 / T-56-05 / T-56-06 | Unit tests assert enum rejection, own-profile-only write, payload-length cap | unit | `pnpm --filter @mpstats/api test` | ❌ created in-plan (02 Task 2) | ⬜ pending |
| 56-03-01 | 03 | 3 | SC1, SC5 | T-56-08 / T-56-09 | `/welcome` route + fullscreen layout + `(main)`-layout guard; unauthenticated → `/login`, no-onboarding → `/welcome` | typecheck | `pnpm --filter web typecheck` | ✅ | ⬜ pending |
| 56-03-02 | 03 | 3 | SC1, SC3 | T-56-11 | 5 wizard components; reframe rendered as React-escaped text, no `dangerouslySetInnerHTML` | typecheck | `pnpm --filter web typecheck` | ✅ | ⬜ pending |
| 56-03-03 | 03 | 3 | SC1, SC3, SC5 | T-56-10 | Wizard orchestrator; `router.push` only in `onSuccess` so failed `complete` keeps user on `/welcome` | unit+e2e | `pnpm --filter web typecheck && pnpm test:e2e -- phase-56-entry-flow` | ❌ created in-plan (03 Task 3) | ⬜ pending |
| 56-04-01 | 04 | 4 | SC4 | T-56-13 / T-56-15 | Only `hasDiagnostic === false` branch removed; `lesson.locked → LockOverlay` subscription gate untouched | typecheck | `pnpm --filter web typecheck` | ✅ | ⬜ pending |
| 56-04-02 | 04 | 4 | SC6 | T-56-12 / T-56-14 | `/profile` qualification editing via `onboarding.complete` (own profile only); `goalText` React-escaped | typecheck | `pnpm --filter web typecheck` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Requirement column maps to ROADMAP Success Criteria SC1–SC6 (phase has no formal REQ-IDs).*

---

## Wave 0 Requirements

No separate Wave 0 stub plan. The two new test files are created in the same task that implements the behavior they cover (tests-with-implementation pattern):

- [ ] `packages/api/src/routers/__tests__/onboarding.test.ts` — created in Plan 02 Task 2 (`56-02-02`)
- [ ] `apps/web/tests/e2e/phase-56-entry-flow.spec.ts` — created in Plan 03 Task 3 (`56-03-03`)

Existing Vitest + Playwright infrastructure covers framework needs — no install required.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Prod schema migration applied | SC2, SC5 | Runs against the LIVE production Supabase DB — must be human-run with a PITR backup first (PROD DATABASE SAFETY, MAAL/CLAUDE.md) | Take Supabase PITR backup → apply `ALTER TABLE "UserProfile" ADD COLUMN ...` migration SQL via Supabase SQL editor → insert matching `_prisma_migrations` row → verify with `SELECT column_name FROM information_schema.columns WHERE table_name='UserProfile'` (5 new columns present) → migration applied BEFORE docker rebuild |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or are a structured `checkpoint:human-action` (1 task: prod migration)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (test files created in-plan; honestly recorded — `wave_0_complete: false`)
- [x] No watch-mode flags
- [x] Feedback latency < 90s (typecheck ~25s; E2E once ~90s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-18
