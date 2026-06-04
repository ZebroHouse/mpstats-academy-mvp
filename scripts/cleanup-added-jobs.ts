/**
 * Phase 61.1-03 (W1b): one-off idempotent clean-up of every user's MANUAL
 * `LearningPath.addedJobs`. The earlier `migrate-track-to-favorites` migration
 * already copied each user's `addedJobs[]` into `Favorite(JOB)`, but left
 * `addedJobs` populated → the same task showed up BOTH in the План
 * («Рекомендованные задачи») and in Избранное (задвоение).
 *
 * Owner decision (model A): clear `addedJobs` entirely (`addedJobs = []`) for
 * every row — everything is already in Favorite, and the plan refills only from
 * new diagnostic additions via RecommendedJobsBlock. `addedJobs` is written by
 * both manual `addJobToTrack` and diagnostic recommendations (also via
 * `addJobToTrack`), so the two cannot be told apart from `addedJobs` alone →
 * full clear is the simplest verifiable invariant.
 *
 * HARD RULES:
 *   - `LessonProgress` is NEVER written (read-only count for the before/after
 *     assert — D-03/D-07).
 *   - `Favorite` is NEVER touched (verified out-of-band by count after apply).
 *   - Idempotent: re-running over already-cleared ([]) rows yields 0 candidates,
 *     so `updateMany` is not called and 0 rows change.
 *   - Only the `addedJobs` JSON column is mutated, scoped by userId filter.
 *     NO DROP / ALTER / TRUNCATE / db push / accept-data-loss anywhere.
 *
 * Usage:
 *   npx tsx scripts/cleanup-added-jobs.ts --dry-run
 *   npx tsx scripts/cleanup-added-jobs.ts --apply
 *
 * The runtime DB target is whatever `DATABASE_URL` points at — this script is
 * run against PROD only behind the owner-approved blocking checkpoint
 * (61.1-03 Task 2). Prefer the Supabase Management API SQL in the runbook when
 * the host has no pnpm/prisma.
 */

// NOTE: `@prisma/client` is intentionally NOT imported at module top-level.
// The unit test imports `cleanup`/`planRowsToClear` under a vite/node harness
// that cannot resolve the Prisma client from the repo-root `scripts/` path. The
// real client is lazily `require`d inside `main()` (CLI-only, run via tsx).

/** Minimal prisma surface this clean-up needs — lets the test pass a stub. */
export interface CleanupPrisma {
  learningPath: {
    findMany: (args: { select: { userId: true; addedJobs: true } }) => Promise<
      Array<{ userId: string; addedJobs: unknown }>
    >;
    updateMany: (args: {
      where: { userId: { in: string[] } };
      data: { addedJobs: unknown[] };
    }) => Promise<{ count: number }>;
  };
  lessonProgress: {
    count: () => Promise<number>;
  };
}

/**
 * Return the userIds whose `addedJobs` is a non-empty array (candidates to clear
 * down to []). Pure — no DB access — so it can be unit-tested directly.
 * Idempotent: rows already cleared to [] (or null / non-array) are NOT returned.
 */
export function planRowsToClear(
  rows: Array<{ userId: string; addedJobs: unknown }>,
): string[] {
  const out: string[] = [];
  for (const row of rows) {
    if (Array.isArray(row.addedJobs) && row.addedJobs.length > 0) {
      out.push(row.userId);
    }
  }
  return out;
}

export interface CleanupResult {
  users: number;
  candidates: number;
  updated: number;
  lessonProgressBefore: number;
  lessonProgressAfter: number;
}

/**
 * Run the clean-up. `apply: false` (default) computes counts without writing.
 * NEVER touches LessonProgress — it only `count()`s it to prove the invariant.
 */
export async function cleanup(
  prisma: CleanupPrisma,
  opts: { apply?: boolean } = {},
): Promise<CleanupResult> {
  const apply = opts.apply === true;

  const lessonProgressBefore = await prisma.lessonProgress.count();

  const rows = await prisma.learningPath.findMany({
    select: { userId: true, addedJobs: true },
  });

  const ids = planRowsToClear(rows);

  let updated = 0;
  if (apply && ids.length > 0) {
    const res = await prisma.learningPath.updateMany({
      where: { userId: { in: ids } },
      data: { addedJobs: [] },
    });
    updated = res.count;
  }

  // Read-only — must equal `before`. Never written above.
  const lessonProgressAfter = await prisma.lessonProgress.count();

  return {
    users: rows.length,
    candidates: ids.length,
    updated,
    lessonProgressBefore,
    lessonProgressAfter,
  };
}

// ── CLI entrypoint (skipped when imported by tests) ──
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const apply = args.includes('--apply');

  if (!dryRun && !apply) {
    console.error('Usage: --dry-run or --apply');
    process.exit(1);
  }

  // Lazy require — keeps `@prisma/client` out of the module graph for tests.
  const { PrismaClient } = require('@prisma/client') as typeof import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const r = await cleanup(prisma as unknown as CleanupPrisma, { apply });
    console.log(`LearningPaths scanned   : ${r.users}`);
    console.log(`Candidates (addedJobs>0): ${r.candidates}`);
    if (apply) {
      console.log(`Updated (cleared to []) : ${r.updated}`);
    } else {
      console.log('[DRY RUN] No rows written. Re-run with --apply to write.');
    }
    console.log(
      `LessonProgress count    : before=${r.lessonProgressBefore} after=${r.lessonProgressAfter} ` +
        (r.lessonProgressBefore === r.lessonProgressAfter ? '(unchanged ✓)' : '(MISMATCH ✗)'),
    );
    if (r.lessonProgressBefore !== r.lessonProgressAfter) {
      throw new Error('LessonProgress count changed — aborting (hard rule D-03/D-07).');
    }
  } finally {
    await (prisma as unknown as { $disconnect: () => Promise<void> }).$disconnect();
  }
}

// Only run as a script, not when imported by the test harness.
if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
