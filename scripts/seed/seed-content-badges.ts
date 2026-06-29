/**
 * Программный сид первой пачки редакторских тегов (storefront badges) на уроки/джобы.
 * БЕЗОПАСЕН: обновляет ТОЛЬКО перечисленные ниже строки. По умолчанию dry-run.
 * Запуск:
 *   NODE_OPTIONS=--dns-result-order=ipv4first npx tsx scripts/seed/seed-content-badges.ts            # dry-run
 *   NODE_OPTIONS=--dns-result-order=ipv4first npx tsx scripts/seed/seed-content-badges.ts --apply    # запись
 * Теги: START | NEW | HOT | QUICK (см. таксономию в spec).
 */
import { PrismaClient } from '@prisma/client';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const APPLY = process.argv.includes('--apply');

// ── Конфиг: owner заполняет реальными id/slug. Примеры ниже — ЗАМЕНИТЬ. ──
// Урок: ключ = Lesson.id (вид "01_analytics_m01_start_001").
const LESSON_BADGES: Record<string, string[]> = {
  '01_analytics_m01_start_001': ['START'],   // EXAMPLE — заменить на реальный стартовый урок
  '02_ads_m01_intro_001': ['NEW', 'QUICK'],  // EXAMPLE
};
// Джоба: ключ = Job.slug.
const JOB_BADGES: Record<string, string[]> = {
  'poschitat-yunit-ekonomiku-tovara': ['HOT'], // EXAMPLE — заменить на реальный slug
};

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log(`${APPLY ? '' : '[DRY-RUN] '}Уроки (${Object.keys(LESSON_BADGES).length}):`);
    for (const [id, badges] of Object.entries(LESSON_BADGES)) {
      const lesson = await prisma.lesson.findUnique({ where: { id }, select: { id: true, title: true } });
      if (!lesson) { console.log(`  ⚠ урок не найден: ${id} (пропуск)`); continue; }
      console.log(`  ${badges.join(',').padEnd(12)} ← ${lesson.title}`);
      if (APPLY) await prisma.lesson.update({ where: { id }, data: { badges } });
    }
    console.log(`\n${APPLY ? '' : '[DRY-RUN] '}Джобы (${Object.keys(JOB_BADGES).length}):`);
    for (const [slug, badges] of Object.entries(JOB_BADGES)) {
      const job = await prisma.job.findUnique({ where: { slug }, select: { slug: true, title: true } });
      if (!job) { console.log(`  ⚠ джоба не найдена: ${slug} (пропуск)`); continue; }
      console.log(`  ${badges.join(',').padEnd(12)} ← ${job.title}`);
      if (APPLY) await prisma.job.update({ where: { slug }, data: { badges } });
    }
    console.log(`\n${APPLY ? 'Готово.' : '[DRY-RUN] Ничего не записано. Запусти с --apply.'}`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
