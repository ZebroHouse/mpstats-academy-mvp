#!/usr/bin/env npx tsx
/**
 * One-time LLM Lesson Tagging Script
 *
 * Tags all 405 lessons with:
 *   - skillCategories (1-3 multi-category)
 *   - topics (2-5 free-form Russian tags)
 *   - difficulty (EASY/MEDIUM/HARD)
 *
 * Two-stage pipeline:
 *   Stage 1: LLM tags each lesson individually (sequential, 1s delay)
 *   Stage 2: LLM clusters all raw topics into canonical forms
 *
 * Usage:
 *   npx tsx scripts/tag-lessons.ts
 *   npx tsx scripts/tag-lessons.ts --dry-run
 *   npx tsx scripts/tag-lessons.ts --skip-stage2
 *
 * Environment: OPENROUTER_API_KEY, DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY
 * Cost estimate: ~$0.05 (405 calls x ~700 tokens + 1 clustering call)
 */

import 'dotenv/config';
import { PrismaClient, type Difficulty, type SkillCategory } from '@prisma/client';
import { tagLesson, fetchLessonChunks, clusterTopics, type LessonTag } from '../packages/ai/src/tagging';

const prisma = new PrismaClient();

// CLI flags
const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_STAGE2 = process.argv.includes('--skip-stage2');

// Rate limiting delay between LLM calls (ms)
const DELAY_MS = 1000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============== STAGE 1: PER-LESSON TAGGING ==============

interface TagResult {
  lessonId: string;
  tag: LessonTag;
}

async function stage1TagLessons(): Promise<TagResult[]> {
  console.log('\n========== Stage 1: LLM Lesson Tagging ==========\n');

  const allLessons = await prisma.lesson.findMany({
    select: { id: true, title: true, courseId: true, skillCategories: true },
    orderBy: [{ courseId: 'asc' }, { order: 'asc' }],
  });

  // Skip already-tagged lessons (resume support)
  const lessons = allLessons.filter(l => !l.skillCategories || (l.skillCategories as any[]).length === 0);
  const alreadyTagged = allLessons.length - lessons.length;

  console.log(`Found ${allLessons.length} lessons (${alreadyTagged} already tagged, ${lessons.length} remaining)\n`);

  const results: TagResult[] = [];
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < lessons.length; i++) {
    const lesson = lessons[i];

    try {
      // Fetch first 3 chunks
      const chunks = await fetchLessonChunks(lesson.id, 3);

      if (chunks.length === 0) {
        console.warn(`[${i + 1}/${lessons.length}] SKIP ${lesson.id} — no chunks found`);
        skipped++;
        continue;
      }

      // Tag via LLM
      const tag = await tagLesson(lesson.id, chunks);

      // Update DB (unless dry run)
      if (!DRY_RUN) {
        await prisma.lesson.update({
          where: { id: lesson.id },
          data: {
            skillCategories: tag.skillCategories,
            topics: tag.topics,
            skillLevel: tag.difficulty as Difficulty,
            skillCategory: tag.skillCategories[0] as SkillCategory,
          },
        });
      }

      results.push({ lessonId: lesson.id, tag });

      console.log(
        `[${alreadyTagged + i + 1}/${allLessons.length}] ${lesson.id} -> [${tag.skillCategories.join(', ')}] ${tag.difficulty} | ${tag.topics.join(', ')}`
      );
    } catch (err) {
      console.error(
        `[${i + 1}/${lessons.length}] FAIL ${lesson.id}:`,
        err instanceof Error ? err.message : err
      );
      failed++;
    }

    // Rate limiting: delay between LLM calls
    if (i < lessons.length - 1) {
      await delay(DELAY_MS);
    }
  }

  console.log(`\nStage 1 complete: ${results.length} tagged, ${skipped} skipped, ${failed} failed\n`);
  return results;
}

// ============== STAGE 2: TOPIC CLUSTERING ==============

async function stage2ClusterTopics(results: TagResult[]): Promise<void> {
  console.log('\n========== Stage 2: Topic Clustering ==========\n');

  // Collect all unique raw topics
  const allRawTopics = new Set<string>();
  for (const { tag } of results) {
    for (const topic of tag.topics) {
      allRawTopics.add(topic);
    }
  }

  const uniqueTopics = Array.from(allRawTopics);
  console.log(`Unique raw topics: ${uniqueTopics.length}`);

  // Cluster via LLM
  const mapping = await clusterTopics(uniqueTopics);

  const canonicalSet = new Set(Object.values(mapping));
  console.log(`Canonical topics: ${canonicalSet.size}`);

  // Update lessons with canonical topics
  let updated = 0;
  for (const { lessonId, tag } of results) {
    const canonicalTopics = tag.topics.map((t) => mapping[t] || t);
    // De-duplicate canonical topics for this lesson
    const deduped = [...new Set(canonicalTopics)];

    if (!DRY_RUN) {
      await prisma.lesson.update({
        where: { id: lessonId },
        data: { topics: deduped },
      });
    }

    updated++;
  }

  console.log(`\nStage 2 complete: ${updated} lessons updated with canonical topics`);
}

// ============== SUMMARY ==============

function printSummary(results: TagResult[]): void {
  console.log('\n========== Summary ==========\n');

  // Count per category
  const catCount: Record<string, number> = {};
  for (const { tag } of results) {
    for (const cat of tag.skillCategories) {
      catCount[cat] = (catCount[cat] || 0) + 1;
    }
  }

  console.log('Lessons per category:');
  for (const [cat, count] of Object.entries(catCount).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${count}`);
  }

  // Count per difficulty
  const diffCount: Record<string, number> = {};
  for (const { tag } of results) {
    diffCount[tag.difficulty] = (diffCount[tag.difficulty] || 0) + 1;
  }

  console.log('\nLessons per difficulty:');
  for (const diff of ['EASY', 'MEDIUM', 'HARD']) {
    console.log(`  ${diff}: ${diffCount[diff] || 0}`);
  }

  // Total unique topics
  const allTopics = new Set<string>();
  for (const { tag } of results) {
    for (const topic of tag.topics) {
      allTopics.add(topic);
    }
  }
  console.log(`\nTotal unique topics: ${allTopics.size}`);

  if (DRY_RUN) {
    console.log('\n[DRY RUN] No database changes were made.');
  }
}

// ============== MAIN ==============

async function main(): Promise<void> {
  console.log('MPSTATS Academy — Lesson Tagging Script');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Stage 2: ${SKIP_STAGE2 ? 'SKIPPED' : 'ENABLED'}`);

  try {
    // Stage 1: Tag each lesson
    const results = await stage1TagLessons();

    if (results.length === 0) {
      console.log('No lessons tagged. Exiting.');
      return;
    }

    // Stage 2: Cluster topics (unless skipped)
    if (!SKIP_STAGE2) {
      await stage2ClusterTopics(results);
    }

    // Print summary
    printSummary(results);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
