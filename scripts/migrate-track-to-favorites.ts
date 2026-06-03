/**
 * Phase 61 (Обучение 2.0, D-03/D-07): one-off idempotent data migration that
 * lifts every user's MANUAL track additions into the new `Favorite` model.
 *
 *   custom-section lessonIds  → Favorite(LESSON)
 *   addedJobs[] jobIds        → Favorite(JOB)
 *
 * HARD RULES:
 *   - `LessonProgress` is NEVER written (read-only count for the before/after assert).
 *   - Idempotent: writes go through `createMany({ data, skipDuplicates: true })`
 *     against `@@unique([userId,itemType,itemId])`, so a re-run inserts 0 rows.
 *   - Reads `LearningPath` only; the custom section (`section.id === 'custom'`)
 *     and `addedJobs` JSON array are the sole sources of manual items.
 *
 * Usage:
 *   npx tsx scripts/migrate-track-to-favorites.ts --dry-run
 *   npx tsx scripts/migrate-track-to-favorites.ts --apply
 *
 * The runtime DB target is whatever `DATABASE_URL` points at — this script is
 * run against PROD only behind the owner-approved blocking checkpoint (61-07 Task 4).
 */

import { parseLearningPath } from '@mpstats/shared';

// NOTE: `@prisma/client` is intentionally NOT imported at module top-level.
// The unit test imports `migrate`/`collectFavoriteRows` under a vite/node harness
// that cannot resolve the Prisma client from the repo-root `scripts/` path. The
// real client is lazily `require`d inside `main()` (CLI-only, run via tsx).

/** Minimal surface this migration needs — lets the test pass a stub. */
export interface MigratePrisma {
  learningPath: {
    findMany: (args: { select: { userId: true; lessons: true; addedJobs: true } }) => Promise<
      Array<{ userId: string; lessons: unknown; addedJobs: unknown }>
    >;
  };
  favorite: {
    createMany: (args: {
      data: Array<{ userId: string; itemType: 'LESSON' | 'JOB'; itemId: string }>;
      skipDuplicates: boolean;
    }) => Promise<{ count: number }>;
  };
  lessonProgress: {
    count: () => Promise<number>;
  };
}

export interface FavoriteRow {
  userId: string;
  itemType: 'LESSON' | 'JOB';
  itemId: string;
}

/**
 * Collect every (userId, itemType, itemId) favorite row implied by a user's
 * LearningPath: custom-section lessons → LESSON, addedJobs → JOB.
 * Pure — no DB writes — so it can be unit-tested directly.
 */
export function collectFavoriteRows(
  rows: Array<{ userId: string; lessons: unknown; addedJobs: unknown }>,
): FavoriteRow[] {
  const out: FavoriteRow[] = [];

  for (const row of rows) {
    const seen = new Set<string>(); // dedupe within a single user/run

    // ── custom-section lessons → LESSON ──
    const parsed = parseLearningPath(row.lessons);
    if (!Array.isArray(parsed)) {
      const custom = parsed.sections.find((s) => s.id === 'custom');
      for (const lessonId of custom?.lessonIds ?? []) {
        if (!lessonId) continue;
        const key = `LESSON:${lessonId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ userId: row.userId, itemType: 'LESSON', itemId: lessonId });
      }
    }

    // ── addedJobs[] → JOB (JSON array of jobId strings) ──
    const addedJobs = Array.isArray(row.addedJobs) ? (row.addedJobs as string[]) : [];
    for (const jobId of addedJobs) {
      if (!jobId || typeof jobId !== 'string') continue;
      const key = `JOB:${jobId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ userId: row.userId, itemType: 'JOB', itemId: jobId });
    }
  }

  return out;
}

export interface MigrateResult {
  users: number;
  lessonRows: number;
  jobRows: number;
  totalRows: number;
  inserted: number;
  lessonProgressBefore: number;
  lessonProgressAfter: number;
}

/**
 * Run the migration. `apply: false` (default) computes counts without writing.
 * NEVER touches LessonProgress — it only `count()`s it to prove the invariant.
 */
export async function migrate(
  prisma: MigratePrisma,
  opts: { apply?: boolean } = {},
): Promise<MigrateResult> {
  const apply = opts.apply === true;

  const lessonProgressBefore = await prisma.lessonProgress.count();

  const paths = await prisma.learningPath.findMany({
    select: { userId: true, lessons: true, addedJobs: true },
  });

  const data = collectFavoriteRows(paths);
  const lessonRows = data.filter((d) => d.itemType === 'LESSON').length;
  const jobRows = data.filter((d) => d.itemType === 'JOB').length;

  let inserted = 0;
  if (apply && data.length > 0) {
    const res = await prisma.favorite.createMany({ data, skipDuplicates: true });
    inserted = res.count;
  }

  // Read-only — must equal `before`. Never written above.
  const lessonProgressAfter = await prisma.lessonProgress.count();

  return {
    users: paths.length,
    lessonRows,
    jobRows,
    totalRows: data.length,
    inserted,
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
    const r = await migrate(prisma as unknown as MigratePrisma, { apply });
    console.log(`LearningPaths scanned : ${r.users}`);
    console.log(`Favorite(LESSON) rows : ${r.lessonRows}`);
    console.log(`Favorite(JOB) rows    : ${r.jobRows}`);
    console.log(`Total candidate rows  : ${r.totalRows}`);
    if (apply) {
      console.log(`Inserted (new rows)   : ${r.inserted}`);
    } else {
      console.log('[DRY RUN] No rows written. Re-run with --apply to write.');
    }
    console.log(
      `LessonProgress count  : before=${r.lessonProgressBefore} after=${r.lessonProgressAfter} ` +
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
