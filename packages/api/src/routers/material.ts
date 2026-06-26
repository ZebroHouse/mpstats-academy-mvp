/**
 * Material Router — Lesson learning materials (Phase 49)
 *
 * Procedures:
 *  - list, getById          : adminProcedure (read access)
 *  - create, update, delete : adminProcedure (CUD)
 *  - attach, detach         : adminProcedure (lesson links)
 *  - requestUploadUrl       : adminProcedure (Storage write)
 *  - getSignedUrl           : protectedProcedure (user download with ACL)
 *
 * ACL: getSignedUrl возвращает signed URL только если у юзера активна подписка на
 * хотя бы один прикреплённый видимый урок (D-23, D-39).
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { MaterialType } from '@mpstats/db';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { handleDatabaseError } from '../utils/db-errors';
import { checkLessonAccess } from '../utils/access';
import {
  MATERIAL_TYPE_VALUES,
  MATERIAL_ALLOWED_MIME_TYPES,
  MATERIAL_MAX_FILE_SIZE,
  MATERIAL_SIGNED_URL_TTL,
  MATERIAL_STORAGE_BUCKET,
} from '@mpstats/shared';

// Sentry — optional. В юнит-тестах модуль мокается. В рантайме (Next.js)
// доступен через @sentry/nextjs, но пакет @mpstats/api не должен от него зависеть
// напрямую (server-only / Edge коллизии). Поэтому используем мягкий contract.
type SentryLike = {
  captureException: (e: unknown, ctx?: any) => void;
  startSpan: <T>(opts: { name: string; op?: string }, fn: () => Promise<T> | T) => Promise<T>;
};
const sentryFallback: SentryLike = {
  captureException: () => undefined,
  startSpan: async (_o, fn) => fn(),
};
let sentryRef: SentryLike = sentryFallback;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod: any = require('@sentry/nextjs');
  if (mod?.captureException && mod?.startSpan) {
    sentryRef = {
      captureException: mod.captureException.bind(mod),
      startSpan: mod.startSpan.bind(mod),
    };
  }
} catch {
  // Sentry not installed in this context (tests, non-Next builds) — fallback noop
}

let supabaseAdmin: SupabaseClient | null = null;
function getSupabaseAdmin(): SupabaseClient {
  if (!supabaseAdmin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) {
      throw new Error('Supabase service role not configured');
    }
    supabaseAdmin = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return supabaseAdmin;
}

// ============== Schemas ==============

const materialTypeSchema = z.nativeEnum(MaterialType);
const mimeSchema = z.enum(
  MATERIAL_ALLOWED_MIME_TYPES as unknown as [string, ...string[]],
);
// MATERIAL_TYPE_VALUES is shared with UI/forms; runtime parity ensured by prisma enum.
void MATERIAL_TYPE_VALUES;

const createInputSchema = z
  .object({
    type: materialTypeSchema,
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    ctaText: z.string().min(1).max(60),
    externalUrl: z.string().url().optional(),
    storagePath: z.string().optional(),
    fileSize: z.number().int().positive().max(MATERIAL_MAX_FILE_SIZE).optional(),
    fileMimeType: mimeSchema.optional(),
    isStandalone: z.boolean().default(false),
  })
  .refine((d) => Boolean(d.externalUrl) !== Boolean(d.storagePath), {
    message:
      'Exactly one of externalUrl or storagePath must be set (D-03)',
  });

const updateInputSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  ctaText: z.string().min(1).max(60).optional(),
  externalUrl: z.string().url().nullable().optional(),
  storagePath: z.string().nullable().optional(),
  isStandalone: z.boolean().optional(),
  isHidden: z.boolean().optional(),
});

// ============== Router ==============

export const materialRouter = router({
  // ===== READ =====

  list: adminProcedure
    .input(
      z.object({
        type: materialTypeSchema.optional(),
        courseId: z.string().optional(),
        search: z.string().optional(),
        includeHidden: z.boolean().default(false),
        limit: z.number().int().min(1).max(100).default(20),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        const where: any = {};
        if (input.type) where.type = input.type;
        if (!input.includeHidden) where.isHidden = false;
        if (input.search) {
          where.title = { contains: input.search, mode: 'insensitive' };
        }
        if (input.courseId) {
          where.lessons = {
            some: { lesson: { courseId: input.courseId } },
          };
        }

        const items = await ctx.prisma.material.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: input.limit,
          ...(input.cursor
            ? { cursor: { id: input.cursor }, skip: 1 }
            : {}),
          include: {
            _count: { select: { lessons: true } },
          },
        });

        const totalCount = await ctx.prisma.material.count({ where });

        return {
          items,
          totalCount,
          nextCursor:
            items.length === input.limit ? items[items.length - 1].id : null,
        };
      } catch (e) {
        handleDatabaseError(e);
      }
    }),

  getById: adminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      try {
        const material = await ctx.prisma.material.findUnique({
          where: { id: input.id },
          include: {
            lessons: {
              orderBy: { order: 'asc' },
              include: {
                lesson: {
                  select: {
                    id: true,
                    title: true,
                    courseId: true,
                    course: { select: { title: true } },
                  },
                },
              },
            },
          },
        });
        if (!material) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Material not found',
          });
        }
        return material;
      } catch (e) {
        if (e instanceof TRPCError) throw e;
        handleDatabaseError(e);
      }
    }),

  /**
   * listForUser (D-05) — user-facing read для каталога «База знаний».
   *
   * Отличия от admin `list`:
   *  - protectedProcedure (любой залогиненный юзер), НЕ adminProcedure.
   *  - ВСЕГДА форсит `where.isHidden = false` — нет `includeHidden` escape (T-61-03-01).
   *  - возвращает standalone (isStandalone=true) И lesson-attached материалы.
   *  - НИКОГДА не отдаёт storagePath клиенту — только hasFile boolean (State 49-02).
   *
   * Download ACL (getSignedUrl) НЕ трогается: standalone = externalUrl-only этот pass (A8).
   */
  listForUser: protectedProcedure
    .input(
      z.object({
        type: materialTypeSchema.optional(),
        search: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(50),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        const where: any = { isHidden: false };
        if (input.type) where.type = input.type;
        if (input.search) {
          where.title = { contains: input.search, mode: 'insensitive' };
        }

        const rows = await ctx.prisma.material.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: input.limit,
          ...(input.cursor
            ? { cursor: { id: input.cursor }, skip: 1 }
            : {}),
          select: {
            id: true,
            type: true,
            title: true,
            description: true,
            ctaText: true,
            externalUrl: true,
            isStandalone: true,
            // storagePath НЕ выбираем для клиента — деривируем hasFile из его
            // наличия через отдельный boolean-флаг ниже (State 49-02).
            storagePath: true,
          },
        });

        // Маппим storagePath → hasFile boolean, storagePath НИКОГДА не уходит клиенту.
        const items = rows.map(({ storagePath, ...rest }) => ({
          ...rest,
          hasFile: storagePath != null,
        }));

        return {
          items,
          nextCursor:
            items.length === input.limit ? items[items.length - 1].id : null,
        };
      } catch (e) {
        handleDatabaseError(e);
      }
    }),

  // ===== CREATE / UPDATE / DELETE =====

  create: adminProcedure
    .input(createInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const material = await ctx.prisma.material.create({
          data: { ...input, createdBy: ctx.user.id },
        });
        return material;
      } catch (e) {
        handleDatabaseError(e);
      }
    }),

  update: adminProcedure
    .input(updateInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const { id, ...rest } = input;
        // XOR check on update if both fields touched
        if (
          rest.externalUrl !== undefined &&
          rest.storagePath !== undefined
        ) {
          if (Boolean(rest.externalUrl) === Boolean(rest.storagePath)) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message:
                'Exactly one of externalUrl/storagePath required (D-03)',
            });
          }
        }
        const material = await ctx.prisma.material.update({
          where: { id },
          data: rest,
        });
        return material;
      } catch (e) {
        if (e instanceof TRPCError) throw e;
        handleDatabaseError(e);
      }
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        const material = await ctx.prisma.material.findUnique({
          where: { id: input.id },
        });
        if (!material) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Material not found',
          });
        }

        // D-14: Storage delete first, then DB soft-delete.
        // Failure on storage — orphan cron справится, поэтому НЕ откатываем.
        if (material.storagePath) {
          try {
            const sb = getSupabaseAdmin();
            const { error } = await sb.storage
              .from(MATERIAL_STORAGE_BUCKET)
              .remove([material.storagePath]);
            if (error) {
              sentryRef.captureException(error, {
                tags: { route: 'material.delete', stage: 'storage' },
              });
            }
          } catch (storageErr) {
            sentryRef.captureException(storageErr, {
              tags: { route: 'material.delete', stage: 'storage' },
            });
          }
        }
        await ctx.prisma.material.update({
          where: { id: input.id },
          data: { isHidden: true },
        });
        return { success: true };
      } catch (e) {
        if (e instanceof TRPCError) throw e;
        handleDatabaseError(e);
      }
    }),

  // ===== ATTACH / DETACH =====

  attach: adminProcedure
    .input(
      z.object({
        materialId: z.string().min(1),
        lessonId: z.string().min(1),
        order: z.number().int().min(0).default(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const link = await ctx.prisma.lessonMaterial.upsert({
          where: {
            lessonId_materialId: {
              lessonId: input.lessonId,
              materialId: input.materialId,
            },
          },
          create: {
            lessonId: input.lessonId,
            materialId: input.materialId,
            order: input.order,
          },
          update: { order: input.order },
        });
        return link;
      } catch (e) {
        handleDatabaseError(e);
      }
    }),

  detach: adminProcedure
    .input(
      z.object({
        materialId: z.string().min(1),
        lessonId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await ctx.prisma.lessonMaterial.delete({
          where: {
            lessonId_materialId: {
              lessonId: input.lessonId,
              materialId: input.materialId,
            },
          },
        });
        return { success: true };
      } catch (e) {
        handleDatabaseError(e);
      }
    }),

  // ===== STORAGE =====

  /**
   * Возвращает signed PUT URL для загрузки файла в Storage до создания material.
   *
   * ARCHITECTURAL NOTE (compromise vs D-09):
   * Используем upload-id (Date.now() + random) как proxy для materialId, потому что
   * materialId создаётся только в material.create — а файл нужно загрузить ДО create,
   * чтобы передать storagePath в input. Альтернатива (два round-trips: create empty
   * material → get id → upload → update) хуже UX. Storage path остаётся
   * `{type}/{upload-id}/{filename}` навсегда — материал получит свой id, но storagePath
   * продолжит указывать на upload-id-path. Работает функционально (signed URL по path),
   * но архитектурно отличается от "идеального" `{type}/{materialId}/{filename}`.
   */
  requestUploadUrl: adminProcedure
    .input(
      z.object({
        type: materialTypeSchema,
        filename: z.string().min(1).max(200),
        mimeType: mimeSchema,
        fileSize: z
          .number()
          .int()
          .positive()
          .max(MATERIAL_MAX_FILE_SIZE),
      }),
    )
    .mutation(async ({ input }) => {
      const sb = getSupabaseAdmin();
      const tmpId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `${input.type.toLowerCase()}/${tmpId}/${safeName}`;
      const { data, error } = await sb.storage
        .from(MATERIAL_STORAGE_BUCKET)
        .createSignedUploadUrl(storagePath);
      if (error || !data) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error?.message || 'Failed to create upload URL',
        });
      }
      return {
        storagePath,
        uploadUrl: data.signedUrl,
        token: data.token,
      };
    }),

  /**
   * Выдаёт временный signed URL для скачивания (TTL 3600s) после ACL-проверки.
   *
   * ACL (D-23, D-39): хотя бы один прикреплённый и видимый урок должен быть доступен
   * юзеру (active subscription на Course/Platform или free lesson по order≤2).
   * Hidden material → NOT_FOUND. Material без storagePath (только externalUrl) → BAD_REQUEST.
   *
   * PERF (W#1): фильтр isHidden у уроков — на уровне БД через include-where.
   * Уменьшает payload и работает корректно при N связанных уроках.
   */
  getSignedUrl: protectedProcedure
    .input(z.object({ materialId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      return await sentryRef.startSpan(
        { name: 'material.getSignedUrl', op: 'storage' },
        async () => {
          try {
            const material = await ctx.prisma.material.findUnique({
              where: { id: input.materialId },
              include: {
                lessons: {
                  where: { lesson: { isHidden: false } },
                  include: {
                    lesson: {
                      select: {
                        id: true,
                        order: true,
                        courseId: true,
                      },
                    },
                  },
                },
              },
            });
            if (!material || material.isHidden) {
              throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'Material not found',
              });
            }
            if (!material.storagePath) {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message:
                  'Material has no storage file (external URL only)',
              });
            }

            // D-23 ACL: хотя бы один видимый прикреплённый урок должен быть доступен
            if (material.lessons.length === 0) {
              throw new TRPCError({
                code: 'FORBIDDEN',
                message:
                  'Material is not attached to any visible lesson',
              });
            }

            let allowed = false;
            for (const lm of material.lessons) {
              const access = await checkLessonAccess(
                ctx.user.id,
                {
                  id: lm.lesson.id,
                  order: lm.lesson.order,
                  courseId: lm.lesson.courseId,
                },
                ctx.prisma,
              );
              if (access.hasAccess) {
                allowed = true;
                break;
              }
            }
            if (!allowed) {
              throw new TRPCError({
                code: 'FORBIDDEN',
                message:
                  'No active subscription for any attached lesson',
              });
            }

            const sb = getSupabaseAdmin();
            const { data, error } = await sb.storage
              .from(MATERIAL_STORAGE_BUCKET)
              .createSignedUrl(
                material.storagePath,
                MATERIAL_SIGNED_URL_TTL,
              );
            if (error || !data) {
              throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message:
                  error?.message || 'Failed to create signed URL',
              });
            }
            return {
              signedUrl: data.signedUrl,
              expiresIn: MATERIAL_SIGNED_URL_TTL,
            };
          } catch (e) {
            if (e instanceof TRPCError) throw e;
            handleDatabaseError(e);
          }
        },
      );
    }),
});
