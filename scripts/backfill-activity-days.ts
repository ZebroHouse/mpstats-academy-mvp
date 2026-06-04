/**
 * Active-user analytics: idempotent backfill of UserActivityDay from existing
 * append-only signals (approximate history).
 *
 * WHY APPROXIMATE: before the protectedProcedure heartbeat shipped, we did not
 * record a per-day "user was active" signal. We can only reconstruct activity
 * from engaged-action tables that carry (userId, timestamp):
 *   - DiagnosticSession.startedAt    → (userId, date)
 *   - DiagnosticAnswer.answeredAt    → (session.userId, date)
 *   - ChatMessage.createdAt          → (userId, date)
 *   - LessonComment.createdAt        → (userId, date)
 *   - UserProfile.createdAt          → (id, date)   // registration day
 * Pure lesson VIEWERS who never took an engaged action are UNDERCOUNTED, so
 * historical DAU/WAU/MAU is a lower bound. Accurate data accrues going-forward
 * via the heartbeat in protectedProcedure (one row per user per active day).
 *
 * SAFETY (matches scripts/cleanup-added-jobs.ts conventions):
 *   - INSERT ... SELECT ... ON CONFLICT ("userId","day") DO NOTHING → idempotent;
 *     re-running inserts 0 new rows.
 *   - NO DROP / ALTER / TRUNCATE / db push / accept-data-loss anywhere.
 *   - --dry-run ALWAYS wins over --apply (fail-safe for prod target).
 *   - Only writes "UserActivityDay" (the additive table from migration
 *     20260604000000). No existing table is mutated.
 *
 * Usage:
 *   npx tsx scripts/backfill-activity-days.ts --dry-run
 *   npx tsx scripts/backfill-activity-days.ts --apply
 *
 * Run against PROD only behind the owner-approved blocking checkpoint. Prefer
 * the equivalent SQL below via Supabase Management API when the host has no
 * pnpm/prisma. The CREATE TABLE lives in the migration; here is just the INSERT:
 *
 *   -- Supabase Management API: POST /v1/projects/{ref}/database/query
 *   INSERT INTO "UserActivityDay" ("userId", "day")
 *   SELECT DISTINCT "userId", "day" FROM (
 *     SELECT "userId", ("startedAt" AT TIME ZONE 'UTC')::date AS "day"
 *       FROM "DiagnosticSession"
 *     UNION
 *     SELECT s."userId", (a."answeredAt" AT TIME ZONE 'UTC')::date AS "day"
 *       FROM "DiagnosticAnswer" a
 *       JOIN "DiagnosticSession" s ON s."id" = a."sessionId"
 *     UNION
 *     SELECT "userId", ("createdAt" AT TIME ZONE 'UTC')::date AS "day"
 *       FROM "ChatMessage"
 *     UNION
 *     SELECT "userId", ("createdAt" AT TIME ZONE 'UTC')::date AS "day"
 *       FROM "LessonComment"
 *     UNION
 *     SELECT "id" AS "userId", ("createdAt" AT TIME ZONE 'UTC')::date AS "day"
 *       FROM "UserProfile"
 *   ) src
 *   ON CONFLICT ("userId", "day") DO NOTHING;
 *
 *   -- dry-run equivalent (how many (userId,day) rows are NOT yet present):
 *   SELECT COUNT(*)::int AS would_insert FROM (
 *     <same SELECT DISTINCT ... as above> src
 *   ) all_signals
 *   WHERE NOT EXISTS (
 *     SELECT 1 FROM "UserActivityDay" u
 *      WHERE u."userId" = all_signals."userId" AND u."day" = all_signals."day"
 *   );
 */

// NOTE: `@prisma/client` is intentionally NOT imported at module top-level —
// lazily `require`d inside main() so the test can import the pure SQL builders
// under a vite/node harness (same pattern as cleanup-added-jobs.ts).

/**
 * The DISTINCT-union of all (userId, day) activity signals. Pure SQL string —
 * shared by both the dry-run COUNT and the apply INSERT so they can never drift.
 * Uses double-quoted identifiers (Postgres) and UTC date truncation.
 */
