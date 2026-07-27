// scripts/crisis-job-stats.ts
/**
 * Срез по ЧП-джобе wb-warehouse-crisis-2026: воронка показ→клик→CTR (по поверхностям)
 * + открыл→досмотрел (LessonProgress, не-test). Запуск по запросу.
 * NODE_OPTIONS=--dns-result-order=ipv4first npx tsx scripts/crisis-job-stats.ts
 */
import { PrismaClient } from '@prisma/client';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();
const LESSONS: Record<string, string> = {
  '04_workshops_w12_jul26_crisis_001': 'Вебинар',
  '04_workshops_text_d1db18c6-7275-4e16-ab16-8ca58117cd50': 'Текст: ущерб',
  '04_workshops_text_3bd9fe05-4195-41f8-a507-96fde377ec91': 'Текст: компенсация',
};
const IDS = Object.keys(LESSONS);

async function main() {
  // Показы/клики по поверхностям
  const events = await prisma.emergencyBlockEventDay.groupBy({
    by: ['surface', 'kind'], _sum: { count: true },
  });
  const val = (s: string, k: string) => events.find((e) => e.surface === s && e.kind === k)?._sum.count ?? 0;
  console.log('\n=== ЧП-блок: показы → клики → CTR ===');
  for (const s of ['BANNER', 'PIN'] as const) {
    const imp = val(s, 'IMPRESSION'); const clk = val(s, 'CLICK');
    const ctr = imp ? `${Math.round((clk / imp) * 1000) / 10}%` : '—';
    console.log(`  ${s.padEnd(7)} показов: ${imp} · кликов: ${clk} · CTR: ${ctr}`);
  }

  // Открыл → досмотрел (не-test)
  const progress = await prisma.lessonProgress.findMany({
    where: { lessonId: { in: IDS } },
    select: { lessonId: true, status: true, watchedPercent: true, path: { select: { userId: true } } },
  });
  const uids = [...new Set(progress.map((p) => p.path.userId))];
  const tests = new Set((await prisma.userProfile.findMany({ where: { id: { in: uids }, isTest: true }, select: { id: true } })).map((u) => u.id));
  const real = progress.filter((p) => !tests.has(p.path.userId));
  console.log('\n=== Уроки джобы: открыл → досмотрел (не-test) ===');
  for (const id of IDS) {
    const rows = real.filter((r) => r.lessonId === id);
    const opened = rows.filter((r) => r.status !== 'NOT_STARTED');
    const done = rows.filter((r) => r.status === 'COMPLETED').length;
    const avg = opened.length ? Math.round(opened.reduce((s, r) => s + r.watchedPercent, 0) / opened.length) : 0;
    console.log(`  ${LESSONS[id].padEnd(20)} открыли: ${opened.length} · досмотрели: ${done} · ср: ${avg}%`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
