-- =============================================================================
-- Phase 58 — D-14 — Collapse UserProfile.marketplaces to {WB, OZON}
-- =============================================================================
--
-- One-time idempotent backfill aligned with decision D-14 in
-- .planning/phases/58-diagnostic-on-jobs/58-CONTEXT.md.
--
-- Why: Wizard step 2 marketplace selector is being collapsed from 7 options
-- (WB/OZON/YANDEX/ALIEXPRESS/MEGAMARKET/OWN_SHOP/OTHER) to 2 (WB, OZON) — Phase
-- 58 platform truth (all 29 Phase 57 jobs target WB/OZON/BOTH). Existing rows
-- in UserProfile.marketplaces may contain legacy values. We must collapse them
-- BEFORE Plan 58-01's restrictive z.enum(['WB','OZON']) reaches prod, otherwise
-- any code path re-validating marketplaces[] against the new whitelist will
-- reject legacy users.
--
-- Behavior per D-14:
--   * Row's marketplaces[] ∩ {WB, OZON} is non-empty → keep just that intersection.
--   * Row's marketplaces[] ∩ {WB, OZON} is empty (only legacy values, or empty
--     to begin with) → set to {WB, OZON} so the user still sees all jobs
--     (status quo; D-15 fallback also catches empty arrays but D-14 prescribes
--     the explicit value).
--
-- Idempotency: running this UPDATE twice produces an identical state because
-- intersecting an already-cleaned array with {WB, OZON} yields the same array.
--
-- =============================================================================
-- PRE-FLIGHT CHECK (run before AND after; expected after = 0):
--
--   SELECT COUNT(*) FROM "UserProfile"
--   WHERE marketplaces && ARRAY['YANDEX','ALIEXPRESS','MEGAMARKET','OWN_SHOP','OTHER']::text[];
--
-- EXECUTION ORDER (per scripts/migrations/README.md):
--   1. Run pre-flight COUNT (record the "before" number, expected > 0).
--   2. Verify Supabase PITR backup exists (Dashboard → Backups).
--   3. Run this UPDATE via Supabase Management API query endpoint
--      (POST https://api.supabase.com/v1/projects/saecuecevicwjkpmaoot/database/query)
--      or via SQL Editor.
--   4. Re-run pre-flight COUNT — expected: 0.
--   5. Spot-check: SELECT id, marketplaces FROM "UserProfile" LIMIT 5;
--   6. Only after post-count == 0 is it safe to deploy Plan 58-01 to prod.
-- =============================================================================

UPDATE "UserProfile"
SET marketplaces = CASE
  WHEN (
    ARRAY(SELECT unnest(marketplaces) INTERSECT SELECT unnest(ARRAY['WB','OZON']))
  ) = '{}'::text[]
    THEN ARRAY['WB','OZON']
  ELSE
    ARRAY(SELECT unnest(marketplaces) INTERSECT SELECT unnest(ARRAY['WB','OZON']))
END;

-- =============================================================================
-- POST-EXECUTION VERIFICATION (operator runs all three):
--
--   -- 1. Legacy values fully cleaned (expected: 0)
--   SELECT COUNT(*) FROM "UserProfile"
--   WHERE marketplaces && ARRAY['YANDEX','ALIEXPRESS','MEGAMARKET','OWN_SHOP','OTHER']::text[];
--
--   -- 2. Every row is a subset of {WB, OZON} (expected: 0 — no rows escape)
--   SELECT COUNT(*) FROM "UserProfile"
--   WHERE NOT (marketplaces <@ ARRAY['WB','OZON']::text[]);
--
--   -- 3. Distribution sanity (just for the record)
--   SELECT marketplaces, COUNT(*)
--   FROM "UserProfile"
--   GROUP BY marketplaces
--   ORDER BY COUNT(*) DESC;
-- =============================================================================
