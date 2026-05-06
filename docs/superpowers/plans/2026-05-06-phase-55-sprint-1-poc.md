# Phase 55 Sprint 1 — Vision Chunking PoC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Throwaway PoC за 1-2 дня: 3 видео → 30 кадров → 3 VLM × OCR → ручной анализ + чек-лист Миле → gate-решение GO/NO-GO на Sprint 2.

**Architecture:** Изолированная папка `scripts/vision-poc/` с 4 основными скриптами (select-videos / extract-frames / run-vlm / run-ocr) + опц. analyze. Никаких изменений в `apps/web`, `packages/`, Prisma. Все данные — в `scripts/vision-poc/results/`. Артефакты решения (`comparison.md`, `decision.md`, `mila-package/`) комитим, бинари и большие JSON в `.gitignore`.

**Tech Stack:** TypeScript + tsx (как существующие скрипты), Node.js fetch (OpenRouter), child_process (ffmpeg/ffprobe/tesseract), Supabase Management API SQL endpoint.

**Reference spec:** `docs/superpowers/specs/2026-05-06-phase-55-sprint-1-poc-design.md`

---

## Task 1: Scaffold project structure + config + .gitignore

**Files:**
- Create: `scripts/vision-poc/config.ts`
- Create: `scripts/vision-poc/README.md`
- Create: `scripts/vision-poc/.gitkeep` (для пустых поддиректорий)
- Create: `scripts/vision-poc/results/.gitkeep`
- Create: `scripts/vision-poc/results/mila-package/.gitkeep`
- Create: `scripts/vision-poc/prompts/.gitkeep`
- Modify: `.gitignore`

- [ ] **Step 1: Создать config.ts**

```typescript
// scripts/vision-poc/config.ts
export const POC_CONFIG = {
  academy_courses_root: 'E:/Academy Courses',
  duration_buckets: {
    short: [180, 600] as [number, number],
    medium: [1200, 2400] as [number, number],
    long: [3600, 10800] as [number, number],
  },
  course_priority: ['01_analytics', '03_ai', '04_workshops'],
  scene_threshold_initial: 0.3,
  scene_threshold_steps: [0.5, 0.7],
  min_interval_seconds: 10,
  frames_cap_per_video: 120,
  frames_for_poc_sample: 10,
  vlm_models: [
    'google/gemini-2.5-flash-lite',
    'google/gemini-3.1-flash-lite-preview',
    'openai/gpt-4.1-mini',
  ],
  vlm_fallback_if_preview_unavailable: 'google/gemini-2.5-flash',
  rate_limit_rps: 5,
  ocr_languages: 'rus+eng',
  ocr_psm: 6,
  results_dir: 'scripts/vision-poc/results',
  frames_dir: 'scripts/vision-poc/results/frames',
} as const;
```

- [ ] **Step 2: Создать README.md**

```markdown
# scripts/vision-poc/

Phase 55 Sprint 1 — Vision Chunking RAG PoC.
**Throwaway**, удаляется/архивируется после Sprint 3.

См. `docs/superpowers/specs/2026-05-06-phase-55-sprint-1-poc-design.md`.

## Запуск (порядок)

```bash
# 0. Setup env
export OPENROUTER_POC_KEY=$(cat "E:/Academy Courses/OpenRouter_Api_key.txt")
export SUPABASE_MGMT_TOKEN=...     # из .claude/memory/reference_supabase_mgmt.md
export SUPABASE_PROJECT_REF=saecuecevicwjkpmaoot

# 1. Выбор 3 видео
npx tsx scripts/vision-poc/select-videos.ts

# 2. Извлечение кадров
npx tsx scripts/vision-poc/extract-frames.ts

# 3. VLM прогон (90 запросов)
npx tsx scripts/vision-poc/run-vlm.ts

# 4. OCR baseline
npx tsx scripts/vision-poc/run-ocr.ts

