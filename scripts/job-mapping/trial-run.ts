/**
 * Job Mapping — TRIAL RUN (spike, not the final pipeline)
 *
 * Goal: validate the hypothesis "seller jobs-to-be-done cluster cleanly out of
 * lesson CONTENT (transcripts), independent of course/module structure."
 *
 * Steps:
 *   1. Sample ~25 lessons spread across all courses
 *   2. DISCOVER: per lesson, LLM reads the transcript and names 1-3 concrete
 *      seller jobs it helps complete (+ which of 5 axes it touches)
 *   3. CLUSTER: one LLM call groups all raw jobs into consolidated jobs with
 *      member lessons + axes/skill coverage (the "bridge" data for diagnostics)
 *   4. Write a human-readable digest to results/
 *
 * Read-only against the DB (SELECT via $queryRawUnsafe). No writes, no DDL.
 *
 * Usage: npx tsx scripts/job-mapping/trial-run.ts [--per-course=5] [--concurrency=5]
 */

import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const RESULTS_DIR = path.resolve(__dirname, 'results');
const MODEL = 'openai/gpt-4.1-mini'; // project's quality choice (nano too weak — see Key Decisions)

function createClient(): OpenAI {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key || key === 'build-placeholder') throw new Error('OPENROUTER_API_KEY not in .env');
  return new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: key,
    defaultHeaders: {
      'HTTP-Referer': 'https://platform.mpstats.academy',
      'X-Title': 'MPSTATS Academy Job Mapper (trial)',
    },
  });
}

function log(msg: string) {
  process.stdout.write(`[${new Date().toLocaleTimeString()}] ${msg}\n`);
}

async function callLLM(client: OpenAI, system: string, user: string, maxTokens = 1024): Promise<string> {
  const r = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    max_tokens: maxTokens,
    temperature: 0.3,
    response_format: { type: 'json_object' },
  });
  return r.choices[0]?.message?.content || '{}';
}

