# Job Foundation + Job Mapping — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ввести сущность `Job` (курируемый набор уроков под задачу селлера) и пайплайн, который выводит черновую таксономию джоб из содержания уроков для валидации контент-командой.

**Architecture:** Новые таблицы `Job` / `JobLesson` в Prisma (аддитивная миграция). Пайплайн `scripts/job-mapping/job-mapper.ts` — три фазы (discover → cluster → proposal) по паттерну существующего `scripts/skill-mapping/skill-mapper.ts`, классификация по транскриптам `content_chunk`. Seed-скрипт переносит валидированный JOB-PROPOSAL в БД.

**Tech Stack:** Prisma 5.22, PostgreSQL (Supabase), TypeScript, `tsx`, OpenRouter (OpenAI SDK), Vitest.

**Plan 2 (отдельный документ):** Library UI — tRPC-роутер `job` + 5 экранов. Зависит от схемы из этого плана.

---

## Контекст и предупреждения

- Спек: `docs/superpowers/specs/2026-05-18-library-redesign-design.md`.
- **PROD DB SAFETY** (`MAAL/CLAUDE.md`): миграция этого плана — **аддитивная** (только `CREATE TABLE` / `CREATE TYPE`, без `ALTER`/`DROP` существующих таблиц). Применять через `prisma migrate deploy`, **никогда** `db push --accept-data-loss`. Staging и прод используют одну Supabase БД — миграция применяется сразу для обоих; поэтому только аддитивный DDL.
- Пайплайн job-mapping — LLM-скрипты; классический TDD к ним неприменим (как и у `scripts/skill-mapping/` — там нет тестов). Тестами покрываются чистые функции (парсинг, сборка) и seed-скрипт.
- База для пайплайна — уже существующий `scripts/job-mapping/trial-run.ts` (прогон-спайк): из него переиспользуются `createClient`, `callLLM`, `parallel`, `courseOf` и промпты.
- Throwaway `scripts/job-mapping/_check-content.ts` удалить в Task 1.

---

## Task 1: Prisma schema — модели Job, JobLesson, JobMarketplace

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (модель `Lesson` ~строки 147-180; добавить новые модели в конец)
- Delete: `scripts/job-mapping/_check-content.ts`

- [ ] **Step 1: Удалить throwaway-скрипт**

```bash
rm "scripts/job-mapping/_check-content.ts"
```

- [ ] **Step 2: Добавить связь в модель `Lesson`**

В `packages/db/prisma/schema.prisma`, в модель `Lesson`, рядом со строкой `materials LessonMaterial[]` добавить:

```prisma
  jobLessons JobLesson[]
```

- [ ] **Step 3: Добавить новые модели в конец `schema.prisma`**

```prisma
enum JobMarketplace {
  WB
  OZON
  BOTH
}

/// Джоба — курируемый упорядоченный набор уроков под одну задачу селлера.
/// Course-agnostic: уроки могут быть из разных курсов. Выводится из контента
/// (scripts/job-mapping), валидируется контент-командой, наполняется seed-jobs.ts.
model Job {
  id           String         @id @default(cuid())
  slug         String         @unique // URL: /learn/job/<slug>
  title        String // глагол + результат: "Посчитать юнит-экономику товара"
  description  String
  outcomes     Json           @default("[]") // string[] — "что ты сможешь после"
  axes         Json           @default("[]") // canonical 5 категорий — мост к диагностике
  skillBlocks  Json           @default("[]") // 32-блочные теги — точный мост к диагностике
  marketplace  JobMarketplace @default(WB)
  displayOrder Int            @default(0) // порядок внутри оси в каталоге
  isPublished  Boolean        @default(false)
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt
  lessons      JobLesson[]

  @@index([isPublished])
}

/// Упорядоченная M2M связь Job ↔ Lesson. Урок может входить в несколько джоб.
model JobLesson {
  jobId    String
  lessonId String
  order    Int // порядок прохождения урока внутри джобы

  job    Job    @relation(fields: [jobId], references: [id], onDelete: Cascade)
  lesson Lesson @relation(fields: [lessonId], references: [id], onDelete: Cascade)

  @@id([jobId, lessonId])
  @@index([lessonId])
}
```

- [ ] **Step 4: Проверить валидность схемы**

