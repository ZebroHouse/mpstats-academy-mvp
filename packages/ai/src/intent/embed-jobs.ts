import { prisma } from '@mpstats/db/client';
import { embedQuery } from '../embeddings';

export interface JobForEmbed {
  id: string;
  embedding: unknown | null;
  title: string;
  description: string | null;
  lessons: Array<{ title: string }>;
}

export function buildJobText(job: {
  title: string;
  description: string | null;
  lessons: Array<{ title: string }>;
}): string {
  const parts = [job.title];
  if (job.description) parts.push(job.description);
  for (const l of job.lessons) parts.push(l.title);
  return parts.join('\n');
}

export async function embedJob(job: JobForEmbed, opts: { force: boolean }): Promise<void> {
  if (!opts.force && job.embedding != null) return;
  const text = buildJobText(job);
  const vec = await embedQuery(text);
  const literal = `[${vec.join(',')}]`;
  await prisma.$executeRawUnsafe(
    `UPDATE "Job" SET "embedding" = '${literal}'::vector WHERE "id" = '${job.id}'`,
  );
}

export async function run({ force }: { force: boolean }): Promise<void> {
  const jobs = await prisma.job.findMany({
    select: {
      id: true,
      title: true,
      description: true,
      lessons: { select: { lesson: { select: { title: true } } } },
    },
  });
  let done = 0;
  for (const j of jobs) {
    // embedding is not in Prisma generated types (Unsupported column),
    // fetch it separately via raw query to check idempotency
    const rows = await prisma.$queryRawUnsafe<Array<{ has_embedding: boolean }>>(
      `SELECT ("embedding" IS NOT NULL) AS has_embedding FROM "Job" WHERE "id" = '${j.id}'`,
    );
    const embedding = rows[0]?.has_embedding ? 'present' : null;
    await embedJob(
      {
        id: j.id,
        embedding,
        title: j.title,
        description: j.description,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        lessons: j.lessons.map((jl: any) => ({ title: jl.lesson.title })),
      },
      { force },
    );
    done++;
    if (done % 10 === 0) console.log(`[embed-jobs] ${done}/${jobs.length}`);
  }
  console.log(`[embed-jobs] done ${done}/${jobs.length}`);
}

if (require.main === module) {
  const force = process.argv.includes('--force');
  run({ force }).then(() => process.exit(0)).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