# 5. (опц.) Сводка
npx tsx scripts/vision-poc/analyze.ts
```

## Результаты

- `results/selected-videos.json` — 3 видео + lessonId + URL
- `results/frames/{lessonId}/*.jpg` — извлечённые кадры
- `results/vlm-runs.json` — 90 VLM-ответов
- `results/ocr-runs.json` — 30 OCR-выводов
- `results/comparison.md` — ручной анализ (commit)
- `results/decision.md` — gate-решение (commit)
- `results/mila-package/` — пакет для тестера (commit)

## Зависимости

- ffmpeg + ffprobe в PATH (`ffmpeg -version`)
- tesseract + rus+eng traineddata (`tesseract --list-langs`)
- Node.js 20+, tsx (уже в devDependencies)
```

- [ ] **Step 3: Добавить .gitignore**

В конец `.gitignore` добавить:

```
# Phase 55 Sprint 1 PoC throwaway artifacts
scripts/vision-poc/results/frames/
scripts/vision-poc/results/selected-videos.json
scripts/vision-poc/results/frames-manifest.json
scripts/vision-poc/results/vlm-runs.json
scripts/vision-poc/results/ocr-runs.json
```

- [ ] **Step 4: Создать пустые директории через .gitkeep**

```bash
mkdir -p scripts/vision-poc/prompts scripts/vision-poc/results/mila-package
touch scripts/vision-poc/.gitkeep scripts/vision-poc/results/.gitkeep scripts/vision-poc/results/mila-package/.gitkeep scripts/vision-poc/prompts/.gitkeep
```

- [ ] **Step 5: Verify типы**

```bash
npx tsc --noEmit scripts/vision-poc/config.ts
```
Expected: no output (success).

- [ ] **Step 6: Commit**

```bash
git add scripts/vision-poc/ .gitignore
git commit -m "chore(vision-poc): scaffold scripts directory and config"
```

---

## Task 2: select-videos.ts — выбор 3 видео + резолв lessonId

**Files:**
- Create: `scripts/vision-poc/select-videos.ts`

- [ ] **Step 1: Реализация**

```typescript
// scripts/vision-poc/select-videos.ts
import { execSync } from 'child_process';
import { readdirSync, statSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, relative } from 'path';
import { POC_CONFIG } from './config';

interface VideoFile {
  localPath: string;
  courseDir: string;
  filename: string;
  durationSeconds: number;
  durationFormatted: string;
}

interface SelectedVideo extends VideoFile {
  bucket: 'short' | 'medium' | 'long';
  courseSlug: string;
  courseTitle: string;
  lessonId: string;
  lessonTitle: string;
  platformUrl: string;
}

const VIDEO_EXT = ['.mp4', '.mov', '.mkv', '.webm'];

function findVideos(root: string): VideoFile[] {
  const result: VideoFile[] = [];
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (VIDEO_EXT.some((ext) => entry.name.toLowerCase().endsWith(ext))) {
        try {
          const out = execSync(
            `ffprobe -v error -show_entries format=duration -of csv=p=0 "${full}"`,
            { encoding: 'utf8' },
          ).trim();
          const seconds = Math.round(parseFloat(out));
          if (!isNaN(seconds) && seconds > 0) {
            const courseDir = relative(root, full).split(/[/\\]/)[0];
            result.push({
              localPath: full.replace(/\\/g, '/'),
              courseDir,
              filename: entry.name,
              durationSeconds: seconds,
              durationFormatted: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`,
            });
          }
        } catch {
          // skip unreadable
        }
      }
    }
  }
  walk(root);
  return result;
}

function bucketize(v: VideoFile): 'short' | 'medium' | 'long' | null {
  const s = v.durationSeconds;
  const b = POC_CONFIG.duration_buckets;
  if (s >= b.short[0] && s <= b.short[1]) return 'short';
  if (s >= b.medium[0] && s <= b.medium[1]) return 'medium';
  if (s >= b.long[0] && s <= b.long[1]) return 'long';
  return null;
}

async function supabaseQuery(sql: string): Promise<any[]> {
  const token = process.env.SUPABASE_MGMT_TOKEN;
  const ref = process.env.SUPABASE_PROJECT_REF;
  if (!token || !ref) throw new Error('SUPABASE_MGMT_TOKEN and SUPABASE_PROJECT_REF required');
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

function escapeSqlLike(s: string): string {
  return s.replace(/'/g, "''").replace(/[%_]/g, (m) => `\\${m}`);
}

async function resolveLessonId(v: VideoFile): Promise<{ lessonId: string; lessonTitle: string; courseSlug: string; courseTitle: string } | null> {
  // Берём первые 4 значащих слова из имени файла как fuzzy fragment
  const base = v.filename.replace(/\.[^.]+$/, '');
  const words = base
    .replace(/[_\-\d]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4)
    .slice(0, 3);
  if (words.length === 0) return null;
  const fragment = escapeSqlLike(words.join(' '));
  const sql = `SELECT l.id, l.title, c.slug as course_slug, c.title as course_title
               FROM "Lesson" l
               JOIN "Course" c ON c.id = l."courseId"
               WHERE l.title ILIKE '%${fragment}%'
               LIMIT 1;`;
  const rows = await supabaseQuery(sql);
  if (rows.length === 0) return null;
  return {
    lessonId: rows[0].id,
    lessonTitle: rows[0].title,
    courseSlug: rows[0].course_slug,
    courseTitle: rows[0].course_title,
  };
}

async function main() {
  console.log('[1/4] Сканирую E:/Academy Courses на видео...');
  const all = findVideos(POC_CONFIG.academy_courses_root);
  console.log(`Найдено ${all.length} видео.`);

  const buckets: Record<'short' | 'medium' | 'long', VideoFile[]> = { short: [], medium: [], long: [] };
  for (const v of all) {
    const b = bucketize(v);
    if (b) buckets[b].push(v);
  }
  console.log(`Распределение: short=${buckets.short.length} / medium=${buckets.medium.length} / long=${buckets.long.length}`);

  console.log('[2/4] Выбираю по одному из каждого бакета (приоритет курсов)...');
  const selected: SelectedVideo[] = [];
  for (const bucket of ['short', 'medium', 'long'] as const) {
    let pick: VideoFile | undefined;
    for (const courseDir of POC_CONFIG.course_priority) {
      pick = buckets[bucket].find((v) => v.courseDir === courseDir);
      if (pick) break;
    }
    if (!pick) pick = buckets[bucket][0];
    if (!pick) {
      console.warn(`Нет видео в бакете ${bucket} — пропускаю.`);
      continue;
    }
    console.log(`[${bucket}] ${pick.courseDir}/${pick.filename} (${pick.durationFormatted})`);

    console.log(`  Резолвлю lessonId...`);
    const lesson = await resolveLessonId(pick);
    if (!lesson) {
      console.warn(`  fuzzy match не сработал — заполни lessonId вручную в JSON после прогона`);
      selected.push({
        ...pick,
        bucket,
        courseSlug: 'UNKNOWN',
        courseTitle: 'UNKNOWN',
        lessonId: 'MANUAL_RESOLVE_REQUIRED',
        lessonTitle: 'MANUAL_RESOLVE_REQUIRED',
        platformUrl: 'MANUAL_RESOLVE_REQUIRED',
      });
      continue;
    }
    selected.push({
      ...pick,
      bucket,
      courseSlug: lesson.courseSlug,
      courseTitle: lesson.courseTitle,
      lessonId: lesson.lessonId,
      lessonTitle: lesson.lessonTitle,
      platformUrl: `https://platform.mpstats.academy/learn/${lesson.courseSlug}/${lesson.lessonId}`,
    });
    console.log(`  → ${lesson.lessonTitle}`);
  }

  console.log('[3/4] Сохраняю результат...');
  if (!existsSync(POC_CONFIG.results_dir)) mkdirSync(POC_CONFIG.results_dir, { recursive: true });
  const outPath = join(POC_CONFIG.results_dir, 'selected-videos.json');
  writeFileSync(outPath, JSON.stringify(selected, null, 2), 'utf8');
  console.log(`[4/4] Готово: ${outPath}`);
  console.log(`Видео выбрано: ${selected.length}/3`);
  if (selected.some((s) => s.lessonId === 'MANUAL_RESOLVE_REQUIRED')) {
    console.warn('⚠ Требуется ручной резолв lessonId для записей помеченных MANUAL_RESOLVE_REQUIRED');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Запуск**

```bash
export SUPABASE_MGMT_TOKEN=<token>
export SUPABASE_PROJECT_REF=saecuecevicwjkpmaoot
npx tsx scripts/vision-poc/select-videos.ts
```

Expected: вывод вида
```
[1/4] Сканирую E:/Academy Courses на видео...
Найдено 405 видео.
Распределение: short=NN / medium=NN / long=NN
[short] 03_ai/03_ai_001_intro.mp4 (07:23)
  Резолвлю lessonId...
  → Введение в AI-инструменты
[medium] ...
[long] ...
[3/4] Сохраняю результат...
[4/4] Готово: scripts/vision-poc/results/selected-videos.json
Видео выбрано: 3/3
```

- [ ] **Step 3: Sanity-check файла**

```bash
cat scripts/vision-poc/results/selected-videos.json | head -30
```
Expected: JSON массив из 3 объектов, каждый с заполненным `lessonId`, `platformUrl`. Если есть `MANUAL_RESOLVE_REQUIRED` — открыть в Supabase Studio, найти lessonId, поправить руками.

- [ ] **Step 4: Открыть platformUrl каждого видео в браузере**

Убедиться что URL ведёт на реальный урок. Если 404 — резолв был ошибочным, поправить вручную.

- [ ] **Step 5: Commit**

```bash
git add scripts/vision-poc/select-videos.ts
git commit -m "feat(vision-poc): video selection with Lesson resolution"
```

---

## Task 3: extract-frames.ts — ffmpeg scene-detect с adaptive cap

**Files:**
- Create: `scripts/vision-poc/extract-frames.ts`

- [ ] **Step 1: Реализация**

```typescript
// scripts/vision-poc/extract-frames.ts
import { execSync, spawnSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { POC_CONFIG } from './config';

interface SelectedVideo {
  localPath: string;
  bucket: 'short' | 'medium' | 'long';
  lessonId: string;
  durationSeconds: number;
}

interface FrameMeta {
  seq: number;
  timecode: string;
  pts: number;
  path: string;
}

interface VideoExtraction {
  lessonId: string;
  totalFramesExtracted: number;
  thresholdUsed: number;
  selectedForPoC: number;
  frames: FrameMeta[];
}

function ptsToTimecode(pts: number): string {
  const total = Math.round(pts);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}-${String(s).padStart(2, '0')}`;
}

function runFfmpeg(video: string, outDir: string, threshold: number, minInterval: number): { count: number; ptsList: number[] } {
  const filter = `select='gt(scene,${threshold})*gte(t-prev_selected_t,${minInterval})',showinfo`;
  // Очистить директорию от предыдущих попыток
  if (existsSync(outDir)) {
    for (const f of readdirSync(outDir)) {
      if (f.endsWith('.jpg')) unlinkSync(join(outDir, f));
    }
  } else {
    mkdirSync(outDir, { recursive: true });
  }
  const result = spawnSync(
    'ffmpeg',
    [
      '-i', video,
      '-vf', filter,
      '-vsync', 'vfr',
      '-q:v', '3',
      join(outDir, 'tmp_%04d.jpg'),
    ],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed: ${result.stderr.slice(-500)}`);
  }
  // Парсим pts_time из stderr — строки вида "showinfo @ ... pts_time:NN.NNN"
  const ptsList: number[] = [];
  const re = /pts_time:([\d.]+)/g;
  let m;
  while ((m = re.exec(result.stderr)) !== null) {
    ptsList.push(parseFloat(m[1]));
  }
  const count = readdirSync(outDir).filter((f) => f.startsWith('tmp_') && f.endsWith('.jpg')).length;
  return { count, ptsList };
}

function pickEvenly<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  const step = arr.length / n;
  const result: T[] = [];
  for (let i = 0; i < n; i++) {
    result.push(arr[Math.floor(i * step)]);
  }
  return result;
}

async function processVideo(v: SelectedVideo): Promise<VideoExtraction> {
  const outDir = join(POC_CONFIG.frames_dir, v.lessonId);
  let thresholdUsed = POC_CONFIG.scene_threshold_initial;
  let { count, ptsList } = runFfmpeg(v.localPath, outDir, thresholdUsed, POC_CONFIG.min_interval_seconds);

  // Adaptive escalation
  for (const next of POC_CONFIG.scene_threshold_steps) {
    if (count <= POC_CONFIG.frames_cap_per_video) break;
    console.log(`  cap превышен (${count}), повтор с threshold=${next}`);
    thresholdUsed = next;
    ({ count, ptsList } = runFfmpeg(v.localPath, outDir, thresholdUsed, POC_CONFIG.min_interval_seconds));
  }

  // Sub-sample если всё ещё > cap
  let allFiles = readdirSync(outDir).filter((f) => f.startsWith('tmp_')).sort();
  let allPts = ptsList.slice(0, allFiles.length);

  if (allFiles.length > POC_CONFIG.frames_cap_per_video) {
    console.log(`  всё ещё > cap (${allFiles.length}), force sub-sample до ${POC_CONFIG.frames_cap_per_video}`);
    const keepIdx = new Set(
      pickEvenly(
        Array.from({ length: allFiles.length }, (_, i) => i),
        POC_CONFIG.frames_cap_per_video,
      ),
    );
    for (let i = 0; i < allFiles.length; i++) {
      if (!keepIdx.has(i)) unlinkSync(join(outDir, allFiles[i]));
    }
    allFiles = allFiles.filter((_, i) => keepIdx.has(i));
    allPts = allPts.filter((_, i) => keepIdx.has(i));
  }

  // Из всего набора — равномерно 10 для PoC
  const sampledIndices = pickEvenly(
    Array.from({ length: allFiles.length }, (_, i) => i),
    POC_CONFIG.frames_for_poc_sample,
  );

  // Переименовать выбранные в финальный формат, удалить остальные
  const frames: FrameMeta[] = [];
  const sampledSet = new Set(sampledIndices);
  for (let i = 0; i < allFiles.length; i++) {
    const tmp = allFiles[i];
    const tmpPath = join(outDir, tmp);
    if (sampledSet.has(i)) {
      const seq = frames.length + 1;
      const pts = allPts[i] ?? 0;
      const tc = ptsToTimecode(pts);
      const finalName = `frame_${String(seq).padStart(3, '0')}_${tc}.jpg`;
      const finalPath = join(outDir, finalName);
      execSync(`mv "${tmpPath}" "${finalPath}"`);
      frames.push({
        seq,
        timecode: `${tc.replace('-', ':')}`,
        pts,
        path: `frames/${v.lessonId}/${finalName}`,
      });
    } else {
      unlinkSync(tmpPath);
    }
  }

  return {
    lessonId: v.lessonId,
    totalFramesExtracted: allFiles.length,
    thresholdUsed,
    selectedForPoC: frames.length,
    frames,
  };
}

async function main() {
  const selectedPath = join(POC_CONFIG.results_dir, 'selected-videos.json');
  if (!existsSync(selectedPath)) {
    console.error(`Не найден ${selectedPath}. Сначала запусти select-videos.ts`);
    process.exit(1);
  }
  const videos: SelectedVideo[] = JSON.parse(readFileSync(selectedPath, 'utf8'));
  if (!existsSync(POC_CONFIG.frames_dir)) mkdirSync(POC_CONFIG.frames_dir, { recursive: true });

  const extractions: VideoExtraction[] = [];
  for (const v of videos) {
    if (v.lessonId === 'MANUAL_RESOLVE_REQUIRED') {
      console.warn(`Пропуск ${v.localPath} — lessonId не зарезолвен`);
      continue;
    }
    console.log(`[${v.bucket}] ${v.localPath}`);
    const ext = await processVideo(v);
    console.log(`  итог: ${ext.totalFramesExtracted} extracted, ${ext.selectedForPoC} в выборке, threshold=${ext.thresholdUsed}`);
    extractions.push(ext);
  }

  const manifestPath = join(POC_CONFIG.results_dir, 'frames-manifest.json');
  writeFileSync(manifestPath, JSON.stringify({ videos: extractions }, null, 2), 'utf8');
  console.log(`Готово: ${manifestPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Запуск**

```bash
npx tsx scripts/vision-poc/extract-frames.ts
```

Expected:
```
[short] E:/Academy Courses/03_ai/...mp4
  итог: 12 extracted, 10 в выборке, threshold=0.3
[medium] ...
  итог: 47 extracted, 10 в выборке, threshold=0.3
[long] E:/Academy Courses/04_workshops/...mp4
  cap превышен (180), повтор с threshold=0.5
  итог: 89 extracted, 10 в выборке, threshold=0.5
Готово: scripts/vision-poc/results/frames-manifest.json
```

- [ ] **Step 3: Visual sanity-check**

Открыть 2-3 кадра из каждого видео:
```bash
ls scripts/vision-poc/results/frames/<lessonId>/
```
Expected: 10 файлов вида `frame_001_00-12.jpg`, `frame_002_01-23.jpg` ...

Открыть руками — кадры должны быть РАЗНЫЕ (не дубли), читаемые, не чёрные.

- [ ] **Step 4: Commit**

```bash
git add scripts/vision-poc/extract-frames.ts
git commit -m "feat(vision-poc): ffmpeg frame extraction with adaptive capping"
```

---

## Task 4: prompts/frame-describe.txt — VLM промпт

**Files:**
- Create: `scripts/vision-poc/prompts/frame-describe.txt`

- [ ] **Step 1: Создать файл промпта**

```
Опиши что показано на кадре. Формат ответа — строго JSON без markdown-обёртки:

{
  "type": "slide" | "interface" | "table" | "code" | "video" | "other",
  "summary": "1-2 предложения общего описания",
  "extracted": {
    "urls": ["полный URL дословно если виден"],
    "numbers": ["числа из таблиц или интерфейсов с указанием контекста, например 'Выручка: 12345'"],
    "tools": ["название инструмента/сервиса/программы"],
    "other": ["прочие важные детали — заголовки, имена кнопок, фильтры"]
  }
}

Правила:
- Если не уверен в значении (мелкий текст, размытость) — пиши "не разобрать"
- НЕ выдумывай конкретные числа, URL или имена если не видишь их чётко
- Для таблиц извлекай данные построчно
- URL извлекай дословно, не сокращай
- Никаких пояснений вне JSON
```

- [ ] **Step 2: Commit**

```bash
git add scripts/vision-poc/prompts/frame-describe.txt
git commit -m "feat(vision-poc): VLM frame description prompt v1"
```

---

## Task 5: run-vlm.ts — 30 кадров × 3 модели через OpenRouter

**Files:**
- Create: `scripts/vision-poc/run-vlm.ts`

- [ ] **Step 1: Реализация**

```typescript
// scripts/vision-poc/run-vlm.ts
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { POC_CONFIG } from './config';

interface FrameMeta {
  seq: number;
  timecode: string;
  pts: number;
  path: string;
}
interface VideoExtraction {
  lessonId: string;
  frames: FrameMeta[];
}

interface VlmResult {
  frameId: string;
  lessonId: string;
  framePath: string;
  model: string;
  response: any;
  rawContent: string;
  tokensIn: number;
  tokensOut: number;
  costUSD: number;
  latencyMs: number;
  error?: string;
}

// Прайсинг OpenRouter на 2026-05-06 (USD per 1M токенов; image — за кадр)
const PRICING: Record<string, { in: number; out: number; image: number }> = {
  'google/gemini-2.5-flash-lite': { in: 0.10, out: 0.40, image: 0.0001 },
  'google/gemini-3.1-flash-lite-preview': { in: 0.25, out: 1.50, image: 0.00025 },
  'openai/gpt-4.1-mini': { in: 0.40, out: 1.60, image: 0 }, // image в input tokens
  'google/gemini-2.5-flash': { in: 0.30, out: 2.50, image: 0.0003 },
};

function calcCost(model: string, tokensIn: number, tokensOut: number, hasImage: boolean): number {
  const p = PRICING[model];
  if (!p) return 0;
  return (tokensIn * p.in + tokensOut * p.out) / 1_000_000 + (hasImage ? p.image : 0);
}

function imageToDataUrl(path: string): string {
  const buf = readFileSync(path);
  const b64 = buf.toString('base64');
  return `data:image/jpeg;base64,${b64}`;
}

async function callVlm(model: string, prompt: string, imagePath: string, apiKey: string): Promise<{ raw: string; tokensIn: number; tokensOut: number; latencyMs: number }> {
  const dataUrl = imageToDataUrl(imagePath);
  const t0 = Date.now();
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://platform.mpstats.academy',
      'X-Title': 'MAAL Vision PoC',
    },
    body: JSON.stringify({
      model,
      max_tokens: 800,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });
  const latencyMs = Date.now() - t0;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${model} HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content ?? '';
  const usage = data.usage ?? {};
  return {
    raw: typeof raw === 'string' ? raw : JSON.stringify(raw),
    tokensIn: usage.prompt_tokens ?? 0,
    tokensOut: usage.completion_tokens ?? 0,
    latencyMs,
  };
}

function tryParseJson(raw: string): any {
  // VLM иногда возвращает JSON в ```json блоках — выдираем
  const fenced = raw.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  const candidate = (fenced ? fenced[1] : raw).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

async function rateLimitedQueue<T, R>(items: T[], rps: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const interval = 1000 / rps;
  const out: R[] = [];
  let last = 0;
  for (const item of items) {
    const since = Date.now() - last;
    if (since < interval) await new Promise((r) => setTimeout(r, interval - since));
    last = Date.now();
    out.push(await fn(item));
  }
  return out;
}

async function main() {
  const apiKey = process.env.OPENROUTER_POC_KEY;
  if (!apiKey) {
    console.error('OPENROUTER_POC_KEY env var required');
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(join(POC_CONFIG.results_dir, 'frames-manifest.json'), 'utf8')) as { videos: VideoExtraction[] };
  const prompt = readFileSync(join('scripts/vision-poc/prompts/frame-describe.txt'), 'utf8');

  // Собираем все frame_x_lesson задачи
  type Job = { lessonId: string; frame: FrameMeta; model: string };
  const jobs: Job[] = [];
  for (const v of manifest.videos) {
    for (const f of v.frames) {
      for (const model of POC_CONFIG.vlm_models) {
        jobs.push({ lessonId: v.lessonId, frame: f, model });
      }
    }
  }
  console.log(`Всего вызовов: ${jobs.length} (${manifest.videos.length} видео × 10 кадров × ${POC_CONFIG.vlm_models.length} моделей)`);

  const results: VlmResult[] = [];
  const totalCostUSD: Record<string, number> = {};

  let i = 0;
  for (const job of jobs) {
    i++;
    const framePath = join(POC_CONFIG.results_dir, job.frame.path);
    process.stdout.write(`[${i}/${jobs.length}] ${job.model} on ${job.lessonId}/frame_${job.frame.seq}... `);
    try {
      const { raw, tokensIn, tokensOut, latencyMs } = await callVlm(job.model, prompt, framePath, apiKey);
      const parsed = tryParseJson(raw);
      const cost = calcCost(job.model, tokensIn, tokensOut, true);
      totalCostUSD[job.model] = (totalCostUSD[job.model] ?? 0) + cost;
      results.push({
        frameId: `${job.lessonId}/frame_${String(job.frame.seq).padStart(3, '0')}`,
        lessonId: job.lessonId,
        framePath: job.frame.path,
        model: job.model,
        response: parsed,
        rawContent: raw,
        tokensIn,
        tokensOut,
        costUSD: cost,
        latencyMs,
      });
      console.log(`ok ${latencyMs}ms ${tokensIn}in/${tokensOut}out $${cost.toFixed(5)}`);
    } catch (e: any) {
      console.log(`FAIL ${e.message.slice(0, 80)}`);
      results.push({
        frameId: `${job.lessonId}/frame_${String(job.frame.seq).padStart(3, '0')}`,
        lessonId: job.lessonId,
        framePath: job.frame.path,
        model: job.model,
        response: null,
        rawContent: '',
        tokensIn: 0,
        tokensOut: 0,
        costUSD: 0,
        latencyMs: 0,
        error: e.message,
      });
    }
    // rate limit
    await new Promise((r) => setTimeout(r, 1000 / POC_CONFIG.rate_limit_rps));
  }

  const out = {
    runDate: new Date().toISOString(),
    models: POC_CONFIG.vlm_models,
    totalCostUSD,
    grandTotalUSD: Object.values(totalCostUSD).reduce((a, b) => a + b, 0),
    results,
  };
  const outPath = join(POC_CONFIG.results_dir, 'vlm-runs.json');
  writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
  console.log(`\nГотово: ${outPath}`);
  console.log(`Итого: ${results.length} вызовов, $${out.grandTotalUSD.toFixed(4)}`);
  console.log(`По моделям:`, totalCostUSD);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Smoke-test на одном кадре одной моделью**

Перед полным прогоном — quick check ключа и vision-доступа. Создать `scripts/vision-poc/smoke-vlm.ts` (потом удалить):

```typescript
// scripts/vision-poc/smoke-vlm.ts (TEMPORARY — удалить перед коммитом)
import { readFileSync } from 'fs';
import { POC_CONFIG } from './config';
import { join } from 'path';

const apiKey = process.env.OPENROUTER_POC_KEY!;
const manifest = JSON.parse(readFileSync(join(POC_CONFIG.results_dir, 'frames-manifest.json'), 'utf8'));
const firstFrame = manifest.videos[0].frames[0];
const framePath = join(POC_CONFIG.results_dir, firstFrame.path);
const dataUrl = `data:image/jpeg;base64,${readFileSync(framePath).toString('base64')}`;

const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'google/gemini-2.5-flash-lite',
    max_tokens: 200,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Что на картинке? Кратко.' }, { type: 'image_url', image_url: { url: dataUrl } }] }],
  }),
});
console.log(res.status, await res.text());
```

```bash
npx tsx scripts/vision-poc/smoke-vlm.ts
```
Expected: HTTP 200 + JSON с описанием картинки. Если 401 — ключ нерабочий. Если 400 vision unsupported — переключиться на основной prod-ключ. После — удалить smoke-vlm.ts:

```bash
rm scripts/vision-poc/smoke-vlm.ts
```

- [ ] **Step 3: Полный прогон**

```bash
export OPENROUTER_POC_KEY=$(cat "E:/Academy Courses/OpenRouter_Api_key.txt")
npx tsx scripts/vision-poc/run-vlm.ts
```

Expected: ~90 строк прогресса, итоговая стоимость <$0.50, ~3-5 минут. Если Gemini 3.1 preview падает 4xx — заменить в `config.ts` на `vlm_fallback_if_preview_unavailable` и перезапустить только для этой модели.

- [ ] **Step 4: Sanity-check файла**

```bash
cat scripts/vision-poc/results/vlm-runs.json | head -50
```
Expected: `grandTotalUSD` < 1.0, `results.length === 90`, у большинства записей `response` не null.

- [ ] **Step 5: Commit**

```bash
git add scripts/vision-poc/run-vlm.ts
git commit -m "feat(vision-poc): VLM trio runner via OpenRouter"
```

---

## Task 6: run-ocr.ts — tesseract baseline

**Files:**
- Create: `scripts/vision-poc/run-ocr.ts`

- [ ] **Step 1: Реализация**

```typescript
// scripts/vision-poc/run-ocr.ts
import { spawnSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { POC_CONFIG } from './config';

interface FrameMeta {
  seq: number;
  timecode: string;
  pts: number;
  path: string;
}
interface VideoExtraction {
  lessonId: string;
  frames: FrameMeta[];
}

interface OcrResult {
  frameId: string;
  framePath: string;
  rawText: string;
  extractedUrls: string[];
  extractedNumbers: string[];
}

function runTesseract(imagePath: string): string {
  const res = spawnSync(
    'tesseract',
    [imagePath, '-', '-l', POC_CONFIG.ocr_languages, '--psm', String(POC_CONFIG.ocr_psm)],
    { encoding: 'utf8' },
  );
  if (res.status !== 0) {
    throw new Error(`tesseract failed: ${res.stderr.slice(0, 300)}`);
  }
  return res.stdout;
}

function extractUrls(text: string): string[] {
  const re = /https?:\/\/[^\s<>"']+/g;
  return [...new Set(text.match(re) ?? [])];
}

function extractNumbers(text: string): string[] {
  // Числа с разделителями (1234, 1 234, 12.34, 12,34, 1234.56)
  const re = /\b\d{1,3}(?:[\s.,]\d{3})*(?:[.,]\d+)?\b/g;
  return [...new Set(text.match(re) ?? [])].filter((n) => n.replace(/[^0-9]/g, '').length >= 2);
}

async function main() {
  const manifest = JSON.parse(readFileSync(join(POC_CONFIG.results_dir, 'frames-manifest.json'), 'utf8')) as { videos: VideoExtraction[] };
  const results: OcrResult[] = [];
  let i = 0;
  const total = manifest.videos.reduce((a, v) => a + v.frames.length, 0);
  for (const v of manifest.videos) {
    for (const f of v.frames) {
      i++;
      const framePath = join(POC_CONFIG.results_dir, f.path);
      process.stdout.write(`[${i}/${total}] ${v.lessonId}/frame_${f.seq}... `);
      try {
        const raw = runTesseract(framePath);
        results.push({
          frameId: `${v.lessonId}/frame_${String(f.seq).padStart(3, '0')}`,
          framePath: f.path,
          rawText: raw,
          extractedUrls: extractUrls(raw),
          extractedNumbers: extractNumbers(raw),
        });
        console.log(`ok ${raw.length}ch`);
      } catch (e: any) {
        console.log(`FAIL ${e.message.slice(0, 80)}`);
      }
    }
  }
  const outPath = join(POC_CONFIG.results_dir, 'ocr-runs.json');
  writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`Готово: ${outPath} (${results.length} записей)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Запуск**

```bash
npx tsx scripts/vision-poc/run-ocr.ts
```
Expected: 30 записей, каждая с rawText (может быть пустым на чисто-графических кадрах).

- [ ] **Step 3: Sanity-check**

```bash
cat scripts/vision-poc/results/ocr-runs.json | grep -c "frameId"
```
Expected: 30.

Открыть один файл с явным URL на кадре (ты глазами видишь URL в JPG) — проверить что `extractedUrls` содержит этот URL. Если пусто и URL должен быть — попробовать `--psm 11` (sparse text) или `--psm 3`.

- [ ] **Step 4: Commit**

```bash
git add scripts/vision-poc/run-ocr.ts
git commit -m "feat(vision-poc): tesseract OCR baseline"
```

---

## Task 7: analyze.ts — генерация черновика comparison.md

**Files:**
- Create: `scripts/vision-poc/analyze.ts`

- [ ] **Step 1: Реализация**

```typescript
// scripts/vision-poc/analyze.ts
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { POC_CONFIG } from './config';

interface VlmResult {
  frameId: string;
  lessonId: string;
  framePath: string;
  model: string;
  response: any;
  rawContent: string;
  tokensIn: number;
  tokensOut: number;
  costUSD: number;
  latencyMs: number;
  error?: string;
}
interface OcrResult {
  frameId: string;
  framePath: string;
  rawText: string;
  extractedUrls: string[];
  extractedNumbers: string[];
}

function summary(r: VlmResult): string {
  if (r.error) return `❌ ERROR: ${r.error.slice(0, 100)}`;
  if (!r.response) return `⚠ Не парсится JSON: ${r.rawContent.slice(0, 100)}`;
  const ext = r.response.extracted ?? {};
  const parts = [
    `**type:** ${r.response.type ?? '?'}`,
    `**summary:** ${r.response.summary ?? ''}`,
  ];
  if (ext.urls?.length) parts.push(`**urls:** ${ext.urls.join(' | ')}`);
  if (ext.numbers?.length) parts.push(`**numbers:** ${ext.numbers.join(' | ')}`);
  if (ext.tools?.length) parts.push(`**tools:** ${ext.tools.join(' | ')}`);
  return parts.join('<br>');
}

async function main() {
  const vlm = JSON.parse(readFileSync(join(POC_CONFIG.results_dir, 'vlm-runs.json'), 'utf8'));
  const ocr = JSON.parse(readFileSync(join(POC_CONFIG.results_dir, 'ocr-runs.json'), 'utf8')) as OcrResult[];
  const ocrMap = new Map(ocr.map((o) => [o.frameId, o]));

  // Группируем VLM по frameId
  const byFrame = new Map<string, VlmResult[]>();
  for (const r of vlm.results as VlmResult[]) {
    if (!byFrame.has(r.frameId)) byFrame.set(r.frameId, []);
    byFrame.get(r.frameId)!.push(r);
  }

  const lines: string[] = [];
  lines.push(`# VLM PoC Comparison — DRAFT`);
  lines.push('');
  lines.push(`**Сгенерировано:** ${new Date().toISOString()}`);
  lines.push(`**Дата прогона VLM:** ${vlm.runDate}`);
  lines.push('');
  lines.push(`## Затраты`);
  lines.push('');
  for (const [m, c] of Object.entries(vlm.totalCostUSD)) {
    lines.push(`- **${m}:** $${(c as number).toFixed(5)}`);
  }
  lines.push(`- **Итого:** $${vlm.grandTotalUSD.toFixed(5)}`);
  lines.push('');
  lines.push(`## Per-frame сравнение`);
  lines.push('');
  lines.push(`Заполни колонку «Hallucination?» руками: y/n/partial. Колонка «Best?» — пометить лучшую модель на этом кадре.`);
  lines.push('');

  for (const [frameId, runs] of byFrame) {
    const ocrRow = ocrMap.get(frameId);
    lines.push(`### ${frameId}`);
    lines.push('');
    lines.push(`![frame](${runs[0].framePath})`);
    lines.push('');
    if (ocrRow) {
      lines.push(`**OCR raw text (первые 300 ch):** \`${ocrRow.rawText.replace(/\s+/g, ' ').slice(0, 300)}\``);
      if (ocrRow.extractedUrls.length) lines.push(`**OCR URLs:** ${ocrRow.extractedUrls.join(' | ')}`);
      if (ocrRow.extractedNumbers.length) lines.push(`**OCR numbers (first 10):** ${ocrRow.extractedNumbers.slice(0, 10).join(' | ')}`);
      lines.push('');
    }
    lines.push(`| Модель | Описание | Hallucination? | Best? |`);
    lines.push(`|---|---|---|---|`);
    for (const r of runs) {
      lines.push(`| ${r.model} | ${summary(r)} | | |`);
    }
    lines.push('');
  }

  lines.push(`## Hallucination rate per model (заполнить руками после ручной разметки)`);
  lines.push('');
  for (const m of POC_CONFIG.vlm_models) {
    lines.push(`- **${m}:** ___ / 30 (___%)`);
  }
  lines.push('');
  lines.push(`## SC5: OCR vs VLM на URL/числах`);
  lines.push('');
  lines.push(`Заполнить после ручной сверки 10 кадров с явными URL/таблицами:`);
  lines.push(`- OCR URL accuracy: ___% (___ из ___ URL извлечены корректно)`);
  lines.push(`- VLM URL accuracy (best model): ___%`);
  lines.push(`- Решение: [ ] объединять OCR+VLM в Sprint 2 / [ ] VLM-only достаточно`);
  lines.push('');
  lines.push(`## Выбор best model`);
  lines.push('');
  lines.push(`Best model по итогам ручного анализа: **___**`);
  lines.push('');
  lines.push(`Обоснование: ___`);

  const outPath = join(POC_CONFIG.results_dir, 'comparison.md');
  writeFileSync(outPath, lines.join('\n'), 'utf8');
  console.log(`Готово: ${outPath}`);
  console.log(`⚠ Это ЧЕРНОВИК. Открой и заполни руками колонки Hallucination/Best, hallucination rate, SC5, best model.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Запуск**

```bash
npx tsx scripts/vision-poc/analyze.ts
```
Expected: создан `results/comparison.md` с 30 секциями (по одной на frame), каждая с превью + 3 строки моделей + OCR + пустые колонки для разметки.

- [ ] **Step 3: Commit**

```bash
git add scripts/vision-poc/analyze.ts
git commit -m "feat(vision-poc): comparison.md draft generator"
```

---

## Task 8: Ручной анализ + comparison.md финал

**Files:**
- Modify: `scripts/vision-poc/results/comparison.md`

- [ ] **Step 1: Открыть comparison.md в редакторе**

В каждой секции для каждой модели проверить ответ против самого кадра:
- Кадр открывается через relative-path (Markdown viewer)
- Сверять: совпадает ли описание с реальностью; правильно ли URL; правильно ли числа
- В колонке «Hallucination?» — `y` (явное враньё), `partial` (часть верно, часть выдумана), `n` (всё ок или честное «не разобрать»)
- В колонке «Best?» — отметить ✓ для модели, которая лучше всех справилась с этим кадром

- [ ] **Step 2: Подсчитать hallucination rate per model**

В разделе "Hallucination rate per model" посчитать `y + partial * 0.5` из 30 для каждой модели, вычислить процент. Заполнить.

- [ ] **Step 3: Sample 10 кадров с URL/таблицами для SC5**

Из 30 кадров отметить вручную ~10, где есть явные URL или таблицы. Сверить:
- VLM лучшей модели извлёк URL/числа? Сколько корректно?
- OCR извлёк URL/числа? Сколько корректно?
- Заполнить раздел "SC5: OCR vs VLM"

- [ ] **Step 4: Решение по best model**

В разделе "Выбор best model" — указать модель и обоснование (1-2 предложения). Best model = модель с наименьшим hallucination rate, при близких рейтингах — приоритет более дешёвой.

- [ ] **Step 5: Commit**

```bash
git add scripts/vision-poc/results/comparison.md
git commit -m "docs(vision-poc): manual VLM comparison analysis"
```

---

## Task 9: Пакет для Милы — checklist + instructions

**Files:**
- Create: `scripts/vision-poc/results/mila-package/instructions.md`
- Create: `scripts/vision-poc/results/mila-package/checklist.md`

- [ ] **Step 1: Создать instructions.md**

```markdown
# Инструкция тестирования Vision RAG (Phase 55 Sprint 1)

**Привет, Мила! Помощь в проверке нового виженного режима ассистента.**

## Зачем

Проверяем — научили ассистента «видеть» что показано на экране в видео (таблицы, URL, кнопки, скриншоты кабинета). До этого он понимал только то, что произносится словами в озвучке. Теперь — должен понимать и визуальный контент.

## Что нужно сделать (~30-45 минут)

1. Открой `checklist.md` в этой же папке.
2. Для каждой строки чек-листа:
   - Перейди по URL урока в новой вкладке
   - Перемотай на указанный тайм-код
   - Открой чат с ассистентом (правая панель)
   - Скопируй вопрос из колонки «Вопрос», вставь в чат, отправь
   - Скопируй ответ ассистента в колонку «Ответ ассистента»
   - В колонке «Корректно?» поставь:
     - **Y** — ответ верный (все факты совпадают с тем что видно на экране)
     - **Partial** — часть верна, часть нет (например URL правильный, но число выдумано)
     - **N** — ответ неверен или ассистент сказал «не знаю» когда инфа явно есть на экране
   - Если что-то странное — пиши в «Комментарий» (например «ассистент уверенно соврал»)

## Сроки

Желательно за 1 рабочий день. Если не успеваешь — напиши в чат, не блокер.

## Куда вернуть

Заполненный `checklist.md` — обратно в чат проекта.

## Если что-то не работает

- URL открывается на 404 → напиши в чат, проверим
- Ассистент не отвечает / лагает → напиши в чат
- Видео не воспроизводится на тайм-коде → попробуй обновить страницу

Спасибо!
```

- [ ] **Step 2: Создать checklist.md (шаблон, конкретные вопросы добавляются после ручного анализа кадров)**

```markdown
# Vision RAG — чек-лист тестирования

> ⚠ Этот файл — шаблон. Конкретные вопросы заполняются после `comparison.md` — берём
> примеры с явными URL, числами, инструментами, скриншотами кабинета,
> формулируем вопросы под них.

## Тестовые уроки

1. **Короткий урок:** [Название] — `<platformUrl>`
2. **Средний урок:** [Название] — `<platformUrl>`
3. **Воркшоп:** [Название] — `<platformUrl>`

## Вопросы

### Категория 1: URL/ссылки на экране (5 вопросов)

| # | Урок | Тайм-код | Вопрос | Ответ ассистента | Корректно? (Y/Partial/N) | Комментарий |
|---|------|----------|--------|------------------|--------------------------|-------------|
| 1 | [Урок 1] | 02:14 | Какая ссылка показана на экране в этот момент? |  |  |  |
| 2 | [Урок 1] | ... | ... |  |  |  |
| 3 | [Урок 2] | ... | ... |  |  |  |
| 4 | [Урок 2] | ... | ... |  |  |  |
| 5 | [Урок 3] | ... | ... |  |  |  |

### Категория 2: Числа в таблицах/графиках (7 вопросов)

| # | Урок | Тайм-код | Вопрос | Ответ ассистента | Корректно? | Комментарий |
|---|------|----------|--------|------------------|-----------|-------------|
| 6 | [Урок 1] | ... | Какое значение в столбце "X" на ... ? |  |  |  |
| 7 | ... | ... | ... |  |  |  |
| 8 | ... | ... | ... |  |  |  |
| 9 | ... | ... | ... |  |  |  |
| 10 | ... | ... | ... |  |  |  |
| 11 | ... | ... | ... |  |  |  |
| 12 | ... | ... | ... |  |  |  |

### Категория 3: Названия инструментов/кнопок/полей (5 вопросов)

| # | Урок | Тайм-код | Вопрос | Ответ ассистента | Корректно? | Комментарий |
|---|------|----------|--------|------------------|-----------|-------------|
| 13 | ... | ... | Какой раздел открыт в кабинете? |  |  |  |
| 14 | ... | ... | ... |  |  |  |
| 15 | ... | ... | ... |  |  |  |
| 16 | ... | ... | ... |  |  |  |
| 17 | ... | ... | ... |  |  |  |

### Категория 4: Скриншоты кабинета MPSTATS (3 вопроса)

| # | Урок | Тайм-код | Вопрос | Ответ ассистента | Корректно? | Комментарий |
|---|------|----------|--------|------------------|-----------|-------------|
| 18 | ... | ... | Какие фильтры установлены? |  |  |  |
| 19 | ... | ... | Какая категория выбрана? |  |  |  |
| 20 | ... | ... | Какой период анализа? |  |  |  |

## Итог (Мила не заполняет — заполнят разработчики)

- Y count: ___ / 20
- Partial count: ___ / 20 (×0.5 в accuracy)
- N count: ___ / 20
- **Accuracy:** ___%
```

- [ ] **Step 3: Заполнить конкретные вопросы**

Открыть `comparison.md`, выписать кадры где:
- Есть явный URL → формулировать вопрос «Какая ссылка показана на TIMECODE?»
- Есть таблица с числами → «Какое значение в столбце Y на TIMECODE?»
- Есть UI кабинета → «Какой раздел открыт на TIMECODE?» / «Какие фильтры?»

Заполнить таблицы в `checklist.md` реальными вопросами + тайм-коды + платформенные URL из `selected-videos.json`.

- [ ] **Step 4: Sanity-check**

Открыть platform URL первого вопроса вручную, перемотать на тайм-код, убедиться что вопрос отвечается с экрана (не из транскрипта). Если ответ есть в транскрипте — это плохой тест-вопрос, заменить на другой.

- [ ] **Step 5: Commit**

```bash
git add scripts/vision-poc/results/mila-package/
git commit -m "docs(vision-poc): Mila test package — instructions + checklist"
```

---

## Task 10: Передача Миле + получение результатов + decision.md

**Files:**
- Create: `scripts/vision-poc/results/decision.md`

- [ ] **Step 1: Передать пакет Миле**

Скопировать `mila-package/` в общедоступное место (Google Drive / общий чат) или дать ссылку на git. Уведомить Милу в чате.

- [ ] **Step 2: Дождаться результатов**

Получить заполненный `checklist.md` обратно. Импортировать в `scripts/vision-poc/results/mila-package/checklist.md` (перезаписать), закоммитить:

```bash
git add scripts/vision-poc/results/mila-package/checklist.md
git commit -m "docs(vision-poc): Mila completed checklist results"
```

- [ ] **Step 3: Посчитать accuracy**

Из заполненного чек-листа: `accuracy = (Y + Partial * 0.5) / 20 * 100`. Заполнить раздел "Итог" в `checklist.md`.

- [ ] **Step 4: Создать decision.md**

```markdown
# Phase 55 Sprint 1 PoC — Decision

**Date:** YYYY-MM-DD
**Verdict:** GO / NO-GO / RETRY

## SC Results

- **SC1 (pipeline works):** PASS / FAIL — описание
- **SC2 (frames extraction sane):** PASS / FAIL — short=N, medium=N, long=N (post-cap)
- **SC3 (cost extrapolation):** PASS / FAIL — actual $X.XX vs estimated $Y.YY на 30 кадров → projected $Z.ZZ на 20K кадров
- **SC4 (best model hallucination ≤20%):** PASS / FAIL — model X: N% hallucination
- **SC5 (OCR vs VLM on URL):** OCR XX% / VLM YY% → решение «объединять OCR+VLM в Sprint 2» / «VLM-only достаточно»
- **SC6 (Mila accuracy ≥70%):** PASS / FAIL — XX%

## Selected Model

**Победитель:** `<provider/model>`

Обоснование: <1-2 предложения о соотношении цена/качество>

Прогноз стоимости full-pass (~20K кадров платформы): **$X.XX**

## Rejected Candidates

- `<model 1>`: причина отклонения
- `<model 2>`: причина отклонения

## Architecture Lessons

- VLM+OCR fusion: KEEP / DROP — обоснование из SC5
- Adaptive cap (120 кадров): adequate / нужно увеличить до N
- Promp v1: достаточен / нужны корректировки (перечислить)

## Next Steps

- [ ] Открыть Sprint 2 (Pilot) — спек `docs/superpowers/specs/YYYY-MM-DD-phase-55-sprint-2-pilot-design.md`
- [ ] Зафиксировать выбранную модель в Phase 55 ROADMAP entry
- [ ] При NO-GO: записать lesson learned в `.claude/memory/feedback_phase_55_no_go.md`

## Artifacts

- `comparison.md` — детальный per-frame анализ
- `mila-package/checklist.md` — результаты тестирования
- `vlm-runs.json` (gitignored) — raw VLM ответы (бэкап локально, не в git)
- `ocr-runs.json` (gitignored) — raw OCR ответы
```

- [ ] **Step 5: Заполнить decision.md результатами**

Все поля `<...>` и `XX%` заменить реальными значениями из `comparison.md` и `checklist.md`. Принять gate-решение по дереву из спеки секция 4.2.

- [ ] **Step 6: Commit + push**

```bash
git add scripts/vision-poc/results/decision.md
git commit -m "docs(vision-poc): Sprint 1 gate decision"
git push -u origin phase-55-sprint-1-poc
```

- [ ] **Step 7: PR**

```bash
gh pr create --title "Phase 55 Sprint 1 PoC: Vision Chunking gate decision" --body "$(cat <<'EOF'
## Summary
- Sprint 1 PoC завершён: pipeline / VLM / OCR / Мила
- Gate decision: см. `scripts/vision-poc/results/decision.md`
- Spec: `docs/superpowers/specs/2026-05-06-phase-55-sprint-1-poc-design.md`

## Test plan
- [ ] decision.md прочитан, verdict понятен
- [ ] Если GO — Sprint 2 spec написан и линкован
- [ ] Если NO-GO — lesson learned зафиксирован

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

**Spec coverage check:**
- ✅ DoD #1 (3 видео разной длины) → Task 2
- ✅ DoD #2 (frames extraction + adaptive cap + 10 sample) → Task 3
- ✅ DoD #3 (3 VLM × 30 кадров) → Task 5
- ✅ DoD #4 (tesseract OCR baseline) → Task 6
- ✅ DoD #5 (ручной sanity-check + comparison.md) → Tasks 7, 8
- ✅ DoD #6 (пакет Миле) → Task 9
- ✅ DoD #7 (заполненный чек-лист + accuracy) → Task 10 Steps 2-3
- ✅ DoD #8 (decision.md GO/NO-GO) → Task 10 Steps 4-7
- ✅ Architecture: 4 main scripts + analyze helper → Tasks 2-7
- ✅ Storage layout + .gitignore → Task 1
- ✅ External deps (ffmpeg/tesseract/OpenRouter/Supabase Mgmt) → Task 1 README + Task 5 smoke test
- ✅ Branch & PR strategy → Task 10 Step 7
- ✅ Risk R4 (key vision-доступ) → Task 5 smoke test

**Placeholder scan:** в шаблонах `decision.md` и `checklist.md` есть placeholders `<...>` / `XX%` / `[Урок 1]` — это намеренно, заполняется на Step с ручной разметкой. В коде placeholder'ов нет.

**Type consistency:**
- `SelectedVideo` → `selected-videos.json` ✓
- `VideoExtraction` / `FrameMeta` → `frames-manifest.json` ✓ (используется в Task 3, 5, 6, 7)
- `VlmResult` → `vlm-runs.json` ✓ (Task 5, 7)
- `OcrResult` → `ocr-runs.json` ✓ (Task 6, 7)
- `POC_CONFIG.frames_dir` / `POC_CONFIG.results_dir` использованы консистентно
- Имена файлов: `frame_NNN_MM-SS.jpg` (с дефисом в timecode из-за filesystem) consistently across tasks 3, 5, 7

План готов.