Run: `cd packages/db && npx prisma@5.22.0 validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 5: Сгенерировать Prisma-клиент**

Run: `pnpm db:generate`
Expected: `Generated Prisma Client` без ошибок.

- [ ] **Step 6: Commit**

```bash
git add packages/db/prisma/schema.prisma
git rm scripts/job-mapping/_check-content.ts
git commit -m "feat(db): add Job and JobLesson models for library redesign"
```

---

## Task 2: Аддитивная миграция Job-таблиц

**Files:**
- Create: `packages/db/prisma/migrations/20260518000000_add_job_models/migration.sql`

- [ ] **Step 1: Создать директорию и файл миграции**

Создать `packages/db/prisma/migrations/20260518000000_add_job_models/migration.sql`:

```sql
-- Library redesign (Phase 57): Job + JobLesson.
-- АДДИТИВНАЯ миграция — только CREATE, ни одной существующей таблицы не трогает.
-- Безопасна для shared prod Supabase БД.

CREATE TYPE "JobMarketplace" AS ENUM ('WB', 'OZON', 'BOTH');

CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "outcomes" JSONB NOT NULL DEFAULT '[]',
    "axes" JSONB NOT NULL DEFAULT '[]',
    "skillBlocks" JSONB NOT NULL DEFAULT '[]',
    "marketplace" "JobMarketplace" NOT NULL DEFAULT 'WB',
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Job_slug_key" ON "Job"("slug");
CREATE INDEX "Job_isPublished_idx" ON "Job"("isPublished");

CREATE TABLE "JobLesson" (
    "jobId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    CONSTRAINT "JobLesson_pkey" PRIMARY KEY ("jobId", "lessonId")
);

CREATE INDEX "JobLesson_lessonId_idx" ON "JobLesson"("lessonId");

ALTER TABLE "JobLesson" ADD CONSTRAINT "JobLesson_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobLesson" ADD CONSTRAINT "JobLesson_lessonId_fkey"
    FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 2: Pre-flight проверка (PROD DB SAFETY)**

Подтвердить перед применением:
1. `DATABASE_URL` в `.env` указывает на проект `saecuecevicwjkpmaoot` (это нормально — миграция аддитивная).
2. Миграция содержит только `CREATE TYPE` / `CREATE TABLE` / `CREATE INDEX` / `ALTER TABLE ... ADD CONSTRAINT` на **новых** таблицах. Ни одного `DROP` / `ALTER` существующих. ✅ (см. файл выше)
3. Свежий backup существует (cron L2 @ 03:00 UTC на VPS — проверить, что отработал).

- [ ] **Step 3: Применить миграцию**

Run: `cd packages/db && npx prisma@5.22.0 migrate deploy`
Expected: `Applying migration 20260518000000_add_job_models` → `All migrations have been successfully applied.`

- [ ] **Step 4: Проверить, что таблицы созданы и существующие данные целы**

```bash
npx tsx -e "import{PrismaClient}from'@prisma/client';import*as d from'dotenv';d.config({path:'.env'});const p=new PrismaClient();(async()=>{console.log('Job rows:',await p.job.count());console.log('JobLesson rows:',await p.jobLesson.count());console.log('Lesson rows (should be ~440, unchanged):',await p.lesson.count());await p.\$disconnect();})()"
```
Expected: `Job rows: 0`, `JobLesson rows: 0`, `Lesson rows: ~440` (число уроков не изменилось — существующие данные целы).

- [ ] **Step 5: Commit**

```bash
git add packages/db/prisma/migrations/20260518000000_add_job_models/
git commit -m "feat(db): migration for Job and JobLesson tables"
```

---

## Task 3: Скрипт проверки дублей-предусловие

Спек §9: перед полным прогоном пайплайна убедиться, что в видимом контенте нет дублей-уроков (иначе джобы наберут фантомных дублей).

**Files:**
- Create: `scripts/job-mapping/check-dedup.ts`

- [ ] **Step 1: Написать скрипт проверки**

Создать `scripts/job-mapping/check-dedup.ts`:

