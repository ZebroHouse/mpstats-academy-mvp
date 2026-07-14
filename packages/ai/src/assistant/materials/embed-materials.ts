import { prisma } from '@mpstats/db/client';
import { embedQuery } from '../../embeddings';

const TYPE_LABELS: Record<string, string> = {
  PRESENTATION: 'презентация',
  CALCULATION_TABLE: 'таблица-калькулятор',
  EXTERNAL_SERVICE: 'внешний сервис',
  CHECKLIST: 'чек-лист',
  MEMO: 'памятка',
};

export function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? 'материал';
}

export function buildMaterialText(m: {
  title: string;
  description: string | null;
  type: string;
  lessonTitles: string[];
}): string {
  const parts = [m.title, typeLabel(m.type)];
  if (m.description) parts.push(m.description);
  for (const t of m.lessonTitles) parts.push(t);
  return parts.join('\n');
}

export interface MaterialForEmbed {
  id: string;
  title: string;
  description: string | null;
  type: string;
  // 'present' | null — embedding is an Unsupported column, absent from Prisma types,
  // so we probe it via a separate raw query (see run()).
  embedding: unknown | null;
  lessonTitles: string[];
}

export async function embedMaterial(m: MaterialForEmbed, opts: { force: boolean }): Promise<void> {
  if (!opts.force && m.embedding != null) return;
  const text = buildMaterialText({
    title: m.title,
    description: m.description,
    type: m.type,
    lessonTitles: m.lessonTitles,
  });
  const vec = await embedQuery(text);
  const literal = `[${vec.join(',')}]`;
  await prisma.$executeRawUnsafe(
    `UPDATE "Material" SET "embedding" = '${literal}'::vector WHERE "id" = '${m.id}'`,
  );
}

// CLI: NODE_OPTIONS=--dns-result-order=ipv4first npx tsx --conditions=react-server \
//   packages/ai/src/assistant/materials/embed-materials.ts [--force]
async function main() {
  const force = process.argv.includes('--force');
  const materials = await prisma.material.findMany({
    where: { isHidden: false },
    select: {
      id: true,
      title: true,
      description: true,
      type: true,
      lessons: {
        where: { lesson: { isHidden: false } },
        select: { lesson: { select: { title: true } } },
      },
    },
  });
  let done = 0;
  for (const m of materials) {
    // embedding is not in Prisma generated types (Unsupported column),
    // fetch it separately via raw query to check idempotency
    const rows = await prisma.$queryRawUnsafe<Array<{ has_embedding: boolean }>>(
      `SELECT ("embedding" IS NOT NULL) AS has_embedding FROM "Material" WHERE "id" = '${m.id}'`,
    );
    const embedding = rows[0]?.has_embedding ? 'present' : null;
    await embedMaterial(
      {
        id: m.id,
        title: m.title,
        description: m.description,
        type: m.type as unknown as string,
        embedding,
        lessonTitles: m.lessons.map((lm) => lm.lesson.title),
      },
      { force },
    );
    done += 1;
    if (done % 20 === 0) console.log(`embedded ${done}/${materials.length}`);
  }
  console.log(`done: ${done}/${materials.length} materials`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
