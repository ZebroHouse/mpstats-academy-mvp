---
phase: 58-diagnostic-on-jobs
plan: 02
status: partial — Task 1 complete, Task 2 deferred per owner agreement
---

# 58-02 Summary — Backfill of UserProfile.marketplaces

## Task 1 — Author SQL file + README (✅ complete)

- **Files committed:**
  - `scripts/migrations/2026-05-26-collapse-marketplaces.sql` — D-14 verbatim UPDATE (idempotent, INTERSECT-based CASE) with header comment block (phase, D-14 ref, idempotency note, pre-flight COUNT, execution order) and post-execution verification queries.
  - `scripts/migrations/README.md` — new directory README documenting execution surface (Supabase Management API + Dashboard), pre-flight checklist (PITR backup, before/after counts), conventions, file index.
- **Acceptance criteria** (all green):
  - File present ✓
  - `UPDATE "UserProfile"` ≥ 1 (1) ✓
  - `INTERSECT` ≥ 2 (2 — one per CASE branch) ✓
  - `ARRAY['WB','OZON']` literal present ✓
  - Header contains `D-14`, `idempotent`, `Phase 58` ✓
  - Pre-flight check query (`marketplaces && ARRAY['YANDEX'…]`) present as comment ✓
- **Commit:** (filled at commit time on `phase-58-diagnostic-on-jobs` branch)

## Task 2 — Execute backfill against MAAL Supabase (⏸ DEFERRED)

**Per owner agreement (2026-05-26):** Phase 58 ships to staging only; prod execution (which is the only execution surface — MAAL has a single shared Supabase project) deferred until Phase 59 (marketplace-awareness split) is ready for a joint Phase 58/59 prod-cut window.

The SQL is safe to apply at any time (idempotent, PITR-recoverable, UPDATE-only). When the joint window opens, operator runs the 7-step procedure in 58-02-PLAN.md Task 2 `<how-to-verify>`:
1. Verify PITR backup present
2. Pre-flight COUNT (record "before")
3. Execute via Management API or SQL Editor
4. Re-run COUNT — expect 0
5. Spot-check one user
6. Confirm 58-01 z.enum deploy can proceed

**Resume signal:** owner types `backfill executed, post-count = 0` to mark Task 2 complete and unblock Plan 58-01's prod deploy.

## Notes

- Plan 58-01 `depends_on: ["58-02"]` is interpreted as *staging-deploy-only* during the deferred window — staging app and prod app share the same DB (`saecuecevicwjkpmaoot`), so applying the new restrictive zod whitelist only affects users on the staging app URL. Real prod users on `platform.mpstats.academy` continue to hit the permissive (pre-58) code path until the joint cut.
- This same shared-DB reality means that if a staging UAT scenario exercises a `/profile` edit flow against a legacy-marketplaces test account, the new z.enum will reject it. Decision per owner: accept this on staging; either backfill the test account row manually, or run the SQL file early against the shared DB. Both options preserve the deferred-prod-cut guarantee (it's a DML to data; no schema change).