```ts
/**
 * Предусловие job-mapping (спек §9): отчёт о дублях-уроках среди ВИДИМОГО контента.
 * Дубли внутри одного курса по visible-урокам = данные грязные, чинить до прогона.
 * Read-only.
 */
import { PrismaClient } from '@prisma/client';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function main() {
  const prisma = new PrismaClient();
  try {
    const dups: { title: string; n: number; courses: string[] }[] = await prisma.$queryRawUnsafe(`
      SELECT title, COUNT(*)::int n, array_agg(DISTINCT "courseId") courses
      FROM "Lesson"
      WHERE "isHidden" = false
        AND "courseId" <> '06_express'
        AND "courseId" IN (SELECT id FROM "Course" WHERE "isHidden" = false)
      GROUP BY title
      HAVING COUNT(*) > 1
      ORDER BY n DESC
    `);
    if (dups.length === 0) {
      console.log('✅ Дублей среди видимых уроков нет — можно запускать пайплайн.');
    } else {
      console.log(`⚠️  Найдено ${dups.length} групп дублей среди ВИДИМЫХ уроков:`);
      for (const d of dups) console.log(`  x${d.n}  "${d.title}"  → ${d.courses.join(', ')}`);
      console.log('\nПочинить (dedup-lessons.ts) или подтвердить с контент-командой до полного прогона.');
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
```

- [ ] **Step 2: Запустить проверку**

Run: `npx tsx scripts/job-mapping/check-dedup.ts`
Expected: либо `✅ Дублей ... нет`, либо список дублей с exit code 1. Если дубли есть — **остановиться**, поднять с владельцем/контент-командой до Task 5. Не блокирует Task 4 (discover идемпотентен по lesson_id).

- [ ] **Step 3: Commit**

```bash
git add scripts/job-mapping/check-dedup.ts
git commit -m "feat(job-mapping): dedup precondition check script"
```

---

## Task 4: Пайплайн job-mapping — фаза `discover`

Превращаем `trial-run.ts` (спайк на 35 уроках) в полноценную фазу с resume/checkpoint на всём видимом контенте.

**Files:**
- Create: `scripts/job-mapping/job-mapper.ts`
- Reference: `scripts/job-mapping/trial-run.ts` (источник `createClient`/`callLLM`/`parallel`/`courseOf` и промпта `DISCOVER_SYSTEM`), `scripts/skill-mapping/skill-mapper.ts` (паттерн resume/checkpoint)

- [ ] **Step 1: Создать `job-mapper.ts` с инфраструктурой и фазой `discover`**

Создать `scripts/job-mapping/job-mapper.ts`. Скопировать из `trial-run.ts` без изменений: импорты, `RESULTS_DIR`, `MODEL`, `createClient`, `log`, `callLLM`, `parallel`, `courseOf`, константу `DISCOVER_SYSTEM`. Добавить helpers `saveJSON`/`loadJSON` (скопировать из `skill-mapper.ts` строки 65-71). Затем фаза `discover`:

```ts
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
```

Обновить `DISCOVER_SYSTEM` (взять из `trial-run.ts`), добавив в JSON-ответ поле `skill_blocks` — в инструкции дописать строку:

```
Дополнительно укажи skill_blocks — теги из 32-блочной таксономии в формате "AXIS/block_slug"
(см. scripts/skill-mapping/results/taxonomy.json). 1-3 блока. Ответ в JSON:
{"jobs":[...],"axes":["ANALYTICS"],"skill_blocks":["ANALYTICS/competitor_analysis"]}
```

- [ ] **Step 2: Добавить CLI-роутер**

В конец `job-mapper.ts`:

```ts
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
```

Заглушки `phaseCluster`/`phaseProposal` (тела добавят Task 5/6):

```ts
async function phaseCluster() { throw new Error('Task 5'); }
async function phaseProposal() { throw new Error('Task 6'); }
```

- [ ] **Step 3: Smoke-прогон discover на 1 уроке**

Run: `npx tsx scripts/job-mapping/job-mapper.ts discover --concurrency=1` затем `Ctrl+C` после первого checkpoint-лога, либо дождаться 20 уроков.
Expected: появляется `scripts/job-mapping/results/jobs-discovery.json` с полями `jobs`/`axes`/`skill_blocks` у уроков.

- [ ] **Step 4: Полный прогон discover**

Run: `npx tsx scripts/job-mapping/job-mapper.ts discover --resume`
Expected: `Готово: ~430 уроков`. Стоимость ~$2-3.

- [ ] **Step 5: Commit**

```bash
git add scripts/job-mapping/job-mapper.ts scripts/job-mapping/results/jobs-discovery.json
git commit -m "feat(job-mapping): discover phase — per-lesson jobs from transcripts"
```

---

## Task 5: Пайплайн job-mapping — фаза `cluster`

Консолидация сырых задач в ~30-40 джоб. Marketplace-aware, оси строго из 5.

**Files:**
- Modify: `scripts/job-mapping/job-mapper.ts` (заменить заглушку `phaseCluster`)

- [ ] **Step 1: Реализовать `phaseCluster`**

