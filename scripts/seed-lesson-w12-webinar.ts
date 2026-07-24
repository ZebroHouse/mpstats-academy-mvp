/**
 * Seed урока-вебинара 04_workshops_w12_jul26_crisis_001 (Phase B, Vision скипнут).
 * Идемпотентен (upsert по id). content_chunk (67) уже загружены в Phase A.
 * skillBlocks/topics — verbatim с валидного соседа w10_nov_crisis_002 (гарантия валидных slug'ов).
 * Запуск: NODE_OPTIONS=--dns-result-order=ipv4first npx tsx scripts/seed-lesson-w12-webinar.ts
 */
import { PrismaClient } from '@prisma/client';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();
const ID = '04_workshops_w12_jul26_crisis_001';

async function main() {
  const max = await prisma.lesson.aggregate({
    where: { courseId: '04_workshops' }, _max: { order: true },
  });
  const order = (max._max.order ?? 0) + 1; // ожидаемо 40

  const data = {
    courseId: '04_workshops',
    title: 'Антикризисный эфир 23.07.2026 — как защитить бизнес и деньги после атак на склады WB',
    duration: 126, // МИНУТЫ
    order,
    skillCategory: 'OPERATIONS' as const,
    skillCategories: ['OPERATIONS', 'FINANCE'],
    // verbatim с соседа w10_nov_crisis_002 — валидные slug'и; методологи могут ретегнуть позже
    skillBlocks: ['ANALYTICS/competitor_analysis', 'ANALYTICS/product_metrics', 'FINANCE/unit_economics'],
    topics: ['Антикризисное управление', 'Управление остатками', 'Работа с цифрами'],
    contentType: 'VIDEO' as const,
    isHidden: false,
  };

  const lesson = await prisma.lesson.upsert({
    where: { id: ID },
    update: data,          // videoId/videoUrl НЕ трогаем — их ставит Kinescope (Task 7)
    create: { id: ID, ...data },
    select: { id: true, order: true, skillCategory: true, duration: true },
  });
  console.log('✅ lesson upserted:', lesson);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
