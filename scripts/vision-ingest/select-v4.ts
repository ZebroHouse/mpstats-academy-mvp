// scripts/vision-ingest/select-v4.ts
// Sprint 3+ multi-strategy selector with LLM judge fallback.
//
// Run:
//   INGEST_SUFFIX=sprint3 npx tsx --env-file=.env scripts/vision-ingest/select-v4.ts --course 03_ai
//   (add --no-judge for fast/cheap dry-run; --confidence-threshold 8 default)
//
// Reads:
//   - Lesson rows (isHidden=false) with metadata.videoSource already populated (mapped[])
//     and rows without it (unmapped[]).
//   - Local video files under E:/Academy Courses/<course>/**/*.mp4 (ffprobe for duration).
//
// Writes:
//   - results/selected-${SUFFIX}-lessons.json   (mapped[] + auto-accepted; same schema as v1/v2/v3)
//   - results/low-confidence-${SUFFIX}.csv      (needs human review; NOT written to DB)
//   - DB: Lesson.metadata.videoSource for auto-accepted rows (source: 'llm-judge' | 'positional' | 'word-overlap')
//
// Honors safety rules:
//   - Rule 1: AbortController 60s on every fetch
//   - Rule 5: isHidden=false filter
//   - Rule 6: deterministic (sorted inputs, stable assignment)
//   - Rule 7: cumulative cost logging

import { execSync } from 'child_process';
import { readdirSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, relative } from 'path';
import { INGEST_CONFIG } from './config';

// ---------- Config ----------

// Brand / high-signal keyword list (case-insensitive). Latin only; Cyrillic
// equivalents are matched via translit on filenames. Owner: edit this list when
// new branded tools / proper nouns show up in a course.
const BRAND_KEYWORDS: string[] = [
  'vpn', 'chatgpt', 'mpstats', 'krea', 'klingai', 'kling', 'pepper', 'fastpay',
  'foreign', 'yandex', 'wildberries', 'ozon', 'weshop', 'dalle', 'dall',
  'photoshop', 'veo', 'seedream', 'banana', 'nano', 'midjourney', 'sora',
  'kandinsky', 'runway', 'gemini', 'claude', 'openai', 'gpt', 'wb', 'capcut',
  'notion', 'figma', 'canva', 'mp', 'mojo', 'eleven', 'elevenlabs', 'suno',
  'whisper', 'perplexity', 'deepl', 'heygen', 'agent', 'assistant',
];

const OPENROUTER_MODEL = 'openai/gpt-4.1-mini';
// gpt-4.1-mini OpenRouter pricing (per 1M tokens) as of 2026-05.
const PRICE_IN_PER_1M = 0.4;
const PRICE_OUT_PER_1M = 1.6;

const FETCH_TIMEOUT_MS = 60_000;
const JUDGE_RETRY_ON_PARSE = 1;

// ---------- CLI parsing ----------

interface Args {
  course?: string;
  noJudge: boolean;
  confidenceThreshold: number;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const out: Args = { noJudge: false, confidenceThreshold: 8 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--course') out.course = argv[++i];
    else if (a === '--no-judge') out.noJudge = true;
    else if (a === '--confidence-threshold') out.confidenceThreshold = parseInt(argv[++i], 10);
  }
  return out;
}

// ---------- Translit (verbatim from v3) ----------

const TRANSLIT_MULTI: Array<[string, string]> = [
  ['shch', 'щ'], ['sch', 'щ'],
  ['sh', 'ш'], ['ch', 'ч'], ['zh', 'ж'], ['ts', 'ц'],
  ['ya', 'я'], ['yu', 'ю'], ['yo', 'ё'],
  ['kh', 'х'],
];
const VOWELS_LAT = new Set(['a', 'e', 'i', 'o', 'u']);
const TRANSLIT_SINGLE: Record<string, string> = {
  a: 'а', b: 'б', v: 'в', g: 'г', d: 'д', e: 'е', z: 'з', i: 'и',
  k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'п', r: 'р',
  s: 'с', t: 'т', u: 'у', f: 'ф', h: 'х', c: 'ц', j: 'ж', w: 'в',
  x: 'кс', q: 'к',
  "'": 'ь', '"': 'ъ',
};

