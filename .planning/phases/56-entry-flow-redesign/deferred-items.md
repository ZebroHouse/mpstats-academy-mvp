# Phase 56 — Deferred Items

## E2E auth credentials unavailable in sandbox (out of scope, pre-existing)

`pnpm test:e2e` login-based scenarios cannot run in this execution sandbox:
Supabase auth rejects `tester@mpstats.academy` / `TestUser2024` with
`invalid_credentials` (HTTP 400). Confirmed pre-existing — `diagnostic-flow.spec.ts`
(unchanged this phase) fails identically.

- `phase-56-entry-flow.spec.ts` scenario 3 ("wizard does not reappear") needs a
  real authenticated session.
- Scenarios 1 & 2 (new-user wizard) are env-gated on `TEST_NEW_USER_EMAIL` /
  `TEST_NEW_USER_PASSWORD` and skip when not set.

Action: run `pnpm test:e2e -- phase-56-entry-flow` in an environment with a valid
Supabase test user (CI or staging) before the phase verifier gate. Typecheck is
green; the spec file itself is syntactically valid (Playwright collected all 3
tests, no parse/compile error).
