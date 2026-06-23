/**
 * Пересборка рекламных плейбуков (ось MARKETING) под структуру методологов.
 * Вход: scripts/job-mapping/results/JOB-PROPOSAL-ads.json
 *   { jobs: ProposalJob[], retire: string[] }
 * Идемпотентен — upsert по slug; уроки пересоздаются. Ретайр = снятие isPublished (НЕ удаление).
 * Запуск:  npx tsx scripts/seed/seed-ads-playbooks.ts [--dry-run]
 * Аддитивно: нейронка/визуал/контент/аналитика/Ozon-плейбуки не трогаются.
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { buildJobUpsert, type ProposalJob } from './seed-jobs';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const DRY = process.argv.includes('--dry-run');

async function main() {
  const file = path.resolve(__dirname, '../job-mapping/results/JOB-PROPOSAL-ads.json');
  if (!fs.existsSync(file)) { console.error(`Нет пропозала: ${file}`); process.exit(1); }
  const { jobs, retire } = JSON.parse(fs.readFileSync(file, 'utf-8')) as { jobs: ProposalJob[]; retire: string[] };

  const prisma = new PrismaClient();
  try {
    // pre-flight: все lessonIds существуют (не сидим висячие связи)
    const allLessonIds = Array.from(new Set(jobs.flatMap((j) => j.lessonIds)));
    const found = await prisma.lesson.findMany({ where: { id: { in: allLessonIds } }, select: { id: true } });
    const foundSet = new Set(found.map((l) => l.id));
    const missing = allLessonIds.filter((id) => !foundSet.has(id));
    if (missing.length) { console.error(`❌ ${missing.length} lessonId не найдены в БД:\n  ${missing.join('\n  ')}`); process.exit(1); }
    console.log(`✓ Pre-flight: все ${allLessonIds.length} lessonId существуют.`);

    console.log(`\n${DRY ? '[DRY-RUN] ' : ''}Upsert ${jobs.length} рекламных плейбуков:`);
    for (const job of jobs) {
      console.log(`  ${job.isPublished === false ? '○ draft' : '● pub  '} [${job.marketplace}] ${job.lessonIds.length}l · ${job.slug}`);
      if (!DRY) await prisma.job.upsert(buildJobUpsert(job) as any);
    }

    console.log(`\n${DRY ? '[DRY-RUN] ' : ''}Ретайр (unpublish) ${retire.length} устаревших дублей:`);
    for (const slug of retire) {
      const job = await prisma.job.findUnique({ where: { slug }, select: { slug: true, title: true, isPublished: true } });
      if (!job) { console.log(`  ⚠ не найден: ${slug} (пропуск)`); continue; }
      console.log(`  ↓ "${job.title}" (был pub=${job.isPublished})`);
      if (!DRY) await prisma.job.update({ where: { slug }, data: { isPublished: false } });
    }

    console.log(`\n${DRY ? '[DRY-RUN] Ничего не записано.' : 'Готово.'}`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