function translitToCyrillic(latin: string): string {
  const s = latin.toLowerCase().replace(/_/g, ' ');
  let out = '';
  let i = 0;
  while (i < s.length) {
    let matched = false;
    for (const [pat, rep] of TRANSLIT_MULTI) {
      if (s.startsWith(pat, i)) { out += rep; i += pat.length; matched = true; break; }
    }
    if (matched) continue;
    const ch = s[i];
    if (ch === 'y') {
      const prev = i > 0 ? s[i - 1] : ' ';
      out += VOWELS_LAT.has(prev) || prev === ' ' ? 'й' : 'ы';
      i++;
      continue;
    }
    out += TRANSLIT_SINGLE[ch] !== undefined ? TRANSLIT_SINGLE[ch] : ch;
    i++;
  }
  return out;
}

// ---------- Tokenize ----------

const TOKEN_SPLIT_RE = /[\s_\-.,|()«»"'!?]+/;

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(TOKEN_SPLIT_RE)
    .map((t) => t.replace(/^[^a-zа-яё0-9]+|[^a-zа-яё0-9]+$/gi, ''))
    .filter((t) => t.length >= 3);
}

function filenameTokens(filename: string): { latin: Set<string>; cyrillic: Set<string> } {
  let stem = filename.replace(/\.[^.]+$/, '');
  stem = stem.replace(/^\d+(?:_\d+)?_/, '');
  return {
    latin: new Set(tokenize(stem)),
    cyrillic: new Set(tokenize(translitToCyrillic(stem))),
  };
}

function parseNumericPrefix(filename: string): number | null {
  const m = filename.match(/^(\d+)(?:_\d+)?_/);
  return m ? parseInt(m[1], 10) : null;
}

// ---------- Supabase ----------

