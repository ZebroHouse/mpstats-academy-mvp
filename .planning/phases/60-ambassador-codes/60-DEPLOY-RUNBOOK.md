---
phase: 60-ambassador-codes
plan: 04
status: ready
created: 2026-05-28
---

# Phase 60 — Deploy Runbook

Sequential commands for owner to ship Phase 60 to staging then prod. **Do not skip steps.** Pause at the two blocking checkpoints.

> **PROD DATABASE SAFETY (incident 2026-05-12):** Only run `prisma migrate deploy` against prod from the **MAAL repo**, with `DATABASE_URL` verified to point at project ref `saecuecevicwjkpmaoot`. Never `prisma db push --accept-data-loss` on prod. See `CLAUDE.md` top section.

---

## Step 1 — Pre-deploy local checks

Run from `D:\GpT_docs\MPSTATS ACADEMY ADAPTIVE LEARNING\MAAL\.claude\worktrees\phase-60-ambassador-codes`:

```bash
git status                                  # working tree clean
git branch --show-current                   # phase-60-ambassador-codes
git log --oneline master..HEAD              # all 60-0X commits present
pnpm --filter @mpstats/api test             # green (>= 52 referral tests)
pnpm --filter @mpstats/api typecheck        # exit 0
pnpm --filter web typecheck                 # exit 0
```

If any check fails — STOP, do not deploy.

---

## Step 2 — Staging deploy + apply migration to staging Supabase

SSH into VPS:

```bash
ssh deploy@89.208.106.208
cd /home/deploy/maal

# Switch to phase branch
git fetch
git checkout phase-60-ambassador-codes
git pull

# Verify staging DATABASE_URL — must NOT contain saecuecevicwjkpmaoot if you have a
# separate staging project; if staging shares prod DB (current setup per CLAUDE.md),
# this is acceptable because the migration is additive and applies once for both envs.
# Check the env file the staging compose uses:
grep -c "DATABASE_URL" /home/deploy/maal/.env.staging   # >= 1
# (If staging uses the same prod DB ref — the additive nature of this migration is
# the safety net; review packages/db/prisma/migrations/20260528000000_add_referral_code_table/migration.sql
# one more time and confirm only CREATE TABLE / CREATE INDEX statements, no DROP / TRUNCATE.)

# Apply migration (will be a no-op if staging+prod share DB AND it has already been applied)
pnpm --filter @mpstats/db exec prisma migrate deploy

# Build + start staging — MUST use --no-cache when .tsx/.ts changed
# (per .claude/memory/feedback_staging_docker_no_cache_required.md)
docker compose -p maal-staging -f docker-compose.staging.yml build --no-cache web
docker compose -p maal-staging -f docker-compose.staging.yml up -d

# Wait for healthy
docker compose -p maal-staging -f docker-compose.staging.yml ps

# Content-grep the bundle to prove new code is actually shipped (not a stale cache hit)
docker exec maal-staging-web sh -c 'grep -lE "createAmbassadorCode|listAmbassadorCodes" /app/.next/server -r | head -3'
# Expect at least one path to appear. If empty — rebuild with --no-cache again.

# CRITICAL — leave VPS on master so the next prod redeploy is not poisoned
git checkout master
```

Verify migration recorded on the staging DB:

```bash
# From local laptop with staging DATABASE_URL set (or via Supabase SQL editor for prod-shared DB):
psql "$STAGING_DATABASE_URL" -c "SELECT migration_name, finished_at FROM _prisma_migrations WHERE migration_name = '20260528000000_add_referral_code_table';"
# Expect 1 row, finished_at NOT NULL.
```

---

## Step 3 — BLOCKING CHECKPOINT A — Owner runs staging UAT

Open `60-HUMAN-UAT.md`, run scenarios 1 through 8 against `https://staging.platform.mpstats.academy`.

- **All 8 PASS** → return to executor with `uat-passed`.
- **Any FAIL** → describe the failing scenario + symptom; executor fixes code; rebuild staging via Step 2; re-run failed scenarios.

---

## Step 4 — Prod migration (run from local MAAL repo, NOT VPS)

