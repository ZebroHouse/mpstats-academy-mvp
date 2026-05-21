#!/usr/bin/env npx tsx
/**
 * Re-tag lesson difficulty with module progression context.
 *
 * Problem: First pass tagged only 8/405 as HARD because LLM evaluated
 * each lesson in isolation. This pass gives LLM:
 *   - Position in module ("Lesson 7 of 9 in module Юнит-экономика")
 *   - Course and module name
 *   - Calibrated scale with clear marketplace-seller context
 *
 * Only updates skillLevel — preserves skillCategories and topics.
 *
 * Usage:
 *   npx tsx scripts/retag-difficulty.ts
 *   npx tsx scripts/retag-difficulty.ts --dry-run
 */

import 'dotenv/config';
import { PrismaClient, type Difficulty } from '@prisma/client';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');
const DELAY_MS = 800;

const openrouter = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY || '',
  defaultHeaders: {
    'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
    'X-Title': 'MPSTATS Academy',
  },
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
);

const MODEL = process.env.OPENROUTER_DEFAULT_MODEL || 'google/gemini-3.1-flash-lite-preview';
const FALLBACK = process.env.OPENROUTER_FALLBACK_MODEL || 'google/gemini-3-flash-preview';

const DIFFICULTY_PROMPT = `You are a curriculum difficulty assessor for MPSTATS Academy — an online education platform for marketplace sellers (Ozon, Wildberries).

You will receive:
- Lesson content (transcript excerpt)
- Position in module: "Lesson N of M in module [name]"
- Course name

Rate difficulty using this CALIBRATED scale for marketplace sellers:

EASY (expect ~20% of lessons):
- Introductions, definitions, "what is X", course navigation
- First 1-2 lessons of any module (setting context)
- Simple one-step instructions (e.g., "how to register on Ozon")

MEDIUM (expect ~55% of lessons):
- Practical skills: using tools, reading reports, basic calculations
- Standard workflows: setting up ads, creating product cards
- Applied knowledge that requires following steps

HARD (expect ~25% of lessons):
- Multi-factor analysis: combining unit economics + ads + seasonality
- Strategy and optimization: not just "how to set up" but "how to optimize"
- Advanced calculations: profitability modeling, budget allocation
- Lessons that BUILD ON previous lessons (late in module progression)
- Cross-domain thinking: requires knowledge from multiple areas
- Real-world case studies with complex decision-making

IMPORTANT: A lesson that is "part 7 of 9" in a module is MORE LIKELY to be HARD than "part 1 of 9".
Late-module lessons typically synthesize earlier knowledge and tackle harder problems.

Respond with ONLY one word: EASY, MEDIUM, or HARD`;

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fetchChunks(lessonId: string): Promise<string[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const { data, error } = await supabase
      .from('content_chunk')
      .select('content')
      .eq('lesson_id', lessonId)
      .order('timecode_start', { ascending: true })
      .limit(2)
      .abortSignal(controller.signal);
    if (error) throw new Error(error.message);
    return (data || []).map(r => r.content);
  } finally {
    clearTimeout(timeout);
  }
}

async function rateDifficulty(
  chunks: string[],
  lessonTitle: string,
  position: string,
  courseName: string,
): Promise<Difficulty> {
  const userContent = `Course: ${courseName}
Position: ${position}
Lesson: ${lessonTitle}

Content excerpt:
${chunks.join('\n\n---\n\n').substring(0, 2000)}`;

  for (const model of [MODEL, FALLBACK]) {
    try {
      const response = await openrouter.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: DIFFICULTY_PROMPT },
          { role: 'user', content: userContent },
        ],
        max_tokens: 10,
        temperature: 0.1,
      });

      const raw = (response.choices[0]?.message?.content || '').trim().toUpperCase();
      if (raw === 'EASY' || raw === 'MEDIUM' || raw === 'HARD') return raw as Difficulty;
      // Try to extract from longer response
      if (raw.includes('HARD')) return 'HARD';
      if (raw.includes('EASY')) return 'EASY';
      return 'MEDIUM';
    } catch {
      continue;
    }
  }
  return 'MEDIUM'; // fallback
}

async function main() {
  console.log('MPSTATS Academy — Difficulty Re-tagging');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log();

  // Get all lessons with module context
  const lessons = await prisma.lesson.findMany({
    select: { id: true, title: true, courseId: true, order: true, skillLevel: true },
    orderBy: [{ courseId: 'asc' }, { order: 'asc' }],
  });

  // Group by module (extract module from lesson ID pattern: courseId_moduleId_lessonNum)
  const moduleMap = new Map<string, typeof lessons>();
  for (const l of lessons) {
    // ID pattern: 01_analytics_m02_economics_001 → module = 01_analytics_m02_economics
    const parts = l.id.split('_');
    // Find module: everything up to the last numeric segment
    const lastIdx = parts.length - 1;
    const moduleKey = parts.slice(0, lastIdx).join('_');
    if (!moduleMap.has(moduleKey)) moduleMap.set(moduleKey, []);
    moduleMap.get(moduleKey)!.push(l);
  }

  // Course name mapping
  const courses = await prisma.course.findMany({ select: { id: true, title: true } });
  const courseNames = new Map(courses.map(c => [c.id, c.title]));

  console.log(`Found ${lessons.length} lessons in ${moduleMap.size} modules\n`);

  let changed = 0;
  let failed = 0;
  let processed = 0;
  const distribution: Record<string, number> = { EASY: 0, MEDIUM: 0, HARD: 0 };

  for (const [moduleKey, moduleLessons] of moduleMap) {
    const moduleSize = moduleLessons.length;
    // Extract readable module name from key
    const moduleName = moduleKey.replace(/^\d+_\w+_/, '').replace(/_/g, ' ');

    for (let idx = 0; idx < moduleLessons.length; idx++) {
      const lesson = moduleLessons[idx];
      processed++;

      try {
        const chunks = await fetchChunks(lesson.id);
        if (chunks.length === 0) {
          distribution[lesson.skillLevel]++;
          continue; // keep existing
        }

        const position = `Lesson ${idx + 1} of ${moduleSize} in module "${moduleName}"`;
        const courseName = courseNames.get(lesson.courseId) || lesson.courseId;
        const newDifficulty = await rateDifficulty(chunks, lesson.title, position, courseName);

        distribution[newDifficulty]++;

        if (newDifficulty !== lesson.skillLevel) {
          if (!DRY_RUN) {
            await prisma.lesson.update({
              where: { id: lesson.id },
              data: { skillLevel: newDifficulty },
            });
          }
          console.log(`[${processed}/${lessons.length}] ${lesson.id}: ${lesson.skillLevel} → ${newDifficulty}`);
          changed++;
        } else {
          // Same — just show progress every 50
          if (processed % 50 === 0) {
            console.log(`[${processed}/${lessons.length}] ... (${changed} changed so far)`);
          }
        }
      } catch (err) {
        failed++;
        console.error(`[${processed}/${lessons.length}] FAIL ${lesson.id}: ${err instanceof Error ? err.message : err}`);
        distribution[lesson.skillLevel]++;
      }

      if (idx < moduleLessons.length - 1) await delay(DELAY_MS);
    }
  }

  console.log(`\n========== Results ==========`);
  console.log(`Processed: ${processed}`);
  console.log(`Changed: ${changed}`);
  console.log(`Failed: ${failed}`);
  console.log(`\nNew distribution:`);
  console.log(`  EASY: ${distribution.EASY}`);
  console.log(`  MEDIUM: ${distribution.MEDIUM}`);
  console.log(`  HARD: ${distribution.HARD}`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
