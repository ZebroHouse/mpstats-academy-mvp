/**
 * Admin Jobs sub-router — Phase C Feature 2 (Job Composition Editor).
 *
 * Lets methodologists manage «решения под задачу» (jobs) from the admin without
 * running seed-jobs.ts. Mounted under `admin.job.*`.
 *
 * Reads: getJobs, getJobLessons, searchLessons.
 * Mutations: addJobLesson, removeJobLesson, reorderJobLesson, setJobPublished,
 * createJob, reembedJob.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { Prisma } from '@mpstats/db';
import { embedQuery } from '@mpstats/ai';
import { router, adminProcedure } from '../trpc';

/**
 * Text fed to the embedding model for a job. Mirrors `buildJobText` in
 * `@mpstats/ai/intent/embed-jobs` (not exported), kept in sync: title +
 * description + ordered lesson titles, blank parts dropped.
 */
function jobEmbedText(title: string, description: string, lessonTitles: string[]): string {
  return [title, description, ...lessonTitles].filter(Boolean).join('\n');
}

/**
 * Writes the job's embedding via raw SQL (`embedding` is an Unsupported pgvector
 * column Prisma can't set through the typed client). `jobId` is a server-issued
 * cuid and `vec` is numbers — both safe to interpolate.
 */
async function writeJobEmbedding(
  prisma: { $executeRawUnsafe: (sql: string) => Promise<unknown> },
  jobId: string,
  vec: number[],
): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE "Job" SET "embedding" = '[${vec.join(',')}]'::vector WHERE "id" = '${jobId}'`,
  );
}

export const adminJobsRouter = router({
  /**
   * All jobs (incl. unpublished) with lessonCount + hasEmbedding, ordered
   * displayOrder asc, title asc. `hasEmbedding` comes from a raw query because
   * Prisma can't select the Unsupported vector column.
   */
  getJobs: adminProcedure.query(async ({ ctx }) => {
    const jobs = await ctx.prisma.job.findMany({
      orderBy: [{ displayOrder: 'asc' }, { title: 'asc' }],
      select: {
        id: true,
        slug: true,
        title: true,
        marketplace: true,
        displayOrder: true,
        isPublished: true,
        _count: { select: { lessons: true } },
      },
    });

    const embeddingRows = await ctx.prisma.$queryRaw<Array<{ id: string; has_embedding: boolean }>>(
      Prisma.sql`SELECT id, embedding IS NOT NULL AS has_embedding FROM "Job"`,
    );
    const hasEmbeddingById = new Map(embeddingRows.map((r) => [r.id, r.has_embedding]));

    return jobs.map((job) => ({
      id: job.id,
      slug: job.slug,
      title: job.title,
      marketplace: job.marketplace,
      displayOrder: job.displayOrder,
      isPublished: job.isPublished,
      lessonCount: job._count.lessons,
      hasEmbedding: hasEmbeddingById.get(job.id) ?? false,
    }));
  }),

  /**
   * A job's lessons by order asc. Includes hidden lessons — admin needs to
   * see/manage them (hidden lessons are invisible to students).
   */
  getJobLessons: adminProcedure
    .input(z.object({ jobId: z.string() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.prisma.jobLesson.findMany({
        where: { jobId: input.jobId },
        orderBy: { order: 'asc' },
        select: {
          lessonId: true,
          order: true,
          lesson: {
            select: {
              title: true,
              isHidden: true,
              contentType: true,
              course: { select: { title: true } },
            },
          },
        },
      });

      return rows.map((row) => ({
        lessonId: row.lessonId,
        title: row.lesson.title,
        order: row.order,
        courseTitle: row.lesson.course?.title ?? '',
        isHidden: row.lesson.isHidden,
        contentType: row.lesson.contentType,
      }));
    }),

  /**
   * Cross-course lesson picker for the admin: title contains query
   * (case-insensitive), INCLUDING hidden lessons, capped at 30.
   */
  searchLessons: adminProcedure
    .input(z.object({ query: z.string().min(1).max(200) }))
    .query(async ({ ctx, input }) => {
      const lessons = await ctx.prisma.lesson.findMany({
        where: { title: { contains: input.query, mode: 'insensitive' } },
        take: 30,
        orderBy: [{ courseId: 'asc' }, { order: 'asc' }],
        select: {
          id: true,
          title: true,
          isHidden: true,
          contentType: true,
          course: { select: { title: true } },
        },
      });

      return lessons.map((lesson) => ({
        lessonId: lesson.id,
        title: lesson.title,
        courseTitle: lesson.course?.title ?? '',
        isHidden: lesson.isHidden,
        contentType: lesson.contentType,
      }));
    }),

  /**
   * Append a lesson to a job at the end (max order + 1). JobLesson has no UNIQUE
   * on order, so the duplicate guard is the composite PK (jobId, lessonId) →
   * P2002 surfaces as CONFLICT.
   */
  addJobLesson: adminProcedure
    .input(z.object({ jobId: z.string(), lessonId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const lesson = await ctx.prisma.lesson.findUnique({
        where: { id: input.lessonId },
        select: { id: true },
      });
      if (!lesson) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Урок не найден' });
      }

      const agg = await ctx.prisma.jobLesson.aggregate({
        where: { jobId: input.jobId },
        _max: { order: true },
      });
      const order = (agg._max.order ?? -1) + 1;

      try {
        await ctx.prisma.jobLesson.create({
          data: { jobId: input.jobId, lessonId: input.lessonId, order },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new TRPCError({ code: 'CONFLICT', message: 'Урок уже в задаче' });
        }
        throw error;
      }

      return { ok: true, order };
    }),

  /**
   * Remove a lesson from a job, then renumber the remaining lessons so orders
   * stay contiguous 0..n-1 (only rows whose order changed are written).
   */
  removeJobLesson: adminProcedure
    .input(z.object({ jobId: z.string(), lessonId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.$transaction(async (tx) => {
        await tx.jobLesson.delete({
          where: { jobId_lessonId: { jobId: input.jobId, lessonId: input.lessonId } },
        });

        const rows = await tx.jobLesson.findMany({
          where: { jobId: input.jobId },
          orderBy: { order: 'asc' },
          select: { lessonId: true, order: true },
        });

        for (let i = 0; i < rows.length; i++) {
          if (rows[i].order !== i) {
            await tx.jobLesson.update({
              where: { jobId_lessonId: { jobId: input.jobId, lessonId: rows[i].lessonId } },
              data: { order: i },
            });
          }
        }
      });

      return { ok: true };
    }),

  /**
   * Move a lesson to `targetOrder` within its job. Array-rebuild approach:
   * remove the lesson from its slot, splice it at the (clamped) target, then
   * rewrite the order of every row that moved. No UNIQUE on order → no parking.
   */
  reorderJobLesson: adminProcedure
    .input(
      z.object({
        jobId: z.string(),
        lessonId: z.string(),
        targetOrder: z.number().int().min(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.$transaction(async (tx) => {
        const rows = await tx.jobLesson.findMany({
          where: { jobId: input.jobId },
          orderBy: { order: 'asc' },
          select: { lessonId: true },
        });
        const ids = rows.map((r) => r.lessonId);

        const index = ids.indexOf(input.lessonId);
        if (index === -1) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Урок не входит в задачу' });
        }

        const target = Math.min(Math.max(input.targetOrder, 0), ids.length - 1);
        if (index === target) return;

        const reordered = [...ids];
        reordered.splice(index, 1);
        reordered.splice(target, 0, input.lessonId);

        for (let i = 0; i < reordered.length; i++) {
          if (reordered[i] !== ids[i]) {
            await tx.jobLesson.update({
              where: { jobId_lessonId: { jobId: input.jobId, lessonId: reordered[i] } },
              data: { order: i },
            });
          }
        }
      });

      return { ok: true };
    }),

  /** Publish / unpublish a job (controls visibility to students). */
  setJobPublished: adminProcedure
    .input(z.object({ jobId: z.string(), isPublished: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.job.update({
        where: { id: input.jobId },
        data: { isPublished: input.isPublished },
      });
      return { ok: true, isPublished: input.isPublished };
    }),

  /**
   * Create a job (parameterized — never raw SQL with user strings), then embed
   * it. Embedding failure is non-fatal: the job exists, UI can reindex later.
   */
  createJob: adminProcedure
    .input(
      z.object({
        slug: z
          .string()
          .min(1)
          .regex(/^[a-z0-9-]+$/, 'slug: только a-z, 0-9, дефис'),
        title: z.string().min(1),
        description: z.string().min(1),
        marketplace: z.enum(['WB', 'OZON', 'BOTH']),
        axes: z
          .array(z.enum(['ANALYTICS', 'MARKETING', 'CONTENT', 'OPERATIONS', 'FINANCE']))
          .min(1),
        outcomes: z.array(z.string()).default([]),
        skillBlocks: z.array(z.string()).default([]),
        displayOrder: z.number().int().default(0),
        isPublished: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.job.findUnique({
        where: { slug: input.slug },
        select: { id: true },
      });
      if (existing) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Задача с таким slug уже существует' });
      }

      const job = await ctx.prisma.job.create({
        data: {
          slug: input.slug,
          title: input.title,
          description: input.description,
          marketplace: input.marketplace,
          axes: input.axes,
          skillBlocks: input.skillBlocks,
          outcomes: input.outcomes,
          displayOrder: input.displayOrder,
          isPublished: input.isPublished,
        },
      });

      try {
        const vec = await embedQuery(jobEmbedText(input.title, input.description, []));
        await writeJobEmbedding(ctx.prisma, job.id, vec);
        return { id: job.id, embedded: true };
      } catch {
        return { id: job.id, embedded: false };
      }
    }),

  /**
   * Recompute a job's embedding from its current title, description and lesson
   * titles. Embedding failure surfaces as an error so the UI can toast a retry.
   */
  reembedJob: adminProcedure
    .input(z.object({ jobId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const job = await ctx.prisma.job.findUnique({
        where: { id: input.jobId },
        select: { title: true, description: true },
      });
      if (!job) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Задача не найдена' });
      }

      const lessons = await ctx.prisma.jobLesson.findMany({
        where: { jobId: input.jobId },
        orderBy: { order: 'asc' },
        select: { lesson: { select: { title: true } } },
      });

      const text = jobEmbedText(
        job.title,
        job.description,
        lessons.map((l) => l.lesson.title),
      );

      try {
        const vec = await embedQuery(text);
        await writeJobEmbedding(ctx.prisma, input.jobId, vec);
        return { ok: true };
      } catch {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Не удалось переиндексировать',
        });
      }
    }),
});
