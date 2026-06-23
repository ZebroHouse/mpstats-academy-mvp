/**
 * Seed script: create skill-based courses, lessons, and apply skillBlocks mapping.
 *
 * 1. Creates 4 container courses: skill_analytics, skill_marketing, skill_finance, skill_operations
 * 2. Upserts Lesson records from _rename_map.json (all mappings) + transcript durations
 * 3. Applies skillBlocks from classification.json to ALL existing lessons
 *
 * Usage:
 *   npx tsx scripts/seed/seed-skill-lessons.ts --dry-run
 *   npx tsx scripts/seed/seed-skill-lessons.ts
 */

import { PrismaClient, SkillCategory } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

// --- Paths ---
const RENAME_MAP = 'E:/Academy Courses/skills/_rename_map.json';
const TRANSCRIPTS_BASE = 'E:/Academy Courses/transcripts/skills';
const CLASSIFICATION_FILE = path.resolve(__dirname, '../skill-mapping/results/classification.json');

// --- Types ---
interface RenameEntry {
  lesson_id: string;
  title_original: string;
  skill_axis: string;
  skill_block: string;
  block_title: string;
  order: number;
  renamed: string; // relative path: "analytics/assortment/001_assortment_as_system.mp4"
}

interface RenameMap {
  mappings: RenameEntry[];
}

interface ClassificationEntry {
  lesson_id: string;
  skill_blocks: string[];
}

interface ClassificationResult {
  lessons: ClassificationEntry[];
}

// --- Helpers ---
function log(msg: string) {
  process.stdout.write(`${msg}\n`);
}

/** Get duration in minutes from transcript (last segment end) */
function getDurationFromTranscript(lessonId: string, entry: RenameEntry): number | null {
  // Build transcript path from renamed field: "analytics/assortment/001_foo.mp4" -> "analytics/assortment/lesson_id.json"
  const dir = path.dirname(entry.renamed); // "analytics/assortment"
  const transcriptPath = path.join(TRANSCRIPTS_BASE, dir, `${lessonId}.json`);

  if (!fs.existsSync(transcriptPath)) return null;

  try {
    const data = JSON.parse(fs.readFileSync(transcriptPath, 'utf-8'));
    const segments = data.segments || [];
    if (segments.length === 0) return null;
    const lastEnd = segments[segments.length - 1].end || 0;
    return Math.ceil(lastEnd / 60);
  } catch {
    return null;
  }
}

// --- Skill axis to SkillCategory mapping (all 5 axes; enum supports them) ---
const AXIS_TO_CATEGORY: Record<string, SkillCategory> = {
  ANALYTICS: 'ANALYTICS',
  MARKETING: 'MARKETING',
  CONTENT: 'CONTENT',
  OPERATIONS: 'OPERATIONS',
  FINANCE: 'FINANCE',
};

// --- Skill axis to container course mapping ---
// Explicit per-axis routing. Unknown axis throws (no silent fallback to
// skill_marketing / ANALYTICS — that bug sent FINANCE/OPERATIONS to the wrong
// bucket and mis-tagged skillCategory before batch 17.06.26).
const AXIS_TO_COURSE: Record<string, string> = {
  ANALYTICS: 'skill_analytics',
  MARKETING: 'skill_marketing',
  FINANCE: 'skill_finance',
  OPERATIONS: 'skill_operations',
};

// --- Container courses for skill-based lessons ---
const SKILL_COURSES = [
  {
    id: 'skill_analytics',
    title: 'Навыковые уроки: Аналитика',
    description: 'Уроки по аналитическим навыкам (ассортимент, фокусные товары, ЦА)',
    slug: 'skill-analytics',
    order: 10,
  },
  {
    id: 'skill_marketing',
    title: 'Навыковые уроки: Маркетинг',
    description: 'Уроки по маркетингу (SEO-оптимизация, метрики РК)',
    slug: 'skill-marketing',
    order: 11,
  },
  {
    id: 'skill_finance',
    title: 'Навыковые уроки: Финансы',
    description: 'Уроки по финансам (P&L, юнит-экономика, управление затратами)',
    slug: 'skill-finance',
    order: 12,
  },
  {
    id: 'skill_operations',
    title: 'Навыковые уроки: Операции',
    description: 'Уроки по операциям (поставки, логистика FBO/FBS, география складов)',
    slug: 'skill-operations',
    order: 13,
  },
];

