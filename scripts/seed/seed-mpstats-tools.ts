import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const prisma = new PrismaClient();

async function main() {
  const manifest = JSON.parse(
    readFileSync(join(__dirname, 'mpstats-tools-manifest.json'), 'utf-8'),
  );
  const c = manifest.course;

  await prisma.course.upsert({
    where: { id: c.id },
    update: { title: c.title, description: c.description, slug: c.slug, partnerKey: c.partnerKey, isFree: true, isHidden: false },
    create: { id: c.id, title: c.title, description: c.description, slug: c.slug, partnerKey: c.partnerKey, isFree: true, isHidden: false, order: 0, duration: 0 },
  });

  let order = 0;
  let totalDuration = 0;
  for (const l of manifest.lessons) {
    order += 1;
    const duration = l.duration ?? 0;
    totalDuration += duration;
    await prisma.lesson.upsert({
      where: { id: l.id },
      update: {
        title: l.title,
        videoId: l.videoId || null,
        duration: duration || null,
        order,
        metadata: { toolGroup: l.toolGroup, partnerModuleKey: l.partnerModuleKey },
      },
      create: {
        id: l.id,
        courseId: c.id,
        title: l.title,
        description: null,
        videoId: l.videoId || null,
        duration: duration || null,
        order,
        skillCategory: 'ANALYTICS',
        skillBlocks: undefined,
        metadata: { toolGroup: l.toolGroup, partnerModuleKey: l.partnerModuleKey },
      },
    });
  }

  await prisma.course.update({ where: { id: c.id }, data: { duration: totalDuration } });
  console.log(`Seeded ${manifest.lessons.length} lessons into ${c.id}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
