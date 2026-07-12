/**
 * Seed course 09_ozon_prodvizhenie «Ozon PROдвижение» (Phase B).
 *
 * Idempotent upsert of Course + 49 Lessons from ozon-manifest.json.
 * Lesson ids are FROZEN — they must match content_chunk.lesson_id (369 audio
 * chunks already uploaded as 09_ozon_prodvizhenie_mNN_*). Do NOT rename ids.
 *
 * Module is encoded ONLY in the id substring (_m01_.._m08_); there is no module
 * column. `order` is a single continuous sequence 1..49 across all 8 modules
 * (constraint @@unique([courseId, order])).
 *
 * Course seeded isHidden=true (no Kinescope videos yet). Reveal after upload +
 * axis/skillBlocks reconciliation from classification.json.
 * videoId/videoUrl are NOT touched here — kinescope-upload.ts sets them.
 * skillCategory in the manifest is PROVISIONAL per-module — reconcile to the
 * classifier's dominant axis before reveal.
 *
 * Usage:
 *   NODE_OPTIONS=--dns-result-order=ipv4first npx tsx scripts/seed/seed-ozon.ts
 *   ... --dry-run   # print plan, no writes
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const DRY_RUN = process.argv.includes('--dry-run');
const prisma = new PrismaClient();

async function main() {
  const manifest = JSON.parse(readFileSync(join(__dirname, 'ozon-manifest.json'), 'utf-8'));
  const c = manifest.course;
  const totalDuration = manifest.lessons.reduce((sum: number, l: any) => sum + (l.duration ?? 0), 0);

  console.log(`Course ${c.id} "${c.title}" — ${manifest.lessons.length} lessons, ${totalDuration} min, isHidden=${c.isHidden}`);
  if (DRY_RUN) {
    for (const l of manifest.lessons) {
      console.log(`  [${l.order}] ${l.id} — ${l.skillCategory} — ${l.duration}min — ${l.title}`);
    }
    console.log('[DRY RUN] no writes.');
    return;
  }

  await prisma.course.upsert({
    where: { id: c.id },
    update: { title: c.title, description: c.description, slug: c.slug, order: c.order, price: c.price, isFree: c.isFree, isHidden: c.isHidden, duration: totalDuration, partnerKey: null },
    create: { id: c.id, title: c.title, description: c.description, slug: c.slug, order: c.order, price: c.price, isFree: c.isFree, isHidden: c.isHidden, duration: totalDuration, partnerKey: null },
  });

  for (const l of manifest.lessons) {
    await prisma.lesson.upsert({
      where: { id: l.id },
      // videoId/videoUrl intentionally omitted — Kinescope upload owns them.
      update: { title: l.title, duration: l.duration ?? null, order: l.order, skillCategory: l.skillCategory },
      create: { id: l.id, courseId: c.id, title: l.title, description: null, duration: l.duration ?? null, order: l.order, skillCategory: l.skillCategory },
    });
    console.log(`  upserted ${l.id} (${l.skillCategory}, order ${l.order})`);
  }

  console.log(`\nDone. Course duration set to ${totalDuration} min.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
