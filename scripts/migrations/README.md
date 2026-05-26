# One-time SQL migrations

Hand-curated SQL files that run against MAAL Supabase (`saecuecevicwjkpmaoot`) outside of Prisma's migration history. Use this directory for **data backfills** and **column-level patches** that don't fit Prisma's declarative schema model (e.g. multi-step DML, JSON shape fixes).

> Production DDL/DML safety rules live in `MAAL/CLAUDE.md` under "🚨 PROD DATABASE SAFETY". Read before executing anything here.

## Execution surface

Two equivalent paths:

1. **Supabase Management API query endpoint** (preferred, scriptable):
   ```
   POST https://api.supabase.com/v1/projects/saecuecevicwjkpmaoot/database/query
   Body: { "query": "<contents of .sql file>" }
   ```
   Token in `~/.claude/projects/D--GpT-docs-MPSTATS-ACADEMY-ADAPTIVE-LEARNING-MAAL/memory/reference_supabase_mgmt.md`. Same endpoint used for Phase 56 additive migration ([56-01] in STATE.md).

2. **Supabase Dashboard → SQL Editor** — paste contents, click Run. Use this when you want to review the result inline.

## Pre-flight checklist (every file, every run)

1. **Owner-approved?** No SQL here runs without owner sign-off in the relevant `xx-PLAN.md` checkpoint task.
2. **PITR backup recent?** Dashboard → Project → Database → Backups.
3. **Capture "before" state** with the file's pre-flight query (commented at the top).
4. **Run.**
5. **Capture "after" state** with the same query — verify expected value.
6. **Update file header** if outcome surprised you (note in `Notes:` block).

## Files

| File | Phase | Purpose | Status |
|------|-------|---------|--------|
| `2026-05-26-collapse-marketplaces.sql` | 58 | D-14 backfill: collapse `UserProfile.marketplaces` to `{WB, OZON}` (idempotent). Must run BEFORE Plan 58-01 z.enum tightening reaches prod. | Authored 2026-05-26 — awaiting joint Phase 58/59 prod-cut window. Safe to apply to staging-app-DB at any time (same shared DB, see CLAUDE.md). |

## Conventions

- Filename: `YYYY-MM-DD-<short-slug>.sql`.
- Top of file: comment block with phase, decision id (e.g. `D-14`), why, idempotency note, pre-flight + post-flight queries.
- One UPDATE/INSERT per file when feasible — easier to review and PITR-revert.
- Never embed real secrets, tokens, or passwords in these files (see CLAUDE.md secrets policy).
