import { prisma } from '@mpstats/db';
import { searchChunks } from '../retrieval';
import { expandSellerQuery } from '../seller-lexicon';
import { searchJobsByEmbedding, aggregateChunksToJobs, mergeJobCandidates } from '../intent/retrieval';
import type { LessonCandidate } from './types';
import type { JobCandidate } from '../intent/types';

const LESSON_CHUNK_LIMIT = 12;
const LESSON_TOP = 6;
const JOB_EMB_LIMIT = 8;
const JOB_CHUNK_LIMIT = 24;
const JOB_TOP = 4;

export interface AssistantRetrieval {
  lessons: LessonCandidate[];
  jobs: JobCandidate[];
}

async function retrieveLessons(query: string): Promise<LessonCandidate[]> {
  const chunks = await searchChunks({
    query,
    limit: LESSON_CHUNK_LIMIT,
    threshold: 0.5,
    sourceTypes: ['academy_audio', 'academy_video_frame', 'academy_text'],
    trustTiers: [1],
  });
  if (chunks.length === 0) return [];

  const byLesson = new Map<string, { sim: number; snippet: string }>();
  for (const c of chunks) {
    const cur = byLesson.get(c.lesson_id);
    if (!cur || c.similarity > cur.sim) {
      byLesson.set(c.lesson_id, { sim: c.similarity, snippet: c.content.slice(0, 200) });
    }
  }
  const lessonIds = Array.from(byLesson.keys());
  const rows = await prisma.lesson.findMany({
    where: { id: { in: lessonIds }, isHidden: false, course: { isHidden: false } },
    select: { id: true, title: true, duration: true, course: { select: { title: true } } },
  });
  const meta = new Map(rows.map((r) => [r.id, r]));

  return lessonIds
    .filter((id) => meta.has(id))
    .map((id) => {
      const m = meta.get(id)!;
      const agg = byLesson.get(id)!;
      return {
        lessonId: id,
        title: m.title,
        durationMin: m.duration ?? null,
        courseTitle: m.course?.title ?? null,
        snippet: agg.snippet,
        similarity: agg.sim,
      } satisfies LessonCandidate;
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, LESSON_TOP);
}

async function retrieveJobs(query: string): Promise<JobCandidate[]> {
  const [emb, chunkHits] = await Promise.all([
    searchJobsByEmbedding(query, { limit: JOB_EMB_LIMIT, threshold: 0.2 }),
    aggregateChunksToJobs(query, { chunkLimit: JOB_CHUNK_LIMIT }),
  ]);
  const merged = await mergeJobCandidates(emb, chunkHits);
  return merged.slice(0, JOB_TOP);
}

export async function retrieveForAssistant(query: string): Promise<AssistantRetrieval> {
  const expanded = expandSellerQuery(query);
  const [lessons, jobs] = await Promise.all([
    retrieveLessons(expanded),
    retrieveJobs(query),
  ]);
  return { lessons, jobs };
}
