/**
 * Предусловие job-mapping (спек §9): отчёт о дублях-уроках среди ВИДИМОГО контента.
 * Дубли внутри одного курса по visible-урокам = данные грязные, чинить до прогона.
 * Read-only.
 */
import { PrismaClient } from '@prisma/client';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function main() {
  const prisma = new PrismaClient();
  try {
    const dups: { title: string; n: number; courses: string[] }[] = await prisma.$queryRawUnsafe(`
      SELECT title, COUNT(*)::int n, array_agg(DISTINCT "courseId") courses
      FROM "Lesson"
      WHERE "isHidden" = false
        AND "courseId" <> '06_express'
        AND "courseId" IN (SELECT id FROM "Course" WHERE "isHidden" = false)
      GROUP BY title
      HAVING COUNT(*) > 1
      ORDER BY n DESC
    `);
    if (dups.length === 0) {
      console.log('✅ Дублей среди видимых уроков нет — можно запускать пайплайн.');
    } else {
      console.log(`⚠️  Найдено ${dups.length} групп дублей среди ВИДИМЫХ уроков:`);
      for (const d of dups) console.log(`  x${d.n}  "${d.title}"  → ${d.courses.join(', ')}`);
      console.log('\nПочинить (dedup-lessons.ts) или подтвердить с контент-командой до полного прогона.');
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