async function parallel<T, R>(items: T[], concurrency: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

/** course id = leading "NN_name" segment of a lesson id */
function courseOf(lessonId: string): string {
  const m = lessonId.match(/^\d+_[a-z]+/);
  return m ? m[0] : 'other';
}

const DISCOVER_SYSTEM = `Ты анализируешь урок онлайн-академии для селлеров маркетплейсов (Wildberries, Ozon).

Прочитай содержимое урока и определи 1-3 конкретные ЗАДАЧИ селлера (jobs-to-be-done), которые этот урок помогает выполнить.

Что такое задача (job):
- Это то, что селлер хочет СДЕЛАТЬ и какой РЕЗУЛЬТАТ получить
- Формулируй от лица селлера, через глагол: "Вывести новый товар в топ", "Посчитать юнит-экономику товара", "Снизить ДРР рекламной кампании"
- Это НЕ навык и НЕ тема. "Аналитика" — тема. "Выбрать прибыльную нишу для запуска" — задача.
- Если урок вводный/теоретический — сформулируй задачу, к подготовке которой он относится

Также укажи, какие из 5 направлений урок реально затрагивает:
ANALYTICS (аналитика, конкуренты, ниши, спрос), MARKETING (SEO, реклама, продвижение),
CONTENT (фото, видео, тексты, карточка), OPERATIONS (логистика, остатки, кабинет, Ozon),
FINANCE (юнит-экономика, маржа, бюджеты, цены).

Ответ строго в JSON: {"jobs": ["задача 1", "задача 2"], "axes": ["ANALYTICS", "FINANCE"]}`;

const CLUSTER_SYSTEM = `Ты проектируешь каталог онлайн-академии для селлеров маркетплейсов.

Тебе дан список уроков, и для каждого — задачи селлера (jobs-to-be-done), которые он закрывает.

Задача: сгруппировать уроки в УКРУПНЁННЫЕ ДЖОБЫ. Джоба — одна крупная цель селлера,
к которой ведёт последовательность из нескольких уроков. Примеры джоб:
"Запустить новый товар с нуля", "Сделать рекламу прибыльной", "Собрать продающую карточку".

Правила:
- Каждый урок попадает хотя бы в одну джобу; урок МОЖЕТ входить в несколько джоб
- Джоба содержательна, если в ней >= 2 уроков (одиночные — помечай отдельно)
- Название джобы — глагол + результат, понятно селлеру
- Для каждой джобы укажи направления (axes), которые она закрывает — это связь с диагностикой
- Уроки в джобе перечисли в логичном порядке прохождения

Ответ строго в JSON:
{"jobs": [{"title": "...", "description": "...", "axes": ["MARKETING"], "lesson_ids": ["id1","id2"]}],
 "orphans": ["lesson_id урока, который не лёг ни в одну джобу"]}`;

interface DiscoverEntry {
  lesson_id: string;
  course: string;
  title: string | null;
  jobs: string[];
  axes: string[];
  chars_used: number;
}

async function main() {
  const args = process.argv.slice(2);
  const perCourse = parseInt(args.find((a) => a.startsWith('--per-course='))?.split('=')[1] || '5');
  const concurrency = parseInt(args.find((a) => a.startsWith('--concurrency='))?.split('=')[1] || '5');

  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });

  const prisma = new PrismaClient();
  const client = createClient();

  try {
    // --- Sample lessons spread across courses ---
    const rows: { lesson_id: string }[] = await prisma.$queryRawUnsafe(
      `SELECT DISTINCT lesson_id FROM content_chunk ORDER BY lesson_id`,
    );
    const byCourse = new Map<string, string[]>();
    for (const r of rows) {
      const c = courseOf(r.lesson_id);
      if (!byCourse.has(c)) byCourse.set(c, []);
      byCourse.get(c)!.push(r.lesson_id);
    }
    log(`content_chunk: ${rows.length} lessons across ${byCourse.size} courses`);

    // pick evenly-spaced lessons per course (spread, not all intro lessons)
    const sample: string[] = [];
    for (const [course, ids] of byCourse) {
      const n = Math.min(perCourse, ids.length);
      for (let i = 0; i < n; i++) {
        sample.push(ids[Math.floor((i + 0.5) * (ids.length / n))]);
      }
      log(`  ${course}: ${ids.length} lessons → sampled ${n}`);
    }
    log(`Total sample: ${sample.length} lessons`);

    const titleRows: { id: string; title: string }[] = await prisma.$queryRawUnsafe(
      `SELECT id, title FROM "Lesson"`,
    );
    const titleMap = new Map(titleRows.map((l) => [l.id, l.title]));

    // --- STEP 1: DISCOVER jobs per lesson ---
    log(`\n=== DISCOVER (model=${MODEL}, concurrency=${concurrency}) ===`);
    let done = 0;
    const discovered: DiscoverEntry[] = await parallel(sample, concurrency, async (lessonId) => {
      try {
        const chunks: { content: string; rn: number }[] = await prisma.$queryRawUnsafe(
          `WITH ranked AS (
             SELECT content, ROW_NUMBER() OVER (ORDER BY timecode_start) rn, COUNT(*) OVER () total
             FROM content_chunk WHERE lesson_id = $1
           )
           SELECT content, rn::int FROM ranked
           WHERE rn <= 3 OR rn = GREATEST(4, total / 2) OR rn = total
           ORDER BY rn`,
          lessonId,
        );
        const contentText = chunks.map((c) => c.content).join('\n\n---\n\n').substring(0, 8000);
        const title = titleMap.get(lessonId) || null;
        const userPrompt = `Название урока: "${title ?? lessonId}"\nID: ${lessonId}\n\nСодержимое (фрагменты):\n\n${contentText}`;
        const parsed = JSON.parse(await callLLM(client, DISCOVER_SYSTEM, userPrompt));
        done++;
        if (done % 10 === 0) log(`  discovered ${done}/${sample.length}`);
        return {
          lesson_id: lessonId,
          course: courseOf(lessonId),
          title,
          jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
          axes: Array.isArray(parsed.axes) ? parsed.axes : [],
          chars_used: contentText.length,
        };
      } catch (err: any) {
        log(`  ERROR [${lessonId}]: ${err.message}`);
        return { lesson_id: lessonId, course: courseOf(lessonId), title: titleMap.get(lessonId) || null, jobs: [], axes: [], chars_used: 0 };
      }
    });

    // --- STEP 2: CLUSTER into consolidated jobs ---
    log(`\n=== CLUSTER ===`);
    const clusterInput = discovered
      .map((d, i) => `${i + 1}. [${d.lesson_id}] "${d.title ?? ''}"\n   задачи: ${d.jobs.join(' | ') || '(не определены)'}`)
      .join('\n');
    const clusterResp = JSON.parse(
      await callLLM(client, CLUSTER_SYSTEM, `Уроков: ${discovered.length}\n\n${clusterInput}`, 4096),
    );
    const jobs: { title: string; description: string; axes: string[]; lesson_ids: string[] }[] =
      Array.isArray(clusterResp.jobs) ? clusterResp.jobs : [];
    const orphans: string[] = Array.isArray(clusterResp.orphans) ? clusterResp.orphans : [];

    // --- Save raw JSON ---
    const stamp = new Date().toISOString();
    fs.writeFileSync(
      path.join(RESULTS_DIR, 'trial-run.json'),
      JSON.stringify({ model: MODEL, timestamp: stamp, sample_size: sample.length, discovered, jobs, orphans }, null, 2),
      'utf-8',
    );

    // --- Write human-readable digest ---
    const titleById = new Map(discovered.map((d) => [d.lesson_id, d]));
    const lines: string[] = [];
    lines.push(`# Job Mapping — пробный прогон\n`);
    lines.push(`Модель: ${MODEL} · уроков в выборке: ${sample.length} · ${stamp}\n`);
    lines.push(`## Предложенные джобы (${jobs.length})\n`);
    jobs.forEach((j, i) => {
      lines.push(`### ${i + 1}. ${j.title}`);
      lines.push(`${j.description}`);
      lines.push(`Направления: ${j.axes.join(', ') || '—'} · уроков: ${j.lesson_ids.length}`);
      const courses = new Set(j.lesson_ids.map(courseOf));
      lines.push(`Кросс-курсовая: ${courses.size > 1 ? 'ДА (' + [...courses].join(', ') + ')' : 'нет'}`);
      for (const id of j.lesson_ids) {
        const d = titleById.get(id);
        lines.push(`- [${courseOf(id)}] ${d?.title ?? id}`);
      }
      lines.push('');
    });
    if (orphans.length) {
      lines.push(`## Уроки вне джоб (${orphans.length})\n`);
      for (const id of orphans) lines.push(`- [${courseOf(id)}] ${titleById.get(id)?.title ?? id}`);
      lines.push('');
    }
    lines.push(`## Сырые задачи по урокам\n`);
    for (const d of discovered) {
      lines.push(`**[${d.course}] ${d.title ?? d.lesson_id}**`);
      lines.push(`${d.jobs.map((x) => '· ' + x).join('\n') || '· (не определены)'}`);
      lines.push('');
    }
    fs.writeFileSync(path.join(RESULTS_DIR, 'trial-run-digest.md'), lines.join('\n'), 'utf-8');

    // --- Console summary ---
    const crossCourse = jobs.filter((j) => new Set(j.lesson_ids.map(courseOf)).size > 1).length;
    log(`\n=== DONE ===`);
    log(`Proposed jobs: ${jobs.length} (cross-course: ${crossCourse})`);
    log(`Orphan lessons: ${orphans.length}`);
    log(`Digest: scripts/job-mapping/results/trial-run-digest.md`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