async function supabaseQuery(sql: string, attempt = 1): Promise<any[]> {
  const token = process.env.SUPABASE_MGMT_TOKEN;
  const ref = process.env.SUPABASE_PROJECT_REF || 'saecuecevicwjkpmaoot';
  if (!token) throw new Error('SUPABASE_MGMT_TOKEN required');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql }),
      signal: ctl.signal,
    });
    if (!res.ok) {
      if ((res.status === 429 || res.status >= 500) && attempt < 5) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
        return supabaseQuery(sql, attempt + 1);
      }
      throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    }
    return res.json();
  } catch (e: any) {
    const transient = /fetch failed|socket|ECONN|UND_ERR|aborted/i.test(String(e?.message));
    if (transient && attempt < 5) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
      return supabaseQuery(sql, attempt + 1);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Filesystem walk ----------

const VIDEO_EXT = ['.mp4', '.mov', '.mkv'];

interface VideoCandidate {
  localPath: string;
  filename: string;
  durationSeconds: number;
  durationFormatted: string;
  bucketSize: 'short' | 'medium' | 'long';
  module: string; // canonical
  rawModuleDir: string;
}

function listVideos(courseRoot: string, canonicalModules: Set<string>): VideoCandidate[] {
  const out: VideoCandidate[] = [];
  function resolveCanonical(rawDir: string): string {
    if (canonicalModules.has(rawDir)) return rawDir;
    const stripped = rawDir.replace(/_\d+$/, '');
    if (canonicalModules.has(stripped)) return stripped;
    return rawDir;
  }
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (VIDEO_EXT.some((e) => entry.name.toLowerCase().endsWith(e))) {
        try {
          const out2 = execSync(
            `ffprobe -v error -show_entries format=duration -of csv=p=0 "${full}"`,
            { encoding: 'utf8' },
          ).trim();
          const seconds = Math.round(parseFloat(out2));
          if (!seconds || isNaN(seconds)) continue;
          const rel = relative(courseRoot, full).replace(/\\/g, '/');
          // Filesystem module dirs:
          //   simple: m01_xxx (01_analytics, 02_ads, 03_ai, 05_ozon), w01_xxx (04_workshops)
          //   nested: c01_<topic>/m01_<sub> (06_express subcourses)
          // Take the LAST path segment matching [mwc]<digits>_<topic>.
          const parts = rel.split('/');
          const modSegments = parts.filter((p) => /^[mwc]\d+_[^/]+/.test(p));
          const rawModuleDir = modSegments.length > 0 ? modSegments[modSegments.length - 1] : 'unknown';
          const canonical = resolveCanonical(rawModuleDir);
          let bucket: 'short' | 'medium' | 'long';
          if (seconds < 900) bucket = 'short';
          else if (seconds < 2400) bucket = 'medium';
          else bucket = 'long';
          out.push({
            localPath: full.replace(/\\/g, '/'),
            filename: entry.name,
            durationSeconds: seconds,
            durationFormatted: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`,
            bucketSize: bucket,
            module: canonical,
            rawModuleDir,
          });
        } catch {
          // skip unreadable
        }
      }
    }
  }
  walk(courseRoot);
  // Deterministic order
  out.sort((a, b) => a.localPath.localeCompare(b.localPath, 'en'));
  return out;
}

// ---------- Scoring ----------

interface ScoreBreakdown {
  positional: number;
  overlap: number;
  brand: number;
  numeric: number;
  total: number;
}

function scorePair(
  file: VideoCandidate,
  lesson: { id: string; title: string; order: number },
  positionalIdx: number | null, // i-th file vs i-th lesson; null when counts mismatch
  fileCount: number,
  lessonCount: number,
): ScoreBreakdown {
  // A: positional
  let positional = 0;
  if (positionalIdx !== null && fileCount === lessonCount) {
    positional = 5.0;
    const np = parseNumericPrefix(file.filename);
    // The order field for skill/module lessons usually correlates with intra-module index.
    // Bonus if numeric prefix matches positional index (1-based vs 0-based agnostic).
    if (np !== null && (np === positionalIdx + 1 || np === positionalIdx)) {
      positional += 0.5;
    }
  }

  // B: word overlap (Latin + Cyrillic translit)
  const ftok = filenameTokens(file.filename);
  const tt = tokenize(lesson.title);
  let overlap = 0;
  for (const t of tt) if (ftok.latin.has(t) || ftok.cyrillic.has(t)) overlap++;

  // C: brand bonus — token must be in BOTH filename (any form) and title.
  let brand = 0;
  const titleSet = new Set(tt);
  for (const b of BRAND_KEYWORDS) {
    const bLower = b.toLowerCase();
    const bCyr = translitToCyrillic(bLower);
    const inFile = ftok.latin.has(bLower) || ftok.cyrillic.has(bCyr);
    const inTitle = titleSet.has(bLower) || titleSet.has(bCyr);
    if (inFile && inTitle) brand += 2.0;
  }

  // D: numeric prefix vs lesson.order exact
  let numeric = 0;
  const np = parseNumericPrefix(file.filename);
  if (np !== null && np === lesson.order) numeric = 1.0;

  return { positional, overlap, brand, numeric, total: positional + overlap + brand + numeric };
}

// ---------- LLM judge ----------

interface JudgeResult {
  confidence: number;
  rationale: string;
  cost: number;
}

async function callJudge(
  file: VideoCandidate,
  lesson: { id: string; title: string },
  courseId: string,
): Promise<JudgeResult> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY required');
  const systemPrompt = `Ты эксперт по образовательным курсам. Тебе дано имя видео-файла и название урока. Реши, насколько вероятно что этот файл является видеозаписью этого урока.

Категории:
- Confidence 9-10: filename и title явно описывают одно и то же
- Confidence 6-8: тематически близко, есть общие термины
- Confidence 3-5: возможно одно и то же, но без уверенности
- Confidence 0-2: разные темы, не совпадают

Верни СТРОГО JSON:
{
  "confidence": <int 0-10>,
  "rationale": "одно предложение почему"
}`;
  const userPrompt = `Имя файла: ${file.filename}
Название урока: ${lesson.title}
Модуль: ${file.module}
Курс: ${courseId}

Оцени.`;

  async function once(): Promise<{ raw: string; promptTokens: number; completionTokens: number }> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: OPENROUTER_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0,
          max_tokens: 200,
          response_format: { type: 'json_object' },
        }),
        signal: ctl.signal,
      });
      if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
      const j: any = await res.json();
      const raw = j?.choices?.[0]?.message?.content || '';
      const promptTokens = j?.usage?.prompt_tokens || 0;
      const completionTokens = j?.usage?.completion_tokens || 0;
      return { raw, promptTokens, completionTokens };
    } finally {
      clearTimeout(timer);
    }
  }

  let attempt = 0;
  let lastErr: any = null;
  while (attempt <= JUDGE_RETRY_ON_PARSE) {
    try {
      const { raw, promptTokens, completionTokens } = await once();
      const parsed = JSON.parse(raw);
      const confidence = Math.max(0, Math.min(10, parseInt(String(parsed.confidence), 10)));
      const rationale = String(parsed.rationale || '').slice(0, 500);
      const cost = (promptTokens / 1_000_000) * PRICE_IN_PER_1M
                 + (completionTokens / 1_000_000) * PRICE_OUT_PER_1M;
      return { confidence, rationale, cost };
    } catch (e) {
      lastErr = e;
      attempt++;
    }
  }
  throw lastErr || new Error('judge parse failed');
}

// ---------- Types for output ----------

interface VideoSourceMetadata {
  filename: string;
  module: string;
  localPath: string;
  source: 'pilot' | 'sprint2c' | 'manual' | 'positional' | 'word-overlap' | 'llm-judge' | 'human-review';
  backfilledAt: string;
  confidence?: number;
}

interface SelectedLesson {
  localPath: string;
  filename: string;
  durationSeconds: number;
  durationFormatted: string;
  bucketSize: 'short' | 'medium' | 'long';
  module: string;
  category: 'theory' | 'ui_demo' | 'mpstats_cabinet';
  lessonId: string;
  lessonTitle: string;
  platformUrl: string;
}

function bucketize(s: number): 'short' | 'medium' | 'long' {
  return s < 900 ? 'short' : s < 2400 ? 'medium' : 'long';
}
function categorize(b: 'short' | 'medium' | 'long'): 'theory' | 'ui_demo' | 'mpstats_cabinet' {
  return b === 'short' ? 'theory' : b === 'medium' ? 'ui_demo' : 'mpstats_cabinet';
}

// ---------- CSV ----------

function csvEscape(v: string | number): string {
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// ---------- Main ----------

async function main() {
  const args = parseArgs();
  const SUFFIX = process.env.INGEST_SUFFIX;
  if (!SUFFIX) throw new Error('INGEST_SUFFIX env var required');
  const courseFilter = args.course || INGEST_CONFIG.pilot_target_course;
  const now = new Date().toISOString();

  console.log(`select-v4: course=${courseFilter}, suffix=${SUFFIX}, judge=${!args.noJudge}, threshold=${args.confidenceThreshold}`);

  // 1. Load lessons split into mapped[] / unmapped[]
  console.log('\n[1] Loading lessons from DB...');
  const lessonRows = await supabaseQuery(
    `SELECT id, "courseId", title, "order", metadata->'videoSource' AS vs
     FROM "Lesson"
     WHERE "isHidden" = false AND id LIKE '${courseFilter.replace(/'/g, "''")}_%'
     ORDER BY "courseId", "order" ASC, id ASC;`,
  );
  const mapped: Array<{ id: string; courseId: string; title: string; order: number; vs: VideoSourceMetadata }> = [];
  const unmapped: Array<{ id: string; courseId: string; title: string; order: number }> = [];
  for (const r of lessonRows) {
    if (r.vs) mapped.push({ id: r.id, courseId: r.courseId, title: r.title, order: r.order, vs: r.vs });
    else unmapped.push({ id: r.id, courseId: r.courseId, title: r.title, order: r.order });
  }
  console.log(`  mapped (existing): ${mapped.length}`);
  console.log(`  unmapped:          ${unmapped.length}`);

  // Canonical module discovery — handles m/w/c prefixes and nested express (c<NN>_<topic>_m<NN>_<sub>).
  // Captures the last segment of `(m|w|c)\d+_<topic>` chain.
  const cf = courseFilter.replace(/'/g, "''");
  const pattern = `((?:[mwc]\\d+_[a-z_0-9]+_)*[mwc]\\d+_[a-z_0-9]+?)_\\d+$`;
  const moduleRows = await supabaseQuery(
    `SELECT DISTINCT substring(id from '${pattern}') AS module
     FROM "Lesson"
     WHERE id LIKE '${cf}_%' AND "isHidden"=false
       AND substring(id from '${pattern}') IS NOT NULL
     ORDER BY module;`,
  );
  // For each match, take the LAST module segment (most specific).
  const canonicalModules = new Set<string>(
    moduleRows
      .map((r) => r.module)
      .filter(Boolean)
      .map((m: string) => {
        // Split on patterns of "[mwc]\d+_..._" boundary and pick last
        const matches = m.match(/[mwc]\d+_[a-z_0-9]+?(?=(?:_[mwc]\d+_|$))/g);
        return matches ? matches[matches.length - 1] : m;
      })
  );
  console.log(`  canonical modules: ${canonicalModules.size}`);

  // 2. List local videos under course root
  const courseRoot = join(INGEST_CONFIG.academy_courses_root, courseFilter);
  console.log(`\n[2] Scanning videos in ${courseRoot}...`);
  let allVideos: VideoCandidate[] = [];
  if (existsSync(courseRoot)) {
    allVideos = listVideos(courseRoot, canonicalModules);
  } else {
    console.warn(`  ! course root missing: ${courseRoot}`);
  }
  console.log(`  found ${allVideos.length} videos`);

  // 2b. Filter out claimed files
  const claimedPaths = new Set<string>();
  const claimedFilenames = new Set<string>();
  for (const m of mapped) {
    if (m.vs.localPath) claimedPaths.add(m.vs.localPath.replace(/\\/g, '/'));
    if (m.vs.filename) claimedFilenames.add(m.vs.filename);
  }
  const freeVideos = allVideos.filter(
    (v) => !claimedPaths.has(v.localPath) && !claimedFilenames.has(v.filename),
  );
  console.log(`  free (unclaimed) videos: ${freeVideos.length}`);

  // 3. Group by module
  // Match the LAST [mwc]<digits>_<topic> segment before the trailing _<digits>.
  // Handles: m01_xxx (simple), w01_xxx (workshops), and nested c<NN>_<topic>_m<NN>_<sub>.
  function lessonModule(lessonId: string, _courseId: string): string {
    const matches = lessonId.match(/[mwc]\d+_[a-z_0-9]+?(?=(?:_[mwc]\d+_|_\d+$))/g);
    return matches && matches.length > 0 ? matches[matches.length - 1] : 'unknown';
  }

  const unmappedByModule = new Map<string, typeof unmapped>();
  for (const l of unmapped) {
    const mod = lessonModule(l.id, l.courseId);
    if (!unmappedByModule.has(mod)) unmappedByModule.set(mod, []);
    unmappedByModule.get(mod)!.push(l);
  }
  const freeByModule = new Map<string, VideoCandidate[]>();
  for (const v of freeVideos) {
    if (!freeByModule.has(v.module)) freeByModule.set(v.module, []);
    freeByModule.get(v.module)!.push(v);
  }

  // 4. Per-module multi-strategy candidate generation
  interface Candidate {
    file: VideoCandidate;
    lesson: { id: string; courseId: string; title: string; order: number };
    score: ScoreBreakdown;
    strategy: 'positional' | 'word-overlap';
  }

  interface Assignment {
    file: VideoCandidate;
    lesson: { id: string; courseId: string; title: string; order: number };
    score: ScoreBreakdown;
    strategy: 'positional' | 'word-overlap';
    runnerUpScore: number;
    confidenceStrategy: 'high' | 'medium' | 'low';
  }

  const assignments: Assignment[] = [];
  const unmatchedVideos: VideoCandidate[] = [];
  const unmatchedLessons: typeof unmapped = [];

  const modules = Array.from(new Set([...unmappedByModule.keys(), ...freeByModule.keys()])).sort();
  console.log(`\n[3] Per-module candidate generation across ${modules.length} module(s)...`);

  for (const mod of modules) {
    const lessons = (unmappedByModule.get(mod) || []).slice().sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    const files = (freeByModule.get(mod) || []).slice().sort((a, b) => a.filename.localeCompare(b.filename, 'en'));
    if (lessons.length === 0 && files.length === 0) continue;
    console.log(`  [${mod}] files=${files.length}, lessons=${lessons.length}`);

    // Generate all (file, lesson) candidate pairs with scores.
    const candidates: Candidate[] = [];
    for (let fi = 0; fi < files.length; fi++) {
      const f = files[fi];
      for (let li = 0; li < lessons.length; li++) {
        const l = lessons[li];
        const positionalIdx = (files.length === lessons.length && fi === li) ? fi : null;
        const sc = scorePair(f, l, positionalIdx, files.length, lessons.length);
        const strategy: 'positional' | 'word-overlap' = sc.positional > 0 ? 'positional' : 'word-overlap';
        candidates.push({ file: f, lesson: l, score: sc, strategy });
      }
    }

    // 5. Greedy bipartite — sort by score desc, claim file & lesson once.
    candidates.sort((a, b) => {
      if (b.score.total !== a.score.total) return b.score.total - a.score.total;
      // Stable tiebreak: prefer same-position pairs, then alphabetic
      return a.file.filename.localeCompare(b.file.filename) + a.lesson.id.localeCompare(b.lesson.id);
    });

    const fileClaimed = new Set<string>();
    const lessonClaimed = new Set<string>();
    // Track runner-up per (file, lesson) for confidence triage
    const winnerByFile = new Map<string, Candidate>();
    const runnerUpByLessonScore = new Map<string, number>();

    for (const c of candidates) {
      const fKey = c.file.localPath;
      const lKey = c.lesson.id;
      if (fileClaimed.has(fKey) || lessonClaimed.has(lKey)) {
        // Track runner-up score for the winning lesson
        const winnerForLesson = [...winnerByFile.values()].find((w) => w.lesson.id === lKey);
        if (winnerForLesson && c.score.total < winnerForLesson.score.total) {
          const prev = runnerUpByLessonScore.get(lKey) ?? 0;
          if (c.score.total > prev) runnerUpByLessonScore.set(lKey, c.score.total);
        }
        continue;
      }
      fileClaimed.add(fKey);
      lessonClaimed.add(lKey);
      winnerByFile.set(fKey, c);
    }

    // Build assignments + classify confidence
    for (const c of winnerByFile.values()) {
      const runnerUp = runnerUpByLessonScore.get(c.lesson.id) ?? 0;
      const gap = c.score.total - runnerUp;
      let confidenceStrategy: 'high' | 'medium' | 'low';
      if (c.score.total >= 5 && gap > 1.0) confidenceStrategy = 'high';
      else if (c.score.total >= 3) confidenceStrategy = 'medium';
      else confidenceStrategy = 'low';
      assignments.push({
        file: c.file,
        lesson: c.lesson,
        score: c.score,
        strategy: c.strategy,
        runnerUpScore: runnerUp,
        confidenceStrategy,
      });
    }

    // Track unmatched
    for (const f of files) if (!fileClaimed.has(f.localPath)) unmatchedVideos.push(f);
    for (const l of lessons) if (!lessonClaimed.has(l.id)) unmatchedLessons.push(l);
  }

  console.log(`\n[4] Assignments: ${assignments.length}`);
  const highC = assignments.filter((a) => a.confidenceStrategy === 'high').length;
  const medC = assignments.filter((a) => a.confidenceStrategy === 'medium').length;
  const lowC = assignments.filter((a) => a.confidenceStrategy === 'low').length;
  console.log(`  confidence — high: ${highC}, medium: ${medC}, low: ${lowC}`);

  // 6. LLM judge for medium + low (unless --no-judge)
  interface FinalDecision {
    assignment: Assignment;
    finalConfidence: number;
    judgeConfidence: number | null;
    judgeRationale: string | null;
    source: 'positional' | 'word-overlap' | 'llm-judge';
  }
  const decisions: FinalDecision[] = [];
  let cumCost = 0;
  let judgeCalls = 0;
  let judgeErrors = 0;
  const t0 = Date.now();

  for (let i = 0; i < assignments.length; i++) {
    const a = assignments[i];
    const strategyNormalized = Math.min(10, (a.score.total / 7.0) * 10);
    let judgeConfidence: number | null = null;
    let judgeRationale: string | null = null;

    const needsJudge = !args.noJudge && a.confidenceStrategy !== 'high';
    if (needsJudge) {
      try {
        const j = await callJudge(a.file, a.lesson, a.lesson.courseId);
        judgeConfidence = j.confidence;
        judgeRationale = j.rationale;
        cumCost += j.cost;
        judgeCalls++;
        console.log(
          `  [${i + 1}/${assignments.length} cost=$${cumCost.toFixed(4)}] judge: ${a.file.filename} → ${a.lesson.id} conf=${j.confidence} (${j.rationale.slice(0, 60)})`,
        );
      } catch (e: any) {
        judgeErrors++;
        console.warn(`  [${i + 1}] judge ERR: ${e.message?.slice(0, 100)}`);
      }
    }

    const finalConfidence = Math.max(
      strategyNormalized,
      judgeConfidence ?? 0,
    );
    let source: 'positional' | 'word-overlap' | 'llm-judge' = a.strategy;
    if (judgeConfidence !== null && judgeConfidence > strategyNormalized) source = 'llm-judge';

    decisions.push({ assignment: a, finalConfidence, judgeConfidence, judgeRationale, source });
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n[5] Judge phase done in ${elapsed}s. Calls: ${judgeCalls}, errors: ${judgeErrors}, cost: $${cumCost.toFixed(4)}`);

  // 7. Decision + DB writes
  const accepted: FinalDecision[] = [];
  const lowConfidence: FinalDecision[] = [];
  for (const d of decisions) {
    if (d.finalConfidence >= args.confidenceThreshold) accepted.push(d);
    else lowConfidence.push(d);
  }
  console.log(`\n[6] Accepted (≥${args.confidenceThreshold}): ${accepted.length}`);
  console.log(`     Low-confidence (CSV): ${lowConfidence.length}`);

  if (accepted.length > 0) {
    const statements: string[] = [];
    for (const d of accepted) {
      const vs: VideoSourceMetadata = {
        filename: d.assignment.file.filename,
        module: d.assignment.file.module,
        localPath: d.assignment.file.localPath,
        source: d.source,
        backfilledAt: now,
        confidence: Math.round(d.finalConfidence * 10) / 10,
      };
      const vsJson = JSON.stringify(vs).replace(/'/g, "''");
      const idEsc = d.assignment.lesson.id.replace(/'/g, "''");
      statements.push(
        `UPDATE "Lesson" SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{videoSource}', '${vsJson}'::jsonb) WHERE id = '${idEsc}';`,
      );
    }
    const CHUNK = 25;
    let done = 0;
    for (let i = 0; i < statements.length; i += CHUNK) {
      const sql = statements.slice(i, i + CHUNK).join('\n');
      await supabaseQuery(sql);
      done += Math.min(CHUNK, statements.length - i);
      console.log(`  DB write: ${done}/${statements.length}`);
    }
  }

  // 8. Build outputs
  if (!existsSync(INGEST_CONFIG.results_dir)) mkdirSync(INGEST_CONFIG.results_dir, { recursive: true });

  // selected JSON = mapped[] + accepted[]
  const selected: SelectedLesson[] = [];
  for (const m of mapped) {
    // We don't have duration/bucket for already-mapped lessons here (would need extra ffprobe).
    // Best-effort: probe if file exists; else fill 0/short.
    let durationSeconds = 0;
    if (m.vs.localPath && existsSync(m.vs.localPath)) {
      try {
        const out = execSync(
          `ffprobe -v error -show_entries format=duration -of csv=p=0 "${m.vs.localPath}"`,
          { encoding: 'utf8' },
        ).trim();
        durationSeconds = Math.round(parseFloat(out)) || 0;
      } catch { /* keep 0 */ }
    }
    const bucket = bucketize(durationSeconds);
    selected.push({
      localPath: m.vs.localPath,
      filename: m.vs.filename,
      durationSeconds,
      durationFormatted: `${Math.floor(durationSeconds / 60)}:${String(durationSeconds % 60).padStart(2, '0')}`,
      bucketSize: bucket,
      module: m.vs.module,
      category: categorize(bucket),
      lessonId: m.id,
      lessonTitle: m.title,
      platformUrl: `https://platform.mpstats.academy/learn/${m.id}`,
    });
  }
  for (const d of accepted) {
    selected.push({
      localPath: d.assignment.file.localPath,
      filename: d.assignment.file.filename,
      durationSeconds: d.assignment.file.durationSeconds,
      durationFormatted: d.assignment.file.durationFormatted,
      bucketSize: d.assignment.file.bucketSize,
      module: d.assignment.file.module,
      category: categorize(d.assignment.file.bucketSize),
      lessonId: d.assignment.lesson.id,
      lessonTitle: d.assignment.lesson.title,
      platformUrl: `https://platform.mpstats.academy/learn/${d.assignment.lesson.id}`,
    });
  }
  // Deterministic order
  selected.sort((a, b) => a.lessonId.localeCompare(b.lessonId));

  const jsonPath = join(INGEST_CONFIG.results_dir, `selected-${SUFFIX}-lessons.json`);
  writeFileSync(jsonPath, JSON.stringify(selected, null, 2), 'utf8');

  // low-confidence CSV
  const csvPath = join(INGEST_CONFIG.results_dir, `low-confidence-${SUFFIX}.csv`);
  const csvLines: string[] = [
    'lessonId,courseId,module,lessonTitle,candidateFilename,candidateLocalPath,score,llmConfidence,llmRationale,approved_lessonId',
  ];
  for (const d of lowConfidence) {
    csvLines.push([
      csvEscape(d.assignment.lesson.id),
      csvEscape(d.assignment.lesson.courseId),
      csvEscape(d.assignment.file.module),
      csvEscape(d.assignment.lesson.title),
      csvEscape(d.assignment.file.filename),
      csvEscape(d.assignment.file.localPath),
      csvEscape(d.assignment.score.total.toFixed(2)),
      csvEscape(d.judgeConfidence ?? ''),
      csvEscape(d.judgeRationale ?? ''),
      '', // approved_lessonId — owner fills in
    ].join(','));
  }
  writeFileSync(csvPath, csvLines.join('\n') + '\n', 'utf8');

  // 9. Final stats
  console.log(`\n=== Final ===`);
  console.log(`  selected JSON:   ${jsonPath}  (${selected.length} lessons)`);
  console.log(`  low-confidence:  ${csvPath}  (${lowConfidence.length} rows)`);
  console.log(`Stats:`);
  console.log(`  Mapped (existing):       ${mapped.length}`);
  console.log(`  Auto-accepted:           ${accepted.length}`);
  console.log(`  Low-confidence (in CSV): ${lowConfidence.length}`);
  console.log(`  Unmatched videos:        ${unmatchedVideos.length}`);
  console.log(`  Unmatched lessons:       ${unmatchedLessons.length}`);
  console.log(`  LLM cost:                $${cumCost.toFixed(4)} (${judgeCalls} calls, ${judgeErrors} errors)`);

  if (unmatchedVideos.length > 0) {
    console.log(`\nUnmatched videos (first 10):`);
    for (const v of unmatchedVideos.slice(0, 10)) console.log(`  - ${v.module}/${v.filename}`);
  }
  if (unmatchedLessons.length > 0) {
    console.log(`\nUnmatched lessons (first 10):`);
    for (const l of unmatchedLessons.slice(0, 10)) console.log(`  - ${l.id} "${l.title}"`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
