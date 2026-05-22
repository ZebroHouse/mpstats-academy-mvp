/**
 * Job Mapper — full pipeline for jobs-to-be-done mapping
 *
 * Three-phase pipeline:
 *   Phase 1 (discover):  Per-lesson LLM reads transcript → 1-3 seller jobs + axes + skill_blocks
 *   Phase 2 (cluster):   Cluster raw jobs into consolidated job cards (Task 5)
 *   Phase 3 (proposal):  Generate final library proposal (Task 6)
 *
 * Infrastructure copied verbatim from trial-run.ts (spike).
 * resume/checkpoint pattern from skill-mapper.ts.
 *
 * Usage:
 *   npx tsx scripts/job-mapping/job-mapper.ts discover [--concurrency=N] [--resume]
 *   npx tsx scripts/job-mapping/job-mapper.ts cluster
 *   npx tsx scripts/job-mapping/job-mapper.ts proposal
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

// --- Helpers (from skill-mapper.ts lines 65-71) ---

function saveJSON(filepath: string, data: unknown) {
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
}

function loadJSON<T>(filepath: string): T {
  return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
}

// --- Prompts ---

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

Дополнительно укажи skill_blocks — теги из 32-блочной таксономии в формате "AXIS/block_slug"
(см. scripts/skill-mapping/results/taxonomy.json). 1-3 блока. Ответ в JSON:
{"jobs":[...],"axes":["ANALYTICS"],"skill_blocks":["ANALYTICS/competitor_analysis"]}`;

// --- Interfaces ---

const DISCOVERY_FILE = path.join(RESULTS_DIR, 'jobs-discovery.json');

interface DiscoverEntry {
  lesson_id: string;
  course: string;
  title: string | null;
  jobs: string[];
  axes: string[];      // строго из 5: ANALYTICS|MARKETING|CONTENT|OPERATIONS|FINANCE
  skill_blocks: string[];
}
interface DiscoveryResult {
  phase: 'discovery'; model: string; timestamp: string;
  total_lessons: number; lessons: DiscoverEntry[];
}

// --- Phase: discover ---

async function phaseDiscover(concurrency: number, resume: boolean) {
  const prisma = new PrismaClient();
  const client = createClient();
  try {
    // Только видимые уроки в видимых курсах, без 06_express (спек §9)
    const visible: { id: string; title: string; courseId: string }[] = await prisma.$queryRawUnsafe(`
      SELECT l.id, l.title, l."courseId"
      FROM "Lesson" l JOIN "Course" c ON c.id = l."courseId"
      WHERE l."isHidden" = false AND c."isHidden" = false AND l."courseId" <> '06_express'
        AND l."videoId" IS NOT NULL
      ORDER BY l.id
    `);
    log(`Видимых уроков для разметки: ${visible.length}`);

    let existing: Record<string, DiscoverEntry> = {};
    if (resume && fs.existsSync(DISCOVERY_FILE)) {
      for (const e of loadJSON<DiscoveryResult>(DISCOVERY_FILE).lessons) existing[e.lesson_id] = e;
      log(`Resume: ${Object.keys(existing).length} уже размечено`);
    }
    const toProcess = visible.filter((l) => !existing[l.id]);
    const results: DiscoverEntry[] = [...Object.values(existing)];
    let done = 0;

    await parallel(toProcess, concurrency, async (lesson) => {
      try {
        const chunks: { content: string }[] = await prisma.$queryRawUnsafe(`
          WITH ranked AS (
            SELECT content, ROW_NUMBER() OVER (ORDER BY timecode_start) rn, COUNT(*) OVER () total
            FROM content_chunk WHERE lesson_id = $1)
          SELECT content FROM ranked
          WHERE rn <= 3 OR rn = GREATEST(4, total/2) OR rn = total ORDER BY rn`, lesson.id);
        const text = chunks.map((c) => c.content).join('\n\n---\n\n').substring(0, 8000);
        const userPrompt = `Название урока: "${lesson.title}"\nID: ${lesson.id}\n\nСодержимое (фрагменты):\n\n${text}`;
        const parsed = JSON.parse(await callLLM(client, DISCOVER_SYSTEM, userPrompt));
        results.push({
          lesson_id: lesson.id, course: lesson.courseId, title: lesson.title,
          jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
          axes: Array.isArray(parsed.axes) ? parsed.axes : [],
          skill_blocks: Array.isArray(parsed.skill_blocks) ? parsed.skill_blocks : [],
        });
      } catch (err: any) {
        log(`ERROR [${lesson.id}]: ${err.message}`);
        results.push({ lesson_id: lesson.id, course: lesson.courseId, title: lesson.title,
          jobs: [], axes: [], skill_blocks: [] });
      }
      if (++done % 20 === 0) {
        log(`discover ${done}/${toProcess.length}`);
        saveJSON(DISCOVERY_FILE, { phase: 'discovery', model: MODEL,
          timestamp: new Date().toISOString(), total_lessons: results.length,
          lessons: results.sort((a, b) => a.lesson_id.localeCompare(b.lesson_id)) });
      }
    });
    saveJSON(DISCOVERY_FILE, { phase: 'discovery', model: MODEL,
      timestamp: new Date().toISOString(), total_lessons: results.length,
      lessons: results.sort((a, b) => a.lesson_id.localeCompare(b.lesson_id)) });
    log(`Готово: ${results.length} уроков → ${DISCOVERY_FILE}`);
  } finally { await prisma.$disconnect(); }
}

// --- Phase: cluster ---

const CLUSTER_FILE = path.join(RESULTS_DIR, 'jobs-cluster.json');

const CLUSTER_SYSTEM = `Ты проектируешь каталог онлайн-академии для селлеров маркетплейсов.
Дан список уроков с задачами селлера (jobs-to-be-done), которые они закрывают.

Сгруппируй уроки в ДЖОБЫ — конкретные практические задачи селлера: одна джоба = одна задача с одним измеримым результатом. Нужно НЕ МЕНЕЕ 30 джоб (цель 30-40). Широкие темы дроби на отдельные узкие задачи.

ЖЁСТКИЕ ПРАВИЛА:
1. Каждый урок входит хотя бы в одну джобу; может входить в несколько.
2. Джоба содержательна при >= 2 уроках. Типичный размер — 3-12 уроков. Джоба из 20+ уроков почти всегда = 2-3 отдельные задачи: раздели её.
3. Название джобы — глагол + результат, понятно селлеру.
4. axes — ТОЛЬКО из пяти: ANALYTICS, MARKETING, CONTENT, OPERATIONS, FINANCE. Других значений быть НЕ может.
5. marketplace: "WB" если все уроки джобы WB-специфичны; "OZON" если все Ozon-специфичны
   (курс 05_ozon); "BOTH" если джоба кросс-платформенная (юнит-экономика, P&L и т.п.).
   WB-специфичные и Ozon-специфичные уроки НЕ смешивать в одну джобу.
6. Уроки в джобе — в логичном порядке прохождения.

Ответ JSON: {"jobs":[{"title":"...","description":"...","outcomes":["..."],
"axes":["FINANCE"],"skill_blocks":["FINANCE/unit_economics"],"marketplace":"BOTH",
"lesson_ids":["id1","id2"]}],"orphans":["lesson_id"]}`;

const VALID_AXES = ['ANALYTICS', 'MARKETING', 'CONTENT', 'OPERATIONS', 'FINANCE'];

async function phaseCluster() {
  const client = createClient();
  if (!fs.existsSync(DISCOVERY_FILE)) throw new Error('Сначала фаза discover');
  const discovery = loadJSON<DiscoveryResult>(DISCOVERY_FILE);

  // 05_ozon — единственный Ozon-курс; пометка платформы урока для подсказки LLM
  const input = discovery.lessons.map((d, i) => {
    const mp = d.course === '05_ozon' ? 'Ozon' : 'WB';
    return `${i + 1}. [${d.lesson_id}] (${mp}) "${d.title ?? ''}"\n   задачи: ${d.jobs.join(' | ') || '—'}`;
  }).join('\n');

  const resp = JSON.parse(await callLLM(client, CLUSTER_SYSTEM,
    `Уроков: ${discovery.lessons.length}\n\n${input}`, 16384));
  const rawJobs: any[] = Array.isArray(resp.jobs) ? resp.jobs : [];

  // Валидация: оси строго из 5, marketplace из 3
  const jobs = rawJobs.map((j) => ({
    title: String(j.title || ''),
    description: String(j.description || ''),
    outcomes: Array.isArray(j.outcomes) ? j.outcomes : [],
    axes: (Array.isArray(j.axes) ? j.axes : []).filter((a: string) => VALID_AXES.includes(a)),
    skill_blocks: Array.isArray(j.skill_blocks) ? j.skill_blocks : [],
    marketplace: ['WB', 'OZON', 'BOTH'].includes(j.marketplace) ? j.marketplace : 'WB',
    lesson_ids: Array.isArray(j.lesson_ids) ? j.lesson_ids : [],
  }));
  const orphans: string[] = Array.isArray(resp.orphans) ? resp.orphans : [];

  saveJSON(CLUSTER_FILE, { phase: 'cluster', model: MODEL,
    timestamp: new Date().toISOString(), total_jobs: jobs.length, jobs, orphans });
  log(`Кластеризация: ${jobs.length} джоб, ${orphans.length} сирот → ${CLUSTER_FILE}`);
  const cross = jobs.filter((j) => new Set(j.lesson_ids.map(courseOf)).size > 1).length;
  log(`Кросс-курсовых джоб: ${cross}/${jobs.length}`);
}

// --- Phase: proposal ---

function slugify(title: string): string {
  const map: Record<string, string> = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',
    з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',
    х:'h',ц:'c',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya' };
  return title.toLowerCase().split('').map((c) => map[c] ?? c).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

async function phaseProposal() {
  if (!fs.existsSync(CLUSTER_FILE)) throw new Error('Сначала фаза cluster');
  const cluster = loadJSON<any>(CLUSTER_FILE);
  const discovery = loadJSON<DiscoveryResult>(DISCOVERY_FILE);
  const titleById = new Map(discovery.lessons.map((d) => [d.lesson_id, d]));

  // JSON для seed-скрипта
  const proposal = {
    phase: 'proposal', timestamp: new Date().toISOString(),
    jobs: cluster.jobs.map((j: any, i: number) => ({
      slug: slugify(j.title) || `job-${i + 1}`,
      title: j.title, description: j.description, outcomes: j.outcomes,
      axes: j.axes, skillBlocks: j.skill_blocks, marketplace: j.marketplace,
      displayOrder: i,
      lessonIds: j.lesson_ids.filter((id: string) => titleById.has(id)),
    })),
  };
  saveJSON(path.join(RESULTS_DIR, 'JOB-PROPOSAL.json'), proposal);

  // Markdown для контент-команды
  const md: string[] = ['# JOB-PROPOSAL — на валидацию контент-команде\n',
    `Сгенерировано ${proposal.timestamp} · джоб: ${proposal.jobs.length}\n`,
    'Проверьте: название, состав уроков, порядок, направления. Правки — прямо в этом файле.\n'];
  for (const [i, j] of proposal.jobs.entries()) {
    md.push(`## ${i + 1}. ${j.title}`);
    md.push(`${j.description}`);
    md.push(`Направления: ${j.axes.join(', ')} · маркетплейс: ${j.marketplace} · slug: \`${j.slug}\``);
    md.push(`Уроков: ${j.lessonIds.length}`);
    for (const id of j.lessonIds) md.push(`- [${courseOf(id)}] ${titleById.get(id)?.title ?? id}`);
    md.push('');
  }
  if (cluster.orphans?.length) {
    md.push(`## Уроки вне джоб (${cluster.orphans.length})\n`);
    for (const id of cluster.orphans) md.push(`- [${courseOf(id)}] ${titleById.get(id)?.title ?? id}`);
  }
  fs.writeFileSync(path.join(RESULTS_DIR, 'JOB-PROPOSAL.md'), md.join('\n'), 'utf-8');
  log(`JOB-PROPOSAL готов: results/JOB-PROPOSAL.md (+ .json для seed)`);
}

// --- CLI router ---

async function main() {
  const phase = process.argv[2];
  const concurrency = parseInt(process.argv.find((a) => a.startsWith('--concurrency='))?.split('=')[1] || '5');
  const resume = process.argv.includes('--resume');
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
  switch (phase) {
    case 'discover': await phaseDiscover(concurrency, resume); break;
    case 'cluster': await phaseCluster(); break;       // Task 5
    case 'proposal': await phaseProposal(); break;     // Task 6
    default:
      process.stdout.write('Usage: npx tsx scripts/job-mapping/job-mapper.ts <discover|cluster|proposal> [--concurrency=N] [--resume]\n');
      process.exit(1);
  }
}
main().catch((e) => { console.error('Fatal:', e.message); process.exit(1); });
