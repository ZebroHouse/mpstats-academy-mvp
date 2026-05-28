---
phase: 58-diagnostic-on-jobs
plan: 02
status: complete — Task 1 + Task 2 both executed 2026-05-26
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

## Task 2 — Execute backfill against MAAL Supabase (✅ executed 2026-05-26)

Executed by orchestrator via Supabase Management API (token from `reference_supabase_mgmt.md`) against project `saecuecevicwjkpmaoot` after owner approved option 1 (apply now to shared DB — UPDATE-only, idempotent, PITR-backed).

### Pre-flight (before)

```
Legacy users (marketplaces contains YANDEX/ALIEXPRESS/MEGAMARKET/OWN_SHOP/OTHER): 5
Distribution:
  []                                      161
  [WB]                                      9
  [WB, OZON]                                3
  [OTHER]                                   3
  [WB, OZON, YANDEX]                        1
  [OZON, WB]                                1
  [WB, YANDEX, OZON, MEGAMARKET, …]         1
  Total                                   179
```

### Post-flight (after run 1)

```
legacy_after = 0  ✓
escapes      = 0  (no row outside {WB,OZON} subset)  ✓
Distribution:
  [WB, OZON]   164   (161 empty + 3 OTHER → fallback)
  [WB]           9
  [OZON, WB]     6   (3 [WB,OZON] + 1 [WB,OZON,YANDEX] + 1 [OZON,WB] + 1 mixed)
  Total        179   ✓ row count conserved
```

Order variance (`[WB,OZON]` vs `[OZON,WB]`) is benign — `marketplaces` is treated as a set everywhere (zod whitelist + `.includes()` checks).

### Idempotency check (run 2)

Re-running the same SQL completed cleanly. Distribution stabilized to:

```
  [OZON, WB]   170
  [WB]           9
  Total        179   ✓ row count conserved
```

Run 2 normalized the residual `[WB,OZON]` orderings to `[OZON,WB]` via INTERSECT's element order — semantically identical (set membership unchanged). Any further run is a no-op on the multiset of values.

### Notes

- This unblocks Plan 58-01 (Wave 2) immediately on **staging** (the new z.enum will accept every existing row).
- Plan 58-01 **prod** deploy still gated by owner per the joint Phase 58/59 cut agreement — but no longer blocked by data shape.
- No PITR rollback needed; if ever required (regret window), restore `UserProfile` table from PITR snapshot taken just before the timestamp of run 1.

## Notes

- Plan 58-01 `depends_on: ["58-02"]` is interpreted as *staging-deploy-only* during the deferred window — staging app and prod app share the same DB (`saecuecevicwjkpmaoot`), so applying the new restrictive zod whitelist only affects users on the staging app URL. Real prod users on `platform.mpstats.academy` continue to hit the permissive (pre-58) code path until the joint cut.
- This same shared-DB reality means that if a staging UAT scenario exercises a `/profile` edit flow against a legacy-marketplaces test account, the new z.enum will reject it. Decision per owner: accept this on staging; either backfill the test account row manually, or run the SQL file early against the shared DB. Both options preserve the deferred-prod-cut guarantee (it's a DML to data; no schema change).
