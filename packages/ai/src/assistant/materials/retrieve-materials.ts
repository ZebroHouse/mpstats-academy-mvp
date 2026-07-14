import { prisma } from '@mpstats/db/client';
import { embedQuery } from '../../embeddings';
import type { MaterialCandidate } from '../types';

interface MaterialEmbedRow {
  id: string;
  type: string;
  title: string;
  description: string | null;
  cta_text: string;
  external_url: string | null;
  has_file: boolean;
  similarity: number;
}

// Косинус-поиск по Material.embedding. Только non-hidden материалы,
// у которых есть хотя бы один видимый прикреплённый урок.
export async function searchMaterialsByEmbedding(
  query: string,
  opts: { limit?: number; threshold?: number } = {},
): Promise<MaterialCandidate[]> {
  const { limit = 6, threshold = 0.35 } = opts;
  const vec = await embedQuery(query);
  const literal = `[${vec.join(',')}]`;
  const rows = await prisma.$queryRawUnsafe<MaterialEmbedRow[]>(
    `SELECT m.id::text AS id, m.type::text AS type, m.title, m.description,
            m."ctaText" AS cta_text, m."externalUrl" AS external_url,
            (m."storagePath" IS NOT NULL) AS has_file,
            (1 - (m."embedding" <=> '${literal}'::vector))::float AS similarity
     FROM "Material" m
     WHERE m."embedding" IS NOT NULL
       AND m."isHidden" = false
       AND (1 - (m."embedding" <=> '${literal}'::vector)) > ${threshold}
       AND EXISTS (
         SELECT 1 FROM "LessonMaterial" lm
         JOIN "Lesson" l ON l.id = lm."lessonId"
         WHERE lm."materialId" = m.id AND l."isHidden" = false
       )
     ORDER BY m."embedding" <=> '${literal}'::vector
     LIMIT ${limit}`,
  );
  return rows.map((r) => ({
    materialId: r.id,
    type: r.type,
    title: r.title,
    description: r.description,
    ctaText: r.cta_text,
    externalUrl: r.external_url,
    hasFile: r.has_file,
    similarity: r.similarity,
  }));
}
