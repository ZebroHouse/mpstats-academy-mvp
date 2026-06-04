import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanup, planRowsToClear } from '../cleanup-added-jobs';

/**
 * Phase 61.1-03 (W1b) — `scripts/cleanup-added-jobs.ts` clears every user's
 * manual `LearningPath.addedJobs` (those rows are already lifted into Favorite(JOB)
 * by `migrate-track-to-favorites`), leaving the plan to fill only from new
 * diagnostic additions via RecommendedJobsBlock.
 *
 * HARD RULES the GREEN bodies keep:
 *   D-03/D-07 — `LessonProgress` is NEVER touched: row count before == after.
 *   Idempotency — re-running over already-cleared ([]) rows updates 0 rows.
 *   Safety — only `addedJobs` is set to []; Favorite & LessonProgress untouched.
 */

// Stub prisma whose learningPath.updateMany emulates clearing addedJobs (so a
// re-run after clearing yields 0 candidates), and whose lessonProgress.count
// returns a fixed snapshot we compare before/after.
function makePrismaStub() {
  // mutable state so updateMany can flip rows to [] and re-runs see them empty
  const rows: Array<{ userId: string; addedJobs: unknown }> = [
    { userId: 'user-1', addedJobs: ['job-1', 'job-2'] },
    { userId: 'user-2', addedJobs: [] },
    { userId: 'user-3', addedJobs: ['job-9'] },
  ];

  return {
    rows,
    learningPath: {
      findMany: vi.fn().mockImplementation(() =>
        Promise.resolve(rows.map((r) => ({ userId: r.userId, addedJobs: r.addedJobs }))),
      ),
      updateMany: vi.fn().mockImplementation(
        (args: { where: { userId: { in: string[] } }; data: { addedJobs: unknown[] } }) => {
          const ids = new Set(args.where.userId.in);
          let count = 0;
          for (const r of rows) {
            if (ids.has(r.userId)) {
              r.addedJobs = args.data.addedJobs;
              count++;
            }
          }
          return Promise.resolve({ count });
        },
      ),
    },
    lessonProgress: {
      count: vi.fn().mockResolvedValue(42),
    },
    $disconnect: vi.fn().mockResolvedValue(undefined),
  };
}

let prisma: ReturnType<typeof makePrismaStub>;
beforeEach(() => {
  prisma = makePrismaStub();
});

describe('cleanup-added-jobs', () => {
  it('planRowsToClear returns only userIds whose addedJobs is non-empty', () => {
    const ids = planRowsToClear([
      { userId: 'a', addedJobs: ['x'] },
      { userId: 'b', addedJobs: [] },
      { userId: 'c', addedJobs: ['y', 'z'] },
      { userId: 'd', addedJobs: null },
      { userId: 'e', addedJobs: 'not-an-array' },
    ]);
    expect(ids).toEqual(['a', 'c']);
  });

  it('planRowsToClear is idempotent: already-cleared ([]) rows yield no candidates', () => {
    const ids = planRowsToClear([
      { userId: 'a', addedJobs: [] },
      { userId: 'b', addedJobs: [] },
    ]);
    expect(ids).toEqual([]);
  });

  it('cleanup with apply:false reports candidates but never calls updateMany', async () => {
    const result = await cleanup(prisma as never, { apply: false });
    expect(prisma.learningPath.updateMany).not.toHaveBeenCalled();
    expect(result.users).toBe(3);
    expect(result.candidates).toBe(2); // user-1, user-3
    expect(result.updated).toBe(0);
  });

  it('cleanup with apply:true calls updateMany exactly for the candidates', async () => {
    const result = await cleanup(prisma as never, { apply: true });
    expect(prisma.learningPath.updateMany).toHaveBeenCalledTimes(1);
    const call = prisma.learningPath.updateMany.mock.calls[0][0];
    expect(call.where.userId.in.sort()).toEqual(['user-1', 'user-3']);
    expect(call.data.addedJobs).toEqual([]);
    expect(result.candidates).toBe(2);
    expect(result.updated).toBe(2);
  });

  it('is idempotent: a second apply run updates 0 rows', async () => {
    const first = await cleanup(prisma as never, { apply: true });
    const second = await cleanup(prisma as never, { apply: true });
    expect(first.updated).toBe(2);
    expect(second.candidates).toBe(0);
    expect(second.updated).toBe(0);
    // updateMany only fired on the first run (no candidates the second time)
    expect(prisma.learningPath.updateMany).toHaveBeenCalledTimes(1);
  });

  it('LessonProgress row count is identical before and after (D-03/D-07, read-only)', async () => {
    const result = await cleanup(prisma as never, { apply: true });
    expect(result.lessonProgressAfter).toBe(result.lessonProgressBefore);
    // count() called twice (before + after); no write APIs exist on the stub.
    expect(prisma.lessonProgress.count).toHaveBeenCalledTimes(2);
  });
});
