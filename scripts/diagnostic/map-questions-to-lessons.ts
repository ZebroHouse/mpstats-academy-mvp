/**
 * One-shot proposal (spec §7.2). Embeds (prompt + correct option + explanation) per
 * static question, vector-searches content_chunk for closest 1-2 lessons, prints JSON.
 * Does NOT modify static-deck. Run:
 *   NODE_OPTIONS=--dns-result-order=ipv4first npx tsx --conditions=react-server \
 *     scripts/diagnostic/map-questions-to-lessons.ts
 *
 * PROPOSAL-ONLY: not on the runtime path, no unit test. Needs prod Supabase + embeddings
 * creds. After running, eyeball each proposal and hand-edit `sourceLessonIds` into the
 * matching questions in static-deck.ts (keep only clear matches).
 */
import { prisma } from '@mpstats/db/client';
import { embedQuery } from '@mpstats/ai';
import { STATIC_DECK } from '../../packages/api/src/diagnostic/static-deck';

const TOP_N = 2;

async function main() {
  const all = [...STATIC_DECK.wb, ...STATIC_DECK.ozon];
  const proposals: Array<{
    questionId: string;
    axis: string;
    suggestedLessonIds: string[];
    titles: string[];
    similarities: number[];
  }> = [];

  for (const q of all) {
    const correct = q.options[0]; // canonical: options[0] is the correct answer in source
    const vec = await embedQuery(`${q.prompt}\n${correct}\n${q.explanation}`);
    const literal = `[${vec.join(',')}]`;
    // content_chunk is an unquoted lowercase table (Prisma @@map); Lesson/Course are
    // quoted PascalCase with quoted camelCase columns — matches packages/ai/src/retrieval.ts.
    const rows = await prisma.$queryRawUnsafe<
      Array<{ lesson_id: string; title: string; similarity: number }>
    >(`
      SELECT l.id::text AS lesson_id, l.title AS title,
             MAX(1 - (cc.embedding <=> '${literal}'::vector))::float AS similarity
      FROM content_chunk cc
      JOIN "Lesson" l ON l.id = cc.lesson_id
      JOIN "Course" c ON c.id = l."courseId"
      WHERE cc.embedding IS NOT NULL
        AND l."isHidden" = false
        AND c."isHidden" = false
        AND c."partnerKey" IS NULL
      GROUP BY l.id, l.title
      ORDER BY similarity DESC
      LIMIT ${TOP_N}
    `);
    proposals.push({
      questionId: q.id,
      axis: q.axis,
      suggestedLessonIds: rows.map((r) => r.lesson_id),
      titles: rows.map((r) => r.title),
      similarities: rows.map((r) => Number(r.similarity)),
    });
    console.error(`[mapped] ${q.id} -> ${rows.map((r) => r.title).join(' | ')}`);
  }
  console.log(JSON.stringify(proposals, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
