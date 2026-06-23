/**
 * AI Router — RAG-powered features for MPSTATS Academy
 *
 * Endpoints:
 * - getLessonSummary: Generate or retrieve cached summary for a lesson
 * - chat: RAG chat with lesson content
 * - searchChunks: Debug endpoint for vector search
 */

import { router, protectedProcedure, chatProcedure } from '../trpc';
import { Prisma } from '@mpstats/db';
import { z } from 'zod';
import {
  generateLessonSummary,
  generateChatResponse,
  searchChunks,
  type ChatMessage,
} from '@mpstats/ai';
import { getUserActiveSubscriptions, getUserAdminBypass, isLessonAccessible } from '../utils/access';
import { isFeatureEnabled } from '../utils/feature-flags';
import type { SearchLessonResult, SearchSnippet } from '@mpstats/shared';

type SummarySource = {
  id: string;
  lesson_id: string;
  content: string;
  timecode_start: number;
  timecode_end: number;
  timecodeFormatted: string;
};

// In-memory hot cache layered on top of the DB cache. DB persists across
// deploys; memory just shaves off a roundtrip for repeat hits within the
// same process.
const summaryCache = new Map<string, {
  content: string;
  sources: SummarySource[];
  generatedAt: Date;
}>();

// Cache TTL: 24 hours
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export const aiRouter = router({
  /**
   * Get or generate a lesson summary
   *
   * 1. Check cache first
   * 2. If miss: generate via RAG
   * 3. Cache and return
   */
  getLessonSummary: protectedProcedure
    .input(z.object({
      lessonId: z.string().min(1),
      forceRefresh: z.boolean().optional().default(false),
    }))
    .query(async ({ ctx, input }) => {
      const { lessonId, forceRefresh } = input;

      // Layer 1 — in-memory hot cache (skips DB roundtrip for repeat hits)
      const memCached = summaryCache.get(lessonId);
      if (memCached && !forceRefresh) {
        const age = Date.now() - memCached.generatedAt.getTime();
        if (age < CACHE_TTL_MS) {
          return {
            content: memCached.content,
            sources: memCached.sources,
            fromCache: true,
          };
        }
      }

      // Layer 2 — DB cache (survives deploys; this is what removes the
      // rate-limit pressure when users browse many lessons)
      if (!forceRefresh) {
        const persisted = await ctx.prisma.lesson.findUnique({
          where: { id: lessonId },
          select: {
            summaryContent: true,
            summarySources: true,
            summaryGeneratedAt: true,
          },
        });
        if (
          persisted?.summaryContent &&
          persisted.summaryGeneratedAt &&
          Date.now() - persisted.summaryGeneratedAt.getTime() < CACHE_TTL_MS
        ) {
          const sources = (persisted.summarySources ?? []) as SummarySource[];
          // Warm the in-memory cache so subsequent hits skip the DB lookup
          summaryCache.set(lessonId, {
            content: persisted.summaryContent,
            sources,
            generatedAt: persisted.summaryGeneratedAt,
          });
          return {
            content: persisted.summaryContent,
            sources,
            fromCache: true,
          };
        }
      }

      // Layer 3 — generate (this is the expensive path that hits OpenRouter)
      const result = await generateLessonSummary(lessonId);
      const generatedAt = new Date();

      // Persist to DB so the next user (or this user after a deploy) gets
      // the cached version without hitting the model.
      await ctx.prisma.lesson
        .update({
          where: { id: lessonId },
          data: {
            summaryContent: result.content,
            summarySources: result.sources as unknown as Prisma.InputJsonValue,
            summaryGeneratedAt: generatedAt,
          },
        })
        .catch((err) => {
          // Don't fail the request if persist fails — user still gets the
          // answer, in-memory cache covers this process at least.
          console.error('[AI Router] Failed to persist lesson summary:', err);
        });

      summaryCache.set(lessonId, {
        content: result.content,
        sources: result.sources,
        generatedAt,
      });

      return {
        content: result.content,
        sources: result.sources,
        fromCache: false,
      };
    }),

  /**
   * RAG chat for a specific lesson
   *
   * 1. Search chunks relevant to message
   * 2. Build context with citations
   * 3. Generate response
   * 4. Return with sources
   */
  chat: chatProcedure
    .input(z.object({
      lessonId: z.string().min(1),
      message: z.string().min(1).max(2000),
      history: z.array(z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string(),
      })).optional().default([]),
    }))
    .mutation(async ({ input }) => {
      const { lessonId, message, history } = input;

      const result = await generateChatResponse(
        lessonId,
        message,
        history as ChatMessage[]
      );

      return {
        content: result.content,
        sources: result.sources,
        model: result.model,
      };
    }),

  /**
   * Debug: Search content chunks
   *
   * Direct access to vector search for debugging
   */
  searchChunks: protectedProcedure
    .input(z.object({
      query: z.string().min(1),
      lessonId: z.string().optional(),
      limit: z.number().min(1).max(20).default(5),
      threshold: z.number().min(0).max(1).default(0.5),
    }))
    .query(async ({ input }) => {
      const { query, lessonId, limit, threshold } = input;

      const chunks = await searchChunks({
        query,
        lessonId,
        limit,
        threshold,
        // Academy-only scope: exclude external sources (e.g. LagerPro tier=2).
        // academy_text = published text/interactive lesson bodies (Phase A).
        sourceTypes: ['academy_audio', 'academy_video_frame', 'academy_text'],
        trustTiers: [1],
      });

      return {
        query,
        count: chunks.length,
        chunks,
      };
    }),

  /**
   * Search lessons by semantic query (Phase 30)
   *
   * 1. Vector search — get up to 30 chunks
   * 2. Group by lesson_id, keep top 2 chunks per lesson
   * 3. Enrich with lesson data from Prisma
   * 4. Check access (locked/unlocked)
   * 5. Check recommended path membership
   * 6. Return top-10 lessons sorted by best similarity
   */
  searchLessons: protectedProcedure
    .input(z.object({
      query: z.string().min(1).max(500),
    }))
    .query(async ({ ctx, input }): Promise<{ query: string; results: SearchLessonResult[]; totalChunks: number }> => {
      const q = input.query.trim();

      // Hybrid search: vector (semantic) + keyword (title/description) in parallel.
      // Keyword fallback ensures that simple queries matching lesson titles always
      // return results, even when vector similarity falls below threshold.
      const [chunks, keywordLessons] = await Promise.all([
        // Academy-only scope for /learn semantic search — keep top-30 slots
        // exclusively for academy content; external sources (LagerPro tier=2)
        // would dilute results since Lesson.findMany enrichment filters them
        // out downstream anyway.
        searchChunks({
          query: q,
          limit: 30,
          threshold: 0.5,
          // academy_text = published text/interactive lessons surface in /learn search too.
          sourceTypes: ['academy_audio', 'academy_video_frame', 'academy_text'],
          trustTiers: [1],
        }),
        ctx.prisma.lesson.findMany({
          where: {
            isHidden: false,
            course: { isHidden: false },
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { description: { contains: q, mode: 'insensitive' } },
            ],
          },
          select: { id: true, title: true, description: true },
          take: 20,
        }),
      ]);

      const qLower = q.toLowerCase();
      const titleMatchIds = new Set(
        keywordLessons.filter((l) => l.title.toLowerCase().includes(qLower)).map((l) => l.id),
      );
      const descMatchIds = new Set(
        keywordLessons
          .filter((l) => !titleMatchIds.has(l.id) && (l.description ?? '').toLowerCase().includes(qLower))
          .map((l) => l.id),
      );
      const keywordMatchIds = new Set<string>([...titleMatchIds, ...descMatchIds]);

      if (chunks.length === 0 && keywordMatchIds.size === 0) {
        return { query: input.query, results: [], totalChunks: 0 };
      }

      // 2. Group chunks by lesson_id, keep top 2 chunks per lesson
      const lessonChunksMap = new Map<string, typeof chunks>();
      for (const chunk of chunks) {
        if (!chunk.lesson_id) continue;
        const existing = lessonChunksMap.get(chunk.lesson_id) || [];
        if (existing.length < 2) {
          existing.push(chunk);
          lessonChunksMap.set(chunk.lesson_id, existing);
        }
      }

      // 3. Enrich: union of vector hits + keyword hits
      const lessonIds = Array.from(new Set([
        ...lessonChunksMap.keys(),
        ...keywordMatchIds,
      ]));
      const lessons = await ctx.prisma.lesson.findMany({
        where: {
          id: { in: lessonIds },
          isHidden: false,
          course: { isHidden: false },
        },
        include: {
          course: { select: { id: true, title: true, isHidden: true, partnerKey: true } },
          progress: {
            where: { path: { userId: ctx.user.id } },
            take: 1,
          },
        },
      });

      // 4. Check access
      const [subs, billingEnabled, isAdminBypass] = await Promise.all([
        getUserActiveSubscriptions(ctx.user.id, ctx.prisma),
        isFeatureEnabled('billing_enabled'),
        getUserAdminBypass(ctx.user.id, ctx.prisma),
      ]);

      // 5. Check recommended path membership
      const activePath = await ctx.prisma.learningPath.findUnique({
        where: { userId: ctx.user.id },
        select: { lessons: true },
      });
      const recommendedLessonIds = new Set<string>();
      if (activePath?.lessons) {
        const parsed = activePath.lessons;
        if (Array.isArray(parsed)) {
          (parsed as string[]).forEach((id) => recommendedLessonIds.add(id));
        } else if (typeof parsed === 'object' && parsed !== null && 'sections' in (parsed as object)) {
          const sections = (parsed as any).sections;
          if (Array.isArray(sections)) {
            sections.forEach((s: any) => {
              if (Array.isArray(s.lessonIds)) {
                s.lessonIds.forEach((id: string) => recommendedLessonIds.add(id));
              }
            });
          }
        }
      }

      // 6. Merge and sort by best similarity (floor-boosted for keyword matches).
      const TITLE_FLOOR = 0.8;
      const DESC_FLOOR = 0.65;

      const results: SearchLessonResult[] = lessons.map((lesson) => {
        const chunkList = lessonChunksMap.get(lesson.id) || [];
        const isPartner = lesson.course.partnerKey != null;
        const locked = !isLessonAccessible(
          { order: lesson.order, courseId: lesson.courseId, isPartnerFree: isPartner },
          subs,
          billingEnabled,
          isAdminBypass,
        );

        const snippets: SearchSnippet[] = chunkList.map((c) => ({
          content: c.content.length > 200 ? c.content.slice(0, 200) + '...' : c.content,
          timecodeStart: c.timecode_start,
          timecodeEnd: c.timecode_end,
          similarity: c.similarity,
        }));

        const vectorBest = snippets.length > 0 ? Math.max(...snippets.map((s) => s.similarity)) : 0;
        // Keyword match acts as a floor on similarity, not a ceiling: a strong
        // semantic hit can still outrank a keyword match.
        const floor = titleMatchIds.has(lesson.id)
          ? TITLE_FLOOR
          : descMatchIds.has(lesson.id)
            ? DESC_FLOOR
            : 0;
        const bestSimilarity = Math.max(vectorBest, floor);

        return {
          lesson: {
            id: lesson.id,
            courseId: lesson.courseId,
            title: lesson.title,
            duration: lesson.duration || 0,
            order: lesson.order,
            skillCategory: lesson.skillCategory as any,
            skillLevel: (lesson.skillLevel || 'MEDIUM') as any,
            skillCategories: (lesson.skillCategories as string[] | null) ?? [],
            topics: (lesson.topics as string[] | null) ?? [],
          },
          course: lesson.course,
          snippets,
          bestSimilarity,
          watchedPercent: lesson.progress[0]?.watchedPercent || 0,
          status: (lesson.progress[0]?.status || 'NOT_STARTED') as any,
          locked,
          isPartner,
          inRecommendedPath: recommendedLessonIds.has(lesson.id),
        };
      })
      .sort((a, b) => b.bestSimilarity - a.bestSimilarity)
      .slice(0, 10);

      // Partner courses are env-gated: hide their lessons from search unless enabled
      // for this environment (staging on / prod off until launch sign-off).
      const partnerEnabled = process.env.PARTNER_COURSES_ENABLED === 'true';
      const visibleResults = partnerEnabled ? results : results.filter((r) => !r.isPartner);

      return { query: input.query, results: visibleResults, totalChunks: chunks.length };
    }),

  /**
   * Clear summary cache for a lesson
   *
   * Admin/debug endpoint
   */
  clearSummaryCache: protectedProcedure
    .input(z.object({
      lessonId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.lessonId) {
        summaryCache.delete(input.lessonId);
        await ctx.prisma.lesson.update({
          where: { id: input.lessonId },
          data: {
            summaryContent: null,
            summarySources: undefined,
            summaryGeneratedAt: null,
          },
        });
        return { cleared: 1 };
      } else {
        const count = summaryCache.size;
        summaryCache.clear();
        const updated = await ctx.prisma.lesson.updateMany({
          where: { summaryContent: { not: null } },
          data: {
            summaryContent: null,
            summarySources: undefined,
            summaryGeneratedAt: null,
          },
        });
        return { cleared: Math.max(count, updated.count) };
      }
    }),
});
