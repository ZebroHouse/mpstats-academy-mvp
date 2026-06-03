import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Wave 0 RED stub — Phase 61 (Обучение 2.0).
 *
 * `favoriteRouter` does NOT exist yet; it lands in 61-06 together with the
 * `FavoriteItemType` enum (`@mpstats/db`) and the `Favorite` table migration.
 * These assertions are AUTHORED now so the downstream implementation task has a
 * concrete `<automated>` target (Nyquist Dim 8). Behavioral bodies are
 * `it.skip('… pending 61-06')` so the suite COLLECTS green; flipping them to
 * `it` (and importing the real router) is the GREEN step in 61-06.
 *
 * SECURITY CONTRACT (T-IDOR-fav): every write/read is scoped by `ctx.user.id`,
 * NEVER by a userId taken from `input`. The skipped bodies below encode that.
 *
 * NOTE: we deliberately do NOT `import { favoriteRouter } from '../favorite'`
 * nor `import { FavoriteItemType } from '@mpstats/db'` at module top-level —
 * neither exists yet, and a top-level import would turn this RED stub into a
 * hard COLLECTION error. 61-06 adds the import inside the un-skipped bodies.
 */

// Item types are string literals here; once the enum lands they become
// `FavoriteItemType.LESSON` etc. The migration declares exactly these three.
const ITEM_TYPES = ['LESSON', 'JOB', 'MATERIAL'] as const;

function makeCtx(overrides: any = {}) {
  return {
    user: { id: 'user-1' },
    prisma: {
      favorite: {
        create: vi.fn().mockResolvedValue({ id: 'fav-1' }),
        upsert: vi.fn().mockResolvedValue({ id: 'fav-1' }),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      lesson: { findMany: vi.fn().mockResolvedValue([]) },
      material: { findMany: vi.fn().mockResolvedValue([]) },
      job: { findMany: vi.fn().mockResolvedValue([]) },
      ...overrides.prisma,
    },
    ...overrides,
  } as any;
}

beforeEach(() => vi.clearAllMocks());

describe('favorite router', () => {
  it('exposes the three favoritable item types', () => {
    expect(ITEM_TYPES).toEqual(['LESSON', 'JOB', 'MATERIAL']);
  });

  describe('add', () => {
    it.skip('writes a row scoped to ctx.user.id, never from input (IDOR guard) — pending 61-06', async () => {
      // GREEN (61-06):
      //   const { favoriteRouter } = await import('../favorite');
      //   const ctx = makeCtx();
      //   const caller = favoriteRouter.createCaller(ctx);
      //   await caller.add({ itemType: 'LESSON', itemId: 'l-1' });
      //   const arg = ctx.prisma.favorite.create.mock.calls[0][0]
      //            ?? ctx.prisma.favorite.upsert.mock.calls[0][0];
      //   // userId MUST come from ctx.user.id — never echoed back from input.
      //   expect(arg.data?.userId ?? arg.create?.userId).toBe(ctx.user.id);
      const ctx = makeCtx();
      expect(ctx.user.id).toBe('user-1');
    });

    it.skip('is idempotent via @@unique([userId,itemType,itemId]) (upsert / skipDuplicates) — pending 61-06', async () => {
      // Adding the same (itemType,itemId) twice must not create a second row.
      expect(true).toBe(true);
    });
  });

  describe('remove', () => {
    it.skip('deleteMany by { userId: ctx.user.id, itemType, itemId } — pending 61-06', async () => {
      // GREEN (61-06): assert deleteMany.where.userId === ctx.user.id and that
      // an attacker-supplied userId in input is ignored.
      const ctx = makeCtx();
      expect(ctx.prisma.favorite.deleteMany).toBeDefined();
    });
  });

  describe('list', () => {
    it.skip('filters by ctx.user.id and resolves itemId entities with isHidden:false, skipping dangling refs — pending 61-06', async () => {
      // D-10: hidden lessons/materials (or course.isHidden) are excluded; a
      // Favorite whose itemId no longer resolves is silently dropped, not 500.
      const ctx = makeCtx();
      expect(ctx.prisma.favorite.findMany).toBeDefined();
    });
  });

  describe('isFavorited', () => {
    it.skip('batch: { items:{itemType,itemId}[] } → map/Set keyed by item, scoped to ctx.user.id — pending 61-06', async () => {
      // Seeds heart state in catalogs without N+1 per card.
      const ctx = makeCtx();
      expect(ctx.user.id).toBe('user-1');
    });
  });
});
