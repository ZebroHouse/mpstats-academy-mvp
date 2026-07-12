/**
 * Reconcile skillCategory + skillBlocks for course 09_ozon_prodvizhenie (Phase B.7 apply).
 *
 * - skillCategory: EDITORIAL per-module axis (handoff guidance: "преимущественно
 *   MARKETING — реклама/ДРР/SEO; ANALYTICS — воронка/точки роста; FINANCE —
 *   ценообразование"). Chosen over the raw classifier dominant-axis because the
 *   nano classifier over-indexes ANALYTICS (33/49) and fragments coherent module
 *   themes. Mirrors the 08_ctr precedent where the owner aligned axes manually.
 * - skillBlocks: taken verbatim from the AI classifier (skill-mapper classify)
 *   results/classification.json — the fine-grained 32-block taxonomy tags.
 *
 * Scoped to 09_ozon_prodvizhenie ONLY (unlike seed-skill-lessons.ts which is global).
 *
 * Usage:
 *   npx tsx scripts/reconcile-ozon-axis.ts            # dry-run
 *   npx tsx scripts/reconcile-ozon-axis.ts --apply    # write
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const APPLY = process.argv.includes('--apply');
const prisma = new PrismaClient();

// Weak-network resilience: retry a DB op on transient connection drops (P1017 etc.)
async function retry<T>(fn: () => Promise<T>, tries = 5): Promise<T> {
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e: any) { if (i === tries - 1) throw e; await new Promise(z => setTimeout(z, 2000 * (i + 1))); }
  }
  throw new Error('unreachable');
}

const MODULE_AXIS: Record<string, string> = {
  m01_economics: 'MARKETING',      // ДРР / экономика рекламы
  m02_pricing: 'FINANCE',          // ценообразование / акции
  m03_card_seo: 'MARKETING',       // SEO / карточка / контент
  m04_funnel: 'ANALYTICS',         // воронка продаж / точки потерь
  m05_ad_tools: 'MARKETING',       // рекламные инструменты
  m06_ad_optimization: 'MARKETING',// оптимизация рекламы / ДРР
  m07_scaling: 'ANALYTICS',        // масштабирование / система роста
  m08_growth_points: 'ANALYTICS',  // тренды / насмотренность / AB
};

function moduleOf(id: string): string {
  const m = id.match(/09_ozon_prodvizhenie_(m[0-9]+_[a-z_]+)_[0-9]+$/);
  return m ? m[1] : '';
}

async function main() {
  const classification = JSON.parse(
    readFileSync(join(__dirname, 'skill-mapping/results/classification.json'), 'utf-8'),
  );
  const list = classification.lessons || classification;
  const blocksById = new Map<string, string[]>();
  for (const e of list) {
    if ((e.lesson_id || '').startsWith('09_ozon_prodvizhenie_')) {
      blocksById.set(e.lesson_id, e.skill_blocks || []);
    }
  }

  const lessons = await prisma.lesson.findMany({
    where: { courseId: '09_ozon_prodvizhenie' },
    select: { id: true, skillCategory: true },
    orderBy: { order: 'asc' },
  });
  console.log(`[reconcile] ${lessons.length} lessons, mode ${APPLY ? 'APPLY' : 'DRY-RUN'}`);

  let updated = 0, missingBlocks = 0, axisChanged = 0;
  for (const l of lessons) {
    const mod = moduleOf(l.id);
    const axis = MODULE_AXIS[mod];
    if (!axis) { console.error('  no axis for', l.id); process.exit(1); }
    const blocks = blocksById.get(l.id) || [];
    if (!blocks.length) missingBlocks++;
    if (l.skillCategory !== axis) axisChanged++;
    if (APPLY) {
      await retry(() => prisma.lesson.update({
        where: { id: l.id },
        data: { skillCategory: axis as any, skillBlocks: blocks },
      }));
      updated++;
    }
  }

  const dist: Record<string, number> = {};
  lessons.forEach(l => { const a = MODULE_AXIS[moduleOf(l.id)]; dist[a] = (dist[a] || 0) + 1; });
  console.log('[reconcile] target skillCategory dist:', JSON.stringify(dist));
  console.log(`[reconcile] axisChanged from provisional: ${axisChanged}, lessons missing blocks: ${missingBlocks}`);
  console.log(APPLY ? `[reconcile] DONE — updated ${updated}` : '[DRY RUN] no writes.');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
