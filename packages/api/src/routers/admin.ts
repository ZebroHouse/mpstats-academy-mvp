/**
 * Admin Router — Admin panel procedures for MPSTATS Academy.
 *
 * Most procedures use adminProcedure (requires ADMIN or SUPERADMIN role).
 * Privileged operations (changeUserRole, toggleUserField) use superadminProcedure.
 * Endpoints: getDashboardStats, getUsers, toggleUserField, changeUserRole, getCourses,
 *   updateLessonOrder, moveCourseToPosition, updateCourseTitle, updateLessonTitle,
 *   getComments, toggleCommentVisibility, getNewCommentsCount
 */

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, adminProcedure, superadminProcedure } from '../trpc';
import { handleDatabaseError } from '../utils/db-errors';
import { refreshBankForCategory } from '../utils/question-bank';
import { resolveIncludeHidden, canToggleHidden, type AdminRole } from '../utils/visibility';
import { createClient } from '@supabase/supabase-js';
import { adminAnalyticsRouter } from './admin-analytics';
import { adminJobsRouter } from './admin-jobs';
import { indexLessonText } from '@mpstats/ai';
import type { SkillCategory } from '@mpstats/shared';
import {
  LESSON_IMAGE_ALLOWED_MIME_TYPES,
  LESSON_IMAGE_MAX_FILE_SIZE,
  LESSON_IMAGE_STORAGE_BUCKET,
} from '@mpstats/shared';

// Lazy-initialized Supabase admin client (service role) for email lookups
let supabaseAdmin: ReturnType<typeof createClient> | null = null;

