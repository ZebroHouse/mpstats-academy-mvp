/**
 * Favorite Router — полиморфное «избранное» (Phase 61, D-06).
 *
 * Procedures (все protectedProcedure):
 *  - add          : создаёт favorite-строку, scoped по ctx.user.id (идемпотентно через upsert)
 *  - remove       : deleteMany по { userId: ctx.user.id, itemType, itemId }
 *  - list         : строки юзера + резолв itemId→сущность с isHidden:false, dangling-refs тихо отброшены
 *  - isFavorited  : batch-проверка набора (itemType,itemId) → отмеченные, без N+1
 *
 * SECURITY (T-61-06-01, IDOR): userId ВСЕГДА из ctx.user.id, НИКОГДА из input.
 * input несёт только { itemType, itemId } — никакого userId.
 *
 * D-10 (T-61-06-02/03): list резолвит ссылки с isHidden:false (+ course.isHidden:false
 * для уроков) и тихо пропускает повисшие/скрытые ссылки (app-level integrity, FK на itemId нет).
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { FavoriteItemType } from '@mpstats/db';
import { router, protectedProcedure } from '../trpc';
import { handleDatabaseError } from '../utils/db-errors';

const itemTypeSchema = z.nativeEnum(FavoriteItemType);

const itemRefSchema = z.object({
  itemType: itemTypeSchema,
  itemId: z.string().min(1),
});

export const favoriteRouter = router({
  /**
   * Добавить элемент в избранное. Идемпотентно: повторный add того же
   * (itemType,itemId) для юзера — no-op (upsert на @@unique([userId,itemType,itemId])).
   * userId берётся ТОЛЬКО из ctx.user.id.
   */
  add: protectedProcedure
    .input(itemRefSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await ctx.prisma.favorite.upsert({
          where: {
            userId_itemType_itemId: {
              userId: ctx.user.id,
              itemType: input.itemType,
              itemId: input.itemId,
            },
          },
          create: {
            userId: ctx.user.id,
            itemType: input.itemType,
            itemId: input.itemId,
          },
          update: {},
        });
      } catch (e) {
        if (e instanceof TRPCError) throw e;
        handleDatabaseError(e);
      }
    }),

  /**
   * Убрать элемент из избранного. deleteMany scoped по ctx.user.id —
   * чужую строку удалить невозможно.
   */
  remove: protectedProcedure
    .input(itemRefSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const res = await ctx.prisma.favorite.deleteMany({
          where: {
            userId: ctx.user.id,
            itemType: input.itemType,
            itemId: input.itemId,
          },
        });
        return { removed: res.count };
      } catch (e) {
        if (e instanceof TRPCError) throw e;
        handleDatabaseError(e);
      }
    }),

  /**
   * Список избранного юзера с резолвом сущностей.
   * Опциональный фильтр по itemType. Скрытые (isHidden) и повисшие ссылки
   * тихо отбрасываются (D-10).
   */
  list: protectedProcedure
    .input(
      z
        .object({ itemType: itemTypeSchema.optional() })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      try {
        const favorites = await ctx.prisma.favorite.findMany({
          where: {
            userId: ctx.user.id,
            ...(input?.itemType ? { itemType: input.itemType } : {}),
          },
          orderBy: { createdAt: 'desc' },
        });

        if (favorites.length === 0) {
          return { items: [] as ResolvedFavorite[] };
        }

        // Группируем itemId по типу для batch-резолва (без N+1).
        const lessonIds = favorites
          .filter((f) => f.itemType === FavoriteItemType.LESSON)
          .map((f) => f.itemId);
        const jobIds = favorites
          .filter((f) => f.itemType === FavoriteItemType.JOB)
          .map((f) => f.itemId);
        const materialIds = favorites
          .filter((f) => f.itemType === FavoriteItemType.MATERIAL)
          .map((f) => f.itemId);

        const [lessons, jobs, materials] = await Promise.all([
          lessonIds.length
            ? ctx.prisma.lesson.findMany({
                // D-10: скрытый урок ИЛИ скрытый курс → не отдаём.
                where: {
                  id: { in: lessonIds },
                  isHidden: false,
                  course: { isHidden: false },
                },
                select: {
                  id: true,
                  title: true,
                  courseId: true,
                  duration: true,
                },
              })
            : Promise.resolve([]),
          jobIds.length
            ? ctx.prisma.job.findMany({
                // Job использует isPublished (не isHidden) — неопубликованные скрыты.
                where: { id: { in: jobIds }, isPublished: true },
                select: { id: true, slug: true, title: true },
              })
            : Promise.resolve([]),
          materialIds.length
            ? ctx.prisma.material.findMany({
                where: { id: { in: materialIds }, isHidden: false },
                select: { id: true, type: true, title: true },
              })
            : Promise.resolve([]),
        ]);

        const lessonMap = new Map(lessons.map((l) => [l.id, l]));
        const jobMap = new Map(jobs.map((j) => [j.id, j]));
        const materialMap = new Map(materials.map((m) => [m.id, m]));

        // Сохраняем порядок favorites (createdAt desc), отбрасывая dangling/hidden.
        const items: ResolvedFavorite[] = [];
        for (const fav of favorites) {
          if (fav.itemType === FavoriteItemType.LESSON) {
            const entity = lessonMap.get(fav.itemId);
            if (entity) {
              items.push({
                itemType: FavoriteItemType.LESSON,
                itemId: fav.itemId,
                favoritedAt: fav.createdAt,
                entity,
              });
            }
          } else if (fav.itemType === FavoriteItemType.JOB) {
            const entity = jobMap.get(fav.itemId);
            if (entity) {
              items.push({
                itemType: FavoriteItemType.JOB,
                itemId: fav.itemId,
                favoritedAt: fav.createdAt,
                entity,
              });
            }
          } else {
            const entity = materialMap.get(fav.itemId);
            if (entity) {
              items.push({
                itemType: FavoriteItemType.MATERIAL,
                itemId: fav.itemId,
                favoritedAt: fav.createdAt,
                entity,
              });
            }
          }
        }

        return { items };
      } catch (e) {
        if (e instanceof TRPCError) throw e;
        handleDatabaseError(e);
      }
    }),

  /**
   * Batch-проверка: какие из переданных (itemType,itemId) уже в избранном у юзера.
   * Заполняет состояние «сердечка» в каталогах без N+1 запросов.
   * Возвращает массив ключей `${itemType}:${itemId}` отмеченных элементов.
   */
  isFavorited: protectedProcedure
    .input(z.object({ items: z.array(itemRefSchema).max(500) }))
    .query(async ({ ctx, input }) => {
      try {
        if (input.items.length === 0) {
          return { favorited: [] as string[] };
        }

        const rows = await ctx.prisma.favorite.findMany({
          where: {
            userId: ctx.user.id,
            OR: input.items.map((it) => ({
              itemType: it.itemType,
              itemId: it.itemId,
            })),
          },
          select: { itemType: true, itemId: true },
        });

        const favorited = rows.map((r) => `${r.itemType}:${r.itemId}`);
        return { favorited };
      } catch (e) {
        if (e instanceof TRPCError) throw e;
        handleDatabaseError(e);
      }
    }),
});

type ResolvedFavorite =
  | {
      itemType: typeof FavoriteItemType.LESSON;
      itemId: string;
      favoritedAt: Date;
      entity: { id: string; title: string; courseId: string; duration: number | null };
    }
  | {
      itemType: typeof FavoriteItemType.JOB;
      itemId: string;
      favoritedAt: Date;
      entity: { id: string; slug: string; title: string };
    }
  | {
      itemType: typeof FavoriteItemType.MATERIAL;
      itemId: string;
      favoritedAt: Date;
      entity: { id: string; type: string; title: string };
    };