Заменить заглушку `phaseCluster` в `job-mapper.ts`:

```ts
const CLUSTER_FILE = path.join(RESULTS_DIR, 'jobs-cluster.json');

const CLUSTER_SYSTEM = `Ты проектируешь каталог онлайн-академии для селлеров маркетплейсов.
Дан список уроков с задачами селлера (jobs-to-be-done), которые они закрывают.

Сгруппируй уроки в УКРУПНЁННЫЕ ДЖОБЫ — крупные цели селлера. Целевое число джоб: 30-40.

ЖЁСТКИЕ ПРАВИЛА:
1. Каждый урок входит хотя бы в одну джобу; может входить в несколько.
2. Джоба содержательна при >= 2 уроках.
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
```

- [ ] **Step 2: Запустить cluster**

Run: `npx tsx scripts/job-mapping/job-mapper.ts cluster`
Expected: `Кластеризация: ~30-40 джоб` + файл `results/jobs-cluster.json`. Если джоб сильно >40 — увеличить укрупнение в промпте и перезапустить.

- [ ] **Step 3: Commit**

```bash
git add scripts/job-mapping/job-mapper.ts scripts/job-mapping/results/jobs-cluster.json
git commit -m "feat(job-mapping): cluster phase — marketplace-aware job consolidation"
```

---

## Task 6: Пайплайн job-mapping — фаза `proposal`

Человекочитаемый JOB-PROPOSAL для контент-команды.

**Files:**
- Modify: `scripts/job-mapping/job-mapper.ts` (заменить заглушку `phaseProposal`)

- [ ] **Step 1: Реализовать `phaseProposal`**

Заменить заглушку `phaseProposal`:

```ts
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
```

- [ ] **Step 2: Запустить proposal**

Run: `npx tsx scripts/job-mapping/job-mapper.ts proposal`
Expected: `results/JOB-PROPOSAL.md` и `results/JOB-PROPOSAL.json`.

- [ ] **Step 3: Commit + handoff**

```bash
git add scripts/job-mapping/job-mapper.ts scripts/job-mapping/results/JOB-PROPOSAL.json scripts/job-mapping/results/JOB-PROPOSAL.md
git commit -m "feat(job-mapping): proposal phase — JOB-PROPOSAL for content team review"
```

После коммита `JOB-PROPOSAL.md` отдаётся контент-команде на валидацию. Валидированную версию (с правками состава/названий) команда возвращает как `JOB-PROPOSAL.validated.json` в том же формате — она и идёт в Task 7.

---

## Task 7: Seed-скрипт — JOB-PROPOSAL → таблицы Job/JobLesson

**Files:**
- Create: `scripts/seed/seed-jobs.ts`
- Create: `scripts/seed/__tests__/seed-jobs.test.ts`
- Modify: `package.json` (добавить npm-скрипт)

- [ ] **Step 1: Написать падающий тест на чистую функцию `buildJobUpsert`**

Создать `scripts/seed/__tests__/seed-jobs.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildJobUpsert, type ProposalJob } from '../seed-jobs';

describe('buildJobUpsert', () => {
  it('преобразует джобу пропозала в Prisma upsert-payload', () => {
    const job: ProposalJob = {
      slug: 'poschitat-unit-ekonomiku', title: 'Посчитать юнит-экономику товара',
      description: 'Расчёт прибыли', outcomes: ['посчитать маржу'],
      axes: ['FINANCE'], skillBlocks: ['FINANCE/unit_economics'],
      marketplace: 'BOTH', displayOrder: 3,
      lessonIds: ['01_analytics_m02_economics_001', '02_ads_unit_004'],
    };
    const r = buildJobUpsert(job);
    expect(r.where).toEqual({ slug: 'poschitat-unit-ekonomiku' });
    expect(r.create.title).toBe('Посчитать юнит-экономику товара');
    expect(r.create.marketplace).toBe('BOTH');
    expect(r.create.isPublished).toBe(true);
    expect(r.create.lessons.create).toEqual([
      { lessonId: '01_analytics_m02_economics_001', order: 0 },
      { lessonId: '02_ads_unit_004', order: 1 },
    ]);
  });
});
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `cd packages/.. && npx vitest run scripts/seed/__tests__/seed-jobs.test.ts`
Expected: FAIL — `Cannot find module '../seed-jobs'`.

- [ ] **Step 3: Написать `seed-jobs.ts`**

Создать `scripts/seed/seed-jobs.ts`:

