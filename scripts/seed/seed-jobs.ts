/**
 * Seed джоб из валидированного JOB-PROPOSAL.
 * Вход: scripts/job-mapping/results/JOB-PROPOSAL.validated.json (от контент-команды).
 * Идемпотентен — upsert по slug. Запуск: npm run db:seed-jobs
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export interface ProposalJob {
  slug: string; title: string; description: string; outcomes: string[];
  axes: string[]; skillBlocks: string[]; marketplace: 'WB' | 'OZON' | 'BOTH';
  displayOrder: number; lessonIds: string[];
}

export function buildJobUpsert(job: ProposalJob) {
  const lessonRows = job.lessonIds.map((lessonId, order) => ({ lessonId, order }));
  const base = {
    title: job.title, description: job.description, outcomes: job.outcomes,
    axes: job.axes, skillBlocks: job.skillBlocks, marketplace: job.marketplace,
    displayOrder: job.displayOrder, isPublished: true,
  };
  return {
    where: { slug: job.slug },
    create: { slug: job.slug, ...base, lessons: { create: lessonRows } },
    update: { ...base, lessons: { deleteMany: {}, create: lessonRows } },
  };
}

async function main() {
  const file = path.resolve(__dirname, '../job-mapping/results/JOB-PROPOSAL.validated.json');
  if (!fs.existsSync(file)) {
    console.error(`Нет валидированного пропозала: ${file}`);
    process.exit(1);
  }
  const proposal = JSON.parse(fs.readFileSync(file, 'utf-8')) as { jobs: ProposalJob[] };
  const prisma = new PrismaClient();
  try {
    for (const job of proposal.jobs) {
      const u = buildJobUpsert(job);
      await prisma.job.upsert(u as any);
      console.log(`✔ ${job.slug} (${job.lessonIds.length} уроков)`);
    }
    console.log(`Готово: ${proposal.jobs.length} джоб.`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
