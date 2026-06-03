import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Wave 0 RED stub — Phase 61 (Обучение 2.0).
 *
 * `scripts/migrate-track-to-favorites.ts` does NOT exist yet; it lands in 61-06.
 * It reads every LearningPath, lifts the `custom`-section lesson ids → Favorite(LESSON)
 * and `addedJobs[]` → Favorite(JOB), then writes them idempotently via
 * `createMany({ data, skipDuplicates: true })`.
 *
 * HARD RULES the GREEN bodies must keep:
 *   D-03/D-07 — `LessonProgress` is NEVER touched: row count before == after.
 *   Idempotency — re-running yields the SAME row count (skipDuplicates +
 *                 @@unique([userId,itemType,itemId])).
 *
 * We do NOT import the script at module top-level (it does not exist → would be a
 * hard COLLECTION error). 61-06 imports its exported `migrate()` inside the
 * un-skipped bodies. Behavioral bodies are `it.skip(... 'pending 61-06')`.
 */

// A stubbed prisma whose favorite.createMany records its calls, and whose
// lessonProgress.count returns a fixed snapshot we can compare before/after.
function makePrismaStub() {
  const createManyCalls: Array<{ data: unknown[]; skipDuplicates?: boolean }> = [];
  return {
    createManyCalls,
    learningPath: {
      findMany: vi.fn().mockResolvedValue([
        {
          userId: 'user-1',
          sections: [
            { id: 'custom', title: 'Мои уроки', lessons: [{ lessonId: 'l-1' }, { lessonId: 'l-2' }] },
            { id: 'diag-1', title: 'Диагностика', lessons: [{ lessonId: 'l-9' }] },
          ],
          addedJobs: [{ id: 'job-1' }],
        },
      ]),
    },
    favorite: {
      createMany: vi.fn().mockImplementation((args: { data: unknown[]; skipDuplicates?: boolean }) => {
        createManyCalls.push(args);
        return Promise.resolve({ count: args.data.length });
      }),
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
  it('uses skipDuplicates for idempotent writes (contract present in this stub)', () => {
    // The migration MUST call createMany with skipDuplicates:true. This shape
    // assertion documents the contract even before the script exists.
    const exampleCall = { data: [{ userId: 'user-1', itemType: 'LESSON', itemId: 'l-1' }], skipDuplicates: true };
    expect(exampleCall.skipDuplicates).toBe(true);
  });

  it.skip('lifts custom-section lessons → Favorite(LESSON) and addedJobs[] → Favorite(JOB) — pending 61-06', async () => {
    // GREEN (61-06):
    //   const { migrate } = await import('../migrate-track-to-favorites');
    //   await migrate(prisma as any, { apply: true });
    //   const rows = prisma.createManyCalls.flatMap((c) => c.data);
    //   expect(rows).toContainEqual(expect.objectContaining({ itemType: 'LESSON', itemId: 'l-1' }));
    //   expect(rows).toContainEqual(expect.objectContaining({ itemType: 'JOB', itemId: 'job-1' }));
    expect(prisma.learningPath.findMany).toBeDefined();
  });

  it.skip('is idempotent: running twice keeps Favorite row count unchanged (skipDuplicates) — pending 61-06', async () => {
    // GREEN (61-06): run migrate() twice against an in-memory unique set; the
    // second pass inserts 0 new rows. createMany is always called with
    // skipDuplicates:true.
    //   await migrate(prisma as any, { apply: true });
    //   await migrate(prisma as any, { apply: true });
    //   for (const call of prisma.createManyCalls) expect(call.skipDuplicates).toBe(true);
    expect(prisma.favorite.createMany).toBeDefined();
  });

  it.skip('LessonProgress row count is identical before and after migration (D-03/D-07) — pending 61-06', async () => {
    // GREEN (61-06): the migration must never write to LessonProgress.
    //   const before = await prisma.lessonProgress.count();
    //   await migrate(prisma as any, { apply: true });
    //   const after = await prisma.lessonProgress.count();
    //   expect(after).toBe(before);
    const before = await prisma.lessonProgress.count();
    const after = await prisma.lessonProgress.count();
    expect(after).toBe(before);
  });
});