```ts
/**
 * Seed джоб из валидированного JOB-PROPOSAL.
 * Вход: scripts/job-mapping/results/JOB-PROPOSAL.validated.json (от контент-команды).
 * Идемпотентен — upsert по slug. Запуск: npm run db:seed-jobs
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export interface ProposalJob {
  slug: string; title: string; description: string; outcomes: string[];
  axes: string[]; skillBlocks: string[]; marketplace: 'WB' | 'OZON' | 'BOTH';
  displayOrder: number; lessonIds: string[];
}

export function buildJobUpsert(job: ProposalJob) {
  const lessonRows = job.lessonIds.map((lessonId, order) => ({ lessonId, order }));
  const base = {
    title: job.title, description: job.description, outcomes: job.outcomes,
    axes: job.axes, skillBlocks: job.skillBlocks, marketplace: job.marketplace,
    displayOrder: job.displayOrder, isPublished: true,
  };
  return {
    where: { slug: job.slug },
    create: { slug: job.slug, ...base, lessons: { create: lessonRows } },
    update: { ...base, lessons: { deleteMany: {}, create: lessonRows } },
  };
}

async function main() {
  const file = path.resolve(__dirname, '../job-mapping/results/JOB-PROPOSAL.validated.json');
  if (!fs.existsSync(file)) {
    console.error(`Нет валидированного пропозала: ${file}`);
    process.exit(1);
  }
  const proposal = JSON.parse(fs.readFileSync(file, 'utf-8')) as { jobs: ProposalJob[] };
  const prisma = new PrismaClient();
  try {
    for (const job of proposal.jobs) {
      const u = buildJobUpsert(job);
      await prisma.job.upsert(u as any);
      console.log(`✔ ${job.slug} (${job.lessonIds.length} уроков)`);
    }
    console.log(`Готово: ${proposal.jobs.length} джоб.`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
```

- [ ] **Step 4: Запустить тест — убедиться, что проходит**

Run: `npx vitest run scripts/seed/__tests__/seed-jobs.test.ts`
Expected: PASS (1 тест).

- [ ] **Step 5: Добавить npm-скрипт**

В корневой `package.json`, рядом с `"db:seed-billing"`:

```json
    "db:seed-jobs": "npx tsx scripts/seed/seed-jobs.ts",
```

- [ ] **Step 6: Commit**

```bash
git add scripts/seed/seed-jobs.ts scripts/seed/__tests__/seed-jobs.test.ts package.json
git commit -m "feat(job-mapping): seed-jobs script — JOB-PROPOSAL into Job/JobLesson tables"
```

- [ ] **Step 7 (выполняется после валидации контент-командой):** Запустить seed

Когда `JOB-PROPOSAL.validated.json` получен от контент-команды:
Run: `npm run db:seed-jobs`
Expected: `Готово: N джоб.` Проверка: `npx tsx -e "..."` → `Job rows > 0`.

---

## Self-Review

**Spec coverage:**
- §3-4 модель/схема `Job` → Task 1-2 ✅
- §5 Workstream A пайплайн (discover/cluster/proposal) → Task 4-6 ✅
- §5 seed → Task 7 ✅
- §9 предусловие dedup → Task 3 ✅
- §9 исключение express, `isHidden=false` → Task 4 Step 1 (SQL-фильтр) ✅
- §8 мост к диагностике (`axes`+`skillBlocks` на джобе) → Task 1 (поля), Task 4-5 (заполнение) ✅
- §6 Library UI → **вне этого плана** (Plan 2) ✅ намеренно
- §8 Phase 58 миграция диагностики → вне скоупа ✅

**Placeholder scan:** заглушки `phaseCluster`/`phaseProposal` в Task 4 — намеренные, заполняются в Task 5/6 (явно указано). Реальных placeholder'ов нет.

**Type consistency:** `DiscoverEntry`/`DiscoveryResult` (Task 4) используются в Task 5-6. `ProposalJob` (Task 7) совпадает по полям с выходом `phaseProposal` (Task 6: slug/title/description/outcomes/axes/skillBlocks/marketplace/displayOrder/lessonIds). `JobMarketplace` enum (Task 1) ↔ `marketplace` строки `'WB'|'OZON'|'BOTH'` (Task 5-7) согласованы.

**Известное ограничение:** discover/cluster/proposal — LLM-фазы, классическим TDD не покрыты (как и `scripts/skill-mapping/`); проверяются smoke-прогонами. Юнит-тестом покрыта чистая функция `buildJobUpsert` (Task 7).