function getSupabaseAdmin() {
  if (!supabaseAdmin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SECRET_KEY;
    if (!url || !serviceKey) {
      throw new Error('SUPABASE_SECRET_KEY is not configured — email search unavailable');
    }
    supabaseAdmin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return supabaseAdmin;
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

const LESSON_IMAGES_PATH_MARKER = '/lesson-images/';

/**
 * Walk a TipTap document and collect the storage object paths of every embedded
 * image hosted in the `lesson-images` bucket (the part of the src after
 * `/lesson-images/`). Pure + exported so it can be unit-tested in isolation.
 */
export function extractLessonImagePaths(body: unknown): string[] {
  const paths: string[] = [];
  const walk = (n: any) => {
    if (!n || typeof n !== 'object') return;
    if (n.type === 'image' && typeof n.attrs?.src === 'string') {
      const i = n.attrs.src.indexOf(LESSON_IMAGES_PATH_MARKER);
      if (i >= 0) paths.push(n.attrs.src.slice(i + LESSON_IMAGES_PATH_MARKER.length));
    }
    if (Array.isArray(n.content)) n.content.forEach(walk);
  };
  walk(body);
  return paths;
}

export const adminRouter = router({
  // Analytics sub-router (getAnalytics, getActiveUserStats, getWatchStats)
  analytics: adminAnalyticsRouter,

  // Jobs sub-router (Phase C — getJobs, getJobLessons, searchLessons + mutations)
  job: adminJobsRouter,

  /**
   * Signed upload URL for an image embedded in a lesson body (TipTap).
   * Uploads land in the PUBLIC `lesson-images` bucket — we return both the
   * signed PUT URL and the resulting public object URL for embedding.
   */
  requestLessonImageUploadUrl: adminProcedure
    .input(
      z.object({
        filename: z.string().min(1).max(200),
        mimeType: z.enum(
          LESSON_IMAGE_ALLOWED_MIME_TYPES as unknown as [string, ...string[]],
        ),
        fileSize: z.number().int().positive().max(LESSON_IMAGE_MAX_FILE_SIZE),
      }),
    )
    .mutation(async ({ input }) => {
      const sb = getSupabaseAdmin();
      const tmpId = randomUUID();
      const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `${tmpId}/${safeName}`;
      const { data, error } = await sb.storage
        .from(LESSON_IMAGE_STORAGE_BUCKET)
        .createSignedUploadUrl(storagePath);
      if (error || !data) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error?.message ?? 'upload url failed',
        });
      }
      const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${LESSON_IMAGE_STORAGE_BUCKET}/${storagePath}`;
      return { uploadUrl: data.signedUrl, publicUrl };
    }),

  /**
   * Dashboard stats: total users, completed diagnostics, total lessons, recent registrations (7d).
   */
  getDashboardStats: adminProcedure.query(async ({ ctx }) => {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const [totalUsers, totalDiagnostics, totalLessons, recentRegistrations] =
        await Promise.all([
          ctx.prisma.userProfile.count(),
          ctx.prisma.diagnosticSession.count({ where: { status: 'COMPLETED' } }),
          ctx.prisma.lesson.count(),
          ctx.prisma.userProfile.count({
            where: { createdAt: { gte: sevenDaysAgo } },
          }),
        ]);

      return { totalUsers, totalDiagnostics, totalLessons, recentRegistrations };
    } catch (error) {
      handleDatabaseError(error);
    }
  }),

  /**
   * Recent activity: last registrations and completed diagnostics (last 7 days).
   */
  getRecentActivity: adminProcedure.query(async ({ ctx }) => {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const [recentUsers, recentDiagnostics] = await Promise.all([
        ctx.prisma.userProfile.findMany({
          where: { createdAt: { gte: sevenDaysAgo } },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { id: true, name: true, createdAt: true },
        }),
        ctx.prisma.diagnosticSession.findMany({
          where: {
            status: 'COMPLETED',
            completedAt: { gte: sevenDaysAgo },
          },
          orderBy: { completedAt: 'desc' },
          take: 10,
          include: {
            user: { select: { name: true } },
          },
        }),
      ]);

      // Merge and sort by date
      const events = [
        ...recentUsers.map((u) => ({
          type: 'registration' as const,
          userName: u.name || 'Unknown',
          date: u.createdAt,
        })),
        ...recentDiagnostics.map((d) => ({
          type: 'diagnostic' as const,
          userName: d.user.name || 'Unknown',
          date: d.completedAt || d.startedAt,
        })),
      ].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 10);

      return events;
    } catch (error) {
      handleDatabaseError(error);
    }
  }),

  /**
   * Paginated user list with search by name AND email.
   * Email search uses Supabase Admin API (auth.admin.listUsers) since emails
   * live in auth.users, not in UserProfile.
   */
  getUsers: adminProcedure
    .input(
      z.object({
        search: z.string().optional(),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        const { search, page, limit } = input;
        const skip = (page - 1) * limit;

        // Build where clause
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let where: any = {};

        if (search && search.trim().length > 0) {
          const term = search.trim();

          // 1. Search auth.users by email via Supabase Admin API
          let matchedAuthUserIds: string[] = [];
          try {
            const admin = getSupabaseAdmin();
            const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
            if (data?.users) {
              matchedAuthUserIds = data.users
                .filter((u) => u.email?.toLowerCase().includes(term.toLowerCase()))
                .map((u) => u.id);
            }
          } catch {
            // Service role key missing or API error — fall back to name-only search
          }

          // 2. Combine name search OR matched auth user IDs
          const conditions = [
            { name: { contains: term, mode: 'insensitive' as const } },
          ];
          if (matchedAuthUserIds.length > 0) {
            conditions.push({ id: { in: matchedAuthUserIds } } as any);
          }
          where = { OR: conditions };
        }

        const [users, totalCount] = await Promise.all([
          ctx.prisma.userProfile.findMany({
            where,
            skip,
            take: limit,
            orderBy: { createdAt: 'desc' },
            include: {
              _count: { select: { diagnosticSessions: true } },
            },
          }),
          ctx.prisma.userProfile.count({ where }),
        ]);

        // Fetch emails from Supabase auth.users for display
        let emailMap = new Map<string, string>();
        try {
          const admin = getSupabaseAdmin();
          const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
          if (data?.users) {
            data.users.forEach((u) => {
              if (u.email) emailMap.set(u.id, u.email);
            });
          }
        } catch {
          // Service role key missing — emails won't be shown
        }

        const usersWithEmail = users.map((u) => ({
          ...u,
          email: emailMap.get(u.id) || null,
        }));

        return {
          users: usersWithEmail,
          totalCount,
          page,
          limit,
          totalPages: Math.ceil(totalCount / limit),
        };
      } catch (error) {
        handleDatabaseError(error);
      }
    }),

  /**
   * Toggle isActive on UserProfile. SUPERADMIN only.
   * Self-deactivation is not allowed.
   */
  toggleUserField: superadminProcedure
    .input(
      z.object({
        userId: z.string(),
        field: z.enum(['isActive', 'isTest']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const { userId, field } = input;

        // Self-deactivation guard
        if (field === 'isActive' && userId === ctx.user.id) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Cannot deactivate your own account',
          });
        }

        const profile = await ctx.prisma.userProfile.findUnique({
          where: { id: userId },
          select: { [field]: true },
        });

        if (!profile) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
        }

        const currentValue = (profile as unknown as Record<string, boolean>)[field];

        const updated = await ctx.prisma.userProfile.update({
          where: { id: userId },
          data: { [field]: !currentValue },
        });

        return updated;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        handleDatabaseError(error);
      }
    }),

  /**
   * Change a user's role. SUPERADMIN only.
   * Self-demotion guard: SUPERADMIN cannot change own role.
   */
  changeUserRole: superadminProcedure
    .input(
      z.object({
        userId: z.string(),
        role: z.enum(['USER', 'ADMIN', 'SUPERADMIN', 'SALES']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { userId, role } = input;

      // Self-demotion guard
      if (userId === ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Cannot change your own role',
        });
      }

      const profile = await ctx.prisma.userProfile.findUnique({
        where: { id: userId },
      });
      if (!profile) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      }

      const updated = await ctx.prisma.userProfile.update({
        where: { id: userId },
        data: { role },
      });
      return updated;
    }),

  /**
   * List all courses with lesson count and content chunk count.
   *
   * Visibility rules:
   *   - ADMIN:      hidden courses and hidden lessons are excluded entirely.
   *   - SUPERADMIN: everything visible; ?includeHidden=false hides them optionally.
   *
   * lessonCount / chunkCount reflect the same visibility scope so the totals the
   * admin sees match what users see.
   */
  getCourses: adminProcedure
    .input(
      z
        .object({
          includeHidden: z.boolean().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      try {
        const includeHidden = resolveIncludeHidden(
          ctx.userRole as AdminRole,
          input?.includeHidden,
        );

        const courses = await ctx.prisma.course.findMany({
          where: includeHidden ? {} : { isHidden: false },
          orderBy: { order: 'asc' },
          include: {
            _count: {
              select: {
                lessons: includeHidden
                  ? true
                  : { where: { isHidden: false } },
              },
            },
          },
        });

        // Get content chunk counts per course (via lesson_id prefix matching)
        // Exclude chunks of hidden lessons when includeHidden is false
        const coursesWithChunks = await Promise.all(
          courses.map(async (course) => {
            let chunkCount: number;
            if (includeHidden) {
              chunkCount = await ctx.prisma.contentChunk.count({
                where: { lessonId: { startsWith: course.id } },
              });
            } else {
              // Filter chunks via join on Lesson.isHidden through raw SQL — Prisma
              // ContentChunk has no FK to Lesson, so we use a subquery.
              const result = await ctx.prisma.$queryRaw<Array<{ count: bigint }>>`
                SELECT COUNT(*)::bigint AS count
                FROM content_chunk c
                WHERE c.lesson_id LIKE ${course.id + '%'}
                  AND EXISTS (
                    SELECT 1 FROM "Lesson" l
                    WHERE l.id = c.lesson_id AND l."isHidden" = false
                  )
              `;
              chunkCount = Number(result[0]?.count ?? 0);
            }
            return {
              ...course,
              chunkCount,
            };
          }),
        );

        return coursesWithChunks;
      } catch (error) {
        handleDatabaseError(error);
      }
    }),

  /**
   * Get lessons for a specific course (used by CourseManager accordion).
   *
   * ADMIN sees only visible lessons. SUPERADMIN sees all by default; can opt-out
   * via includeHidden=false.
   */
  getCourseLessons: adminProcedure
    .input(
      z.object({
        courseId: z.string(),
        includeHidden: z.boolean().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        const includeHidden = resolveIncludeHidden(
          ctx.userRole as AdminRole,
          input.includeHidden,
        );

        const lessons = await ctx.prisma.lesson.findMany({
          where: includeHidden
            ? { courseId: input.courseId }
            : { courseId: input.courseId, isHidden: false },
          orderBy: { order: 'asc' },
          select: {
            id: true,
            title: true,
            order: true,
            skillCategory: true,
            videoId: true,
            duration: true,
            isHidden: true,
            hiddenAt: true,
            contentType: true,
            contentStatus: true,
          },
        });
        return lessons;
      } catch (error) {
        handleDatabaseError(error);
      }
    }),

  /**
   * Toggle lesson visibility (soft-hide). ADMIN and SUPERADMIN allowed.
   *
   * Behavior:
   *   - ADMIN can only hide (setting hidden=true). Unhide is restricted to
   *     SUPERADMIN to prevent self-undoing: once an ADMIN hides a lesson they
   *     lose sight of it and cannot reach it via the UI anyway.
   *   - SUPERADMIN can both hide and unhide.
   *
   * The embedding data, video, and progress records are preserved — only the
   * isHidden flag flips.
   */
  toggleLessonHidden: adminProcedure
    .input(
      z.object({
        lessonId: z.string(),
        hidden: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        if (!canToggleHidden(ctx.userRole as AdminRole, input.hidden)) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Только суперадмин может вернуть скрытый урок',
          });
        }

        const lesson = await ctx.prisma.lesson.findUnique({
          where: { id: input.lessonId },
          select: { id: true, isHidden: true },
        });
        if (!lesson) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Lesson not found' });
        }

        const updated = await ctx.prisma.lesson.update({
          where: { id: input.lessonId },
          data: {
            isHidden: input.hidden,
            hiddenBy: input.hidden ? ctx.user.id : null,
            hiddenAt: input.hidden ? new Date() : null,
          },
        });

        return updated;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        handleDatabaseError(error);
      }
    }),

  /**
   * Toggle course visibility (soft-hide the entire course).
   *
   * When a course is hidden, all its lessons become inaccessible to users
   * regardless of their individual isHidden flag, because learning queries
   * filter courses before lessons. Used for the «Экспресс-курсы» removal case.
   *
   * Same role logic as toggleLessonHidden.
   */
  toggleCourseHidden: adminProcedure
    .input(
      z.object({
        courseId: z.string(),
        hidden: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        if (!canToggleHidden(ctx.userRole as AdminRole, input.hidden)) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Только суперадмин может вернуть скрытый курс',
          });
        }

        const course = await ctx.prisma.course.findUnique({
          where: { id: input.courseId },
          select: { id: true, isHidden: true },
        });
        if (!course) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Course not found' });
        }

        const updated = await ctx.prisma.course.update({
          where: { id: input.courseId },
          data: {
            isHidden: input.hidden,
            hiddenBy: input.hidden ? ctx.user.id : null,
            hiddenAt: input.hidden ? new Date() : null,
          },
        });

        return updated;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        handleDatabaseError(error);
      }
    }),

  /**
   * Move a lesson to a specific position within its course.
   * Shifts all lessons between old and new positions accordingly.
   *
   * Wrapped in a transaction with a temporary "parking" order so the
   * (courseId, order) UNIQUE constraint stays satisfied during shifts.
   * Without the parking step, the decrement/increment of the in-between
   * range collides with the lesson being moved before its final order
   * is written.
   */
  moveLessonToPosition: adminProcedure
    .input(
      z.object({
        lessonId: z.string(),
        targetPosition: z.number().int().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await ctx.prisma.$transaction(async (tx) => {
          const lesson = await tx.lesson.findUnique({
            where: { id: input.lessonId },
            select: { id: true, courseId: true, order: true },
          });
          if (!lesson) throw new Error('Lesson not found');

          const oldPos = lesson.order;
          const newPos = input.targetPosition;
          if (oldPos === newPos) return lesson;

          const count = await tx.lesson.count({ where: { courseId: lesson.courseId } });
          const clampedNew = Math.min(Math.max(newPos, 1), count);

          // Park the moving lesson outside the valid range so shifts can
          // freely traverse its old slot without UNIQUE collisions.
          const PARK = 1_000_000;
          await tx.lesson.update({
            where: { id: input.lessonId },
            data: { order: PARK },
          });

          if (oldPos < clampedNew) {
            await tx.lesson.updateMany({
              where: {
                courseId: lesson.courseId,
                order: { gt: oldPos, lte: clampedNew },
              },
              data: { order: { decrement: 1 } },
            });
          } else {
            await tx.lesson.updateMany({
              where: {
                courseId: lesson.courseId,
                order: { gte: clampedNew, lt: oldPos },
              },
              data: { order: { increment: 1 } },
            });
          }

          return tx.lesson.update({
            where: { id: input.lessonId },
            data: { order: clampedNew },
          });
        });
      } catch (error) {
        handleDatabaseError(error);
      }
    }),

  /**
   * Move a course to a specific position among all courses.
   * Shifts all courses between old and new positions accordingly.
   */
  moveCourseToPosition: adminProcedure
    .input(
      z.object({
        courseId: z.string(),
        targetPosition: z.number().int().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const course = await ctx.prisma.course.findUnique({
          where: { id: input.courseId },
          select: { id: true, order: true },
        });
        if (!course) throw new Error('Course not found');

        const oldPos = course.order;
        const newPos = input.targetPosition;
        if (oldPos === newPos) return course;

        // Get all courses sorted by order
        const allCourses = await ctx.prisma.course.findMany({
          orderBy: { order: 'asc' },
          select: { id: true, order: true },
        });

        // Clamp target to valid range
        const maxPos = allCourses.length;
        const clampedNew = Math.min(Math.max(newPos, 1), maxPos);

        // Shift courses between old and new positions
        if (oldPos < clampedNew) {
          // Moving down: shift courses in (oldPos, clampedNew] up by 1
          await ctx.prisma.course.updateMany({
            where: {
              order: { gt: oldPos, lte: clampedNew },
            },
            data: { order: { decrement: 1 } },
          });
        } else {
          // Moving up: shift courses in [clampedNew, oldPos) down by 1
          await ctx.prisma.course.updateMany({
            where: {
              order: { gte: clampedNew, lt: oldPos },
            },
            data: { order: { increment: 1 } },
          });
        }

        // Place the course at target position
        const updated = await ctx.prisma.course.update({
          where: { id: input.courseId },
          data: { order: clampedNew },
        });

        return updated;
      } catch (error) {
        handleDatabaseError(error);
      }
    }),

  /**
   * Update a course title.
   */
  updateCourseTitle: adminProcedure
    .input(
      z.object({
        courseId: z.string(),
        title: z.string().min(1).max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const updated = await ctx.prisma.course.update({
          where: { id: input.courseId },
          data: { title: input.title },
        });
        return updated;
      } catch (error) {
        handleDatabaseError(error);
      }
    }),

  /**
   * Update a lesson title.
   */
  updateLessonTitle: adminProcedure
    .input(
      z.object({
        lessonId: z.string(),
        title: z.string().min(1).max(300),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const updated = await ctx.prisma.lesson.update({
          where: { id: input.lessonId },
          data: { title: input.title },
        });
        return updated;
      } catch (error) {
        handleDatabaseError(error);
      }
    }),

  /**
   * Create a DRAFT text/interactive lesson at the end of a course.
   * Admin-created lessons have no manifest, so we mint a synthetic id.
   * Drafts are hidden from students + RAG until published.
   */
  createLesson: adminProcedure
    .input(
      z.object({
        courseId: z.string().min(1),
        title: z.string().min(1).max(300),
        contentType: z.enum(['TEXT', 'INTERACTIVE']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const agg = await ctx.prisma.lesson.aggregate({
        where: { courseId: input.courseId },
        _max: { order: true },
      });
      const nextOrder = (agg._max.order ?? 0) + 1;
      const id = `${input.courseId}_text_${randomUUID()}`;

      const created = await ctx.prisma.lesson.create({
        data: {
          id,
          courseId: input.courseId,
          title: input.title,
          contentType: input.contentType,
          contentStatus: 'DRAFT',
          isHidden: true, // drafts are hidden from students + RAG until publish
          order: nextOrder,
          skillCategory: 'ANALYTICS', // default; methodologist refines later
        },
      });
      return { id: created.id };
    }),

  /**
   * Load a single lesson's editable fields for the admin text/interactive editor.
   */
  getLessonForEdit: adminProcedure
    .input(z.object({ lessonId: z.string() }))
    .query(async ({ ctx, input }) => {
      const lesson = await ctx.prisma.lesson.findUnique({
        where: { id: input.lessonId },
        select: {
          id: true,
          title: true,
          courseId: true,
          contentType: true,
          contentStatus: true,
          body: true,
        },
      });
      if (!lesson) throw new TRPCError({ code: 'NOT_FOUND' });
      return lesson;
    }),

  /**
   * Save lesson draft content (title + TipTap body).
   * Plain save: never publishes (contentStatus untouched), never indexes.
   * Publishing is a separate procedure.
   */
  updateLessonBody: adminProcedure
    .input(
      z.object({
        lessonId: z.string(),
        title: z.string().min(1).max(300),
        body: z.any(), // TipTap JSON document
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const updated = await ctx.prisma.lesson.update({
        where: { id: input.lessonId },
        data: { title: input.title, body: input.body },
        select: { id: true },
      });
      return updated;
    }),

  /**
   * Publish a draft lesson: index its body into content_chunk FIRST, then flip
   * contentStatus to PUBLISHED + isHidden=false. If indexing throws, abort —
   * we never publish unindexed content (students/RAG would see an empty lesson).
   */
  publishLesson: adminProcedure
    .input(z.object({ lessonId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const lesson = await ctx.prisma.lesson.findUnique({
        where: { id: input.lessonId },
        select: { id: true, body: true, skillCategory: true },
      });
      if (!lesson) throw new TRPCError({ code: 'NOT_FOUND' });

      // Index first; if it fails, abort — never publish unindexed content.
      const { chunks } = await indexLessonText({
        prisma: ctx.prisma,
        lessonId: lesson.id,
        skillCategory: lesson.skillCategory ?? null,
        doc: lesson.body as never,
      });

      const updated = await ctx.prisma.lesson.update({
        where: { id: lesson.id },
        data: { contentStatus: 'PUBLISHED', isHidden: false },
        select: { id: true, contentStatus: true },
      });

      return { id: updated.id, contentStatus: updated.contentStatus, chunks };
    }),

  /**
   * Hard-delete a text/interactive lesson: its content_chunk rows, any embedded
   * images in the `lesson-images` bucket (best-effort), and the lesson row
   * (FK cascades LessonProgress + JobLesson).
   *
   * VIDEO lessons are protected — they are only ever soft-hidden, never deleted
   * through this path (496 existing video lessons would otherwise be at risk).
   */
  deleteLesson: adminProcedure
    .input(z.object({ lessonId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const lesson = await ctx.prisma.lesson.findUnique({
        where: { id: input.lessonId },
        select: { id: true, contentType: true, body: true },
      });
      if (!lesson) throw new TRPCError({ code: 'NOT_FOUND' });

      if (lesson.contentType === 'VIDEO') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Видео-уроки удаляются только скрытием',
        });
      }

      await ctx.prisma.contentChunk.deleteMany({ where: { lessonId: lesson.id } });

      // Best-effort: remove embedded images. A storage failure must not abort
      // the lesson delete — log and continue.
      const imagePaths = extractLessonImagePaths(lesson.body);
      if (imagePaths.length > 0) {
        try {
          await getSupabaseAdmin()
            .storage.from(LESSON_IMAGE_STORAGE_BUCKET)
            .remove(imagePaths);
        } catch (error) {
          console.error('[deleteLesson] image cleanup failed', error);
        }
      }

      await ctx.prisma.lesson.delete({ where: { id: lesson.id } });

      return { id: lesson.id };
    }),

  /**
   * Update lesson display order.
   */
  updateLessonOrder: adminProcedure
    .input(
      z.object({
        lessonId: z.string(),
        newOrder: z.number().int().min(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const updated = await ctx.prisma.lesson.update({
          where: { id: input.lessonId },
          data: { order: input.newOrder },
        });
        return updated;
      } catch (error) {
        handleDatabaseError(error);
      }
    }),

  /**
   * Force-refresh the AI question bank for all categories.
   * Generates ~30 questions per category via LLM + RAG, stores in DB with 7-day TTL.
   */
  refreshQuestionBank: adminProcedure.mutation(async ({ ctx }) => {
    const categories: SkillCategory[] = [
      'ANALYTICS',
      'MARKETING',
      'CONTENT',
      'OPERATIONS',
      'FINANCE',
    ];
    const results: Record<string, { success: boolean; count: number }> = {};

    for (const category of categories) {
      try {
        await refreshBankForCategory(ctx.prisma, category);
        const bank = await ctx.prisma.questionBank.findUnique({
          where: { skillCategory: category },
        });
        const count = bank ? (bank.questions as any[]).length : 0;
        results[category] = { success: true, count };
      } catch (err) {
        console.error(`[refreshQuestionBank] Failed for ${category}:`, err);
        results[category] = { success: false, count: 0 };
      }
    }

    return results;
  }),

  /**
   * List all feature flags, ordered by key.
   */
  getFeatureFlags: superadminProcedure.query(async ({ ctx }) => {
    try {
      return await ctx.prisma.featureFlag.findMany({
        orderBy: { key: 'asc' },
      });
    } catch (error) {
      handleDatabaseError(error);
    }
  }),

  /**
   * Toggle a feature flag on/off by key.
   */
  toggleFeatureFlag: superadminProcedure
    .input(z.object({ key: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const flag = await ctx.prisma.featureFlag.findUnique({
          where: { key: input.key },
        });

        if (!flag) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Feature flag "${input.key}" not found`,
          });
        }

        const updated = await ctx.prisma.featureFlag.update({
          where: { key: input.key },
          data: { enabled: !flag.enabled },
        });

        return updated;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        handleDatabaseError(error);
      }
    }),

  // ============== COMMENT MODERATION ==============

  /**
   * List all comments across lessons with filters for admin moderation.
   * Supports filtering by course, visibility status, time period, and text search.
   * Returns paginated results with lesson/course context.
   */
  getComments: adminProcedure
    .input(
      z.object({
        courseId: z.string().optional(),
        status: z.enum(['all', 'visible', 'hidden']).default('all'),
        period: z.enum(['7d', '30d', 'all']).default('all'),
        search: z.string().optional(),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        const { courseId, status, period, search, cursor } = input;
        const PAGE_SIZE = 30;

        // Build date filter
        let dateFilter: Date | undefined;
        if (period === '7d') {
          dateFilter = new Date();
          dateFilter.setDate(dateFilter.getDate() - 7);
        } else if (period === '30d') {
          dateFilter = new Date();
          dateFilter.setDate(dateFilter.getDate() - 30);
        }

        // Build where clause
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const where: any = {};

        if (status === 'visible') where.isHidden = false;
        else if (status === 'hidden') where.isHidden = true;

        if (dateFilter) where.createdAt = { gte: dateFilter };

        if (search) {
          where.OR = [
            { content: { contains: search, mode: 'insensitive' } },
            { user: { name: { contains: search, mode: 'insensitive' } } },
          ];
        }

        // Filter by course: find lessons in that course first
        if (courseId) {
          const courseLessons = await ctx.prisma.lesson.findMany({
            where: { courseId },
            select: { id: true },
          });
          where.lessonId = { in: courseLessons.map((l) => l.id) };
        }

        const [items, totalCount, newCount] = await Promise.all([
          ctx.prisma.lessonComment.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: PAGE_SIZE,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            include: {
              user: { select: { id: true, name: true, avatarUrl: true, role: true } },
            },
          }),
          ctx.prisma.lessonComment.count({ where }),
          ctx.prisma.lessonComment.count({
            where: { createdAt: { gte: new Date(Date.now() - TWENTY_FOUR_HOURS_MS) } },
          }),
        ]);

        // Enrich items with lesson + course info
        const uniqueLessonIds = [...new Set(items.map((c) => c.lessonId))];
        const lessons = await ctx.prisma.lesson.findMany({
          where: { id: { in: uniqueLessonIds } },
          select: {
            id: true,
            title: true,
            course: { select: { id: true, title: true } },
          },
        });
        const lessonMap = new Map(lessons.map((l) => [l.id, l]));

        const enrichedItems = items.map((item) => ({
          ...item,
          lesson: lessonMap.get(item.lessonId) ?? null,
        }));

        const nextCursor =
          items.length === PAGE_SIZE ? items[items.length - 1].id : null;

        return { items: enrichedItems, nextCursor, totalCount, newCount };
      } catch (error) {
        handleDatabaseError(error);
      }
    }),

  /**
   * Toggle comment visibility (hide/unhide). Tracks who hid the comment and when.
   */
  toggleCommentVisibility: adminProcedure
    .input(
      z.object({
        commentId: z.string(),
        isHidden: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const comment = await ctx.prisma.lessonComment.findUnique({
          where: { id: input.commentId },
        });

        if (!comment) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Comment not found' });
        }

        const updated = await ctx.prisma.lessonComment.update({
          where: { id: input.commentId },
          data: {
            isHidden: input.isHidden,
            hiddenBy: input.isHidden ? ctx.user.id : null,
            hiddenAt: input.isHidden ? new Date() : null,
          },
        });

        return updated;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        handleDatabaseError(error);
      }
    }),

  /**
   * Count of new comments in the last 24 hours (for sidebar badge).
   */
  getNewCommentsCount: adminProcedure.query(async ({ ctx }) => {
    try {
      const count = await ctx.prisma.lessonComment.count({
        where: {
          createdAt: { gte: new Date(Date.now() - TWENTY_FOUR_HOURS_MS) },
        },
      });
      return { count };
    } catch (error) {
      handleDatabaseError(error);
    }
  }),
});