> Migration is applied **before** code deploy. The new code references the `ReferralCode` table; deploying code first against an un-migrated DB would 500 on `/admin/referrals/codes`.

From local laptop, in the MAAL worktree:

```bash
cd "D:\GpT_docs\MPSTATS ACADEMY ADAPTIVE LEARNING\MAAL\.claude\worktrees\phase-60-ambassador-codes"

# Set DATABASE_URL to PROD — confirm project ref before anything else
export DATABASE_URL='postgresql://postgres.<...>@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?...'
echo "$DATABASE_URL" | grep -c saecuecevicwjkpmaoot
# MUST output 1. If 0 — you have the wrong URL. STOP.

# Confirm migration is pending
pnpm --filter @mpstats/db exec prisma migrate status
# Expect: 1 migration not yet applied → 20260528000000_add_referral_code_table

# Apply
pnpm --filter @mpstats/db exec prisma migrate deploy

# Verify recorded
psql "$DATABASE_URL" -c "SELECT migration_name, finished_at FROM _prisma_migrations WHERE migration_name = '20260528000000_add_referral_code_table';"
# Expect 1 row with finished_at set.

# Verify schema present
psql "$DATABASE_URL" -c '\d "ReferralCode"'
# Expect: table with columns id, code (uniq), codeType, label, refereeTrialDays,
#         maxUses, currentUses, expiresAt, isActive, createdAt, etc.
```

---

## Step 5 — BLOCKING CHECKPOINT B — Owner confirms prod migration

Signal executor:
- `migration-applied` → proceed to Step 6 (code deploy).
- `migration-failed: <reason>` → trigger PITR rollback (see Step 8) and stop.

---

## Step 6 — Prod code deploy

After branch is merged to master via PR:

```bash
ssh deploy@89.208.106.208
cd /home/deploy/maal
git checkout master
git pull
docker compose down
docker compose build --no-cache
docker compose up -d
docker compose ps                              # all healthy
docker exec maal-web sh -c 'grep -lE "createAmbassadorCode|listAmbassadorCodes" /app/.next/server -r | head -3'
# Expect at least one path.
```

---

## Step 7 — Post-deploy smoke on prod

Run UAT Scenario 9 (`60-HUMAN-UAT.md`):

- Admin opens `/admin/referrals/codes` on `https://platform.mpstats.academy`.
- Creates `AMB-PROD-SMOKE-01` (maxUses=1, refereeTrialDays=1).
- Activates via incognito throwaway email + DOI.
- Confirms TRIAL in /profile, activations=1 in admin UI.
- Deletes the smoke code via SQL: `DELETE FROM "ReferralCode" WHERE code='AMB-PROD-SMOKE-01';`

If smoke fails — see Rollback (Step 8).

---

## Step 8 — Rollback procedure

The migration is **additive** (CREATE TABLE / CREATE INDEX / ALTER TABLE ADD COLUMN only — no DROP, no data mutation). No functional rollback of the migration itself is required.

To disable the feature without rolling back:

```sql
-- Kill all active ambassador codes instantly:
UPDATE "ReferralCode" SET "isActive" = false WHERE "codeType" = 'AMBASSADOR';
```

To revert the code:

```bash
# Merge a git revert of the Phase 60 PR
git revert <phase-60-merge-commit>
# Redeploy prod via Step 6
```

If catastrophe (data loss, table corruption — extremely unlikely given additive schema):

- **PITR rollback** via Supabase dashboard → Project saecuecevicwjkpmaoot → Database → Backups → Point-in-Time Recovery → choose moment **before** the `prisma migrate deploy` of Step 4.
- See `CLAUDE.md` «PROD DATABASE SAFETY → Recovery procedure».
- After PITR: re-create any valid tables from sibling projects that may have been affected (none expected for this phase).

---

## Step 9 — Post-deploy housekeeping

- Update `CLAUDE.md` and `.planning/ROADMAP.md` per Plan 60-04 Task 5.
- Write `60-04-SUMMARY.md` per Plan output spec.
- Commit + push.
