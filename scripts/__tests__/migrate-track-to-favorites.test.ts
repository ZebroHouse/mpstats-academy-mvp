import { describe, it, expect, vi, beforeEach } from 'vitest';
import { migrate, collectFavoriteRows } from '../migrate-track-to-favorites';

/**
 * GREEN (61-07) — `scripts/migrate-track-to-favorites.ts` now exists and exports
 * `migrate(prisma, { apply })` + the pure `collectFavoriteRows(rows)`.
 *
 * It reads every LearningPath, lifts the `custom`-section `lessonIds` → Favorite(LESSON)
 * and `addedJobs[]` (JSON array of jobId strings) → Favorite(JOB), then writes them
 * idempotently via `createMany({ data, skipDuplicates: true })`.
 *
 * HARD RULES the GREEN bodies keep:
 *   D-03/D-07 — `LessonProgress` is NEVER touched: row count before == after.
 *   Idempotency — re-running yields the SAME row count (skipDuplicates +
 *                 @@unique([userId,itemType,itemId])).
 *
 * Real data shapes (from learning.ts / @mpstats/shared):
 *   LearningPath.lessons  = SectionedLearningPath { version:2, sections:[{ id, lessonIds }] }
 *   LearningPath.addedJobs = string[] of jobIds
 */

// A stubbed prisma whose favorite.createMany emulates the @@unique skipDuplicates
// behavior (so re-runs are idempotent), and whose lessonProgress.count returns a
// fixed snapshot we compare before/after. learningPath.findMany returns real shapes.
function makePrismaStub() {
  const createManyCalls: Array<{ data: unknown[]; skipDuplicates?: boolean }> = [];
  const uniqueRows = new Set<string>(); // emulates @@unique([userId,itemType,itemId])

  return {
    createManyCalls,
    uniqueRows,
    learningPath: {
      findMany: vi.fn().mockResolvedValue([
        {
          userId: 'user-1',
          lessons: {
            version: 2,
            sections: [
              { id: 'errors', title: 'Ошибки', lessonIds: ['l-9'] },
              { id: 'custom', title: 'Мои уроки', lessonIds: ['l-1', 'l-2'] },
            ],
          },
          addedJobs: ['job-1'],
        },
      ]),
    },
    favorite: {
      createMany: vi.fn().mockImplementation(
        (args: { data: Array<{ userId: string; itemType: string; itemId: string }>; skipDuplicates?: boolean }) => {
          createManyCalls.push(args);
          let inserted = 0;
          for (const r of args.data) {
            const key = `${r.userId}:${r.itemType}:${r.itemId}`;
            if (args.skipDuplicates && uniqueRows.has(key)) continue;
            uniqueRows.add(key);
            inserted++;
          }
          return Promise.resolve({ count: inserted });
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

describe('migrate-track-to-favorites', () => {
  it('uses skipDuplicates for idempotent writes', async () => {
    await migrate(prisma as never, { apply: true });
    expect(prisma.favorite.createMany).toHaveBeenCalled();
    for (const call of prisma.createManyCalls) {
      expect(call.skipDuplicates).toBe(true);
    }
  });

  it('lifts custom-section lessons → Favorite(LESSON) and addedJobs[] → Favorite(JOB)', async () => {
    await migrate(prisma as never, { apply: true });
    const rows = prisma.createManyCalls.flatMap((c) => c.data);
    expect(rows).toContainEqual(expect.objectContaining({ itemType: 'LESSON', itemId: 'l-1' }));
    expect(rows).toContainEqual(expect.objectContaining({ itemType: 'LESSON', itemId: 'l-2' }));
    expect(rows).toContainEqual(expect.objectContaining({ itemType: 'JOB', itemId: 'job-1' }));
    // Diagnostic-section lesson must NOT be migrated (only the custom section).
    expect(rows).not.toContainEqual(expect.objectContaining({ itemId: 'l-9' }));
  });

  it('is idempotent: running twice keeps Favorite row count unchanged (skipDuplicates)', async () => {
    const first = await migrate(prisma as never, { apply: true });
    const second = await migrate(prisma as never, { apply: true });
    expect(first.inserted).toBe(3); // l-1, l-2, job-1
    expect(second.inserted).toBe(0); // re-run inserts nothing
    expect(prisma.uniqueRows.size).toBe(3);
    for (const call of prisma.createManyCalls) {
      expect(call.skipDuplicates).toBe(true);
    }
  });

  it('LessonProgress row count is identical before and after migration (D-03/D-07)', async () => {
    const result = await migrate(prisma as never, { apply: true });
    expect(result.lessonProgressAfter).toBe(result.lessonProgressBefore);
    // count() is read-only; never write APIs on lessonProgress exist on the stub.
    expect(prisma.lessonProgress.count).toHaveBeenCalled();
  });

  it('collectFavoriteRows is pure and maps shapes correctly', () => {
    const rows = collectFavoriteRows([
      {
        userId: 'u',
        lessons: { version: 2, sections: [{ id: 'custom', lessonIds: ['a'] }] },
        addedJobs: ['j1', 'j2'],
      },
    ]);
    expect(rows).toEqual([
      { userId: 'u', itemType: 'LESSON', itemId: 'a' },
      { userId: 'u', itemType: 'JOB', itemId: 'j1' },
      { userId: 'u', itemType: 'JOB', itemId: 'j2' },
    ]);
  });

  it('--dry-run (apply:false) writes nothing', async () => {
    const result = await migrate(prisma as never, { apply: false });
    expect(prisma.favorite.createMany).not.toHaveBeenCalled();
    expect(result.totalRows).toBe(3);
    expect(result.inserted).toBe(0);
  });
});