export const ACTIVITY_SIGNALS_SELECT = `
  SELECT DISTINCT "userId", "day" FROM (
    SELECT "userId", ("startedAt" AT TIME ZONE 'UTC')::date AS "day"
      FROM "DiagnosticSession"
    UNION
    SELECT s."userId", (a."answeredAt" AT TIME ZONE 'UTC')::date AS "day"
      FROM "DiagnosticAnswer" a
      JOIN "DiagnosticSession" s ON s."id" = a."sessionId"
    UNION
    SELECT "userId", ("createdAt" AT TIME ZONE 'UTC')::date AS "day"
      FROM "ChatMessage"
    UNION
    SELECT "userId", ("createdAt" AT TIME ZONE 'UTC')::date AS "day"
      FROM "LessonComment"
    UNION
    SELECT "id" AS "userId", ("createdAt" AT TIME ZONE 'UTC')::date AS "day"
      FROM "UserProfile"
  ) src
`;

/** Builds the idempotent INSERT statement (apply mode). */
export function buildInsertSql(): string {
  return `INSERT INTO "UserActivityDay" ("userId", "day")\n${ACTIVITY_SIGNALS_SELECT}\nON CONFLICT ("userId", "day") DO NOTHING`;
}

/** Builds the COUNT-only statement (dry-run): rows that WOULD be inserted. */
export function buildDryRunCountSql(): string {
  return `SELECT COUNT(*)::int AS would_insert FROM (\n${ACTIVITY_SIGNALS_SELECT}\n) all_signals\nWHERE NOT EXISTS (\n  SELECT 1 FROM "UserActivityDay" u\n   WHERE u."userId" = all_signals."userId" AND u."day" = all_signals."day"\n)`;
}

/** Minimal prisma surface this backfill needs — lets the test pass a stub. */
export interface BackfillPrisma {
  $queryRawUnsafe: <T = unknown>(sql: string, ...params: unknown[]) => Promise<T>;
  $executeRawUnsafe: (sql: string, ...params: unknown[]) => Promise<number>;
}

export interface BackfillResult {
  /** dry-run: how many (userId,day) rows would be inserted. */
  wouldInsert: number;
  /** apply: rows actually inserted (excludes ON CONFLICT skips). null in dry-run. */
  inserted: number | null;
}

/**
 * Run the backfill. `apply: false` (default) only counts; `apply: true` inserts.
 * Idempotent via ON CONFLICT DO NOTHING.
 */
export async function backfill(
  prisma: BackfillPrisma,
  opts: { apply?: boolean } = {},
): Promise<BackfillResult> {
  const apply = opts.apply === true;

  const countRows = await prisma.$queryRawUnsafe<Array<{ would_insert: number }>>(
    buildDryRunCountSql(),
  );
  const wouldInsert = Number(countRows?.[0]?.would_insert ?? 0);

  if (!apply) {
    return { wouldInsert, inserted: null };
  }

  const inserted = await prisma.$executeRawUnsafe(buildInsertSql());
  return { wouldInsert, inserted: Number(inserted) };
}

// ── CLI entrypoint (skipped when imported by tests) ──
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  // --dry-run ALWAYS wins. Contradictory input must fail safe (prod target).
  const apply = args.includes('--apply') && !dryRun;

  if (!dryRun && !apply) {
    console.error('Usage: --dry-run or --apply');
    process.exit(1);
  }

  const { PrismaClient } = require('@prisma/client') as typeof import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const r = await backfill(prisma as unknown as BackfillPrisma, { apply });
    console.log(`(userId,day) rows to insert (approx): ${r.wouldInsert}`);
    if (apply) {
      console.log(`Inserted (excl. ON CONFLICT skips)  : ${r.inserted}`);
    } else {
      console.log('[DRY RUN] No rows written. Re-run with --apply to write.');
    }
    console.log(
      'NOTE: history is APPROXIMATE (engaged-action signals only; pure lesson ' +
        'viewers undercounted). Accurate data accrues going-forward via heartbeat.',
    );
  } finally {
    await (prisma as unknown as { $disconnect: () => Promise<void> }).$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
