import { prisma } from '@mpstats/db/client';
import { embedQuery } from '../embeddings';
import { searchChunks } from '../retrieval';
import type { JobCandidate } from './types';

interface JobEmbedRow {
  id: string;
  title: string;
  description: string | null;
  lesson_count: number;
  similarity: number;
}

export async function searchJobsByEmbedding(
  query: string,
  opts: { limit?: number; threshold?: number } = {},
): Promise<JobCandidate[]> {
  const { limit = 10, threshold = 0.5 } = opts;
  const vec = await embedQuery(query);
  const literal = `[${vec.join(',')}]`;
  const rows = await prisma.$queryRawUnsafe<JobEmbedRow[]>(
    // Visible-lesson count uses the same hidden-lesson filter as Phase 57 PR #9
    // (job.getCatalog / job.getJob): JobLesson rows whose target Lesson and its
    // Course are both isHidden=false. Jobs whose every lesson is hidden are
    // excluded via EXISTS guard.
    `SELECT j.id::text AS id, j.title, j.description,
            (
              SELECT COUNT(*)
              FROM "JobLesson" jl
              JOIN "Lesson" l ON l.id = jl."lessonId"
              JOIN "Course" c ON c.id = l."courseId"
              WHERE jl."jobId" = j.id
                AND l."isHidden" = false
                AND c."isHidden" = false
            )::int AS lesson_count,
            (1 - (j."embedding" <=> '${literal}'::vector))::float AS similarity
     FROM "Job" j
     WHERE j."embedding" IS NOT NULL
       AND j."isPublished" = true
       AND (1 - (j."embedding" <=> '${literal}'::vector)) > ${threshold}
       AND EXISTS (
         SELECT 1 FROM "JobLesson" jl
         JOIN "Lesson" l ON l.id = jl."lessonId"
         JOIN "Course" c ON c.id = l."courseId"
         WHERE jl."jobId" = j.id AND l."isHidden" = false AND c."isHidden" = false
       )
     ORDER BY j."embedding" <=> '${literal}'::vector
     LIMIT ${limit}`,
  );
  return rows.map((r) => ({
    jobId: r.id,
    title: r.title,
    description: r.description,
    lessonCount: r.lesson_count,
    jobEmbeddingSim: r.similarity,
    topChunkSim: 0,
    combinedScore: 0,
    topSnippets: [],
  }));
}

export async function aggregateChunksToJobs(
  query: string,
  opts: { chunkLimit?: number } = {},
): Promise<JobCandidate[]> {
  const { chunkLimit = 30 } = opts;
  const chunks = await searchChunks({
    query,
    limit: chunkLimit,
    threshold: 0.5,
    sourceTypes: ['academy_audio', 'academy_video_frame'],
    trustTiers: [1],
  });
  if (chunks.length === 0) return [];
  const lessonIds = Array.from(new Set(chunks.map((c) => c.lesson_id).filter(Boolean) as string[]));
  if (lessonIds.length === 0) return [];

  const mapRows = await prisma.jobLesson.findMany({
    where: { lessonId: { in: lessonIds } },
    select: { lessonId: true, jobId: true },
  });
  const lessonToJob = new Map<string, string>();
  for (const row of mapRows) lessonToJob.set(row.lessonId, row.jobId);

  // Aggregate per job: top similarity + top-2 snippets
  const acc = new Map<string, { topSim: number; snippets: Array<{ content: string; similarity: number }> }>();
  for (const c of chunks) {
    const jobId = c.lesson_id ? lessonToJob.get(c.lesson_id) : undefined;
    if (!jobId) continue;
    const cur = acc.get(jobId) ?? { topSim: 0, snippets: [] };
    if (c.similarity > cur.topSim) cur.topSim = c.similarity;
    if (cur.snippets.length < 2) {
      const content = c.content.length > 200 ? c.content.slice(0, 200) + '...' : c.content;
      cur.snippets.push({ content, similarity: c.similarity });
    }
    acc.set(jobId, cur);
  }

  return Array.from(acc.entries()).map(([jobId, v]) => ({
    jobId,
    title: '',
    description: null,
    lessonCount: 0,
    jobEmbeddingSim: 0,
    topChunkSim: v.topSim,
    combinedScore: 0,
    topSnippets: v.snippets,
  }));
}

const W_EMB = 0.7;
const W_CHUNK = 0.3;

export function mergeJobCandidates(
  embHits: JobCandidate[],
  chunkHits: JobCandidate[],
): JobCandidate[] {
  const byId = new Map<string, JobCandidate>();
  for (const j of embHits) byId.set(j.jobId, { ...j });
  for (const j of chunkHits) {
    const cur = byId.get(j.jobId);
    if (cur) {
      cur.topChunkSim = Math.max(cur.topChunkSim, j.topChunkSim);
      cur.topSnippets = [...cur.topSnippets, ...j.topSnippets].slice(0, 2);
    } else {
      byId.set(j.jobId, { ...j });
    }
  }
  for (const c of byId.values()) {
    c.combinedScore = W_EMB * c.jobEmbeddingSim + W_CHUNK * c.topChunkSim;
  }
  return Array.from(byId.values()).sort((a, b) => b.combinedScore - a.combinedScore);
}
