import 'server-only';
import { prisma } from '@mpstats/db';
import { searchChunks, type ChunkSearchResult } from './retrieval';

/** Base URL of the public Academy platform. Override via env if needed. */
export const DEEPLINK_BASE =
  process.env.RAG_DEEPLINK_BASE ?? 'https://platform.mpstats.academy';

/** Public-facing chunk DTO returned to RAG consumers (AIM agent, MCP, etc.). */
export interface PublicChunk {
  content: string;
  lessonId: string;
  lessonTitle: string;
  courseTitle: string;
  source_type: string;
  trust_tier: number;
  similarity: number;
  deeplink: string;
}

export interface SearchChunksPublicOptions {
  query: string;
  limit?: number;
  threshold?: number;
  sourceTypes?: string[];
  trustTiers?: number[];
}

export interface SearchChunksPublicResult {
  chunks: PublicChunk[];
}

/**
 * Public RAG search: vector query → title join → deeplink-ready chunks.
 *
 * Always passes `includeHidden: false` — callers cannot include hidden lessons
 * regardless of request shape. No raw embeddings returned.
 */
export async function searchChunksPublic(
  opts: SearchChunksPublicOptions,
): Promise<SearchChunksPublicResult> {
  const raw: ChunkSearchResult[] = await searchChunks({
    query: opts.query,
    limit: opts.limit,
    threshold: opts.threshold,
    includeHidden: false,
    sourceTypes: opts.sourceTypes,
    trustTiers: opts.trustTiers,
  });
  if (raw.length === 0) return { chunks: [] };

  const lessonIds = Array.from(new Set(raw.map((c) => c.lesson_id)));
  const lessons = await prisma.lesson.findMany({
    where: { id: { in: lessonIds } },
    select: { id: true, title: true, course: { select: { id: true, title: true } } },
  });
  const byId = new Map(
    lessons.map((l) => [
      l.id,
      { title: l.title, courseTitle: l.course?.title ?? '' },
    ]),
  );

  const chunks: PublicChunk[] = raw.map((c) => {
    const meta = byId.get(c.lesson_id);
    return {
      content: c.content,
      lessonId: c.lesson_id,
      lessonTitle: meta?.title ?? c.lesson_id,
      courseTitle: meta?.courseTitle ?? '',
      source_type: c.source_type,
      trust_tier: c.trust_tier,
      similarity: c.similarity,
      deeplink: `${DEEPLINK_BASE}/learn/${c.lesson_id}?t=${c.timecode_start}`,
    };
  });
  return { chunks };
}
