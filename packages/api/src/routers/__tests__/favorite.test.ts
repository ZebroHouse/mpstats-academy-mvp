import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FavoriteItemType } from '@mpstats/db';
import { favoriteRouter } from '../favorite';

/**
 * GREEN (Phase 61, 61-06) — favorite router behavioral suite.
 *
 * SECURITY CONTRACT (T-IDOR-fav / T-61-06-01): every write/read is scoped by
 * `ctx.user.id`, NEVER by a userId taken from `input`. The assertions below
 * encode that — an attacker-supplied userId in input is ignored.
 */

const ITEM_TYPES = ['LESSON', 'JOB', 'MATERIAL'] as const;

function makeCtx(overrides: any = {}) {
  const { prisma: prismaOverride, ...rest } = overrides;
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
      ...prismaOverride,
      // protectedProcedure middleware fire-and-forgets lastActiveAt via userProfile —
      // placed AFTER override spread so a test's `prisma` override can never wipe it.
      userProfile: {
        findUnique: vi.fn().mockResolvedValue({ lastActiveAt: new Date() }),
        update: vi.fn().mockResolvedValue({}),
      },
    },
    ...rest,
  } as any;
}

beforeEach(() => vi.clearAllMocks());

describe('favorite router', () => {
  it('exposes the three favoritable item types', () => {
    expect(ITEM_TYPES).toEqual(['LESSON', 'JOB', 'MATERIAL']);
    expect(Object.values(FavoriteItemType).sort()).toEqual(
      [...ITEM_TYPES].sort(),
    );
  });

  describe('add', () => {
    it('writes a row scoped to ctx.user.id, never from input (IDOR guard)', async () => {
      const ctx = makeCtx();
      const caller = favoriteRouter.createCaller(ctx);
      // attacker tries to inject a userId — it must be ignored.
      await caller.add({
        itemType: FavoriteItemType.LESSON,
        itemId: 'l-1',
        userId: 'attacker-id',
      } as any);

      const arg = ctx.prisma.favorite.upsert.mock.calls[0][0];
      // userId MUST come from ctx.user.id in both where and create.
      expect(arg.where.userId_itemType_itemId.userId).toBe(ctx.user.id);
      expect(arg.create.userId).toBe(ctx.user.id);
      expect(arg.create.userId).not.toBe('attacker-id');
    });

    it('is idempotent via @@unique([userId,itemType,itemId]) (upsert no-op on update)', async () => {
      const ctx = makeCtx();
      const caller = favoriteRouter.createCaller(ctx);
      await caller.add({ itemType: FavoriteItemType.JOB, itemId: 'j-1' });

      const arg = ctx.prisma.favorite.upsert.mock.calls[0][0];
      // upsert keyed on the composite unique; update is a no-op (idempotent).
      expect(arg.where.userId_itemType_itemId).toMatchObject({
        userId: ctx.user.id,
        itemType: FavoriteItemType.JOB,
        itemId: 'j-1',
      });
      expect(arg.update).toEqual({});
    });
  });

  describe('remove', () => {
    it('deleteMany by { userId: ctx.user.id, itemType, itemId }, ignoring input userId', async () => {
      const ctx = makeCtx();
      const caller = favoriteRouter.createCaller(ctx);
      await caller.remove({
        itemType: FavoriteItemType.MATERIAL,
        itemId: 'm-1',
        userId: 'attacker-id',
      } as any);

      const arg = ctx.prisma.favorite.deleteMany.mock.calls[0][0];
      expect(arg.where.userId).toBe(ctx.user.id);
      expect(arg.where.userId).not.toBe('attacker-id');
      expect(arg.where).toMatchObject({
        itemType: FavoriteItemType.MATERIAL,
        itemId: 'm-1',
      });
    });
  });

  describe('list', () => {
    it('filters by ctx.user.id and resolves itemId entities with isHidden:false, skipping dangling refs', async () => {
      const ctx = makeCtx({
        prisma: {
          favorite: {
            findMany: vi.fn().mockResolvedValue([
              { itemType: 'LESSON', itemId: 'l-visible', createdAt: new Date('2026-06-03') },
              { itemType: 'LESSON', itemId: 'l-hidden', createdAt: new Date('2026-06-02') },
              { itemType: 'JOB', itemId: 'j-dangling', createdAt: new Date('2026-06-01') },
            ]),
          },
          // resolution: only the visible lesson comes back; hidden + dangling are absent.
          lesson: {
            findMany: vi.fn().mockResolvedValue([
              { id: 'l-visible', title: 'Visible', courseId: 'c-1', duration: 10 },
            ]),
          },
          job: { findMany: vi.fn().mockResolvedValue([]) },
          material: { findMany: vi.fn().mockResolvedValue([]) },
        },
      });
      const caller = favoriteRouter.createCaller(ctx);
      const res = await caller.list();

      // favorite.findMany scoped to user.
      expect(ctx.prisma.favorite.findMany.mock.calls[0][0].where.userId).toBe(
        ctx.user.id,
      );
      // lesson resolution forces isHidden:false + course.isHidden:false (D-10).
      const lessonWhere = ctx.prisma.lesson.findMany.mock.calls[0][0].where;
      expect(lessonWhere.isHidden).toBe(false);
      expect(lessonWhere.course).toEqual({ isHidden: false });
      // only the resolvable visible lesson survives; hidden + dangling dropped.
      expect(res!.items).toHaveLength(1);
      expect(res!.items[0]).toMatchObject({
        itemType: 'LESSON',
        itemId: 'l-visible',
      });
    });

    it('honors optional itemType filter scoped to ctx.user.id', async () => {
      const ctx = makeCtx();
      const caller = favoriteRouter.createCaller(ctx);
      await caller.list({ itemType: FavoriteItemType.JOB });
      const where = ctx.prisma.favorite.findMany.mock.calls[0][0].where;
      expect(where.userId).toBe(ctx.user.id);
      expect(where.itemType).toBe(FavoriteItemType.JOB);
    });
  });

  describe('isFavorited', () => {
    it('batch: { items:{itemType,itemId}[] } → keys of favorited items, scoped to ctx.user.id', async () => {
      const ctx = makeCtx({
        prisma: {
          favorite: {
            findMany: vi.fn().mockResolvedValue([
              { itemType: 'LESSON', itemId: 'l-1' },
            ]),
          },
        },
      });
      const caller = favoriteRouter.createCaller(ctx);
      const res = await caller.isFavorited({
        items: [
          { itemType: FavoriteItemType.LESSON, itemId: 'l-1' },
          { itemType: FavoriteItemType.JOB, itemId: 'j-1' },
        ],
      });

      // scoped to user; uses a single OR query (no N+1).
      expect(ctx.prisma.favorite.findMany.mock.calls[0][0].where.userId).toBe(
        ctx.user.id,
      );
      expect(res!.favorited).toEqual(['LESSON:l-1']);
    });

    it('returns empty for empty input without querying favorites', async () => {
      const ctx = makeCtx();
      const caller = favoriteRouter.createCaller(ctx);
      const res = await caller.isFavorited({ items: [] });
      expect(res!.favorited).toEqual([]);
      expect(ctx.prisma.favorite.findMany).not.toHaveBeenCalled();
    });
  });
});
