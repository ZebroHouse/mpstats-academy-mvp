/**
 * Создать Job 'wb-warehouse-crisis-2026' + привязать 3 урока по порядку.
 * Идемпотентен (upsert по slug; JobLesson через deleteMany+createMany для чистоты порядка).
 * isPublished=false НАВСЕГДА — гейт ЧП-блока только флаг EMERGENCY_BANNER_ENABLED.
 * Embedding НЕ считаем (не обязателен; при желании — admin reembedJob позже).
 * Запуск: NODE_OPTIONS=--dns-result-order=ipv4first npx tsx scripts/seed-job-warehouse-crisis.ts
 */
import { PrismaClient } from '@prisma/client';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();
const SLUG = 'wb-warehouse-crisis-2026';
const LESSONS = [
  '04_workshops_w12_jul26_crisis_001',                      // 0 — вебинар
  '04_workshops_text_d1db18c6-7275-4e16-ab16-8ca58117cd50', // 1 — «Товар пострадал…»
  '04_workshops_text_3bd9fe05-4195-41f8-a507-96fde377ec91', // 2 — «Когда принять компенсацию…»
];

async function main() {
  // Предохранитель: все 3 урока должны существовать
  const found = await prisma.lesson.findMany({ where: { id: { in: LESSONS } }, select: { id: true } });
  if (found.length !== LESSONS.length) {
    throw new Error(`Не все уроки найдены: ${found.map((l) => l.id).join(', ')}`);
  }

  const jobData = {
    title: 'Склады WB под ударом: как защитить бизнес и деньги',
    description:
      'Экстренный антикризисный разбор после атак на склады Wildberries (18–22.07.2026): ' +
      'как действовать с холодной головой, посчитать убыток, получить компенсацию и снизить риски.',
    marketplace: 'WB' as const,
    axes: ['OPERATIONS', 'FINANCE'],
    skillBlocks: ['FINANCE/unit_economics'],
    outcomes: [
      'Отличить прямой убыток от кассового разрыва и посчитать оба',
      'Проверить и получить компенсацию WB (~40% себестоимости)',
      'Разобраться, что покрывает страховка WB/Ozon и оговорка «БПЛА→теракт»',
      'Снизить риски: ФБС, диверсификация складов и каналов',
      'Действовать без паники и преждевременных коллективных исков',
    ],
    displayOrder: 0,
    isPublished: false,
  };

  const job = await prisma.job.upsert({
    where: { slug: SLUG },
    update: jobData,
    create: { slug: SLUG, ...jobData },
    select: { id: true, slug: true },
  });

  await prisma.jobLesson.deleteMany({ where: { jobId: job.id } });
  await prisma.jobLesson.createMany({
    data: LESSONS.map((lessonId, order) => ({ jobId: job.id, lessonId, order })),
  });

  const rows = await prisma.jobLesson.findMany({
    where: { jobId: job.id }, orderBy: { order: 'asc' }, select: { lessonId: true, order: true },
  });
  console.log('✅ job:', job.slug, 'lessons:', rows);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