async function main() {
  if (DRY_RUN) log('[DRY RUN] No database changes will be made.\n');

  // --- Load data ---
  const renameMap: RenameMap = JSON.parse(fs.readFileSync(RENAME_MAP, 'utf-8'));
  log(`Loaded rename map: ${renameMap.mappings.length} entries`);

  const classification: ClassificationResult = JSON.parse(fs.readFileSync(CLASSIFICATION_FILE, 'utf-8'));
  const classMap = new Map(classification.lessons.map((l) => [l.lesson_id, l.skill_blocks]));
  log(`Loaded classification: ${classification.lessons.length} lessons`);

  // --- Step 1: Create container courses ---
  log('\n--- Step 1: Container courses ---');
  for (const course of SKILL_COURSES) {
    log(`  ${course.id}: ${course.title}`);
    if (!DRY_RUN) {
      await prisma.course.upsert({
        where: { id: course.id },
        update: { title: course.title, description: course.description, order: course.order },
        create: {
          id: course.id,
          title: course.title,
          description: course.description,
          slug: course.slug,
          order: course.order,
          duration: 0,
          isHidden: true, // hidden from course list, visible through playbooks later
        },
      });
    }
  }

  // --- Step 2: Upsert skill lessons into their container ---
  log('\n--- Step 2: Skill lessons ---');
  let totalDuration = 0;

  // Lessons created in a skill_ container by an earlier batch get migrated to a
  // real course later (Step 4). Detect those: never re-touch their courseId/order
  // (the per-block staging order would collide with module lessons in the real
  // course). They only need a skillBlocks refresh.
  const existing = await prisma.lesson.findMany({
    where: { id: { in: renameMap.mappings.map((e) => e.lesson_id) } },
    select: { id: true, courseId: true },
  });
  const courseById = new Map(existing.map((l) => [l.id, l.courseId]));
  const isMigrated = (id: string) => {
    const c = courseById.get(id);
    return c !== undefined && !c.startsWith('skill_');
  };

  // Assign container-unique sequential order (1..N) to staged lessons. The
  // rename_map `order` is numbered per block, so it repeats across blocks within
  // one container and violates @@unique([courseId, order]). Deterministic:
  // group by container, sort by (block, original order).
  const stagedOrder = new Map<string, number>();
  const byCourse = new Map<string, RenameEntry[]>();
  for (const e of renameMap.mappings) {
    if (isMigrated(e.lesson_id)) continue;
    const c = AXIS_TO_COURSE[e.skill_axis];
    if (!c) {
      throw new Error(
        `Unknown skill_axis "${e.skill_axis}" for lesson ${e.lesson_id}. ` +
        `Add it to AXIS_TO_COURSE + AXIS_TO_CATEGORY (and a container course if needed).`
      );
    }
    if (!byCourse.has(c)) byCourse.set(c, []);
    byCourse.get(c)!.push(e);
  }
  for (const list of byCourse.values()) {
    list
      .sort((a, b) => a.skill_block.localeCompare(b.skill_block) || a.order - b.order)
      .forEach((e, i) => stagedOrder.set(e.lesson_id, i + 1));
  }

  for (const entry of renameMap.mappings) {
    const courseId = AXIS_TO_COURSE[entry.skill_axis];
    const skillCategory = AXIS_TO_CATEGORY[entry.skill_axis];
    if (!courseId || !skillCategory) {
      throw new Error(
        `Unknown skill_axis "${entry.skill_axis}" for lesson ${entry.lesson_id}. ` +
        `Add it to AXIS_TO_COURSE + AXIS_TO_CATEGORY (and a container course if needed).`
      );
    }
    const skillBlocks = classMap.get(entry.lesson_id) || [];

    // Migrated lesson: refresh skillBlocks only, leave course/order intact.
    if (isMigrated(entry.lesson_id)) {
      log(`  [migrated → ${courseById.get(entry.lesson_id)}] ${entry.lesson_id}: refresh blocks only`);
      if (!DRY_RUN && skillBlocks.length > 0) {
        await prisma.lesson.update({
          where: { id: entry.lesson_id },
          data: { skillBlocks },
        });
      }
      continue;
    }

    const duration = getDurationFromTranscript(entry.lesson_id, entry);
    const order = stagedOrder.get(entry.lesson_id)!;

    log(`  ${entry.lesson_id}: "${entry.title_original}" (${duration || '?'} min) → ${courseId} #${order} [${skillBlocks.join(', ')}]`);

    if (duration) totalDuration += duration;

    if (!DRY_RUN) {
      await prisma.lesson.upsert({
        where: { id: entry.lesson_id },
        update: {
          title: entry.title_original,
          description: `${entry.block_title} — ${entry.skill_axis.toLowerCase()}`,
          order,
          duration,
          skillCategory,
          skillBlocks: skillBlocks.length > 0 ? skillBlocks : undefined,
        },
        create: {
          id: entry.lesson_id,
          courseId,
          title: entry.title_original,
          description: `${entry.block_title} — ${entry.skill_axis.toLowerCase()}`,
          order,
          duration,
          skillCategory,
          skillLevel: 'MEDIUM',
          skillBlocks: skillBlocks.length > 0 ? skillBlocks : undefined,
        },
      });
    }
  }

  log(`  Total: ${stagedOrder.size} staged lessons, ${totalDuration} min`);

  // Update course durations
  if (!DRY_RUN) {
    for (const course of SKILL_COURSES) {
      const lessons = await prisma.lesson.findMany({
        where: { courseId: course.id },
        select: { duration: true },
      });
      const courseDuration = lessons.reduce((sum, l) => sum + (l.duration || 0), 0);
      await prisma.course.update({
        where: { id: course.id },
        data: { duration: courseDuration },
      });
    }
  }

  // --- Step 3: Apply skillBlocks to ALL existing lessons ---
  log('\n--- Step 3: Apply skillBlocks to existing lessons ---');
  let updated = 0;
  let skipped = 0;

  // Partner-course lessons (e.g. 07_instruments "Инструменты MPSTATS") are
  // isolated via Course.partnerKey, NOT via skillBlocks. Applying skillBlocks to
  // them is inert (jobs/diagnostic/track all filter partnerKey IS NULL) and a
  // latent isolation risk: a future JobLesson linker matching
  // Lesson.skillBlocks → Job.skillBlocks without a partnerKey guard would leak
  // partner lessons into jobs. Keep them out of the skill taxonomy entirely.
  const partnerLessonIds = new Set(
    (
      await prisma.lesson.findMany({
        where: { course: { partnerKey: { not: null } } },
        select: { id: true },
      })
    ).map((l) => l.id)
  );
  log(`  Excluding ${partnerLessonIds.size} partner-course lessons from skillBlocks application`);

  for (const entry of classification.lessons) {
    // Skip skill_ lessons — already handled in Step 2
    if (entry.lesson_id.startsWith('skill_')) continue;

    // Skip partner-course lessons — isolated via partnerKey, not skillBlocks
    if (partnerLessonIds.has(entry.lesson_id)) {
      skipped++;
      continue;
    }

    const blocks = entry.skill_blocks;
    if (blocks.length === 0) {
      skipped++;
      continue;
    }

    if (!DRY_RUN) {
      try {
        await prisma.lesson.update({
          where: { id: entry.lesson_id },
          data: { skillBlocks: blocks },
        });
        updated++;
      } catch {
        // Lesson might not exist in Prisma (13 orphan lesson_ids in content_chunk)
        skipped++;
      }
    } else {
      updated++;
    }
  }

  log(`  Updated: ${updated}, Skipped: ${skipped}`);

  // --- Summary ---
  log('\n=== SUMMARY ===');
  log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  log(`Container courses: ${SKILL_COURSES.length}`);
  log(`New skill lessons: ${renameMap.mappings.length}`);
  log(`Existing lessons with skillBlocks: ${updated}`);
  log(`Skipped (no Lesson record): ${skipped}`);

  if (!DRY_RUN) {
    const totalLessons = await prisma.lesson.count();
    // Raw count — Prisma's `NOT: { skillBlocks: null }` filter throws on JSONB columns.
    const [{ count: withBlocks }] = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT count(*)::int AS count FROM "Lesson" WHERE "skillBlocks" IS NOT NULL
    `;
    log(`\nTotal lessons in DB: ${totalLessons}`);
    log(`With skillBlocks: ${withBlocks}`);
  }
}

main()
  .catch((err) => { console.error('Failed:', err.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
