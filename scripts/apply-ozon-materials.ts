/**
 * Apply доп.материалы for course 09_ozon_prodvizhenie (Phase B — enrichment).
 *
 * Consumes scripts/ozon-materials.json — pre-matched (lessonId already resolved
 * offline against the frozen 49-lesson map, so NO fuzzy DB matching here).
 * Source: methodologists' sheet "Дозагрузка видео" tab, Ozon section rows 90-232,
 * columns E=title / F=type / G=url / H=cta / I=isStandalone.
 *
 * Idempotent:
 *   - Material deduped by (title, externalUrl) — module presentations that repeat
 *     across a module collapse to one Material, linked to every lesson in it.
 *   - LessonMaterial upserted on (lessonId, materialId); re-run is safe.
 *   - order = per-lesson running index in sheet order.
 *
 * Usage:
 *   npx tsx scripts/apply-ozon-materials.ts            # dry-run (default)
 *   npx tsx scripts/apply-ozon-materials.ts --apply    # write to DB
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const APPLY = process.argv.includes('--apply');
const prisma = new PrismaClient();

// Weak-network resilience: retry a DB op on transient connection drops (P1017/P2028 etc.)
async function retry<T>(fn: () => Promise<T>, tries = 5): Promise<T> {
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e: any) { if (i === tries - 1) throw e; await new Promise(z => setTimeout(z, 2000 * (i + 1))); }
  }
  throw new Error('unreachable');
}

type Row = {
  lessonId: string; lessonTitle: string; materialTitle: string;
  type: string; url: string; cta: string; standalone: boolean;
};

async function main() {
  const rows: Row[] = JSON.parse(readFileSync(join(__dirname, 'ozon-materials.json'), 'utf-8'));
  console.log(`[materials] Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'} — ${rows.length} rows`);

  // Guard: every lessonId must exist in DB (course seeded).
  const dbLessons = await prisma.lesson.findMany({
    where: { courseId: '09_ozon_prodvizhenie' }, select: { id: true },
  });
  const known = new Set(dbLessons.map(l => l.id));
  const orphan = rows.filter(r => !known.has(r.lessonId));
  if (orphan.length) {
    console.error(`[materials] ${orphan.length} rows reference unknown lessonId — aborting:`);
    orphan.slice(0, 5).forEach(o => console.error('   ', o.lessonId, '::', o.materialTitle));
    process.exit(1);
  }

  // Group by lesson, preserve sheet order for per-lesson `order`.
  const byLesson = new Map<string, Row[]>();
  for (const r of rows) { const a = byLesson.get(r.lessonId) || []; a.push(r); byLesson.set(r.lessonId, a); }

  let materialsCreated = 0, materialsReused = 0, linksUpserted = 0;

  if (!APPLY) {
    const uniq = new Set(rows.map(r => `${r.materialTitle}|${r.url}`));
    console.log(`[materials] would touch ${byLesson.size} lessons, ${uniq.size} unique materials, ${rows.length} links`);
    const byType: Record<string, number> = {};
    rows.forEach(r => (byType[r.type] = (byType[r.type] || 0) + 1));
    console.log('[materials] by type:', JSON.stringify(byType));
    console.log('[DRY RUN] no writes.');
    return;
  }

  // No per-lesson transaction: over a weak network the interactive-tx 5s window
  // expires (P2028). Every op below is idempotent, so plain sequential writes with
  // per-op retry are safe to resume on a re-run.
  for (const [lessonId, items] of byLesson) {
    for (let order = 0; order < items.length; order++) {
      const r = items[order];
      const title = r.materialTitle.trim();
      const url = (r.url || '').trim() || null;
      let mat = await retry(() => prisma.material.findFirst({ where: { title, externalUrl: url } }));
      if (!mat) {
        mat = await retry(() => prisma.material.create({
          data: {
            type: r.type as any, title, description: null,
            ctaText: r.cta || 'Открыть', externalUrl: url,
            isStandalone: !!r.standalone, createdBy: 'ozon-materials-script',
          },
        }));
        materialsCreated++;
      } else {
        materialsReused++;
      }
      await retry(() => prisma.lessonMaterial.upsert({
        where: { lessonId_materialId: { lessonId, materialId: mat!.id } },
        create: { lessonId, materialId: mat!.id, order },
        update: { order },
      }));
      linksUpserted++;
    }
    console.log(`  ${lessonId}: ${items.length} materials`);
  }

  console.log(`\n[materials] DONE. materialsCreated=${materialsCreated} materialsReused=${materialsReused} linksUpserted=${linksUpserted}`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
