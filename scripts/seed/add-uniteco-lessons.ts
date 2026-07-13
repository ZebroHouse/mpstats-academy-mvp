/**
 * Add 2 unit-economics lessons to LIVE course 09_ozon_prodvizhenie, module m01.
 *
 * Videos existed in the methodologists' sheet (rows 96-97) but were NOT in the
 * Phase A 49-video batch. Now downloaded + staged. Inserted at order 6-7 (right
 * after m01_005), shifting m02..m08 (old order 6-49) by +2 → new total 51.
 *
 * Renumber is safe: LessonProgress/JobLesson reference lessonId (not order);
 * @@unique([courseId,order]) is respected via temp-park (order += 1000 first).
 *
 * skillBlocks left null here — set later by classify --resume + reconcile once
 * the audio RAG chunks exist for these lesson_ids.
 *
 * Usage: npx tsx scripts/seed/add-uniteco-lessons.ts [--dry-run]
 */
import { PrismaClient } from '@prisma/client';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const DRY = process.argv.includes('--dry-run');
const prisma = new PrismaClient();
const COURSE = '09_ozon_prodvizhenie';

const NEW = [
  { id: `${COURSE}_m01_economics_006`, order: 6, duration: 15, skillCategory: 'FINANCE', title: 'Юнит-экономика для Ozon' },
  { id: `${COURSE}_m01_economics_007`, order: 7, duration: 18, skillCategory: 'FINANCE', title: 'Расчёт юнит-экономики Ozon в таблице' },
];

async function main() {
  const before = await prisma.lesson.findMany({ where: { courseId: COURSE }, select: { id: true, order: true }, orderBy: { order: 'asc' } });
  console.log(`Course ${COURSE}: ${before.length} lessons (orders ${before[0]?.order}..${before[before.length - 1]?.order})`);
  console.log(`Insert at order 6,7; shift order>=6 by +2 → total ${before.length + 2}.`);
  if (DRY) { NEW.forEach(l => console.log(`  + [${l.order}] ${l.id} (${l.skillCategory}, ${l.duration}min) — ${l.title}`)); console.log('[DRY RUN] no writes.'); return; }

  await prisma.$transaction(async (tx) => {
    // 1. park everything at order >= 6
    await tx.lesson.updateMany({ where: { courseId: COURSE, order: { gte: 6 } }, data: { order: { increment: 1000 } } });
    // 2. insert new lessons at 6,7
    for (const l of NEW) {
      await tx.lesson.upsert({
        where: { id: l.id },
        update: { title: l.title, duration: l.duration, order: l.order, skillCategory: l.skillCategory as any },
        create: { id: l.id, courseId: COURSE, title: l.title, description: null, duration: l.duration, order: l.order, skillCategory: l.skillCategory as any },
      });
    }
    // 3. unpark: parked orders 1006.. → +2 of original (order - 998)
    const parked = await tx.lesson.findMany({ where: { courseId: COURSE, order: { gte: 1000 } }, select: { id: true, order: true } });
    for (const p of parked) {
      await tx.lesson.update({ where: { id: p.id }, data: { order: p.order - 998 } });
    }
    // 4. bump course duration
    const total = await tx.lesson.aggregate({ where: { courseId: COURSE }, _sum: { duration: true } });
    await tx.course.update({ where: { id: COURSE }, data: { duration: total._sum.duration ?? undefined } });
  }, { timeout: 60000 });

  const after = await prisma.lesson.findMany({ where: { courseId: COURSE }, select: { order: true }, orderBy: { order: 'asc' } });
  const orders = after.map(l => l.order);
  const ok = orders.every((v, i) => v === i + 1);
  console.log(`Done. ${after.length} lessons, order 1..${orders[orders.length - 1]}, continuous=${ok}`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
